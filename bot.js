// Discord Bot - Activity Tracking with Chat Activity Integration
import dotenv from 'dotenv';
import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  REST,
  Routes
} from 'discord.js';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';
import { trackUserActivity } from './streak-system.js';
import { initializeDefaultBadges, checkAndGrantAutoBadges } from './default-badges.js';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '.env');

console.log('Loading environment variables from:', envPath);
const result = dotenv.config({ path: envPath });

if (result.error) {
  console.error('Error loading .env file:', result.error);
} else {
  console.log('Environment variables loaded successfully');
}

const { TOKEN, GUILD_ID, ACTIVITY_CHANNEL_ID, ACTIVITY_APP_ID, CLIENT_ID, EXTERNAL_API_URL } = process.env;

// Debug: Show which variables are loaded
console.log('Environment variables status:');
console.log('TOKEN:', TOKEN ? '✓ Loaded' : '✗ Missing');
console.log('GUILD_ID:', GUILD_ID ? '✓ Loaded' : '✗ Missing');
console.log('ACTIVITY_CHANNEL_ID:', ACTIVITY_CHANNEL_ID ? '✓ Loaded' : '✗ Missing');
console.log('ACTIVITY_APP_ID:', ACTIVITY_APP_ID ? '✓ Loaded' : '✗ Missing');
console.log('EXTERNAL_API_URL:', EXTERNAL_API_URL ? '✓ Loaded' : '✗ Missing');

if (!TOKEN || !GUILD_ID || !ACTIVITY_CHANNEL_ID || !ACTIVITY_APP_ID) {
  console.error('Missing environment variables: TOKEN, GUILD_ID, ACTIVITY_CHANNEL_ID, ACTIVITY_APP_ID');
  process.exit(1);
}

// Database
const db = new Database(path.join(__dirname, 'database.db'));
db.pragma('journal_mode = WAL');

