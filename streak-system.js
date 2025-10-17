// Enhanced Streak System with Configurable Requirements
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const db = new Database(path.join(__dirname, 'database.db'));

// Create streak settings table
db.exec(`
  CREATE TABLE IF NOT EXISTS streak_settings (
    setting_key TEXT PRIMARY KEY,
    setting_value TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    updated_by TEXT
  );

  CREATE TABLE IF NOT EXISTS activity_streaks (
    user_id TEXT PRIMARY KEY,
    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    last_activity_date TEXT,
    today_voice_minutes INTEGER DEFAULT 0,
    today_messages INTEGER DEFAULT 0,
    streak_qualified_today INTEGER DEFAULT 0,
    total_streak_days INTEGER DEFAULT 0,
    FOREIGN KEY(user_id) REFERENCES users(user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_activity_streaks ON activity_streaks(user_id, last_activity_date);
`);

// Initialize default settings
const initializeSettings = () => {
  const defaults = {
    required_voice_minutes: '5',
    required_messages: '5',
    streak_reward_gems: '10',
    streak_milestone_7_gems: '50',
    streak_milestone_14_gems: '100',
    streak_milestone_30_gems: '250',
    streak_milestone_60_gems: '500',
    streak_milestone_90_gems: '1000',
  };

  const now = Date.now();
  for (const [key, value] of Object.entries(defaults)) {
    try {
      db.prepare(`
        INSERT OR IGNORE INTO streak_settings (setting_key, setting_value, updated_at)
        VALUES (?, ?, ?)
      `).run(key, value, now);
    } catch (err) {
      console.error(`Error initializing setting ${key}:`, err);
    }
  }
};

initializeSettings();

// Get streak settings
export function getStreakSettings() {
  try {
    const settings = db.prepare(`
      SELECT setting_key, setting_value FROM streak_settings
    `).all();

    const config = {};
    settings.forEach(s => {
      config[s.setting_key] = s.setting_value;
    });

    return {
      required_voice_minutes: parseInt(config.required_voice_minutes) || 5,
      required_messages: parseInt(config.required_messages) || 5,
      streak_reward_gems: parseInt(config.streak_reward_gems) || 10,
      milestones: {
        7: parseInt(config.streak_milestone_7_gems) || 50,
        14: parseInt(config.streak_milestone_14_gems) || 100,
        30: parseInt(config.streak_milestone_30_gems) || 250,
        60: parseInt(config.streak_milestone_60_gems) || 500,
        90: parseInt(config.streak_milestone_90_gems) || 1000,
      }
    };
  } catch (err) {
    console.error('Error getting streak settings:', err);
    return {
      required_voice_minutes: 5,
      required_messages: 5,
      streak_reward_gems: 10,
      milestones: { 7: 50, 14: 100, 30: 250, 60: 500, 90: 1000 }
    };
  }
}

// Update streak settings (admin only)
export function updateStreakSettings(settings, updatedBy) {
  try {
    const now = Date.now();
    const validKeys = [
      'required_voice_minutes',
      'required_messages',
      'streak_reward_gems',
      'streak_milestone_7_gems',
      'streak_milestone_14_gems',
      'streak_milestone_30_gems',
      'streak_milestone_60_gems',
      'streak_milestone_90_gems',
    ];

    for (const [key, value] of Object.entries(settings)) {
      if (!validKeys.includes(key)) continue;

      db.prepare(`
        INSERT INTO streak_settings (setting_key, setting_value, updated_at, updated_by)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(setting_key) DO UPDATE SET
          setting_value = excluded.setting_value,
          updated_at = excluded.updated_at,
          updated_by = excluded.updated_by
      `).run(key, value.toString(), now, updatedBy);
    }

    console.log(`✅ Streak settings updated by ${updatedBy}`);
    return { success: true };
  } catch (err) {
    console.error('Error updating streak settings:', err);
    return { success: false, error: err.message };
  }
}

