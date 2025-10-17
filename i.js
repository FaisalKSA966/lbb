// bot.js — يرسل إنفايت تلقائي أول ما يشتغل
import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  ChannelType,
  InviteTargetType,
} from 'discord.js';

const {
  TOKEN,
  ACTIVITY_APP_ID, // معرف التطبيق (Activity ID)
} = process.env;

const CHANNEL_ID = '1422067201334181910'; // القناة الهدف

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once('ready', async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);

  try {
    const channel = await client.channels.fetch(CHANNEL_ID);
    if (!channel) return console.log('❌ القناة غير موجودة.');

    // نتحقق إذا القناة صوتية أم نصية
    if (channel.type === ChannelType.GuildVoice) {
      // يرسل دعوة Activity (بطاقة Game Launch)
      const invite = await channel.createInvite({
        maxAge: 3600, // ساعة
        maxUses: 0,
        unique: true,
        targetType: InviteTargetType.EmbeddedApplication, // Activity
        targetApplication: ACTIVITY_APP_ID, // App ID للنشاط
      });

      await channel.send(`🎮 **Activity Invite:**\n${invite.url}`);
      console.log(`✅ تم إرسال إنفايت Activity إلى القناة: ${channel.name}`);
    } else {
      // إذا كانت القناة نصية، نرسل إنفايت عادي
      const invite = await channel.createInvite({
        maxAge: 3600,
        maxUses: 0,
        unique: true,
      });

      await channel.send(`🧪 **Text Invite:**\n${invite.url}`);
      console.log(`✅ تم إرسال إنفايت نصي إلى القناة: ${channel.name}`);
    }
  } catch (err) {
    console.error('❌ خطأ أثناء إرسال الإنفايت:', err);
  }
});

client.login(TOKEN);