// Function to sync data with external API
async function syncWithExternalAPI(endpoint, data) {
  if (!EXTERNAL_API_URL) {
    console.log('⚠️ EXTERNAL_API_URL not set, skipping external API sync');
    return;
  }

  try {
    const response = await fetch(`${EXTERNAL_API_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data)
    });

    if (response.ok) {
      console.log(`✅ Synced with external API: ${endpoint}`);
    } else {
      console.log(`⚠️ External API sync failed: ${endpoint} - Status: ${response.status}`);
    }
  } catch (error) {
    console.log(`⚠️ External API sync error: ${endpoint} - ${error.message}`);
  }
}

// Create enhanced schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    global_name TEXT,
    avatar TEXT,
    banner TEXT,
    about_me TEXT,
    joined_server_at INTEGER,
    total_voice_minutes INTEGER DEFAULT 0,
    total_messages INTEGER DEFAULT 0,
    respect_count INTEGER DEFAULT 0,
    streak_count INTEGER DEFAULT 0,
    gems INTEGER DEFAULT 0,
    last_streak_date TEXT,
    last_voice_date TEXT,
    last_message_date TEXT,
    last_updated INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS voice_sessions (
    session_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    join_time INTEGER NOT NULL,
    leave_time INTEGER,
    duration_minutes INTEGER,
    FOREIGN KEY(user_id) REFERENCES users(user_id)
  );

  CREATE TABLE IF NOT EXISTS respect_given (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    giver_id TEXT NOT NULL,
    receiver_id TEXT NOT NULL,
    given_at INTEGER NOT NULL,
    UNIQUE(giver_id, receiver_id, given_at)
  );

  CREATE TABLE IF NOT EXISTS friends (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    friend_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(user_id, friend_id)
  );

  CREATE TABLE IF NOT EXISTS respect_transfers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id TEXT NOT NULL,
    receiver_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    transferred_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS daily_activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    date TEXT NOT NULL,
    voice_minutes INTEGER DEFAULT 0,
    messages_count INTEGER DEFAULT 0,
    UNIQUE(user_id, date)
  );

  CREATE TABLE IF NOT EXISTS badges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    badge_type TEXT NOT NULL,
    badge_tier INTEGER DEFAULT 1,
    earned_at INTEGER NOT NULL,
    UNIQUE(user_id, badge_type, badge_tier)
  );

  CREATE TABLE IF NOT EXISTS clans (
    clan_id INTEGER PRIMARY KEY AUTOINCREMENT,
    clan_name TEXT NOT NULL UNIQUE,
    clan_tag TEXT,
    clan_description TEXT,
    leader_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    total_members INTEGER DEFAULT 1,
    total_score INTEGER DEFAULT 0,
    FOREIGN KEY(leader_id) REFERENCES users(user_id)
  );

  CREATE TABLE IF NOT EXISTS clan_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    clan_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT DEFAULT 'member',
    joined_at INTEGER NOT NULL,
    contribution_voice INTEGER DEFAULT 0,
    contribution_messages INTEGER DEFAULT 0,
    contribution_respect INTEGER DEFAULT 0,
    UNIQUE(user_id),
    FOREIGN KEY(clan_id) REFERENCES clans(clan_id),
    FOREIGN KEY(user_id) REFERENCES users(user_id)
  );

  CREATE TABLE IF NOT EXISTS clan_invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    clan_id INTEGER NOT NULL,
    inviter_id TEXT NOT NULL,
    invitee_id TEXT NOT NULL,
    invited_at INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    FOREIGN KEY(clan_id) REFERENCES clans(clan_id)
  );

  CREATE TABLE IF NOT EXISTS quests (
    quest_id INTEGER PRIMARY KEY AUTOINCREMENT,
    quest_type TEXT NOT NULL,
    quest_name TEXT NOT NULL,
    quest_description TEXT,
    requirement_type TEXT NOT NULL,
    requirement_value INTEGER NOT NULL,
    reward_gems INTEGER DEFAULT 0,
    reward_respect INTEGER DEFAULT 0,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    is_weekly INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS user_quests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    quest_id INTEGER NOT NULL,
    progress INTEGER DEFAULT 0,
    completed INTEGER DEFAULT 0,
    claimed INTEGER DEFAULT 0,
    started_at INTEGER NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(user_id),
    FOREIGN KEY(quest_id) REFERENCES quests(quest_id),
    UNIQUE(user_id, quest_id)
  );

  CREATE TABLE IF NOT EXISTS trades (
    trade_id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id TEXT NOT NULL,
    receiver_id TEXT NOT NULL,
    offer_type TEXT NOT NULL,
    offer_value TEXT NOT NULL,
    request_type TEXT NOT NULL,
    request_value TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at INTEGER NOT NULL,
    updated_at INTEGER,
    FOREIGN KEY(sender_id) REFERENCES users(user_id),
    FOREIGN KEY(receiver_id) REFERENCES users(user_id)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    transaction_type TEXT NOT NULL,
    amount INTEGER NOT NULL,
    description TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(user_id)
  );

  CREATE TABLE IF NOT EXISTS user_customization (
    user_id TEXT PRIMARY KEY,
    theme_color TEXT DEFAULT '#9146FF',
    profile_frame TEXT DEFAULT 'default',
    profile_border TEXT DEFAULT 'none',
    custom_banner TEXT,
    selected_title TEXT,
    updated_at INTEGER DEFAULT 0,
    FOREIGN KEY(user_id) REFERENCES users(user_id)
  );

  CREATE TABLE IF NOT EXISTS achievements (
    achievement_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    requirement_type TEXT NOT NULL,
    requirement_value INTEGER NOT NULL,
    reward_gems INTEGER DEFAULT 0,
    reward_badge TEXT,
    icon TEXT,
    rarity TEXT DEFAULT 'common',
    is_secret INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS user_achievements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    achievement_id TEXT NOT NULL,
    progress INTEGER DEFAULT 0,
    unlocked INTEGER DEFAULT 0,
    unlocked_at INTEGER,
    UNIQUE(user_id, achievement_id),
    FOREIGN KEY(user_id) REFERENCES users(user_id),
    FOREIGN KEY(achievement_id) REFERENCES achievements(achievement_id)
  );

  CREATE TABLE IF NOT EXISTS daily_rewards (
    user_id TEXT PRIMARY KEY,
    current_streak INTEGER DEFAULT 0,
    last_claim_date TEXT,
    total_claims INTEGER DEFAULT 0,
    next_milestone INTEGER DEFAULT 7,
    FOREIGN KEY(user_id) REFERENCES users(user_id)
  );

  CREATE TABLE IF NOT EXISTS reward_claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    claim_date TEXT NOT NULL,
    day_number INTEGER NOT NULL,
    reward_type TEXT NOT NULL,
    reward_value INTEGER NOT NULL,
    claimed_at INTEGER NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(user_id)
  );

  CREATE TABLE IF NOT EXISTS limited_badges (
    badge_id INTEGER PRIMARY KEY AUTOINCREMENT,
    badge_name TEXT NOT NULL UNIQUE,
    badge_description TEXT,
    badge_icon TEXT,
    badge_color TEXT,
    rarity TEXT DEFAULT 'legendary',
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    is_active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS user_limited_badges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    badge_id INTEGER NOT NULL,
    granted_by TEXT NOT NULL,
    granted_at INTEGER NOT NULL,
    reason TEXT,
    UNIQUE(user_id, badge_id),
    FOREIGN KEY(user_id) REFERENCES users(user_id),
    FOREIGN KEY(badge_id) REFERENCES limited_badges(badge_id)
  );

  CREATE TABLE IF NOT EXISTS website_registered_users (
    user_id TEXT PRIMARY KEY,
    registered_at INTEGER NOT NULL,
    registration_source TEXT DEFAULT 'website',
    last_login_at INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_voice_user ON voice_sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_respect_date ON respect_given(giver_id, given_at);
  CREATE INDEX IF NOT EXISTS idx_friends ON friends(user_id, friend_id);
  CREATE INDEX IF NOT EXISTS idx_daily_activity ON daily_activity(user_id, date);
  CREATE INDEX IF NOT EXISTS idx_badges ON badges(user_id, badge_type);
  CREATE INDEX IF NOT EXISTS idx_clan_members ON clan_members(clan_id, user_id);
  CREATE INDEX IF NOT EXISTS idx_clan_invites ON clan_invites(invitee_id, status);
  CREATE INDEX IF NOT EXISTS idx_user_quests ON user_quests(user_id, quest_id);
  CREATE INDEX IF NOT EXISTS idx_trades ON trades(sender_id, receiver_id, status);
  CREATE INDEX IF NOT EXISTS idx_user_achievements ON user_achievements(user_id, achievement_id);
  CREATE INDEX IF NOT EXISTS idx_daily_rewards ON daily_rewards(user_id);
  CREATE INDEX IF NOT EXISTS idx_user_limited_badges ON user_limited_badges(user_id, badge_id);
  CREATE INDEX IF NOT EXISTS idx_website_registered ON website_registered_users(user_id);
`);

// Prepared statements
const stmtUpsertUser = db.prepare(`
  INSERT INTO users (user_id, username, global_name, avatar, banner, about_me, joined_server_at, last_updated)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(user_id) DO UPDATE SET
    username = excluded.username,
    global_name = excluded.global_name,
    avatar = excluded.avatar,
    banner = excluded.banner,
    about_me = excluded.about_me,
    last_updated = excluded.last_updated
`);

const stmtStartVoiceSession = db.prepare(`
  INSERT INTO voice_sessions (user_id, channel_id, join_time) VALUES (?, ?, ?)
`);

const stmtEndVoiceSession = db.prepare(`
  UPDATE voice_sessions SET leave_time = ?, duration_minutes = ?
  WHERE user_id = ? AND leave_time IS NULL
`);

const stmtUpdateVoiceMinutes = db.prepare(`
  UPDATE users SET total_voice_minutes = total_voice_minutes + ?, last_voice_date = ? WHERE user_id = ?
`);

const stmtUpdateMessages = db.prepare(`
  UPDATE users SET total_messages = total_messages + 1, last_message_date = ? WHERE user_id = ?
`);

const stmtUpdateDailyActivity = db.prepare(`
  INSERT INTO daily_activity (user_id, date, voice_minutes, messages_count)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(user_id, date) DO UPDATE SET
    voice_minutes = voice_minutes + excluded.voice_minutes,
    messages_count = messages_count + excluded.messages_count
`);

const stmtCheckStreak = db.prepare(`
  SELECT streak_count, last_streak_date FROM users WHERE user_id = ?
`);

const stmtUpdateStreak = db.prepare(`
  UPDATE users SET streak_count = ?, last_streak_date = ? WHERE user_id = ?
`);

const stmtCheckWebsiteRegistration = db.prepare(`
  SELECT 1 FROM website_registered_users WHERE user_id = ?
`);

const stmtRegisterWebsiteUser = db.prepare(`
  INSERT INTO website_registered_users (user_id, registered_at, registration_source, last_login_at)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(user_id) DO UPDATE SET last_login_at = excluded.last_login_at
`);

// Discord Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers
  ]
});

