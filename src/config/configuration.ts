export default () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    adminUsername: (process.env.ADMIN_USERNAME || 'nur_ksydykov').toLowerCase(),
    groupChatId: process.env.GROUP_CHAT_ID
      ? BigInt(process.env.GROUP_CHAT_ID)
      : null,
    groupChatLink: process.env.GROUP_CHAT_LINK || null,
  },
  database: {
    url: process.env.DATABASE_URL,
  },
  rateLimit: {
    maxMessagesPerDay: 100,
  },
  moderation: {
    enabled: process.env.MODERATION !== 'false',
  },
});
