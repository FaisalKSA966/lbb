// Daily Rewards System
import { db } from './bot.js';

// Daily reward structure (increases with streak)
export const DAILY_REWARDS = {
  day1: { gems: 10, respect: 1, description: 'Day 1' },
  day2: { gems: 15, respect: 1, description: 'Day 2' },
  day3: { gems: 20, respect: 2, description: 'Day 3' },
  day4: { gems: 25, respect: 2, description: 'Day 4' },
  day5: { gems: 30, respect: 3, description: 'Day 5' },
  day6: { gems: 40, respect: 3, description: 'Day 6' },
  day7: { gems: 100, respect: 10, description: 'Week Milestone!', special: true },
  day14: { gems: 250, respect: 25, description: '2-Week Milestone!', special: true },
  day30: { gems: 500, respect: 50, description: 'Month Milestone!', special: true },
  day60: { gems: 1000, respect: 100, description: '2-Month Milestone!', special: true },
  day90: { gems: 2000, respect: 200, description: '3-Month Milestone!', special: true },
};

// Get base daily reward based on streak
function getDailyReward(streakDay) {
  // Milestone rewards
  if (DAILY_REWARDS[`day${streakDay}`]) {
    return DAILY_REWARDS[`day${streakDay}`];
  }

  // Regular days (after day 7)
  if (streakDay > 7) {
    const weekNumber = Math.floor((streakDay - 1) / 7) + 1;
    const baseGems = 40 + (weekNumber * 5);
    const baseRespect = 3 + Math.floor(weekNumber / 2);

    return {
      gems: baseGems,
      respect: baseRespect,
      description: `Day ${streakDay}`
    };
  }

  // Fallback
  return { gems: 10, respect: 1, description: `Day ${streakDay}` };
}

// Check if user can claim daily reward
export function canClaimDailyReward(userId) {
  try {
    const today = new Date().toISOString().split('T')[0];

    const rewardData = db.prepare(`
      SELECT current_streak, last_claim_date, next_milestone
      FROM daily_rewards
      WHERE user_id = ?
    `).get(userId);

    if (!rewardData) {
      return {
        canClaim: true,
        streakDay: 1,
        isNewUser: true
      };
    }

    const lastClaim = rewardData.last_claim_date;

    // Already claimed today
    if (lastClaim === today) {
      return {
        canClaim: false,
        reason: 'already_claimed_today',
        nextClaimDate: getNextClaimDate(today)
      };
    }

    // Check if streak is broken
    const yesterday = getYesterday();
    const isStreakActive = lastClaim === yesterday || !lastClaim;

    const newStreakDay = isStreakActive ? rewardData.current_streak + 1 : 1;

    return {
      canClaim: true,
      streakDay: newStreakDay,
      streakBroken: !isStreakActive && lastClaim !== null
    };
  } catch (err) {
    console.error('Error checking daily reward:', err);
    return { canClaim: false, error: err.message };
  }
}

