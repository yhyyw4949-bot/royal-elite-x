// ================================================================
// ROYAL ELITE X - CLOUD PERSISTENCE & AUTO-SYNC ENGINE (SUPABASE)
// ================================================================
// Eliminates data loss on Render ephemeral disk restarts/redeployments.
// Automatically syncs SQLite state to Supabase Postgres cloud storage.
// ================================================================

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://svznftqjnlqfkdyrinds.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2em5mdHFqbmxxZmtkeXJpbmRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxNTI5OTcsImV4cCI6MjEwNzcyODk5N30.2CLcrRMummlxbAFv6H0uo8u-C0c3tdZcjjk4419kQko';

function getDbPath() {
  if (process.env.DATABASE_PATH) return process.env.DATABASE_PATH;
  const customDataDir = process.env.DATA_DIR || (fs.existsSync('/data') ? '/data' : null);
  if (customDataDir) return path.join(customDataDir, 'royal_bot.db');
  return path.join(__dirname, 'royal_bot.db');
}

/**
 * Restore latest database snapshot from Supabase if newer than local file
 */
async function restoreFromCloud() {
  const dbPath = getDbPath();
  console.log(`[CloudSync] Checking Supabase cloud backup for ${dbPath}...`);

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/bot_db_backups?id=eq.1&select=*`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });

    if (!res.ok) {
      console.warn(`[CloudSync] Supabase returned status ${res.status}. Skipping restore.`);
      return false;
    }

    const rows = await res.json();
    if (!rows || rows.length === 0 || !rows[0].data) {
      console.log('[CloudSync] No cloud backup found in Supabase. Using local database.');
      return false;
    }

    const cloudBackup = rows[0];
    let localMtime = 0;
    if (fs.existsSync(dbPath)) {
      localMtime = fs.statSync(dbPath).mtimeMs;
    }

    // If cloud backup is newer than local file by more than 1 second
    if (!fs.existsSync(dbPath) || cloudBackup.backup_time > localMtime) {
      console.log(`[CloudSync] Restoring cloud backup (Cloud: ${new Date(cloudBackup.backup_time).toISOString()} vs Local: ${new Date(localMtime).toISOString()})...`);
      
      const compressedBuffer = Buffer.from(cloudBackup.data, 'base64');
      const decompressedBuffer = zlib.gunzipSync(compressedBuffer);

      // Write atomically via temporary file to prevent corruption
      const tmpPath = `${dbPath}.cloudtmp`;
      fs.writeFileSync(tmpPath, decompressedBuffer);
      fs.renameSync(tmpPath, dbPath);

      // Clean up any stale wal/shm files so SQLite opens the newly restored master DB cleanly
      try {
        if (fs.existsSync(`${dbPath}-wal`)) fs.unlinkSync(`${dbPath}-wal`);
        if (fs.existsSync(`${dbPath}-shm`)) fs.unlinkSync(`${dbPath}-shm`);
      } catch (e) {}

      console.log(`[CloudSync] ✅ Successfully restored database from Supabase! Size: ${decompressedBuffer.length} bytes.`);
      return true;
    } else {
      console.log('[CloudSync] Local database is already up to date. No restore needed.');
      return false;
    }
  } catch (err) {
    console.error('[CloudSync] Error restoring database from Supabase:', err.message);
    return false;
  }
}

/**
 * Backup local SQLite database to Supabase cloud storage
 */
let isBackingUp = false;
async function backupToCloud() {
  if (isBackingUp) return;
  isBackingUp = true;

  const dbPath = getDbPath();
  try {
    if (!fs.existsSync(dbPath)) {
      isBackingUp = false;
      return false;
    }

    const rawBuffer = fs.readFileSync(dbPath);
    if (!rawBuffer || rawBuffer.length === 0) {
      isBackingUp = false;
      return false;
    }

    const gzipped = zlib.gzipSync(rawBuffer);
    const base64Data = gzipped.toString('base64');
    const backupTime = Date.now();

    const res = await fetch(`${SUPABASE_URL}/rest/v1/bot_db_backups`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        id: 1,
        backup_time: backupTime,
        data: base64Data
      })
    });

    if (res.ok) {
      console.log(`[CloudSync] ✅ Database backed up to Supabase. Compressed: ${Math.round(base64Data.length / 1024)} KB (Original: ${Math.round(rawBuffer.length / 1024)} KB)`);
      isBackingUp = false;
      return true;
    } else {
      console.warn(`[CloudSync] Supabase backup failed with status: ${res.status}`);
      isBackingUp = false;
      return false;
    }
  } catch (err) {
    console.error('[CloudSync] Error saving database backup to Supabase:', err.message);
    isBackingUp = false;
    return false;
  }
}

/**
 * Debounced backup trigger for event-driven updates
 */
let debounceTimer = null;
function triggerCloudBackup(delayMs = 4000) {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    backupToCloud();
  }, delayMs);
}

/**
 * Start periodic background sync interval (every 5 minutes)
 */
function initAutoBackup(intervalMs = 5 * 60 * 1000) {
  setInterval(() => {
    backupToCloud();
  }, intervalMs);
  console.log(`[CloudSync] Auto-backup daemon initialized (Interval: ${Math.round(intervalMs / 60000)}m)`);
}

// CLI runner if invoked directly (e.g. `node bot/cloudSync.js restore`)
if (require.main === module) {
  const arg = process.argv[2];
  if (arg === 'restore') {
    restoreFromCloud().catch(e => console.error(e));
  } else if (arg === 'backup') {
    backupToCloud().catch(e => console.error(e));
  } else {
    console.log('Usage: node bot/cloudSync.js [restore|backup]');
  }
}

module.exports = {
  restoreFromCloud,
  backupToCloud,
  triggerCloudBackup,
  initAutoBackup
};
