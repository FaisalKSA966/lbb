// Achievements System
import { db } from './bot.js';

// Achievement definitions
export const ACHIEVEMENTS = {
  // Voice Activity Achievements
  'voice_novice': {
    achievement_id: 'voice_novice',
    name: 'Voice Novice',
    description: 'Spend 60 minutes in voice channels',
    category: 'voice',
    requirement_type: 'total_voice_minutes',
    requirement_value: 60,
    reward_gems: 50,
    reward_badge: 'voice_bronze',
    icon: '🎤',
    rarity: 'common'
  },
  'voice_enthusiast': {
    achievement_id: 'voice_enthusiast',
    name: 'Voice Enthusiast',
    description: 'Spend 500 minutes in voice channels',
    category: 'voice',
    requirement_type: 'total_voice_minutes',
    requirement_value: 500,
    reward_gems: 150,
    reward_badge: 'voice_silver',
    icon: '🎧',
    rarity: 'uncommon'
  },
  'voice_master': {
    achievement_id: 'voice_master',
    name: 'Voice Master',
    description: 'Spend 2000 minutes in voice channels',
    category: 'voice',
    requirement_type: 'total_voice_minutes',
    requirement_value: 2000,
    reward_gems: 500,
    reward_badge: 'voice_gold',
    icon: '🎙️',
    rarity: 'rare'
  },
  'night_owl': {
    achievement_id: 'night_owl',
    name: 'Night Owl',
    description: 'Be in voice between 12 AM - 6 AM ten times',
    category: 'voice',
    requirement_type: 'late_night_sessions',
    requirement_value: 10,
    reward_gems: 200,
    reward_badge: 'night_owl',
    icon: '🦉',
    rarity: 'rare'
  },

  // Message Achievements
  'chatterbox': {
    achievement_id: 'chatterbox',
    name: 'Chatterbox',
    description: 'Send 1000 messages',
    category: 'messages',
    requirement_type: 'total_messages',
    requirement_value: 1000,
    reward_gems: 100,
    reward_badge: 'message_bronze',
    icon: '💬',
    rarity: 'common'
  },
  'conversation_king': {
    achievement_id: 'conversation_king',
    name: 'Conversation King',
    description: 'Send 5000 messages',
    category: 'messages',
    requirement_type: 'total_messages',
    requirement_value: 5000,
    reward_gems: 300,
    reward_badge: 'message_silver',
    icon: '👑',
    rarity: 'uncommon'
  },
  'message_legend': {
    achievement_id: 'message_legend',
    name: 'Message Legend',
    description: 'Send 20000 messages',
    category: 'messages',
    requirement_type: 'total_messages',
    requirement_value: 20000,
    reward_gems: 1000,
    reward_badge: 'message_gold',
    icon: '⭐',
    rarity: 'epic'
  },

  // Streak Achievements
  'streak_starter': {
    achievement_id: 'streak_starter',
    name: 'Streak Starter',
    description: 'Maintain a 7-day streak',
    category: 'streaks',
    requirement_type: 'streak_count',
    requirement_value: 7,
    reward_gems: 100,
    reward_badge: 'streak_week',
    icon: '🔥',
    rarity: 'common'
  },
  'loyal_member': {
    achievement_id: 'loyal_member',
    name: 'Loyal Member',
    description: 'Maintain a 30-day streak',
    category: 'streaks',
    requirement_type: 'streak_count',
    requirement_value: 30,
    reward_gems: 500,
    reward_badge: 'streak_month',
    icon: '💎',
    rarity: 'rare'
  },
  'dedication_master': {
    achievement_id: 'dedication_master',
    name: 'Dedication Master',
    description: 'Maintain a 100-day streak',
    category: 'streaks',
    requirement_type: 'streak_count',
    requirement_value: 100,
    reward_gems: 2000,
    reward_badge: 'streak_legend',
    icon: '👑',
    rarity: 'legendary'
  },

  // Social Achievements
  'social_butterfly': {
    achievement_id: 'social_butterfly',
    name: 'Social Butterfly',
    description: 'Add 10 friends',
    category: 'social',
    requirement_type: 'friends_count',
    requirement_value: 10,
    reward_gems: 150,
    reward_badge: 'social_bronze',
    icon: '🦋',
    rarity: 'common'
  },
  'generous_soul': {
    achievement_id: 'generous_soul',
    name: 'Generous Soul',
    description: 'Give 100 respect to others',
    category: 'social',
    requirement_type: 'respect_given',
    requirement_value: 100,
    reward_gems: 300,
    reward_badge: 'generous',
    icon: '💝',
    rarity: 'uncommon'
  },
  'respect_legend': {
    achievement_id: 'respect_legend',
    name: 'Respect Legend',
    description: 'Receive 500 respect from others',
    category: 'social',
    requirement_type: 'respect_count',
    requirement_value: 500,
    reward_gems: 500,
    reward_badge: 'respected',
    icon: '🌟',
    rarity: 'rare'
  },

  // Clan Achievements
  'clan_founder': {
    achievement_id: 'clan_founder',
    name: 'Clan Founder',
    description: 'Create a clan',
    category: 'clans',
    requirement_type: 'clan_created',
    requirement_value: 1,
    reward_gems: 200,
    reward_badge: 'founder',
    icon: '🏰',
    rarity: 'uncommon'
  },
  'clan_leader': {
    achievement_id: 'clan_leader',
    name: 'Clan Leader',
    description: 'Lead a clan to Top 3 ranking',
    category: 'clans',
    requirement_type: 'clan_top3',
    requirement_value: 1,
    reward_gems: 1000,
    reward_badge: 'top_clan',
    icon: '👑',
    rarity: 'epic'
  },

  // Trade Achievements
  'trader_novice': {
    achievement_id: 'trader_novice',
    name: 'Trader Novice',
    description: 'Complete 10 trades',
    category: 'trading',
    requirement_type: 'trades_completed',
    requirement_value: 10,
    reward_gems: 100,
    reward_badge: 'trader_bronze',
    icon: '🤝',
    rarity: 'common'
  },
  'merchant': {
    achievement_id: 'merchant',
    name: 'Merchant',
    description: 'Complete 50 trades',
    category: 'trading',
    requirement_type: 'trades_completed',
    requirement_value: 50,
    reward_gems: 500,
    reward_badge: 'merchant',
    icon: '💰',
    rarity: 'rare'
  },

  // Quest Achievements
  'quest_hunter': {
    achievement_id: 'quest_hunter',
    name: 'Quest Hunter',
    description: 'Complete 20 quests',
    category: 'quests',
    requirement_type: 'quests_completed',
    requirement_value: 20,
    reward_gems: 300,
    reward_badge: 'quest_hunter',
    icon: '🎯',
    rarity: 'uncommon'
  },

  // Secret Achievements
  'early_bird': {
    achievement_id: 'early_bird',
    name: 'Early Bird',
    description: '???',
    category: 'secret',
    requirement_type: 'early_morning_sessions',
    requirement_value: 5,
    reward_gems: 250,
    reward_badge: 'early_bird',
    icon: '🌅',
    rarity: 'rare',
    is_secret: 1
  },
  'completionist': {
    achievement_id: 'completionist',
    name: 'Completionist',
    description: 'Unlock all non-secret achievements',
    category: 'secret',
    requirement_type: 'achievements_unlocked',
    requirement_value: 20,
    reward_gems: 5000,
    reward_badge: 'completionist',
    icon: '🏆',
    rarity: 'legendary',
    is_secret: 1
  }
};