// Claim daily reward
export function claimDailyReward(userId) {
  try {
    const claimCheck = canClaimDailyReward(userId);

    if (!claimCheck.canClaim) {
      return {
        success: false,
        error: claimCheck.reason || 'Cannot claim reward'
      };
    }

    const today = new Date().toISOString().split('T')[0];
    const now = Date.now();
    const streakDay = claimCheck.streakDay;
    const reward = getDailyReward(streakDay);

    // Update or insert daily_rewards record
    db.prepare(`
      INSERT INTO daily_rewards (user_id, current_streak, last_claim_date, total_claims, next_milestone)
      VALUES (?, ?, ?, 1, 7)
      ON CONFLICT(user_id) DO UPDATE SET
        current_streak = ?,
        last_claim_date = ?,
        total_claims = total_claims + 1,
        next_milestone = CASE
          WHEN ? >= 90 THEN 90
          WHEN ? >= 60 THEN 90
          WHEN ? >= 30 THEN 60
          WHEN ? >= 14 THEN 30
          WHEN ? >= 7 THEN 14
          ELSE 7
        END
    `).run(userId, streakDay, today, streakDay, today, streakDay, streakDay, streakDay, streakDay, streakDay);

    // Record the claim
    db.prepare(`
      INSERT INTO reward_claims (user_id, claim_date, day_number, reward_type, reward_value, claimed_at)
      VALUES (?, ?, ?, 'daily', ?, ?)
    `).run(userId, today, streakDay, reward.gems, now);

    // Award gems and respect
    db.prepare('UPDATE users SET gems = gems + ?, respect_count = respect_count + ? WHERE user_id = ?')
      .run(reward.gems, reward.respect, userId);

    // Log transaction
    db.prepare(`
      INSERT INTO transactions (user_id, transaction_type, amount, description, created_at)
      VALUES (?, 'daily_reward', ?, ?, ?)
    `).run(userId, reward.gems, `Daily reward: Day ${streakDay}`, now);

    console.log(`✅ Daily reward claimed by ${userId}: Day ${streakDay}`);

    return {
      success: true,
      reward: {
        ...reward,
        day: streakDay
      },
      streakDay,
      nextMilestone: getNextMilestone(streakDay),
      streakBroken: claimCheck.streakBroken || false
    };
  } catch (err) {
    console.error('Error claiming daily reward:', err);
    return {
      success: false,
      error: err.message
    };
  }
}

// Get user's daily reward status
export function getDailyRewardStatus(userId) {
  try {
    const rewardData = db.prepare(`
      SELECT current_streak, last_claim_date, total_claims, next_milestone
      FROM daily_rewards
      WHERE user_id = ?
    `).get(userId);

    const claimCheck = canClaimDailyReward(userId);
    const today = new Date().toISOString().split('T')[0];

    if (!rewardData) {
      return {
        currentStreak: 0,
        canClaim: true,
        nextReward: getDailyReward(1),
        totalClaims: 0,
        nextMilestone: 7
      };
    }

    const currentStreak = rewardData.current_streak;
    const nextDay = claimCheck.canClaim ? claimCheck.streakDay : currentStreak;

    return {
      currentStreak,
      canClaim: claimCheck.canClaim,
      nextReward: getDailyReward(nextDay),
      nextRewardDay: nextDay,
      totalClaims: rewardData.total_claims,
      nextMilestone: getNextMilestone(currentStreak),
      lastClaimDate: rewardData.last_claim_date,
      streakActive: rewardData.last_claim_date === today || rewardData.last_claim_date === getYesterday()
    };
  } catch (err) {
    console.error('Error getting daily reward status:', err);
    return null;
  }
}

// Get upcoming rewards preview (next 7 days)
export function getUpcomingRewards(currentStreak = 0) {
  const upcoming = [];
  for (let i = 1; i <= 7; i++) {
    const day = currentStreak + i;
    const reward = getDailyReward(day);
    upcoming.push({
      day,
      ...reward,
      isMilestone: reward.special || false
    });
  }
  return upcoming;
}

// Helper: Get yesterday's date
function getYesterday() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().split('T')[0];
}

// Helper: Get next claim date
function getNextClaimDate(currentDate) {
  const tomorrow = new Date(currentDate);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString().split('T')[0];
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

// Get user's claim history
export function getClaimHistory(userId, limit = 30) {
  try {
    const claims = db.prepare(`
      SELECT claim_date, day_number, reward_value, claimed_at
      FROM reward_claims
      WHERE user_id = ?
      ORDER BY claimed_at DESC
      LIMIT ?
    `).all(userId, limit);

    return claims.map(claim => ({
      date: claim.claim_date,
      day: claim.day_number,
      gems: claim.reward_value,
      claimedAt: claim.claimed_at
    }));
  } catch (err) {
    console.error('Error getting claim history:', err);
    return [];
  }
}
