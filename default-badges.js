// Default Badges System
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const db = new Database(path.join(__dirname, 'database.db'));

// Default badge definitions
export const DEFAULT_BADGES = {
  early_user: {
    name: 'Early User',
    description: 'Was here on Day 1 of the Activity launch',
    icon: '🌟',
    color: '#FFD700',
    rarity: 'legendary',
    type: 'early_user',
    auto_grant: false
  },
  active_member: {
    name: 'Active Member',
    description: 'Consistently active in voice and chat',
    icon: '⚡',
    color: '#FF6B6B',
    rarity: 'epic',
    type: 'active_member',
    auto_grant: true,
    requirements: {
      voice_minutes: 100,
      messages: 50
    }
  },
  friend: {
    name: 'Friend',
    description: 'Has made friends in the community',
    icon: '💙',
    color: '#4ECDC4',
    rarity: 'rare',
    type: 'friend',
    auto_grant: true,
    requirements: {
      friends: 5
    }
  },
  partner: {
    name: 'Partner',
    description: 'Official server partner',
    icon: '💎',
    color: '#9B59B6',
    rarity: 'legendary',
    type: 'partner',
    auto_grant: false
  },
  admin: {
    name: 'Admin',
    description: 'Server administrator',
    icon: '👑',
    color: '#E74C3C',
    rarity: 'legendary',
    type: 'admin',
    auto_grant: false
  },
  developer: {
    name: 'Developer',
    description: 'Contributed to the development of this Activity',
    icon: '💻',
    color: '#3498DB',
    rarity: 'legendary',
    type: 'developer',
    auto_grant: false
  },
  og: {
    name: 'OG',
    description: 'Original member from the early days',
    icon: '🏆',
    color: '#F39C12',
    rarity: 'legendary',
    type: 'og',
    auto_grant: false
  },
  voice_enthusiast: {
    name: 'Voice Enthusiast',
    description: 'Spent 500+ minutes in voice channels',
    icon: '🎙️',
    color: '#8E44AD',
    rarity: 'epic',
    type: 'voice_enthusiast',
    auto_grant: true,
    requirements: {
      voice_minutes: 500
    }
  },
  chat_champion: {
    name: 'Chat Champion',
    description: 'Sent 500+ messages',
    icon: '💬',
    color: '#27AE60',
    rarity: 'epic',
    type: 'chat_champion',
    auto_grant: true,
    requirements: {
      messages: 500
    }
  },
  streak_master: {
    name: 'Streak Master',
    description: 'Maintained a 30-day activity streak',
    icon: '🔥',
    color: '#E67E22',
    rarity: 'epic',
    type: 'streak_master',
    auto_grant: true,
    requirements: {
      streak: 30
    }
  },
  respected: {
    name: 'Respected',
    description: 'Earned 100+ respect points',
    icon: '⭐',
    color: '#F1C40F',
    rarity: 'rare',
    type: 'respected',
    auto_grant: true,
    requirements: {
      respect: 100
    }
  },
  clan_leader: {
    name: 'Clan Leader',
    description: 'Founded and leads a clan',
    icon: '🛡️',
    color: '#16A085',
    rarity: 'epic',
    type: 'clan_leader',
    auto_grant: true,
    requirements: {
      is_clan_leader: true
    }
  }
};

// Initialize default badges table
db.exec(`
  CREATE TABLE IF NOT EXISTS default_badges (
    badge_type TEXT PRIMARY KEY,
    badge_name TEXT NOT NULL,
    badge_description TEXT,
    badge_icon TEXT,
    badge_color TEXT,
    rarity TEXT DEFAULT 'common',
    auto_grant INTEGER DEFAULT 0,
    requirements TEXT,
    is_active INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_default_badges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    badge_type TEXT NOT NULL,
    earned_at INTEGER NOT NULL,
    auto_granted INTEGER DEFAULT 0,
    UNIQUE(user_id, badge_type),
    FOREIGN KEY(user_id) REFERENCES users(user_id),
    FOREIGN KEY(badge_type) REFERENCES default_badges(badge_type)
  );

  CREATE INDEX IF NOT EXISTS idx_user_default_badges ON user_default_badges(user_id, badge_type);
`);

// Initialize default badges
export function initializeDefaultBadges() {
  const now = Date.now();

  for (const [type, badge] of Object.entries(DEFAULT_BADGES)) {
    try {
      db.prepare(`
        INSERT OR REPLACE INTO default_badges
        (badge_type, badge_name, badge_description, badge_icon, badge_color, rarity, auto_grant, requirements, is_active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      `).run(
        type,
        badge.name,
        badge.description,
        badge.icon,
        badge.color,
        badge.rarity,
        badge.auto_grant ? 1 : 0,
        badge.requirements ? JSON.stringify(badge.requirements) : null,
        now
      );
    } catch (err) {
      console.error(`Error initializing badge ${type}:`, err);
    }
  }

  console.log('✅ Default badges initialized');
}