// Track user activity for today
export function trackUserActivity(userId, voiceMinutes = 0, messages = 0) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const settings = getStreakSettings();

    // Get or create activity streak record
    let streak = db.prepare(`
      SELECT * FROM activity_streaks WHERE user_id = ?
    `).get(userId);

    if (!streak) {
      db.prepare(`
        INSERT INTO activity_streaks (user_id, current_streak, longest_streak, last_activity_date, today_voice_minutes, today_messages, streak_qualified_today, total_streak_days)
        VALUES (?, 0, 0, ?, 0, 0, 0, 0)
      `).run(userId, today);
      streak = db.prepare('SELECT * FROM activity_streaks WHERE user_id = ?').get(userId);
    }

    // Check if it's a new day
    if (streak.last_activity_date !== today) {
      // Check if yesterday's activity qualified for streak
      const yesterday = getYesterday();

      if (streak.last_activity_date === yesterday && streak.streak_qualified_today === 1) {
        // Continue streak
        const newStreak = streak.current_streak + 1;
        const longestStreak = Math.max(newStreak, streak.longest_streak);

        db.prepare(`
          UPDATE activity_streaks
          SET current_streak = ?,
              longest_streak = ?,
              last_activity_date = ?,
              today_voice_minutes = ?,
              today_messages = ?,
              streak_qualified_today = 0,
              total_streak_days = total_streak_days + 1
          WHERE user_id = ?
        `).run(newStreak, longestStreak, today, voiceMinutes, messages, userId);

        // Award milestone rewards
        checkAndAwardMilestone(userId, newStreak);
      } else if (streak.last_activity_date !== yesterday) {
        // Streak broken - reset
        db.prepare(`
          UPDATE activity_streaks
          SET current_streak = 0,
              last_activity_date = ?,
              today_voice_minutes = ?,
              today_messages = ?,
              streak_qualified_today = 0
          WHERE user_id = ?
        `).run(today, voiceMinutes, messages, userId);
      } else {
        // Just update for new day
        db.prepare(`
          UPDATE activity_streaks
          SET last_activity_date = ?,
              today_voice_minutes = ?,
              today_messages = ?,
              streak_qualified_today = 0
          WHERE user_id = ?
        `).run(today, voiceMinutes, messages, userId);
      }

      streak = db.prepare('SELECT * FROM activity_streaks WHERE user_id = ?').get(userId);
    } else {
      // Same day - update activity
      db.prepare(`
        UPDATE activity_streaks
        SET today_voice_minutes = today_voice_minutes + ?,
            today_messages = today_messages + ?
        WHERE user_id = ?
      `).run(voiceMinutes, messages, userId);

      streak = db.prepare('SELECT * FROM activity_streaks WHERE user_id = ?').get(userId);
    }

    // Check if user qualifies for streak today
    const totalVoice = streak.today_voice_minutes + voiceMinutes;
    const totalMessages = streak.today_messages + messages;

    if (totalVoice >= settings.required_voice_minutes &&
        totalMessages >= settings.required_messages &&
        streak.streak_qualified_today === 0) {
      db.prepare(`
        UPDATE activity_streaks
        SET streak_qualified_today = 1
        WHERE user_id = ?
      `).run(userId);

      // Award daily streak reward
      const reward = settings.streak_reward_gems;
      db.prepare('UPDATE users SET gems = gems + ? WHERE user_id = ?').run(reward, userId);

      console.log(`✅ ${userId} qualified for streak! +${reward} gems`);

      return {
        qualified: true,
        reward,
        voice: totalVoice,
        messages: totalMessages,
        required_voice: settings.required_voice_minutes,
        required_messages: settings.required_messages
      };
    }

    return {
      qualified: false,
      voice: totalVoice,
      messages: totalMessages,
      required_voice: settings.required_voice_minutes,
      required_messages: settings.required_messages
    };
  } catch (err) {
    console.error('Error tracking user activity:', err);
    return { qualified: false, error: err.message };
  }
}

// Check and award milestone rewards
function checkAndAwardMilestone(userId, streakDay) {
  try {
    const settings = getStreakSettings();
    const milestones = settings.milestones;

    if (milestones[streakDay]) {
      const reward = milestones[streakDay];
      db.prepare('UPDATE users SET gems = gems + ? WHERE user_id = ?').run(reward, userId);

      // Log transaction
      db.prepare(`
        INSERT INTO transactions (user_id, transaction_type, amount, description, created_at)
        VALUES (?, 'streak_milestone', ?, ?, ?)
      `).run(userId, reward, `Streak milestone: Day ${streakDay}`, Date.now());

      console.log(`🎉 ${userId} reached ${streakDay}-day streak milestone! +${reward} gems`);
      return true;
    }
    return false;
  } catch (err) {
    console.error('Error awarding milestone:', err);
    return false;
  }
}

// Get user's streak status
export function getUserStreakStatus(userId) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const settings = getStreakSettings();

    let streak = db.prepare(`
      SELECT * FROM activity_streaks WHERE user_id = ?
    `).get(userId);

    if (!streak) {
      return {
        current_streak: 0,
        longest_streak: 0,
        total_streak_days: 0,
        today_progress: {
          voice_minutes: 0,
          messages: 0,
          qualified: false,
          voice_remaining: settings.required_voice_minutes,
          messages_remaining: settings.required_messages
        },
        next_milestone: 7,
        settings
      };
    }

    // Reset today's progress if it's a new day
    if (streak.last_activity_date !== today) {
      streak.today_voice_minutes = 0;
      streak.today_messages = 0;
      streak.streak_qualified_today = 0;
    }

    const voiceRemaining = Math.max(0, settings.required_voice_minutes - streak.today_voice_minutes);
    const messagesRemaining = Math.max(0, settings.required_messages - streak.today_messages);

    return {
      current_streak: streak.current_streak,
      longest_streak: streak.longest_streak,
      total_streak_days: streak.total_streak_days,
      today_progress: {
        voice_minutes: streak.today_voice_minutes,
        messages: streak.today_messages,
        qualified: streak.streak_qualified_today === 1,
        voice_remaining: voiceRemaining,
        messages_remaining: messagesRemaining
      },
      next_milestone: getNextMilestone(streak.current_streak),
      settings
    };
  } catch (err) {
    console.error('Error getting user streak status:', err);
    return null;
  }
}

// Get leaderboard with streaks
export function getStreakLeaderboard(limit = 100) {
  try {
    const users = db.prepare(`
      SELECT
        u.user_id,
        u.username,
        u.global_name,
        u.avatar,
        a.current_streak,
        a.longest_streak,
        a.total_streak_days
      FROM activity_streaks a
      JOIN users u ON a.user_id = u.user_id
      WHERE a.current_streak > 0
      ORDER BY a.current_streak DESC, a.longest_streak DESC
      LIMIT ?
    `).all(limit);

    return users;
  } catch (err) {
    console.error('Error getting streak leaderboard:', err);
    return [];
  }
}

// Helper: Get yesterday's date
function getYesterday() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().split('T')[0];
}

// Helper: Get next milestone
function getNextMilestone(currentStreak) {
  if (currentStreak >= 90) return null;
  if (currentStreak >= 60) return 90;
  if (currentStreak >= 30) return 60;
  if (currentStreak >= 14) return 30;
  if (currentStreak >= 7) return 14;
  return 7;
}

export { db };