const activeSessions = new Map();

// Helper: Get today's date string
function getTodayDate() {
  return new Date().toISOString().split('T')[0];
}

// Helper: Update streak
function updateStreak(userId) {
  const today = getTodayDate();
  const user = stmtCheckStreak.get(userId);

  if (!user) return;

  const lastDate = user.last_streak_date;
  let newStreak = user.streak_count;

  if (!lastDate) {
    newStreak = 1;
  } else if (lastDate === today) {
    // Already counted today
    return;
  } else {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    if (lastDate === yesterdayStr) {
      newStreak += 1;
    } else {
      newStreak = 1; // Streak broken
    }
  }

  stmtUpdateStreak.run(newStreak, today, userId);

  // Award badges for streaks
  if (newStreak >= 7 && newStreak % 7 === 0) {
    awardBadge(userId, 'streak', Math.floor(newStreak / 7));
  }
}

// Helper: Award badge
function awardBadge(userId, badgeType, tier = 1) {
  try {
    db.prepare(`
      INSERT OR IGNORE INTO badges (user_id, badge_type, badge_tier, earned_at)
      VALUES (?, ?, ?, ?)
    `).run(userId, badgeType, tier, Date.now());
  } catch (err) {
    console.error('Badge award error:', err);
  }
}

// Helper: Check if user is registered on website
function isUserWebsiteRegistered(userId) {
  const registration = stmtCheckWebsiteRegistration.get(userId);
  return !!registration;
}

