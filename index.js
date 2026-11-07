// ================================================================
// ROYAL ELITE X (REX) - MASTER BOOTSTRAP ENTRYPOINT
// ================================================================
// 1. Restores the latest database snapshot from Supabase Postgres.
// 2. Starts the Express API server and Telegraf Telegram Bot.
// ================================================================

const cloudSync = require('./bot/cloudSync');

async function bootstrap() {
  console.log('👑 [Bootstrap] Initializing ROYAL ELITE X...');
  try {
    const restored = await cloudSync.restoreFromCloud();
    if (restored) {
      console.log('✅ [Bootstrap] Cloud database successfully restored prior to launch.');
    } else {
      console.log('ℹ️ [Bootstrap] Proceeding with current database state.');
    }
  } catch (err) {
    console.error('⚠️ [Bootstrap] Cloud restore encountered an error, falling back to local DB:', err.message);
  }

  // Load and launch server & bot
  require('./bot/server.js');
}

bootstrap();
