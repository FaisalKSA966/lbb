// Quests & Trades APIs - Additional Module
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const db = new Database(path.join(__dirname, 'database.db'));

// ============ QUESTS SYSTEM ============

// Generate daily quests
export function generateDailyQuests() {
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const questTemplates = [
    { type: 'voice', name: 'Vocal Legend', desc: 'Stay in voice for 30 minutes', req: 30, gems: 5, respect: 2 },
    { type: 'voice', name: 'Chatterbox', desc: 'Stay in voice for 60 minutes', req: 60, gems: 10, respect: 5 },
    { type: 'messages', name: 'Text Master', desc: 'Send 20 messages', req: 20, gems: 5, respect: 2 },
    { type: 'messages', name: 'Conversation King', desc: 'Send 50 messages', req: 50, gems: 10, respect: 5 },
    { type: 'respect', name: 'Generous Soul', desc: 'Give 3 Respect', req: 3, gems: 5, respect: 0 },
    { type: 'friends', name: 'Social Butterfly', desc: 'Add 2 new friends', req: 2, gems: 10, respect: 3 },
  ];

  // Check if quests already exist for today
  const existing = db.prepare('SELECT COUNT(*) as count FROM quests WHERE start_date = ?').get(today);

  if (existing.count === 0) {
    // Shuffle and pick 3 random quests
    const shuffled = questTemplates.sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, 3);

    selected.forEach(q => {
      db.prepare(`
        INSERT INTO quests (quest_type, quest_name, quest_description, requirement_type, requirement_value,
                           reward_gems, reward_respect, start_date, end_date, is_weekly)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      `).run('daily', q.name, q.desc, q.type, q.req, q.gems, q.respect, today, tomorrowStr);
    });

    console.log(`✅ Generated ${selected.length} daily quests for ${today}`);
  }
}