// Initialize achievements in database
export function initializeAchievements() {
  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO achievements
      (achievement_id, name, description, category, requirement_type, requirement_value,
       reward_gems, reward_badge, icon, rarity, is_secret)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    Object.values(ACHIEVEMENTS).forEach(achievement => {
      stmt.run(
        achievement.achievement_id,
        achievement.name,
        achievement.description,
        achievement.category,
        achievement.requirement_type,
        achievement.requirement_value,
        achievement.reward_gems,
        achievement.reward_badge,
        achievement.icon,
        achievement.rarity,
        achievement.is_secret || 0
      );
    });

    console.log('✅ Achievements initialized successfully');
  } catch (err) {
    console.error('❌ Failed to initialize achievements:', err);
  }
}

// Check and unlock achievements for a user
export function checkAchievements(userId) {
  try {
    // Get user stats
    const user = db.prepare(`
      SELECT
        total_voice_minutes,
        total_messages,
        streak_count,
        respect_count
      FROM users WHERE user_id = ?
    `).get(userId);

    if (!user) return;

    // Count friends
    const friendsCount = db.prepare(
      'SELECT COUNT(*) as count FROM friends WHERE user_id = ?'
    ).get(userId)?.count || 0;

    // Count respect given
    const respectGiven = db.prepare(
      'SELECT COUNT(*) as count FROM respect_given WHERE giver_id = ?'
    ).get(userId)?.count || 0;

    // Count trades completed
    const tradesCompleted = db.prepare(
      `SELECT COUNT(*) as count FROM trades
       WHERE (sender_id = ? OR receiver_id = ?) AND status = 'accepted'`
    ).get(userId, userId)?.count || 0;

    // Count quests completed
    const questsCompleted = db.prepare(
      'SELECT COUNT(*) as count FROM user_quests WHERE user_id = ? AND completed = 1'
    ).get(userId)?.count || 0;

    // Count achievements unlocked
    const achievementsUnlocked = db.prepare(
      'SELECT COUNT(*) as count FROM user_achievements WHERE user_id = ? AND unlocked = 1'
    ).get(userId)?.count || 0;

    // Check clan created
    const clanCreated = db.prepare(
      'SELECT COUNT(*) as count FROM clans WHERE leader_id = ?'
    ).get(userId)?.count || 0;

    const stats = {
      total_voice_minutes: user.total_voice_minutes,
      total_messages: user.total_messages,
      streak_count: user.streak_count,
      respect_count: user.respect_count,
      friends_count: friendsCount,
      respect_given: respectGiven,
      trades_completed: tradesCompleted,
      quests_completed: questsCompleted,
      achievements_unlocked: achievementsUnlocked,
      clan_created: clanCreated
    };

    const unlockedAchievements = [];

    // Check each achievement
    Object.values(ACHIEVEMENTS).forEach(achievement => {
      const statValue = stats[achievement.requirement_type] || 0;

      if (statValue >= achievement.requirement_value) {
        const unlocked = unlockAchievement(userId, achievement.achievement_id);
        if (unlocked) {
          unlockedAchievements.push(achievement);
        }
      }
    });

    return unlockedAchievements;
  } catch (err) {
    console.error('Error checking achievements:', err);
    return [];
  }
}