// Helper: Ensure user exists with full Discord data (only for website-registered users)
async function ensureUser(member) {
  const now = Date.now();
  const user = member.user;

  try {
    // Check if user is registered on website first
    if (!isUserWebsiteRegistered(user.id)) {
      console.log(`⏭️ Skipping user ${user.username} (${user.id}) - not registered on website`);
      return false;
    }

    // Fetch full member data
    await member.fetch();

    const result = stmtUpsertUser.run(
      user.id,
      user.username,
      user.globalName || user.username,
      user.displayAvatarURL({ size: 512 }),
      member.user.bannerURL({ size: 1024 }) || null,
      user.bio || null,
      member.joinedTimestamp || now,
      now
    );

    console.log(`✅ User ensured: ${user.username} (${user.id}) - Changes: ${result.changes}`);
    return true;
  } catch (err) {
    console.error(`❌ Error ensuring user ${user.username}:`, err);
    return false;
  }
}

// Helper: Create user in users table if they don't exist (for website registration)
function createUserIfNotExists(userId, username, globalName, avatar, banner, bio) {
  try {
    const now = Date.now();
    const result = stmtUpsertUser.run(
      userId,
      username,
      globalName || username,
      avatar,
      banner,
      bio,
      now,
      now
    );
    console.log(`✅ User created/updated: ${username} (${userId}) - Changes: ${result.changes}`);
    return true;
  } catch (err) {
    console.error(`❌ Error creating user ${username}:`, err);
    return false;
  }
}