// Generate weekly quests
export function generateWeeklyQuests() {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay()); // Start of week
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  const weekStartStr = weekStart.toISOString().split('T')[0];
  const weekEndStr = weekEnd.toISOString().split('T')[0];

  const weeklyTemplates = [
    { type: 'voice', name: 'Weekly Warrior', desc: 'Stay in voice for 300 minutes this week', req: 300, gems: 50, respect: 20 },
    { type: 'messages', name: 'Message Marathon', desc: 'Send 500 messages this week', req: 500, gems: 50, respect: 20 },
    { type: 'streak', name: 'Streak Master', desc: 'Maintain a 7-day streak', req: 7, gems: 100, respect: 30 },
    { type: 'respect', name: 'Respectful', desc: 'Give 20 Respect this week', req: 20, gems: 75, respect: 10 },
  ];

  const existing = db.prepare(`
    SELECT COUNT(*) as count FROM quests WHERE start_date = ? AND is_weekly = 1
  `).get(weekStartStr);

  if (existing.count === 0) {
    const selected = weeklyTemplates.sort(() => 0.5 - Math.random()).slice(0, 2);

    selected.forEach(q => {
      db.prepare(`
        INSERT INTO quests (quest_type, quest_name, quest_description, requirement_type, requirement_value,
                           reward_gems, reward_respect, start_date, end_date, is_weekly)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).run('weekly', q.name, q.desc, q.type, q.req, q.gems, q.respect, weekStartStr, weekEndStr);
    });

    console.log(`✅ Generated ${selected.length} weekly quests`);
  }
}

// Get available quests for user
export function getAvailableQuests(userId) {
  const today = new Date().toISOString().split('T')[0];

  const quests = db.prepare(`
    SELECT
      q.*,
      uq.progress,
      uq.completed,
      uq.claimed
    FROM quests q
    LEFT JOIN user_quests uq ON q.quest_id = uq.quest_id AND uq.user_id = ?
    WHERE q.start_date <= ? AND q.end_date > ?
    ORDER BY q.is_weekly, q.quest_id
  `).all(userId, today, today);

  return quests;
}

// Update quest progress
export function updateQuestProgress(userId, type, amount = 1) {
  const today = new Date().toISOString().split('T')[0];

  // Get active quests of this type
  const quests = db.prepare(`
    SELECT q.quest_id, q.requirement_value
    FROM quests q
    LEFT JOIN user_quests uq ON q.quest_id = uq.quest_id AND uq.user_id = ?
    WHERE q.requirement_type = ?
      AND q.start_date <= ?
      AND q.end_date > ?
      AND (uq.completed IS NULL OR uq.completed = 0)
  `).all(userId, type, today, today);

  quests.forEach(quest => {
    const now = Date.now();

    // Insert or update progress
    db.prepare(`
      INSERT INTO user_quests (user_id, quest_id, progress, started_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, quest_id) DO UPDATE SET
        progress = progress + ?
    `).run(userId, quest.quest_id, amount, now, amount);

    // Check if completed
    const current = db.prepare(`
      SELECT progress FROM user_quests WHERE user_id = ? AND quest_id = ?
    `).get(userId, quest.quest_id);

    if (current.progress >= quest.requirement_value) {
      db.prepare(`
        UPDATE user_quests SET completed = 1 WHERE user_id = ? AND quest_id = ?
      `).run(userId, quest.quest_id);
    }
  });
}

// Claim quest reward
export function claimQuestReward(userId, questId) {
  const userQuest = db.prepare(`
    SELECT * FROM user_quests WHERE user_id = ? AND quest_id = ? AND completed = 1 AND claimed = 0
  `).get(userId, questId);

  if (!userQuest) {
    return { success: false, error: 'Quest not completed or already claimed' };
  }

  const quest = db.prepare('SELECT * FROM quests WHERE quest_id = ?').get(questId);

  // Give rewards
  if (quest.reward_gems > 0) {
    db.prepare('UPDATE users SET gems = gems + ? WHERE user_id = ?').run(quest.reward_gems, userId);

    db.prepare(`
      INSERT INTO transactions (user_id, transaction_type, amount, description, created_at)
      VALUES (?, 'quest_reward', ?, ?, ?)
    `).run(userId, quest.reward_gems, `Quest: ${quest.quest_name}`, Date.now());
  }

  if (quest.reward_respect > 0) {
    db.prepare('UPDATE users SET respect_count = respect_count + ? WHERE user_id = ?')
      .run(quest.reward_respect, userId);
  }

  // Mark as claimed
  db.prepare('UPDATE user_quests SET claimed = 1 WHERE user_id = ? AND quest_id = ?')
    .run(userId, questId);

  return {
    success: true,
    rewards: {
      gems: quest.reward_gems,
      respect: quest.reward_respect
    }
  };
}

// ============ TRADE SYSTEM ============

// Create trade offer
export function createTrade(senderId, receiverId, offerType, offerValue, requestType, requestValue) {
  // Validate they are friends
  const areFriends = db.prepare(`
    SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ?
  `).get(senderId, receiverId);

  if (!areFriends) {
    return { success: false, error: 'Can only trade with friends' };
  }

  // Validate sender has the offer
  const sender = db.prepare('SELECT * FROM users WHERE user_id = ?').get(senderId);

  if (offerType === 'gems' && sender.gems < parseInt(offerValue)) {
    return { success: false, error: 'Insufficient gems' };
  }

  if (offerType === 'respect' && sender.respect_count < parseInt(offerValue)) {
    return { success: false, error: 'Insufficient respect' };
  }

  // Create trade
  const now = Date.now();
  const result = db.prepare(`
    INSERT INTO trades (sender_id, receiver_id, offer_type, offer_value, request_type, request_value, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(senderId, receiverId, offerType, offerValue, requestType, requestValue, now);

  return { success: true, trade_id: result.lastInsertRowid };
}

// Accept trade
export function acceptTrade(tradeId, userId) {
  const trade = db.prepare(`
    SELECT * FROM trades WHERE trade_id = ? AND receiver_id = ? AND status = 'pending'
  `).get(tradeId, userId);

  if (!trade) {
    return { success: false, error: 'Trade not found or already processed' };
  }

  // Validate receiver has the requested items
  const receiver = db.prepare('SELECT * FROM users WHERE user_id = ?').get(userId);

  if (trade.request_type === 'gems' && receiver.gems < parseInt(trade.request_value)) {
    return { success: false, error: 'Insufficient gems' };
  }

  if (trade.request_type === 'respect' && receiver.respect_count < parseInt(trade.request_value)) {
    return { success: false, error: 'Insufficient respect' };
  }

  // Execute trade
  const now = Date.now();

  // Sender gives offer, receives request
  if (trade.offer_type === 'gems') {
    db.prepare('UPDATE users SET gems = gems - ? WHERE user_id = ?')
      .run(parseInt(trade.offer_value), trade.sender_id);
  } else if (trade.offer_type === 'respect') {
    db.prepare('UPDATE users SET respect_count = respect_count - ? WHERE user_id = ?')
      .run(parseInt(trade.offer_value), trade.sender_id);
  }

  if (trade.request_type === 'gems') {
    db.prepare('UPDATE users SET gems = gems + ? WHERE user_id = ?')
      .run(parseInt(trade.request_value), trade.sender_id);
  } else if (trade.request_type === 'respect') {
    db.prepare('UPDATE users SET respect_count = respect_count + ? WHERE user_id = ?')
      .run(parseInt(trade.request_value), trade.sender_id);
  }

  // Receiver gives request, receives offer
  if (trade.request_type === 'gems') {
    db.prepare('UPDATE users SET gems = gems - ? WHERE user_id = ?')
      .run(parseInt(trade.request_value), userId);
  } else if (trade.request_type === 'respect') {
    db.prepare('UPDATE users SET respect_count = respect_count - ? WHERE user_id = ?')
      .run(parseInt(trade.request_value), userId);
  }

  if (trade.offer_type === 'gems') {
    db.prepare('UPDATE users SET gems = gems + ? WHERE user_id = ?')
      .run(parseInt(trade.offer_value), userId);
  } else if (trade.offer_type === 'respect') {
    db.prepare('UPDATE users SET respect_count = respect_count + ? WHERE user_id = ?')
      .run(parseInt(trade.offer_value), userId);
  }

  // Update trade status
  db.prepare('UPDATE trades SET status = ?, updated_at = ? WHERE trade_id = ?')
    .run('accepted', now, tradeId);

  // Record transactions
  db.prepare(`
    INSERT INTO transactions (user_id, transaction_type, amount, description, created_at)
    VALUES (?, 'trade', ?, ?, ?)
  `).run(trade.sender_id, -parseInt(trade.offer_value), `Trade with user`, now);

  db.prepare(`
    INSERT INTO transactions (user_id, transaction_type, amount, description, created_at)
    VALUES (?, 'trade', ?, ?, ?)
  `).run(userId, -parseInt(trade.request_value), `Trade with user`, now);

  return { success: true };
}

// Reject trade
export function rejectTrade(tradeId, userId) {
  const trade = db.prepare(`
    SELECT * FROM trades WHERE trade_id = ? AND receiver_id = ? AND status = 'pending'
  `).get(tradeId, userId);

  if (!trade) {
    return { success: false, error: 'Trade not found' };
  }

  db.prepare('UPDATE trades SET status = ?, updated_at = ? WHERE trade_id = ?')
    .run('rejected', Date.now(), tradeId);

  return { success: true };
}

// Get user trades
export function getUserTrades(userId) {
  return db.prepare(`
    SELECT
      t.*,
      sender.username as sender_name,
      sender.avatar as sender_avatar,
      receiver.username as receiver_name,
      receiver.avatar as receiver_avatar
    FROM trades t
    JOIN users sender ON t.sender_id = sender.user_id
    JOIN users receiver ON t.receiver_id = receiver.user_id
    WHERE t.sender_id = ? OR t.receiver_id = ?
    ORDER BY t.created_at DESC
    LIMIT 50
  `).all(userId, userId);
}

// Initialize quests on startup
generateDailyQuests();
generateWeeklyQuests();

// Schedule daily quest generation (run at midnight)
setInterval(() => {
  const now = new Date();
  if (now.getHours() === 0 && now.getMinutes() === 0) {
    generateDailyQuests();
  }
}, 60000); // Check every minute

// Schedule weekly quest generation (run on Sundays at midnight)
setInterval(() => {
  const now = new Date();
  if (now.getDay() === 0 && now.getHours() === 0 && now.getMinutes() === 0) {
    generateWeeklyQuests();
  }
}, 60000);

export { db };