// Unlock achievement for user
function unlockAchievement(userId, achievementId) {
  try {
    const existing = db.prepare(
      'SELECT unlocked FROM user_achievements WHERE user_id = ? AND achievement_id = ?'
    ).get(userId, achievementId);

    if (existing?.unlocked) {
      return false; // Already unlocked
    }

    const now = Date.now();

    if (existing) {
      // Update existing record
      db.prepare(`
        UPDATE user_achievements
        SET unlocked = 1, unlocked_at = ?
        WHERE user_id = ? AND achievement_id = ?
      `).run(now, userId, achievementId);
    } else {
      // Insert new record
      db.prepare(`
        INSERT INTO user_achievements (user_id, achievement_id, progress, unlocked, unlocked_at)
        VALUES (?, ?, 100, 1, ?)
      `).run(userId, achievementId, now);
    }

    // Award gems
    const achievement = ACHIEVEMENTS[achievementId];
    if (achievement && achievement.reward_gems > 0) {
      db.prepare('UPDATE users SET gems = gems + ? WHERE user_id = ?')
        .run(achievement.reward_gems, userId);
    }

    console.log(`🏆 Achievement unlocked: ${achievementId} for user ${userId}`);
    return true;
  } catch (err) {
    console.error('Error unlocking achievement:', err);
    return false;
  }
}

// Get user achievements with progress
export function getUserAchievements(userId) {
  try {
    const user = db.prepare(`
      SELECT
        total_voice_minutes,
        total_messages,
        streak_count,
        respect_count
      FROM users WHERE user_id = ?
    `).get(userId);

    if (!user) return [];

    const friendsCount = db.prepare(
      'SELECT COUNT(*) as count FROM friends WHERE user_id = ?'
    ).get(userId)?.count || 0;

    const respectGiven = db.prepare(
      'SELECT COUNT(*) as count FROM respect_given WHERE giver_id = ?'
    ).get(userId)?.count || 0;

    const tradesCompleted = db.prepare(
      `SELECT COUNT(*) as count FROM trades
       WHERE (sender_id = ? OR receiver_id = ?) AND status = 'accepted'`
    ).get(userId, userId)?.count || 0;

    const questsCompleted = db.prepare(
      'SELECT COUNT(*) as count FROM user_quests WHERE user_id = ? AND completed = 1'
    ).get(userId)?.count || 0;

    const achievementsUnlocked = db.prepare(
      'SELECT COUNT(*) as count FROM user_achievements WHERE user_id = ? AND unlocked = 1'
    ).get(userId)?.count || 0;

    const clanCreated = db.prepare(
      'SELECT COUNT(*) as count FROM clans WHERE leader_id = ?'
    ).get(userId)?.count || 0;

    const stats = {
      total_voice_minutes: user.total_voice_minutes,
      total_messages: user.total_messages,
      streak_count: user.streak_count,
      respect_count: user.respect_count,
      friends_count: friendsCount,
      respect_given: respectGiven,
      trades_completed: tradesCompleted,
      quests_completed: questsCompleted,
      achievements_unlocked: achievementsUnlocked,
      clan_created: clanCreated
    };

    const userAchievements = db.prepare(`
      SELECT achievement_id, unlocked, unlocked_at
      FROM user_achievements
      WHERE user_id = ?
    `).all(userId);

    const unlockedMap = {};
    userAchievements.forEach(ua => {
      unlockedMap[ua.achievement_id] = {
        unlocked: ua.unlocked === 1,
        unlocked_at: ua.unlocked_at
      };
    });

    return Object.values(ACHIEVEMENTS).map(achievement => {
      const statValue = stats[achievement.requirement_type] || 0;
      const progress = Math.min(100, Math.floor((statValue / achievement.requirement_value) * 100));
      const userAch = unlockedMap[achievement.achievement_id] || {};

      return {
        ...achievement,
        progress,
        current_value: statValue,
        unlocked: userAch.unlocked || false,
        unlocked_at: userAch.unlocked_at || null
      };
    });
  } catch (err) {
    console.error('Error getting user achievements:', err);
    return [];
  }
}