// Helper: Fetch member from Discord when they register via website
async function fetchMemberOnRegistration(userId) {
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const member = await guild.members.fetch(userId);
    
    if (member) {
      console.log(`🔍 Fetched member from Discord: ${member.user.username} (${userId})`);
      
      // Update user data with fresh Discord info
      const now = Date.now();
      const result = stmtUpsertUser.run(
        userId,
        member.user.username,
        member.user.globalName || member.user.username,
        member.user.displayAvatarURL({ size: 512 }),
        member.user.bannerURL({ size: 1024 }) || null,
        member.user.bio || null,
        member.joinedTimestamp || now,
        now
      );
      
      console.log(`✅ Updated user data from Discord: ${member.user.username} - Changes: ${result.changes}`);
      return true;
    }
  } catch (err) {
    console.log(`ℹ️ Could not fetch member ${userId} from Discord (not in server or other issue):`, err.message);
    return false;
  }
}

client.once('ready', async () => {
  console.log(`Bot ready: ${client.user.tag}`);

  // Create a live activity invite so members can launch the app directly
  try {
    const channel = await client.channels.fetch(ACTIVITY_CHANNEL_ID);

    if (!channel || !channel.isTextBased()) {
      console.warn('Activity channel is not text-based or could not be fetched.');
    } else {
      const invite = await channel.createInvite({
        maxAge: 3600,
        maxUses: 0,
        targetApplication: ACTIVITY_APP_ID,
        targetType: 2, // Embedded application
        reason: 'Auto activity launch for Twilight Hub',
      });

      const embed = new EmbedBuilder()
        .setTitle('Twilight Activity Invitation')
        .setDescription([
          'Launch the Twilight Activity to explore:',
          '- Live leaderboard synced with Rep, voice, and messages',
          '- Personal profiles, streaks, and badges',
          '- Clan controls, invites, and contribution scoring',
          '- Trades, friends, and the badge store',
          '',
          'Click the button below to open the activity inside Discord.',
        ].join('\n'))
        .setColor(0x92019e)
        .setThumbnail(client.user.displayAvatarURL())
        .setFooter({ text: 'Invite expires in 1 hour - Reposted automatically when the bot restarts' })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('Open Twilight Activity')
          .setURL(invite.url)
          .setStyle(ButtonStyle.Link)
      );

      await channel.send({ embeds: [embed], components: [row] });
            console.log(`Activity invite created: ${invite.url}`);
    }
  } catch (err) {
    console.error('Failed to create activity invite:', err);
  }

  // Initialize guild connection (no member fetching on startup)
  console.log(`🔍 Connecting to guild: ${GUILD_ID}`);
  const guild = await client.guilds.fetch(GUILD_ID);
  console.log(`✅ Guild connected: ${guild.name}`);
  console.log(`ℹ️ Member fetching disabled on startup - will fetch only when users log in via website`);
});

// Handle new members joining
client.on('guildMemberAdd', async (member) => {
  console.log(`👋 New member joined: ${member.user.username}`);
  await ensureUser(member);
});

// Handle members leaving
client.on('guildMemberRemove', async (member) => {
  console.log(`👋 Member left: ${member.user.username}`);
});