// Grant default badge to user
export function grantDefaultBadge(userId, badgeType, autoGranted = false) {
  try {
    // Check if badge exists
    const badge = db.prepare('SELECT * FROM default_badges WHERE badge_type = ? AND is_active = 1').get(badgeType);
    if (!badge) {
      return { success: false, error: 'Badge not found' };
    }

    // Check if user already has this badge
    const existing = db.prepare(`
      SELECT 1 FROM user_default_badges WHERE user_id = ? AND badge_type = ?
    `).get(userId, badgeType);

    if (existing) {
      return { success: false, error: 'User already has this badge' };
    }

    const now = Date.now();
    db.prepare(`
      INSERT INTO user_default_badges (user_id, badge_type, earned_at, auto_granted)
      VALUES (?, ?, ?, ?)
    `).run(userId, badgeType, now, autoGranted ? 1 : 0);

    console.log(`✅ Badge "${badgeType}" granted to ${userId}`);
    return { success: true, badge };
  } catch (err) {
    console.error('Error granting badge:', err);
    return { success: false, error: err.message };
  }
}

// Revoke default badge from user
export function revokeDefaultBadge(userId, badgeType) {
  try {
    db.prepare(`
      DELETE FROM user_default_badges WHERE user_id = ? AND badge_type = ?
    `).run(userId, badgeType);

    console.log(`✅ Badge "${badgeType}" revoked from ${userId}`);
    return { success: true };
  } catch (err) {
    console.error('Error revoking badge:', err);
    return { success: false, error: err.message };
  }
}

// Get user's default badges
export function getUserDefaultBadges(userId) {
  try {
    const badges = db.prepare(`
      SELECT
        db.*,
        udb.earned_at,
        udb.auto_granted
      FROM user_default_badges udb
      JOIN default_badges db ON udb.badge_type = db.badge_type
      WHERE udb.user_id = ? AND db.is_active = 1
      ORDER BY udb.earned_at DESC
    `).all(userId);

    return badges;
  } catch (err) {
    console.error('Error getting user badges:', err);
    return [];
  }
}

// Get all default badges
export function getAllDefaultBadges() {
  try {
    const badges = db.prepare(`
      SELECT * FROM default_badges WHERE is_active = 1 ORDER BY rarity DESC, badge_name ASC
    `).all();

    return badges;
  } catch (err) {
    console.error('Error getting all badges:', err);
    return [];
  }
}

// Check and auto-grant badges based on user stats
export function checkAndGrantAutoBadges(userId) {
  try {
    const user = db.prepare(`
      SELECT
        u.*,
        (SELECT COUNT(*) FROM friends WHERE user_id = u.user_id) as friend_count,
        (SELECT COUNT(*) FROM clans WHERE leader_id = u.user_id) as is_clan_leader,
        COALESCE(a.current_streak, 0) as current_streak
      FROM users u
      LEFT JOIN activity_streaks a ON u.user_id = a.user_id
      WHERE u.user_id = ?
    `).get(userId);

    if (!user) return { success: false, error: 'User not found' };

    const grantedBadges = [];

    // Check each auto-grantable badge
    for (const [type, badge] of Object.entries(DEFAULT_BADGES)) {
      if (!badge.auto_grant || !badge.requirements) continue;

      // Check if user already has this badge
      const existing = db.prepare(`
        SELECT 1 FROM user_default_badges WHERE user_id = ? AND badge_type = ?
      `).get(userId, type);

      if (existing) continue;

      // Check requirements
      let qualified = true;
      const req = badge.requirements;

      if (req.voice_minutes && user.total_voice_minutes < req.voice_minutes) qualified = false;
      if (req.messages && user.total_messages < req.messages) qualified = false;
      if (req.friends && user.friend_count < req.friends) qualified = false;
      if (req.respect && user.respect_count < req.respect) qualified = false;
      if (req.streak && user.current_streak < req.streak) qualified = false;
      if (req.is_clan_leader && user.is_clan_leader < 1) qualified = false;

      if (qualified) {
        const result = grantDefaultBadge(userId, type, true);
        if (result.success) {
          grantedBadges.push({ type, badge: result.badge });
        }
      }
    }

    return { success: true, granted: grantedBadges };
  } catch (err) {
    console.error('Error checking auto badges:', err);
    return { success: false, error: err.message };
  }
}

// Initialize on module load
initializeDefaultBadges();

export { db };
