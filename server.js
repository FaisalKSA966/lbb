// API Server with Friends, Respect Transfer, Badges
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';
import { getShopItems, purchaseItem, getUserInventory } from './shop.js';
import { isUserWebsiteRegistered, stmtRegisterWebsiteUser, createUserIfNotExists, fetchMemberOnRegistration } from './bot.js';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();

// Enhanced CORS configuration
app.use(cors({
  origin: [
    'http://localhost:3001', 
    'https://localhost:3001', 
    'http://127.0.0.1:3001', 
    'https://127.0.0.1:3001',
    'http://localhost:3000',
    'https://localhost:3000',
    'http://127.0.0.1:3000',
    'https://127.0.0.1:3000',
    'https://lb.8guys.xyz',  // Frontend على Vercel
    'https://apilb.8guys.xyz' // API الخارجي
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json());

// Debug middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - Origin: ${req.headers.origin || 'none'}`);
  next();
});

const db = new Database(path.join(__dirname, 'database.db'));
db.pragma('journal_mode = WAL');

// ============ LEADERBOARD ============
app.get('/api/leaderboard', (req, res) => {
  try {
    const users = db.prepare(`
      SELECT
        u.user_id,
        u.username,
        u.global_name,
        u.avatar,
        u.banner,
        u.total_voice_minutes,
        u.total_messages,
        u.respect_count,
        u.streak_count,
        u.joined_server_at,
        (u.total_voice_minutes + (u.total_messages * 0.5) + (u.respect_count * 10)) as total_score,
        COUNT(DISTINCT b.badge_type) as badge_count
      FROM users u
      LEFT JOIN badges b ON u.user_id = b.user_id
      GROUP BY u.user_id
      ORDER BY total_score DESC
      LIMIT 100
    `).all();

    res.json({ success: true, data: users });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// ============ USER PROFILE ============
app.get('/api/profile/:userId', (req, res) => {
  try {
    const { userId } = req.params;

    const user = db.prepare(`
      SELECT
        user_id,
        username,
        global_name,
        avatar,
        banner,
        about_me,
        joined_server_at,
        total_voice_minutes,
        total_messages,
        respect_count,
        streak_count,
        last_streak_date,
        (total_voice_minutes + (total_messages * 0.5) + (respect_count * 10)) as total_score
      FROM users
      WHERE user_id = ?
    `).get(userId);

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Get rank
    const rankResult = db.prepare(`
      SELECT COUNT(*) + 1 as rank
      FROM users
      WHERE (total_voice_minutes + (total_messages * 0.5) + (respect_count * 10)) >
            (SELECT (total_voice_minutes + (total_messages * 0.5) + (respect_count * 10))
             FROM users WHERE user_id = ?)
    `).get(userId);

    user.rank = rankResult.rank;

    // Get badges from all systems (legacy, default, limited)
    const legacyBadges = db.prepare(`
      SELECT
        badge_type,
        badge_tier,
        earned_at,
        badge_type as badge_name,
        NULL as badge_icon,
        NULL as badge_color,
        NULL as rarity,
        'legacy' as source
      FROM badges
      WHERE user_id = ?
      ORDER BY earned_at DESC
    `).all(userId);

    const defaultBadges = db.prepare(`
      SELECT
        db.badge_type,
        1 as badge_tier,
        udb.earned_at,
        db.badge_name,
        db.badge_icon,
        db.badge_color,
        db.rarity,
        'default' as source
      FROM user_default_badges udb
      JOIN default_badges db ON udb.badge_type = db.badge_type
      WHERE udb.user_id = ? AND db.is_active = 1
      ORDER BY udb.earned_at DESC
    `).all(userId);

    const limitedBadges = db.prepare(`
      SELECT
        CAST(lb.badge_id AS TEXT) as badge_type,
        1 as badge_tier,
        ulb.granted_at as earned_at,
        lb.badge_name,
        lb.badge_icon,
        lb.badge_color,
        lb.rarity,
        'limited' as source
      FROM user_limited_badges ulb
      JOIN limited_badges lb ON ulb.badge_id = lb.badge_id
      WHERE ulb.user_id = ? AND lb.is_active = 1
      ORDER BY ulb.granted_at DESC
    `).all(userId);

    user.badges = [...defaultBadges, ...limitedBadges, ...legacyBadges];

    // Get friends
    user.friends = db.prepare(`
      SELECT
        u.user_id,
        u.username,
        u.global_name,
        u.avatar,
        f.created_at
      FROM friends f
      JOIN users u ON f.friend_id = u.user_id
      WHERE f.user_id = ?
      ORDER BY f.created_at DESC
    `).all(userId);

    // Recent sessions
    user.recent_sessions = db.prepare(`
      SELECT channel_id, join_time, leave_time, duration_minutes
      FROM voice_sessions
      WHERE user_id = ? AND leave_time IS NOT NULL
      ORDER BY leave_time DESC
      LIMIT 10
    `).all(userId);

    res.json({ success: true, data: user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// ============ RESPECT (GIVE) ============
app.post('/api/respect', (req, res) => {
  try {
    const { giverId, receiverId } = req.body;

    if (!giverId || !receiverId || giverId === receiverId) {
      return res.status(400).json({ success: false, error: 'Invalid request' });
    }

    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);

    const existing = db.prepare(`
      SELECT COUNT(*) as count
      FROM respect_given
      WHERE giver_id = ? AND receiver_id = ? AND given_at > ?
    `).get(giverId, receiverId, oneDayAgo);

    if (existing.count > 0) {
      return res.status(429).json({
        success: false,
        error: 'Already gave respect today',
        cooldown: true
      });
    }

    const now = Date.now();

    db.prepare('INSERT INTO respect_given (giver_id, receiver_id, given_at) VALUES (?, ?, ?)')
      .run(giverId, receiverId, now);

    db.prepare('UPDATE users SET respect_count = respect_count + 1 WHERE user_id = ?')
      .run(receiverId);

    const updated = db.prepare('SELECT respect_count FROM users WHERE user_id = ?')
      .get(receiverId);

    res.json({ success: true, new_respect_count: updated?.respect_count || 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// ============ FRIENDS SYSTEM ============

// Add friend
app.post('/api/friends/add', (req, res) => {
  try {
    const { userId, friendId } = req.body;

    if (!userId || !friendId || userId === friendId) {
      return res.status(400).json({ success: false, error: 'Invalid request' });
    }

    // Check if already friends
    const existing = db.prepare(
      'SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ?'
    ).get(userId, friendId);

    if (existing) {
      return res.status(400).json({ success: false, error: 'Already friends' });
    }

    const now = Date.now();

    // Add both directions
    db.prepare('INSERT INTO friends (user_id, friend_id, created_at) VALUES (?, ?, ?)')
      .run(userId, friendId, now);

    db.prepare('INSERT INTO friends (user_id, friend_id, created_at) VALUES (?, ?, ?)')
      .run(friendId, userId, now);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// Remove friend
app.post('/api/friends/remove', (req, res) => {
  try {
    const { userId, friendId } = req.body;

    if (!userId || !friendId) {
      return res.status(400).json({ success: false, error: 'Invalid request' });
    }

    // Remove both directions
    db.prepare('DELETE FROM friends WHERE user_id = ? AND friend_id = ?')
      .run(userId, friendId);

    db.prepare('DELETE FROM friends WHERE user_id = ? AND friend_id = ?')
      .run(friendId, userId);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// Get friends list
app.get('/api/friends/:userId', (req, res) => {
  try {
    const { userId } = req.params;

    const friends = db.prepare(`
      SELECT
        u.user_id,
        u.username,
        u.global_name,
        u.avatar,
        u.respect_count,
        f.created_at,
        (u.total_voice_minutes + (u.total_messages * 0.5) + (u.respect_count * 10)) as total_score
      FROM friends f
      JOIN users u ON f.friend_id = u.user_id
      WHERE f.user_id = ?
      ORDER BY f.created_at DESC
    `).all(userId);

    res.json({ success: true, data: friends });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// ============ RESPECT TRANSFER ============
app.post('/api/respect/transfer', (req, res) => {
  try {
    const { senderId, receiverId, amount } = req.body;

    if (!senderId || !receiverId || !amount || senderId === receiverId) {
      return res.status(400).json({ success: false, error: 'Invalid request' });
    }

    if (amount < 1 || amount > 25) {
      return res.status(400).json({ success: false, error: 'Amount must be 1-25' });
    }

    // Check if friends
    const areFriends = db.prepare(
      'SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ?'
    ).get(senderId, receiverId);

    if (!areFriends) {
      return res.status(403).json({ success: false, error: 'Must be friends to transfer' });
    }

    // Check sender has enough respect
    const sender = db.prepare('SELECT respect_count FROM users WHERE user_id = ?')
      .get(senderId);

    if (!sender || sender.respect_count < amount) {
      return res.status(400).json({ success: false, error: 'Insufficient respect' });
    }

    // Check daily limit (25 per day)
    const today = new Date().toISOString().split('T')[0];
    const startOfDay = new Date(today).getTime();

    const todayTransfers = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM respect_transfers
      WHERE sender_id = ? AND transferred_at >= ?
    `).get(senderId, startOfDay);

    if (todayTransfers.total + amount > 25) {
      return res.status(429).json({
        success: false,
        error: 'Daily transfer limit reached (25 max)',
        remaining: 25 - todayTransfers.total
      });
    }

    // Perform transfer
    const now = Date.now();

    db.prepare('UPDATE users SET respect_count = respect_count - ? WHERE user_id = ?')
      .run(amount, senderId);

    db.prepare('UPDATE users SET respect_count = respect_count + ? WHERE user_id = ?')
      .run(amount, receiverId);

    db.prepare(
      'INSERT INTO respect_transfers (sender_id, receiver_id, amount, transferred_at) VALUES (?, ?, ?, ?)'
    ).run(senderId, receiverId, amount, now);

    const senderNew = db.prepare('SELECT respect_count FROM users WHERE user_id = ?')
      .get(senderId);

    res.json({
      success: true,
      new_sender_respect: senderNew.respect_count,
      transferred_amount: amount
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// Get transfer history
app.get('/api/respect/transfers/:userId', (req, res) => {
  try {
    const { userId } = req.params;

    const transfers = db.prepare(`
      SELECT
        rt.sender_id,
        rt.receiver_id,
        rt.amount,
        rt.transferred_at,
        CASE
          WHEN rt.sender_id = ? THEN 'sent'
          ELSE 'received'
        END as type,
        CASE
          WHEN rt.sender_id = ? THEN u2.username
          ELSE u1.username
        END as other_username
      FROM respect_transfers rt
      LEFT JOIN users u1 ON rt.sender_id = u1.user_id
      LEFT JOIN users u2 ON rt.receiver_id = u2.user_id
      WHERE rt.sender_id = ? OR rt.receiver_id = ?
      ORDER BY rt.transferred_at DESC
      LIMIT 50
    `).all(userId, userId, userId, userId);

    res.json({ success: true, data: transfers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// ============ SEARCH ============
app.get('/api/search', (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.length < 2) {
      return res.status(400).json({ success: false, error: 'Query too short' });
    }

    const users = db.prepare(`
      SELECT
        user_id,
        username,
        global_name,
        avatar,
        total_voice_minutes,
        total_messages,
        respect_count,
        streak_count,
        (total_voice_minutes + (total_messages * 0.5) + (respect_count * 10)) as total_score
      FROM users
      WHERE username LIKE ? OR global_name LIKE ?
      ORDER BY total_score DESC
      LIMIT 20
    `).all(`%${q}%`, `%${q}%`);

    res.json({ success: true, data: users });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// ============ STATS ============
app.get('/api/stats', (req, res) => {
  try {
    const stats = {
      total_users: db.prepare('SELECT COUNT(*) as count FROM users').get().count,
      total_voice_hours: Math.round(
        (db.prepare('SELECT SUM(total_voice_minutes) as sum FROM users').get().sum || 0) / 60
      ),
      total_messages: db.prepare('SELECT SUM(total_messages) as sum FROM users').get().sum || 0,
      total_respect: db.prepare('SELECT SUM(respect_count) as sum FROM users').get().sum || 0,
      active_sessions: db.prepare(
        'SELECT COUNT(*) as count FROM voice_sessions WHERE leave_time IS NULL'
      ).get().count,
      total_friendships: Math.floor(
        (db.prepare('SELECT COUNT(*) as count FROM friends').get().count || 0) / 2
      )
    };
    stats.total_rep = stats.total_respect;

    res.json({ success: true, data: stats });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// ============ ACTIVITY SNAPSHOT ============
function buildActivitySnapshot() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayTimestamp = today.getTime();
  const todayStr = today.toISOString().split('T')[0];

  const repToday = db.prepare(
    'SELECT COUNT(*) as count FROM respect_given WHERE given_at >= ?'
  ).get(todayTimestamp).count || 0;

  const totals = {
    members: db.prepare('SELECT COUNT(*) as count FROM users').get().count || 0,
    clans: db.prepare('SELECT COUNT(*) as count FROM clans').get().count || 0,
    liveVoice: db.prepare(
      'SELECT COUNT(*) as count FROM voice_sessions WHERE leave_time IS NULL'
    ).get().count || 0,
    repToday,
    respectToday: repToday,
  };

  const topPlayers = db.prepare(`
    SELECT
      user_id,
      username,
      global_name,
      avatar,
      respect_count,
      total_voice_minutes,
      total_messages,
      (total_voice_minutes + (total_messages * 0.5) + (respect_count * 10)) as total_score
    FROM users
    ORDER BY total_score DESC
    LIMIT 5
  `).all();

  const topClans = db.prepare(`
    SELECT
      c.clan_id,
      c.clan_name,
      c.total_members,
      COALESCE(SUM(
        cm.contribution_voice +
        (cm.contribution_messages * 0.5) +
        (cm.contribution_respect * 10)
      ), 0) as total_score
    FROM clans c
    LEFT JOIN clan_members cm ON c.clan_id = cm.clan_id
    GROUP BY c.clan_id
    ORDER BY total_score DESC
    LIMIT 3
  `).all();

  const questCounts = db.prepare(`
    SELECT
      SUM(CASE WHEN is_weekly = 0 THEN 1 ELSE 0 END) as daily,
      SUM(CASE WHEN is_weekly = 1 THEN 1 ELSE 0 END) as weekly
    FROM quests
    WHERE start_date <= ? AND end_date > ?
  `).get(todayStr, todayStr);

  return {
    totals,
    topPlayers,
    topClans,
    quests: {
      daily: questCounts?.daily || 0,
      weekly: questCounts?.weekly || 0,
    },
    generatedAt: Date.now(),
  };
}

app.get('/api/activity/snapshot', (req, res) => {
  try {
    const snapshot = buildActivitySnapshot();
    res.json({ success: true, data: snapshot });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

app.post('/api/activity/launch', (req, res) => {
  try {
    const { hostId } = req.body || {};
    const snapshot = buildActivitySnapshot();

    broadcastAll('activity-invite', {
      hostId: hostId || null,
      publishedAt: Date.now(),
      kind: 'game_invitation',
      snapshot,
    });

    res.json({ success: true, data: snapshot });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// ============ DEFAULT BADGES SYSTEM ============
import {
  getAllDefaultBadges,
  getUserDefaultBadges,
  grantDefaultBadge,
  revokeDefaultBadge,
  checkAndGrantAutoBadges
} from './default-badges.js';

// Get all default badges
app.get('/api/default-badges', (req, res) => {
  try {
    const badges = getAllDefaultBadges();
    res.json({ success: true, data: badges });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// Get user's default badges
app.get('/api/default-badges/user/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const badges = getUserDefaultBadges(userId);
    res.json({ success: true, data: badges });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// Grant default badge to user (Admin only)
app.post('/api/default-badges/grant', (req, res) => {
  try {
    const { userId, badgeType } = req.body;
    if (!userId || !badgeType) {
      return res.status(400).json({ success: false, error: 'User ID and badge type required' });
    }
    const result = grantDefaultBadge(userId, badgeType, false);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// Revoke default badge from user (Admin only)
app.post('/api/default-badges/revoke', (req, res) => {
  try {
    const { userId, badgeType } = req.body;
    if (!userId || !badgeType) {
      return res.status(400).json({ success: false, error: 'User ID and badge type required' });
    }
    const result = revokeDefaultBadge(userId, badgeType);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// Check and grant auto badges for user
app.post('/api/default-badges/check', (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'User ID required' });
    }
    const result = checkAndGrantAutoBadges(userId);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// ============ BADGES (Legacy) ============
app.get('/api/badges/:userId', (req, res) => {
  try {
    const { userId } = req.params;

    const badges = db.prepare(`
      SELECT badge_type, badge_tier, earned_at
      FROM badges
      WHERE user_id = ?
      ORDER BY earned_at DESC
    `).all(userId);

    res.json({ success: true, data: badges });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// ============ CLANS SYSTEM ============

// Create clan
app.post('/api/clans/create', (req, res) => {
  try {
    const { leaderId, clanName, clanTag, description } = req.body;

    if (!leaderId || !clanName) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    // Ensure user exists in database first
    const user = db.prepare('SELECT user_id FROM users WHERE user_id = ?').get(leaderId);
    if (!user) {
      return res.status(400).json({ success: false, error: 'User not found. Please interact with the bot first (send a message or join voice).' });
    }

    // Check if user already in a clan
    const existing = db.prepare('SELECT 1 FROM clan_members WHERE user_id = ?').get(leaderId);
    if (existing) {
      return res.status(400).json({ success: false, error: 'Already in a clan' });
    }

    // Check if clan name exists
    const nameExists = db.prepare('SELECT 1 FROM clans WHERE clan_name = ?').get(clanName);
    if (nameExists) {
      return res.status(400).json({ success: false, error: 'Clan name already taken' });
    }

    const now = Date.now();

    // Use a transaction for atomic operation
    const transaction = db.transaction(() => {
      // Create clan
      const result = db.prepare(`
        INSERT INTO clans (clan_name, clan_tag, clan_description, leader_id, created_at, total_members, total_score)
        VALUES (?, ?, ?, ?, ?, 1, 0)
      `).run(clanName, clanTag || null, description || null, leaderId, now);

      const clanId = result.lastInsertRowid;

      // Add leader as member
      db.prepare(`
        INSERT INTO clan_members (clan_id, user_id, role, joined_at, contribution_voice, contribution_messages, contribution_respect)
        VALUES (?, ?, 'leader', ?, 0, 0, 0)
      `).run(clanId, leaderId, now);

      return clanId;
    });

    const clanId = transaction();

    res.json({ success: true, clan_id: clanId });
  } catch (err) {
    console.error('Clan creation error:', err);
    if (err?.message?.includes('UNIQUE')) {
      return res.status(400).json({ success: false, error: 'Clan already exists with this name or leader.' });
    }
    if (err?.message?.includes('FOREIGN KEY')) {
      return res.status(400).json({ success: false, error: 'User not found in database. Please interact with the bot first.' });
    }
    res.status(500).json({ success: false, error: err.message || 'Database error' });
  }
});

// Get clan details
app.get('/api/clans/:clanId', (req, res) => {
  try {
    const { clanId } = req.params;

    const clan = db.prepare(`
      SELECT
        c.*,
        u.username as leader_name,
        u.avatar as leader_avatar
      FROM clans c
      JOIN users u ON c.leader_id = u.user_id
      WHERE c.clan_id = ?
    `).get(clanId);

    if (!clan) {
      return res.status(404).json({ success: false, error: 'Clan not found' });
    }

    // Get members
    clan.members = db.prepare(`
      SELECT
        cm.user_id,
        cm.role,
        cm.joined_at,
        cm.contribution_voice,
        cm.contribution_messages,
        cm.contribution_respect,
        u.username,
        u.global_name,
        u.avatar,
        (cm.contribution_voice + (cm.contribution_messages * 0.5) + (cm.contribution_respect * 10)) as contribution_score
      FROM clan_members cm
      JOIN users u ON cm.user_id = u.user_id
      WHERE cm.clan_id = ?
      ORDER BY contribution_score DESC
    `).all(clanId);

    // Calculate total score
    clan.total_score = clan.members.reduce((sum, m) => sum + m.contribution_score, 0);

    res.json({ success: true, data: clan });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// Invite to clan
app.post('/api/clans/invite', (req, res) => {
  try {
    const { clanId, inviterId, inviteeId } = req.body;

    if (!clanId || !inviterId || !inviteeId) {
      return res.status(400).json({ success: false, error: 'Missing fields' });
    }

    // Check if inviter is leader or officer
    const inviter = db.prepare(`
      SELECT role FROM clan_members WHERE clan_id = ? AND user_id = ?
    `).get(clanId, inviterId);

    if (!inviter || (inviter.role !== 'leader' && inviter.role !== 'officer')) {
      return res.status(403).json({ success: false, error: 'No permission to invite' });
    }

    // Check if invitee is friend
    const areFriends = db.prepare(`
      SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ?
    `).get(inviterId, inviteeId);

    if (!areFriends) {
      return res.status(403).json({ success: false, error: 'Can only invite friends' });
    }

    // Check if invitee already in a clan
    const inClan = db.prepare('SELECT 1 FROM clan_members WHERE user_id = ?').get(inviteeId);
    if (inClan) {
      return res.status(400).json({ success: false, error: 'User already in a clan' });
    }

    // Check for existing pending invite
    const existingInvite = db.prepare(`
      SELECT 1 FROM clan_invites
      WHERE clan_id = ? AND invitee_id = ? AND status = 'pending'
    `).get(clanId, inviteeId);

    if (existingInvite) {
      return res.status(400).json({ success: false, error: 'Invite already sent' });
    }

    // Create invite
    db.prepare(`
      INSERT INTO clan_invites (clan_id, inviter_id, invitee_id, invited_at)
      VALUES (?, ?, ?, ?)
    `).run(clanId, inviterId, inviteeId, Date.now());

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// Accept/Reject invite
app.post('/api/clans/invite/:action', (req, res) => {
  try {
    const { action } = req.params;
    const { inviteId, userId } = req.body;

    if (!inviteId || !userId || !['accept', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, error: 'Invalid request' });
    }

    const invite = db.prepare(`
      SELECT * FROM clan_invites WHERE id = ? AND invitee_id = ? AND status = 'pending'
    `).get(inviteId, userId);

    if (!invite) {
      return res.status(404).json({ success: false, error: 'Invite not found' });
    }

    if (action === 'accept') {
      // Check if user already in clan
      const inClan = db.prepare('SELECT 1 FROM clan_members WHERE user_id = ?').get(userId);
      if (inClan) {
        return res.status(400).json({ success: false, error: 'Already in a clan' });
      }

      // Add to clan
      db.prepare(`
        INSERT INTO clan_members (clan_id, user_id, role, joined_at)
        VALUES (?, ?, 'member', ?)
      `).run(invite.clan_id, userId, Date.now());

      // Update clan member count
      db.prepare('UPDATE clans SET total_members = total_members + 1 WHERE clan_id = ?')
        .run(invite.clan_id);
    }

    // Update invite status
    db.prepare('UPDATE clan_invites SET status = ? WHERE id = ?')
      .run(action === 'accept' ? 'accepted' : 'rejected', inviteId);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// Kick member
app.post('/api/clans/kick', (req, res) => {
  try {
    const { clanId, kickerId, targetId } = req.body;

    if (!clanId || !kickerId || !targetId) {
      return res.status(400).json({ success: false, error: 'Missing fields' });
    }

    // Check permissions
    const kicker = db.prepare(`
      SELECT role FROM clan_members WHERE clan_id = ? AND user_id = ?
    `).get(clanId, kickerId);

    const target = db.prepare(`
      SELECT role FROM clan_members WHERE clan_id = ? AND user_id = ?
    `).get(clanId, targetId);

    if (!kicker || !target) {
      return res.status(404).json({ success: false, error: 'User not found in clan' });
    }

    // Officers can't kick leader, members can't kick anyone
    if (target.role === 'leader') {
      return res.status(403).json({ success: false, error: 'Cannot kick leader' });
    }

    if (kicker.role === 'member') {
      return res.status(403).json({ success: false, error: 'No permission to kick' });
    }

    // Remove member
    db.prepare('DELETE FROM clan_members WHERE clan_id = ? AND user_id = ?')
      .run(clanId, targetId);

    // Update clan member count
    db.prepare('UPDATE clans SET total_members = total_members - 1 WHERE clan_id = ?')
      .run(clanId);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// Promote to officer
app.post('/api/clans/promote', (req, res) => {
  try {
    const { clanId, leaderId, targetId } = req.body;

    // Only leader can promote
    const leader = db.prepare(`
      SELECT role FROM clan_members WHERE clan_id = ? AND user_id = ?
    `).get(clanId, leaderId);

    if (!leader || leader.role !== 'leader') {
      return res.status(403).json({ success: false, error: 'Only leader can promote' });
    }

    db.prepare('UPDATE clan_members SET role = ? WHERE clan_id = ? AND user_id = ?')
      .run('officer', clanId, targetId);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// Leave clan
app.post('/api/clans/leave', (req, res) => {
  try {
    const { clanId, userId } = req.body;

    const member = db.prepare(`
      SELECT role FROM clan_members WHERE clan_id = ? AND user_id = ?
    `).get(clanId, userId);

    if (!member) {
      return res.status(404).json({ success: false, error: 'Not in clan' });
    }

    if (member.role === 'leader') {
      return res.status(400).json({ success: false, error: 'Leader must delete clan or transfer leadership' });
    }

    db.prepare('DELETE FROM clan_members WHERE clan_id = ? AND user_id = ?')
      .run(clanId, userId);

    db.prepare('UPDATE clans SET total_members = total_members - 1 WHERE clan_id = ?')
      .run(clanId);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// Delete clan
app.delete('/api/clans/:clanId', (req, res) => {
  try {
    const { clanId } = req.params;
    const { userId } = req.body;

    const member = db.prepare(`
      SELECT role FROM clan_members WHERE clan_id = ? AND user_id = ?
    `).get(clanId, userId);

    if (!member || member.role !== 'leader') {
      return res.status(403).json({ success: false, error: 'Only leader can delete clan' });
    }

    // Delete all clan data
    db.prepare('DELETE FROM clan_members WHERE clan_id = ?').run(clanId);
    db.prepare('DELETE FROM clan_invites WHERE clan_id = ?').run(clanId);
    db.prepare('DELETE FROM clans WHERE clan_id = ?').run(clanId);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// Clan Leaderboard
app.get('/api/clans/leaderboard', (req, res) => {
  try {
    const clans = db.prepare(`
      SELECT
        c.clan_id,
        c.clan_name,
        c.clan_tag,
        c.total_members,
        c.created_at,
        u.username as leader_name,
        u.avatar as leader_avatar,
        COALESCE(SUM(
          cm.contribution_voice +
          (cm.contribution_messages * 0.5) +
          (cm.contribution_respect * 10)
        ), 0) as total_score
      FROM clans c
      LEFT JOIN clan_members cm ON c.clan_id = cm.clan_id
      JOIN users u ON c.leader_id = u.user_id
      GROUP BY c.clan_id
      ORDER BY total_score DESC
      LIMIT 50
    `).all();

    res.json({ success: true, data: clans });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// Get user's clan
app.get('/api/clans/user/:userId', (req, res) => {
  try {
    const { userId } = req.params;

    const clan = db.prepare(`
      SELECT c.*, cm.role, cm.joined_at
      FROM clan_members cm
      JOIN clans c ON cm.clan_id = c.clan_id
      WHERE cm.user_id = ?
    `).get(userId);

    if (!clan) {
      return res.json({ success: true, data: null });
    }

    res.json({ success: true, data: clan });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// Get user's clan invites
app.get('/api/clans/invites/:userId', (req, res) => {
  try {
    const { userId } = req.params;

    const invites = db.prepare(`
      SELECT
        ci.*,
        c.clan_name,
        c.clan_tag,
        c.total_members,
        u.username as inviter_name
      FROM clan_invites ci
      JOIN clans c ON ci.clan_id = c.clan_id
      JOIN users u ON ci.inviter_id = u.user_id
      WHERE ci.invitee_id = ? AND ci.status = 'pending'
      ORDER BY ci.invited_at DESC
    `).all(userId);

    res.json({ success: true, data: invites });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// ============ SHOP ============

// Get shop items
app.get('/api/shop/items', (req, res) => {
  try {
    const items = getShopItems();
    res.json({ success: true, data: items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Purchase item
app.post('/api/shop/purchase', (req, res) => {
  try {
    const { userId, itemId } = req.body;

    if (!userId || !itemId) {
      return res.status(400).json({ success: false, error: 'Missing fields' });
    }

    const result = purchaseItem(userId, itemId);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Get user inventory
app.get('/api/shop/inventory/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const inventory = getUserInventory(userId);
    res.json({ success: true, data: inventory });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ============ QUESTS & TRADES ============
import {
  getAvailableQuests,
  updateQuestProgress,
  claimQuestReward,
  createTrade,
  acceptTrade,
  rejectTrade,
  getUserTrades
} from './quests-trades.js';

// Get quests
app.get('/api/quests/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const quests = getAvailableQuests(userId);
    res.json({ success: true, data: quests });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// Claim quest reward
app.post('/api/quests/claim', (req, res) => {
  try {
    const { userId, questId } = req.body;
    const result = claimQuestReward(userId, questId);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// Create trade
app.post('/api/trades/create', (req, res) => {
  try {
    const { senderId, receiverId, offerType, offerValue, requestType, requestValue } = req.body;
    const result = createTrade(senderId, receiverId, offerType, offerValue, requestType, requestValue);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// Accept/Reject trade
app.post('/api/trades/:tradeId/:action', (req, res) => {
  try {
    const { tradeId, action } = req.params;
    const { userId } = req.body;

    const result = action === 'accept' ? acceptTrade(parseInt(tradeId), userId) : rejectTrade(parseInt(tradeId), userId);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// Get user trades
app.get('/api/trades/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const trades = getUserTrades(userId);
    res.json({ success: true, data: trades });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// ============ ACHIEVEMENTS ============
import { getUserAchievements, checkAchievements, initializeAchievements } from './achievements.js';

// Initialize achievements on server start
initializeAchievements();

// Get user achievements with progress
app.get('/api/achievements/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const achievements = getUserAchievements(userId);
    res.json({ success: true, data: achievements });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// Check and unlock achievements for user
app.post('/api/achievements/check', (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'User ID required' });
    }
    const unlocked = checkAchievements(userId);
    res.json({ success: true, unlocked });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// ============ STREAK SYSTEM ============
import {
  getStreakSettings,
  updateStreakSettings,
  trackUserActivity,
  getUserStreakStatus,
  getStreakLeaderboard
} from './streak-system.js';

// Get streak settings
app.get('/api/streak/settings', (req, res) => {
  try {
    const settings = getStreakSettings();
    res.json({ success: true, data: settings });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// Update streak settings (Admin only)
app.post('/api/streak/settings', (req, res) => {
  try {
    const { settings, adminId } = req.body;
    if (!adminId) {
      return res.status(400).json({ success: false, error: 'Admin ID required' });
    }
    const result = updateStreakSettings(settings, adminId);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// Get user streak status
app.get('/api/streak/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const status = getUserStreakStatus(userId);
    res.json({ success: true, data: status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// Track user activity (called by bot or frontend)
app.post('/api/streak/track', (req, res) => {
  try {
    const { userId, voiceMinutes, messages } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'User ID required' });
    }
    const result = trackUserActivity(userId, voiceMinutes || 0, messages || 0);
    res.json({ success: true, data: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// Get streak leaderboard
app.get('/api/streak/leaderboard', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const leaderboard = getStreakLeaderboard(limit);
    res.json({ success: true, data: leaderboard });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// ============ DAILY REWARDS ============
import {
  getDailyRewardStatus,
  claimDailyReward,
  getUpcomingRewards,
  getClaimHistory
} from './daily-rewards.js';

// Get daily reward status for user
app.get('/api/daily-rewards/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const status = getDailyRewardStatus(userId);
    res.json({ success: true, data: status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// Claim daily reward
app.post('/api/daily-rewards/claim', (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'User ID required' });
    }
    const result = claimDailyReward(userId);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// Get upcoming rewards preview
app.get('/api/daily-rewards/:userId/upcoming', (req, res) => {
  try {
    const { userId } = req.params;
    const status = getDailyRewardStatus(userId);
    const upcoming = getUpcomingRewards(status?.currentStreak || 0);
    res.json({ success: true, data: upcoming });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// Get claim history
app.get('/api/daily-rewards/:userId/history', (req, res) => {
  try {
    const { userId } = req.params;
    const history = getClaimHistory(userId);
    res.json({ success: true, data: history });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// ============ PROFILE CUSTOMIZATION ============

// Get user customization
app.get('/api/customization/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    let customization = db.prepare(`
      SELECT * FROM user_customization WHERE user_id = ?
    `).get(userId);

    if (!customization) {
      // Create default customization
      db.prepare(`
        INSERT INTO user_customization (user_id, theme_color, profile_frame, profile_border)
        VALUES (?, '#9146FF', 'default', 'none')
      `).run(userId);

      customization = {
        user_id: userId,
        theme_color: '#9146FF',
        profile_frame: 'default',
        profile_border: 'none',
        custom_banner: null,
        selected_title: null
      };
    }

    res.json({ success: true, data: customization });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// Update user customization
app.post('/api/customization/update', (req, res) => {
  try {
    const { userId, themeColor, profileFrame, profileBorder, customBanner, selectedTitle } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'User ID required' });
    }

    const now = Date.now();

    db.prepare(`
      INSERT INTO user_customization (user_id, theme_color, profile_frame, profile_border, custom_banner, selected_title, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        theme_color = COALESCE(?, theme_color),
        profile_frame = COALESCE(?, profile_frame),
        profile_border = COALESCE(?, profile_border),
        custom_banner = COALESCE(?, custom_banner),
        selected_title = COALESCE(?, selected_title),
        updated_at = ?
    `).run(
      userId, themeColor, profileFrame, profileBorder, customBanner, selectedTitle, now,
      themeColor, profileFrame, profileBorder, customBanner, selectedTitle, now
    );

    const updated = db.prepare('SELECT * FROM user_customization WHERE user_id = ?').get(userId);

    res.json({ success: true, data: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// ============ LIMITED BADGES (Admin Only) ============

// Get all limited badges
app.get('/api/limited-badges', (req, res) => {
  try {
    const badges = db.prepare(`
      SELECT * FROM limited_badges WHERE is_active = 1 ORDER BY created_at DESC
    `).all();

    res.json({ success: true, data: badges });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// Create limited badge (Admin only - add authentication later)
app.post('/api/limited-badges/create', (req, res) => {
  try {
    const { badgeName, badgeDescription, badgeIcon, badgeColor, rarity, createdBy } = req.body;

    if (!badgeName || !createdBy) {
      return res.status(400).json({ success: false, error: 'Badge name and creator required' });
    }

    const now = Date.now();

    const result = db.prepare(`
      INSERT INTO limited_badges (badge_name, badge_description, badge_icon, badge_color, rarity, created_by, created_at, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `).run(badgeName, badgeDescription, badgeIcon, badgeColor, rarity || 'legendary', createdBy, now);

    res.json({ success: true, badge_id: result.lastInsertRowid });
  } catch (err) {
    console.error(err);
    if (err?.message?.includes('UNIQUE')) {
      return res.status(400).json({ success: false, error: 'Badge name already exists' });
    }
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// Grant limited badge to user (Admin only)
app.post('/api/limited-badges/grant', (req, res) => {
  try {
    const { userId, badgeId, grantedBy, reason } = req.body;

    if (!userId || !badgeId || !grantedBy) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    // Check if badge exists
    const badge = db.prepare('SELECT * FROM limited_badges WHERE badge_id = ? AND is_active = 1').get(badgeId);
    if (!badge) {
      return res.status(404).json({ success: false, error: 'Badge not found' });
    }

    // Check if user already has this badge
    const existing = db.prepare(`
      SELECT 1 FROM user_limited_badges WHERE user_id = ? AND badge_id = ?
    `).get(userId, badgeId);

    if (existing) {
      return res.status(400).json({ success: false, error: 'User already has this badge' });
    }

    const now = Date.now();

    db.prepare(`
      INSERT INTO user_limited_badges (user_id, badge_id, granted_by, granted_at, reason)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, badgeId, grantedBy, now, reason || null);

    res.json({ success: true, message: 'Badge granted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// Revoke limited badge from user (Admin only)
app.post('/api/limited-badges/revoke', (req, res) => {
  try {
    const { userId, badgeId } = req.body;

    if (!userId || !badgeId) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    db.prepare(`
      DELETE FROM user_limited_badges WHERE user_id = ? AND badge_id = ?
    `).run(userId, badgeId);

    res.json({ success: true, message: 'Badge revoked successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// Get user's limited badges
app.get('/api/limited-badges/user/:userId', (req, res) => {
  try {
    const { userId } = req.params;

    const badges = db.prepare(`
      SELECT
        lb.*,
        ulb.granted_by,
        ulb.granted_at,
        ulb.reason
      FROM user_limited_badges ulb
      JOIN limited_badges lb ON ulb.badge_id = lb.badge_id
      WHERE ulb.user_id = ? AND lb.is_active = 1
      ORDER BY ulb.granted_at DESC
    `).all(userId);

    res.json({ success: true, data: badges });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// ============ WEBSOCKET (Real-time) ============
import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ noServer: true });

const clients = new Map(); // userId -> ws connection

wss.on('connection', (ws, userId) => {
  clients.set(userId, ws);
  console.log(`✅ WebSocket connected: ${userId}`);

  ws.on('close', () => {
    clients.delete(userId);
    console.log(`❌ WebSocket disconnected: ${userId}`);
  });
});

// Broadcast to specific user
export function notifyUser(userId, event, data) {
  const ws = clients.get(userId);
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ event, data }));
  }
}

// Broadcast to all
export function broadcastAll(event, data) {
  wss.clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(JSON.stringify({ event, data }));
    }
  });
}

// ============ DISCORD OAUTH ============
app.post('/api/discord-auth', async (req, res) => {
  try {
    const { code, redirect_uri: providedRedirect } = req.body;
    
    console.log('🔄 Discord OAuth request received:', { 
      hasCode: !!code, 
      codeLength: code?.length || 0,
      redirectUri: providedRedirect 
    });

    if (!code) {
      return res.status(400).json({ success: false, error: 'Code is required' });
    }

    // Exchange code for access token
    const redirectUri = providedRedirect || process.env.REDIRECT_URI || process.env.NEXT_PUBLIC_DISCORD_REDIRECT_URI || null;

    const response = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: code,
        ...(redirectUri ? { redirect_uri: redirectUri } : {}),
      }),
    });

    let data = null;
    const ct = response.headers.get('content-type') || '';
    const txt = await response.text();
    if (ct.includes('application/json')) {
      try { data = JSON.parse(txt); } catch {}
    }

    if (!response.ok) {
      console.error('Discord OAuth error:', txt);
      console.error('Debug info:', {
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET ? `${process.env.CLIENT_SECRET.slice(0, 5)}...` : 'MISSING',
        redirect_uri: redirectUri,
        code_length: code?.length || 0,
      });
      return res.status(400).json({
        success: false,
        error: 'Failed to exchange code for token',
        details: data || txt,
        debug: {
          client_id: process.env.CLIENT_ID || null,
          has_client_secret: Boolean(process.env.CLIENT_SECRET),
          redirect_uri_sent: redirectUri,
          discord_error: data?.error || null,
          discord_error_description: data?.error_description || null,
        }
      });
    }

    // Auto-register user in database after successful OAuth
    try {
      // Get user info from Discord
      const userResponse = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${data.access_token}` }
      });
      
      if (userResponse.ok) {
        const userInfo = await userResponse.json();
        const now = Date.now();
        
        // First, ensure user exists in main users table
        const avatarUrl = userInfo.avatar ? `https://cdn.discordapp.com/avatars/${userInfo.id}/${userInfo.avatar}.png?size=512` : null;
        const bannerUrl = userInfo.banner ? `https://cdn.discordapp.com/banners/${userInfo.id}/${userInfo.banner}.png?size=1024` : null;
        
        createUserIfNotExists(
          userInfo.id,
          userInfo.username,
          userInfo.global_name || userInfo.username,
          avatarUrl,
          bannerUrl,
          userInfo.bio || null
        );
        
        // Then register user in website_registered_users table
        stmtRegisterWebsiteUser.run(userInfo.id, now, 'website', now);
        
        // Try to fetch fresh member data from Discord
        await fetchMemberOnRegistration(userInfo.id);
        
        console.log(`✅ Auto-registered user: ${userInfo.username} (${userInfo.id})`);
        console.log(`📊 User now registered in website_registered_users table`);
      }
    } catch (regError) {
      console.error('❌ Error auto-registering user:', regError);
      // Don't fail the OAuth flow if registration fails
    }

    console.log('🎉 OAuth flow completed successfully');
    res.json({ success: true, access_token: data.access_token });
  } catch (err) {
    console.error('Discord auth error:', err);
    res.status(500).json({ success: false, error: 'Server error during authentication' });
  }
});

// ============ HEALTH ============
app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'healthy', timestamp: Date.now() });
});

// Root route - helpful info
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Activity Leaderboard API',
    endpoints: [
      '/api/health',
      '/api/leaderboard',
      '/api/stats',
      '/api/profile/:userId'
    ]
  });
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`✅ API Server: http://localhost:${PORT}`);
});

// Upgrade HTTP server to WebSocket
server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const userId = url.searchParams.get('userId');

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, userId);
  });
});

export { db };