// Voice tracking
client.on('voiceStateUpdate', async (oldState, newState) => {
  const userId = newState.id;
  const member = newState.member;
  const today = getTodayDate();

  // Check if user is registered on website before tracking
  if (!isUserWebsiteRegistered(userId)) {
    console.log(`⏭️ Skipping voice tracking for ${member.user.username} - not registered on website`);
    return;
  }

  const userEnsured = await ensureUser(member);
  if (!userEnsured) {
    return;
  }

  // Joined voice
  if (!oldState.channel && newState.channel) {
    const now = Date.now();
    activeSessions.set(userId, {
      channelId: newState.channel.id,
      joinTime: now
    });
    stmtStartVoiceSession.run(userId, newState.channel.id, now);
    console.log(`🎤 ${member.user.username} joined voice channel: ${newState.channel.name}`);
  }
  // Left voice
  else if (oldState.channel && !newState.channel) {
    const session = activeSessions.get(userId);
    if (session) {
      const now = Date.now();
      const duration = Math.round((now - session.joinTime) / 60000);

      stmtEndVoiceSession.run(now, duration, userId);
      stmtUpdateVoiceMinutes.run(duration, today, userId);
      stmtUpdateDailyActivity.run(userId, today, duration, 0);
      activeSessions.delete(userId);

      console.log(`🎤 ${member.user.username} left voice channel after ${duration} minutes`);

      // Track activity for new streak system
      trackUserActivity(userId, duration, 0);

      // Check and grant auto badges
      checkAndGrantAutoBadges(userId);

      // Sync with external API
      await syncWithExternalAPI('/api/activity/voice', {
        userId,
        duration,
        action: 'left_voice',
        timestamp: now
      });

      // Legacy streak check
      const todayActivity = db.prepare(
        'SELECT voice_minutes FROM daily_activity WHERE user_id = ? AND date = ?'
      ).get(userId, today);

      if (todayActivity && todayActivity.voice_minutes >= 5) {
        updateStreak(userId);
      }
    }
  }
  // Switched channels
  else if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id) {
    const session = activeSessions.get(userId);
    if (session) {
      const now = Date.now();
      const duration = Math.round((now - session.joinTime) / 60000);

      stmtEndVoiceSession.run(now, duration, userId);
      stmtUpdateVoiceMinutes.run(duration, today, userId);
      stmtUpdateDailyActivity.run(userId, today, duration, 0);

      activeSessions.set(userId, {
        channelId: newState.channel.id,
        joinTime: now
      });
      stmtStartVoiceSession.run(userId, newState.channel.id, now);
    }
  }
});

// Message tracking
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const userId = message.author.id;
  const member = message.member;
  const today = getTodayDate();

  // Check if user is registered on website before tracking
  if (!isUserWebsiteRegistered(userId)) {
    console.log(`⏭️ Skipping message tracking for ${message.author.username} - not registered on website`);
    return;
  }

  console.log(`💬 Message from: ${message.author.username} in #${message.channel.name}`);
  
  const userEnsured = await ensureUser(member);
  if (!userEnsured) {
    return;
  }

  stmtUpdateMessages.run(today, userId);
  stmtUpdateDailyActivity.run(userId, today, 0, 1);

  // Track activity for new streak system
  trackUserActivity(userId, 0, 1);

  // Check and grant auto badges
  checkAndGrantAutoBadges(userId);

  // Sync with external API
  await syncWithExternalAPI('/api/activity/message', {
    userId,
    action: 'message_sent',
    timestamp: Date.now()
  });

  // Legacy streak check
  const todayActivity = db.prepare(
    'SELECT messages_count FROM daily_activity WHERE user_id = ? AND date = ?'
  ).get(userId, today);

  if (todayActivity && todayActivity.messages_count >= 5) {
    updateStreak(userId);
  }
});

// Periodic: Award Top 10 badges (every hour)
setInterval(() => {
  try {
    const topUsers = db.prepare(`
      SELECT user_id,
             (total_voice_minutes + (total_messages * 0.5) + (respect_count * 10)) as score
      FROM users
      ORDER BY score DESC
      LIMIT 10
    `).all();

    topUsers.forEach((user, index) => {
      const rank = index + 1;
      if (rank <= 3) {
        awardBadge(user.user_id, 'top3', rank);
      } else if (rank <= 10) {
        awardBadge(user.user_id, 'top10', 1);
      }
    });
  } catch (err) {
    console.error('Badge update error:', err);
  }
}, 60 * 60 * 1000);

export { db, isUserWebsiteRegistered, stmtRegisterWebsiteUser, createUserIfNotExists, fetchMemberOnRegistration };

client.login(TOKEN);







