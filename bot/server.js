/**
 * ROYAL ELITE X (REX) — Enterprise Telegram Bot & WebApp API v4.0
 * Architecture:
 *  - Secure Environment Configuration via dotenv
 *  - Cryptographic Telegram initData Verification (HMAC-SHA256)
 *  - Anti-Flooding Rate Limiting & RPC Caching
 *  - ACID Double-Entry Financial Ledger
 *  - Multi-State Withdrawal Engine with Balance Reservation
 *  - Subsystems: REX Intelligence, Proof of Rewards, Royal Vault,
 *    Royal Guilds, REX Academy, Royal Achievements, and Admin 2FA
 */

const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const compression = require('compression');
const cors = require('cors');
const db = require('./database');
const security = require('./security');
const payout = require('./payout');
const cloudSync = require('./cloudSync');
const { TonClient, Address, beginCell } = require('@ton/ton');

// Initialize cloud auto-backup daemon (Supabase)
cloudSync.initAutoBackup();

function sanitizeName(name) {
  if (!name) return 'Knight';
  return String(name).replace(/[_*`[\]()~>#+=|{}.!\\]/g, ' ').trim() || 'Knight';
}

// ── Environment & Secrets Management ──
const BOT_TOKEN = process.env.BOT_TOKEN || '9206918976:AAEiNUzrcB_RwhyYuMzCLZsymx0J3p94gLU';
const ADMIN_WALLET = process.env.ADMIN_WALLET || 'UQDcvNuFSROi4VFR1kzca-O17z5shUVyc5X6ep4pPGAPltYz';
const ADMIN_TG_ID = parseInt(process.env.ADMIN_TG_ID || '7082457308', 10);
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'REX_ADMIN_2026';
let REX_MASTER_CONTRACT = process.env.REX_MASTER_CONTRACT;
if (!REX_MASTER_CONTRACT || REX_MASTER_CONTRACT.includes('EQCSsfG6xm') || REX_MASTER_CONTRACT.length < 20) {
  REX_MASTER_CONTRACT = 'EQBSYVo_WE0fAlAWUSec1o42x1LiYKNFOCoaxb8Dz_vsU_53';
}
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://royal-elite-x.onrender.com';
const PORT = parseInt(process.env.PORT || '3000', 10);
const TONCENTER_ENDPOINT = process.env.TONCENTER_ENDPOINT || 'https://toncenter.com/api/v2/jsonRPC';
const TON_API_KEY = process.env.TON_API_KEY || undefined;

const bot = new Telegraf(BOT_TOKEN);
const app = express();

// ── Middleware Pipeline ──
app.use(compression({ threshold: 1024 }));
app.use(cors());
app.use(express.json());
// Ironclad Anti-Cache Middleware for real-time mobile WebView sync
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});
app.use(security.createRateLimiter(60000, 180)); // 180 req/min limit per IP
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// Telegram initData Authentication Middleware (Strict Tamper-Proof Session Verification)
function telegramAuth(req, res, next) {
  const initData = req.headers['x-telegram-init-data'] || req.body?.initData || req.query?.initData;
  if (initData) {
    const verified = security.verifyTelegramInitData(initData, BOT_TOKEN);
    if (verified && verified.user) {
      req.telegramUser = verified.user;
      // Guarantee server-verified Telegram ID to prevent account impersonation
      req.body = req.body || {};
      req.body.telegram_id = verified.user.id;
      return next();
    } else {
      // Invalid or forged signature
      return res.status(401).json({
        success: false,
        message: 'جلسة تيليجرام غير صالحة أو تم التلاعب بها.',
        error: 'TAMPERED_TELEGRAM_SESSION'
      });
    }
  }

  // If in production, strictly require verified session for all state-changing requests
  if (process.env.NODE_ENV === 'production' && req.method === 'POST') {
    return res.status(401).json({
      success: false,
      message: 'يرجى فتح التطبيق من داخل تيليجرام حصراً لتوثيق الجلسة.',
      error: 'UNAUTHORIZED_TELEGRAM_SESSION'
    });
  }

  next();
}

// Admin Authentication Middleware (Constant-Time Safe Comparison against timing attacks)
function adminAuth(req, res, next) {
  const secret = req.headers['x-admin-secret'] || req.query.secret;
  if (!secret || !ADMIN_SECRET) {
    return res.status(403).json({ error: 'Unauthorized: Missing Admin Secret' });
  }
  const secretBuf = Buffer.from(String(secret));
  const adminBuf = Buffer.from(String(ADMIN_SECRET));
  if (secretBuf.length !== adminBuf.length || !crypto.timingSafeEqual(secretBuf, adminBuf)) {
    return res.status(403).json({ error: 'Unauthorized: Invalid Admin Secret' });
  }
  next();
}

// Serve Admin Dashboard
app.use('/admin', express.static(path.join(__dirname, 'admin'), {
  maxAge: '1d',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));
app.get('/admin', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'admin', 'index.html'));
});

// Serve Burn Tool
app.get(['/burn', '/burn.html'], (req, res) => {
  res.sendFile(path.resolve(__dirname, 'public', 'burn.html'));
});

// Serve Mint Tool
app.get(['/mint', '/mint.html'], (req, res) => {
  res.sendFile(path.resolve(__dirname, 'public', 'mint.html'));
});

// Serve Deploy Tool
app.get(['/deploy-new', '/deploy-new.html'], (req, res) => {
  res.sendFile(path.resolve(__dirname, 'public', 'deploy-new.html'));
});

// ── Mandatory Channel Subscription Helpers ──
function getRequiredChannel() {
  return process.env.REQUIRED_CHANNEL || db.getSetting('required_channel', '@REXCEO1A');
}

const channelSubCache = new Map();

async function isUserSubscribedToChannel(userId) {
  if (!userId || parseInt(userId) === ADMIN_TG_ID) return true;

  const isEnabled = db.getSetting('force_sub_enabled', '1');
  if (isEnabled !== '1') return true;

  const rawChannel = getRequiredChannel();
  if (!rawChannel || rawChannel.trim() === '') return true;

  const now = Date.now();
  const cached = channelSubCache.get(userId);
  if (cached && (now - cached.ts < 90000)) {
    return cached.status;
  }

  const channel = rawChannel.startsWith('@') ? rawChannel : `@${rawChannel}`;

  try {
    const member = await bot.telegram.getChatMember(channel, userId);
    const validStatuses = ['creator', 'administrator', 'member', 'restricted'];
    const isSub = validStatuses.includes(member.status);
    channelSubCache.set(userId, { status: isSub, ts: now });
    return isSub;
  } catch (err) {
    if (err.message && (err.message.includes('user not found') || err.message.includes('PARTICIPANT_ID_INVALID') || err.message.includes('USER_NOT_PARTICIPANT'))) {
      channelSubCache.set(userId, { status: false, ts: now });
      return false;
    }
    console.error(`[FORCE SUB CHECK] Error checking user ${userId} in ${channel}:`, err.message);
    if (cached) return cached.status;
    return false;
  }
}

async function requireChannelSubMiddleware(req, res, next) {
  const telegram_id = req.telegramUser?.id || req.body?.telegram_id || req.query?.telegram_id;
  if (!telegram_id || parseInt(telegram_id) === ADMIN_TG_ID) return next();

  const isSub = await isUserSubscribedToChannel(telegram_id);
  if (!isSub) {
    const chan = getRequiredChannel();
    return sendMsg(
      req, res, false,
      `تم إيقاف الميزة لأنك لست عضواً في قناة ${chan}. يرجى الانضمام واستئناف الاستخدام.`,
      `Access locked: You must be a member of ${chan}. Please join to resume.`,
      { requires_channel: true, required_channel: chan }
    );
  }
  next();
}

// ── TON Client & On-Chain Cache ──
const tonClient = new TonClient({ endpoint: TONCENTER_ENDPOINT, apiKey: TON_API_KEY });

async function getOnChainRexBalance(walletAddrStr) {
  if (!walletAddrStr) return 0;
  
  // Check in-memory cache first
  const cached = security.OnChainBalanceCache.get(walletAddrStr);
  if (cached !== null) return cached;

  try {
    const rpcPromise = (async () => {
      const parsedAddr = Address.parse(walletAddrStr);
      const minter = Address.parse(REX_MASTER_CONTRACT);
      const walletAddrResult = await tonClient.runMethod(minter, 'get_wallet_address', [
        { type: 'slice', cell: beginCell().storeAddress(parsedAddr).endCell() }
      ]);
      const userJettonWallet = walletAddrResult.stack.readAddress();
      const walletData = await tonClient.runMethod(userJettonWallet, 'get_wallet_data');
      const balance = Number(walletData.stack.readBigNumber() / 10n**9n);
      security.OnChainBalanceCache.set(walletAddrStr, balance);
      return balance;
    })();

    // 3500ms safety timeout to prevent stalling API responses on TON RPC lags
    const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), 3500));
    const result = await Promise.race([rpcPromise, timeoutPromise]);
    return result;
  } catch (err) {
    if (err.message && (err.message.includes('exit_code: -13') || err.message.includes('cannot find') || err.message.includes('exit_code: -11'))) {
      security.OnChainBalanceCache.set(walletAddrStr, 0);
      return 0;
    }
    return null;
  }
}

// Maintenance Mode Checkers
function isMaintenanceActive() {
  return db.getSetting('maintenance_mode', '0') === '1';
}

function checkMaintenance(req, res, next) {
  if (isMaintenanceActive()) {
    const tid = req.body?.telegram_id || req.query?.id || req.query?.telegram_id;
    if (parseInt(tid) === ADMIN_TG_ID) return next();
    return res.status(503).json({
      success: false,
      maintenance: true,
      code: 'MAINTENANCE_MODE',
      message: 'System is currently undergoing scheduled maintenance. Please check back shortly.'
    });
  }
  next();
}

// Repeatable Tasks Definition
const REPEATABLE_TASKS = {
  daily_checkin:  { id: 'daily_checkin',  name: 'تسجيل الحضور الملكي اليومي', name_ar: 'تسجيل الحضور الملكي اليومي', name_en: 'Daily Sovereign Attendance Check-in', reward: 50,  cooldown: 24*3600*1000, icon: '📅' },
  mystery_chest:  { id: 'mystery_chest',  name: 'صندوق الحظ الملكي الغامض',   name_ar: 'صندوق الحظ الملكي الغامض',   name_en: 'Sovereign Mystery Luck Chest', minReward: 20, maxReward: 60, cooldown: 4*3600*1000, icon: '🎁' },
  turbo_charge:   { id: 'turbo_charge',   name: 'شحنة الطاقة السحابية',       name_ar: 'شحنة الطاقة السحابية',       name_en: 'Cloud Energy Turbo Charge', reward: 35,  cooldown: 6*3600*1000, icon: '⚡' },
  social_share:   { id: 'social_share',   name: 'مشاركة البوت في قصة/مجموعة',  name_ar: 'مشاركة البوت في قصة/مجموعة',  name_en: 'Share Telegram Story / Channel', reward: 75,  cooldown: 12*3600*1000, icon: '📢' },
  community_chat: { id: 'community_chat', name: 'التفاعل في مجتمع ROYAL ELITE', name_ar: 'التفاعل في مجتمع ROYAL ELITE', name_en: 'Engage in Official Community Chat', reward: 30,  cooldown: 8*3600*1000, icon: '💬' },
};

const MINING_24H_DURATION = 24 * 60 * 60 * 1000;

// ================================================================
// SOVEREIGN HOLDING TIERS SPECIFICATION (نظام مستويات الحيازة الملكية)
// ================================================================
const HOLDING_TIERS = [
  {
    tier: 1,
    min_hold: 0,
    multiplier: 1.0,
    badge: '🥉',
    title_ar: 'المستكشف البرونزي',
    title_en: 'Bronze Explorer',
    color: '#cd7f32',
    daily_rex: 100,
    hourly_rex: 4.16,
    desc_ar: 'المعدل القياسي بدون متطلبات حيازة',
    desc_en: 'Standard mining rate with 0 REX required'
  },
  {
    tier: 2,
    min_hold: 500,
    multiplier: 2.0,
    badge: '🥈',
    title_ar: 'الحارس الفضي',
    title_en: 'Silver Guardian',
    color: '#94a3b8',
    daily_rex: 200,
    hourly_rex: 8.33,
    desc_ar: 'مضاعفة إنتاج التعدين 2X عند حيازة 500 REX',
    desc_en: '2X Mining rate boost holding 500+ REX'
  },
  {
    tier: 3,
    min_hold: 2000,
    multiplier: 4.0,
    badge: '🥇',
    title_ar: 'الفارس الذهبي',
    title_en: 'Gold Knight',
    color: '#eab308',
    daily_rex: 400,
    hourly_rex: 16.66,
    desc_ar: 'مضاعفة إنتاج التعدين 4X عند حيازة 2,000 REX',
    desc_en: '4X Mining rate boost holding 2,000+ REX'
  },
  {
    tier: 4,
    min_hold: 5000,
    multiplier: 7.0,
    badge: '💠',
    title_ar: 'البارون البلاتيني',
    title_en: 'Platinum Baron',
    color: '#a855f7',
    daily_rex: 700,
    hourly_rex: 29.16,
    desc_ar: 'مضاعفة 7X + فتح شرط أهلية السحب (72 ساعة)',
    desc_en: '7X Boost + Unlocks withdrawal eligibility (72h)'
  },
  {
    tier: 5,
    min_hold: 15000,
    multiplier: 15.0,
    badge: '💎',
    title_ar: 'الدوق الماسي VIP',
    title_en: 'Diamond Duke VIP',
    color: '#06b6d4',
    daily_rex: 1500,
    hourly_rex: 62.5,
    desc_ar: 'مضاعفة خارقة 15X عند حيازة 15,000 REX',
    desc_en: 'Supercharged 15X boost holding 15,000+ REX'
  },
  {
    tier: 6,
    min_hold: 50000,
    multiplier: 25.0,
    badge: '👑',
    title_ar: 'الإمبراطور الملكي الأسطوري',
    title_en: 'Crown Sovereign VIP',
    color: '#f59e0b',
    daily_rex: 2500,
    hourly_rex: 104.16,
    desc_ar: 'أقصى مضاعف تعدين في المنظومة 25X (VIP)',
    desc_en: 'Apex tier: Maximum 25X mining boost'
  }
];

function calculateHoldingTier(onChainRex) {
  const bal = Math.max(0, Number(onChainRex) || 0);
  for (let i = HOLDING_TIERS.length - 1; i >= 0; i--) {
    if (bal >= HOLDING_TIERS[i].min_hold) {
      const current = HOLDING_TIERS[i];
      const next = (i < HOLDING_TIERS.length - 1) ? HOLDING_TIERS[i + 1] : null;
      const progressToNext = next 
        ? Math.min(100, Math.max(0, ((bal - current.min_hold) / (next.min_hold - current.min_hold)) * 100))
        : 100;
      const rexNeededForNext = next ? Math.max(0, next.min_hold - bal) : 0;
      return {
        ...current,
        current_balance: bal,
        next_tier: next ? {
          tier: next.tier,
          title_ar: next.title_ar,
          title_en: next.title_en,
          min_hold: next.min_hold,
          multiplier: next.multiplier,
          rex_needed: rexNeededForNext,
          badge: next.badge,
          daily_rex: next.daily_rex
        } : null,
        progress_pct: Number(progressToNext.toFixed(1))
      };
    }
  }
  return {
    ...HOLDING_TIERS[0],
    current_balance: bal,
    next_tier: {
      tier: 2,
      title_ar: HOLDING_TIERS[1].title_ar,
      title_en: HOLDING_TIERS[1].title_en,
      min_hold: HOLDING_TIERS[1].min_hold,
      multiplier: HOLDING_TIERS[1].multiplier,
      rex_needed: HOLDING_TIERS[1].min_hold - bal,
      badge: HOLDING_TIERS[1].badge,
      daily_rex: HOLDING_TIERS[1].daily_rex
    },
    progress_pct: 0
  };
}

// ================================================================
// 1. USER PROFILE & ECOSYSTEM SYNC (EXPANDED)
// ================================================================

// ================================================================
// ANTI-DUMP SENTINEL (حظر تلقائي في حال بيع العملات بعد السحب خلال 24 ساعة)
// ================================================================
async function checkAntiDumpViolation(user, currentOnChain) {
  if (!user || user.is_banned) return false;

  // 1. Admin and exempt accounts are completely immune
  if (parseInt(user.telegram_id) === ADMIN_TG_ID || user.is_hold_exempt || user.is_sybil_exempt) {
    if (user.post_wd_monitored_until) db.clearPostWdMonitoring(user.telegram_id);
    return false;
  }

  // 2. Controlled strictly by global master settings
  const enableHoldingRule = db.getSetting('enable_holding_rule', '0') === '1';
  const enableAntiDump = db.getSetting('enable_anti_dump', '0') === '1';
  if (!enableHoldingRule || !enableAntiDump) {
    if (user.post_wd_monitored_until) db.clearPostWdMonitoring(user.telegram_id);
    return false;
  }

  if (!user.post_wd_monitored_until) return false;
  const now = Date.now();
  if (now > user.post_wd_monitored_until) {
    db.clearPostWdMonitoring(user.telegram_id);
    return false;
  }

  // 3. CRITICAL: Never ban on null/undefined/NaN or RPC network error
  if (currentOnChain === null || currentOnChain === undefined || isNaN(currentOnChain)) {
    return false;
  }

  const baseline = user.post_wd_baseline_rex || 0;
  if (baseline <= 0) return false;

  // If user acquired more tokens, raise the baseline
  if (currentOnChain >= baseline) {
    if (currentOnChain > baseline) {
      db.updatePostWdBaseline(user.telegram_id, currentOnChain);
      user.post_wd_baseline_rex = currentOnChain;
    }
    return false;
  }

  // Check if balance dropped by more than 15 REX (protection against fee jitter / micro-transfers)
  if (currentOnChain < baseline - 15) {
    // 4. RETRY VERIFICATION: Never ban on a single RPC reading!
    await new Promise(r => setTimeout(r, 2000));
    security.OnChainBalanceCache.invalidate(user.wallet_address);
    const retryBal = await getOnChainRexBalance(user.wallet_address);

    // If retry failed (null) or balance is restored/above threshold: FALSE ALARM!
    if (retryBal === null || retryBal >= baseline - 15) {
      console.log(`[ANTI-DUMP SENTINEL] False alarm prevented for ${user.telegram_id}: initial=${currentOnChain}, retry=${retryBal}`);
      return false;
    }

    const soldAmount = Math.max(0, baseline - retryBal);
    if (soldAmount < 15) return false;

    const reason = `حظر تلقائي: بيع/تحويل عملات REX (${soldAmount.toFixed(0)} REX) خلال 24 ساعة من استلام السحب (نظام مكافحة الإغراق Anti-Dump)`;
    
    // 1. Ban user immediately
    db.banUser(user.telegram_id, reason);
    db.logAdminAction('AUTO_BAN_ANTI_DUMP', `حظر تلقائي للمستخدم ${user.telegram_id}: بيع ${soldAmount.toFixed(0)} REX بعد السحب (كان: ${baseline.toFixed(0)} -> الآن: ${retryBal.toFixed(0)})`, ADMIN_TG_ID);

    // 2. Clear monitoring
    db.clearPostWdMonitoring(user.telegram_id);

    // 3. Notify user on Telegram
    bot.telegram.sendMessage(
      user.telegram_id,
      `⛔ *Permanent Ban from Royal Court* 🛡️\n\n` +
      `Your account has been permanently suspended from *ROYAL ELITE X* for violating tokenomics and anti-dump protection policies.\n\n` +
      `• *Reason:* Selling or transferring REX tokens within 24 hours of receiving a withdrawal (Anti-Dump Sentinel violation).\n` +
      `• *Monitored Baseline Balance:* ${Number(baseline).toLocaleString()} REX\n` +
      `• *Balance After Transfer:* ${Number(retryBal).toLocaleString()} REX\n` +
      `• *Transferred Amount:* -${soldAmount.toLocaleString()} REX\n\n` +
      `Your account has been permanently frozen and access revoked.`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});

    // 4. Alert Admin on Telegram
    bot.telegram.sendMessage(
      ADMIN_TG_ID,
      `🚨 *Security Alert: Anti-Dump Auto-Ban Triggered* 👑\n\n` +
      `A user was detected selling tokens within 24 hours of withdrawal!\n\n` +
      `👤 User: *${user.first_name}* (@${user.username || 'None'})\n` +
      `🆔 Telegram ID: \`${user.telegram_id}\`\n` +
      `💼 Wallet: \`${user.wallet_address}\`\n` +
      `📊 Monitored Baseline: *${Number(baseline).toLocaleString()} REX*\n` +
      `📉 Balance After Transfer: *${Number(retryBal).toLocaleString()} REX*\n` +
      `⚠️ Amount Transferred: *${soldAmount.toLocaleString()} REX*\n` +
      `⏱️ Timing: Within 24-hour post-withdrawal hold lock.\n\n` +
      `✅ *Account banned automatically.* Liquidity pool protected 🛡️`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});

    console.warn(`[ANTI-DUMP SENTINEL] User ${user.telegram_id} automatically BANNED for selling ${soldAmount} REX after withdrawal!`);
    return true;
  }

  return false;
}

app.post('/api/user/sync', telegramAuth, async (req, res) => {
  const { telegram_id, first_name, username, fingerprint } = req.body;
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || '127.0.0.1';

  if (!telegram_id) return res.status(400).json({ error: 'Missing telegram_id' });

  const minWithdrawal = parseFloat(db.getSetting('min_withdrawal', '5000'));
  const holdPercent = parseFloat(db.getSetting('hold_percent', '20'));
  const baseDailyReward = parseFloat(db.getSetting('base_daily_reward', '100'));

  let user = db.getUser(telegram_id);
  if (!user) {
    db.createUser({ telegram_id, first_name: first_name || 'الملك', username: username || '', referrer_id: null, created_at: Date.now() });
    user = db.getUser(telegram_id);
  }

  if (user.is_banned) {
    return res.json({ is_banned: true, ban_reason: user.ban_reason });
  }

  const isMaint = isMaintenanceActive();
  if (isMaint && parseInt(telegram_id) !== ADMIN_TG_ID) {
    return res.json({
      maintenance: true,
      telegram_id,
      message: 'System is currently undergoing scheduled maintenance. Please check back shortly.'
    });
  }

  // Anti-Sybil Radar Check
  if (fingerprint && parseInt(telegram_id) !== ADMIN_TG_ID) {
    const isSybilAutoBan = db.getSetting('sybil_auto_ban', '1') === '1';
    const isExempt = user && user.is_sybil_exempt === 1;

    if (!isExempt && isSybilAutoBan) {
      const matched = db.checkFingerprintAccounts(fingerprint);
      const others = matched.filter(a => a.telegram_id !== telegram_id && a.telegram_id !== ADMIN_TG_ID);
      if (others.length >= 1) {
        db.logDevice(telegram_id, fingerprint, ip);
        db.banUser(telegram_id, 'تعدد حسابات على نفس الجهاز (Anti-Sybil)');
        return res.json({ is_banned: true, ban_reason: 'تعدد حسابات على نفس الجهاز' });
      }
    }
    db.logDevice(telegram_id, fingerprint, ip);
  }

  // 1. Check On-Chain REX Balance & Multiplier Boost (FIRST)
  let onChainRex = user.on_chain_rex || 0;
  if (user.wallet_address) {
    const freshBal = await getOnChainRexBalance(user.wallet_address);
    if (freshBal !== null) {
      onChainRex = freshBal;
    }
  }

  // Anti-Dump Surveillance Check (Within 24h of withdrawal)
  if (user.post_wd_monitored_until && Date.now() < user.post_wd_monitored_until) {
    const wasBanned = await checkAntiDumpViolation(user, onChainRex);
    if (wasBanned) {
      return res.json({ 
        is_banned: true, 
        ban_reason: 'تم حظر حسابك نهائياً لمخالفة سياسة مكافحة الإغراق (بيع العملات خلال 24 ساعة من السحب).' 
      });
    }
  }
  // 2. 10% Daily HODL Mining Protocol (No Tiers - Direct 10% of held coins per day)
  const baseReward = parseFloat(db.getSetting('base_daily_reward', '25'));
  const dailyRate = Math.max(baseReward, onChainRex * 0.10);
  const hourlyRate = dailyRate / 24;
  const effectiveMultiplier = onChainRex > 0 ? Number((dailyRate / baseReward).toFixed(1)) : 1.0;
  if (effectiveMultiplier !== user.mining_multiplier) {
    db.setMultiplier(telegram_id, effectiveMultiplier);
    user.mining_multiplier = effectiveMultiplier;
  }
  const holdingTier = calculateHoldingTier(onChainRex);

  let currentAccrued = 0;
  let remainingTime = 0;
  let canClaim = false;
  let miningProgress = 0;

  if (user.is_mining && user.last_mining_start > 0) {
    const elapsed = Date.now() - user.last_mining_start;
    miningProgress = Math.min(elapsed / MINING_24H_DURATION, 1.0);
    currentAccrued = miningProgress * dailyRate;
    remainingTime = Math.max(0, MINING_24H_DURATION - elapsed);
    canClaim = elapsed >= MINING_24H_DURATION;
  }

  // Holding Condition Tracker (Controlled globally by enable_holding_rule)
  const enableHoldingRule = db.getSetting('enable_holding_rule', '0') === '1';
  const minHoldRex = parseFloat(db.getSetting('min_hold_rex', '0'));
  const minHoldDays = parseFloat(db.getSetting('min_hold_days', '0'));
  const minHoldDurationMs = minHoldDays * 24 * 3600 * 1000;

  const isHoldExempt = Boolean(user.is_hold_exempt) || !enableHoldingRule;
  let onchainHoldStart = user.onchain_hold_start || 0;
  if (enableHoldingRule && !isHoldExempt && minHoldRex > 0) {
    if (onChainRex >= minHoldRex) {
      if (!onchainHoldStart) {
        onchainHoldStart = Date.now();
        db.updateHoldStart(telegram_id, onchainHoldStart);
        user.onchain_hold_start = onchainHoldStart;
      }
    } else {
      if (onchainHoldStart > 0) {
        onchainHoldStart = 0;
        db.updateHoldStart(telegram_id, 0);
        user.onchain_hold_start = 0;
      }
    }
  }

  const holdingElapsed = onchainHoldStart > 0 ? (Date.now() - onchainHoldStart) : 0;
  const isHoldPassed = !enableHoldingRule || isHoldExempt || (minHoldRex === 0) || ((onchainHoldStart > 0) && (holdingElapsed >= minHoldDurationMs));
  const holdRemainingMs = (!enableHoldingRule || isHoldExempt || minHoldRex === 0) ? 0 : Math.max(0, minHoldDurationMs - holdingElapsed);

  // Evaluate & Unlock Achievements
  db.checkAndUnlockAchievements(telegram_id);

  // User Rank Information
  const rankInfo = db.getUserRank(user.xp_points || 0);

  // User Tasks List
  const userTasksRaw = db.getUserTasks(telegram_id);
  const tasksMap = {};
  userTasksRaw.forEach(t => { tasksMap[t.task_id] = t; });
  const now = Date.now();
  const tasksList = Object.values(REPEATABLE_TASKS).map(def => {
    const record = tasksMap[def.id] || { completed_count: 0, last_completed_at: 0 };
    const timeSinceLast = now - (record.last_completed_at || 0);
    const isReady = timeSinceLast >= def.cooldown;
    return {
      id: def.id,
      name: def.name,
      name_ar: def.name_ar,
      name_en: def.name_en,
      icon: def.icon,
      reward: def.reward || `${def.minReward}-${def.maxReward}`,
      completed_count: record.completed_count,
      is_ready: isReady,
      cooldown_remaining: isReady ? 0 : (def.cooldown - timeSinceLast)
    };
  });

  // User Subsystem Data
  const userVaults = db.getUserVaults(telegram_id);
  const userGuild = db.getUserGuild(telegram_id);
  const withdrawalHistory = db.getWithdrawals(telegram_id);
  const recentTransactions = db.getUserTransactions(telegram_id, 15);
  const tokenomicsSummary = db.getPublicTokenomicsStats();

  res.json({
    telegram_id: user.telegram_id,
    first_name: user.first_name,
    username: user.username,
    wallet_address: user.wallet_address,
    on_chain_rex: onChainRex,
    balance: user.balance,
    reserved_balance: user.reserved_balance || 0.0,
    mined_total: user.mined_total,
    total_withdrawn: user.total_withdrawn || 0.0,
    xp_points: user.xp_points || 0.0,
    rank_info: rankInfo,
    holding_tier: holdingTier,
    all_holding_tiers: HOLDING_TIERS,
    mining_multiplier: user.mining_multiplier,
    daily_rate: dailyRate,
    hourly_rate: hourlyRate,
    is_mining: user.is_mining,
    last_mining_start: user.last_mining_start,
    current_accrued: currentAccrued,
    mining_progress: miningProgress,
    remaining_time: remainingTime,
    can_claim: canClaim,
    is_activated: !!user.is_activated,
    is_wallet_connected: !!user.wallet_address,
    is_banned: !!user.is_banned,
    admin_wallet: ADMIN_WALLET,
    contract_address: REX_MASTER_CONTRACT,
    tasks: tasksList,
    daily_checkin: db.getDailyCheckinStatus(telegram_id),
    referral_offer: db.getReferralOfferDetails(),
    vaults: userVaults,
    guild: userGuild,
    referrals_count: db.getReferralsCount(telegram_id),
    withdrawal_history: withdrawalHistory,
    recent_transactions: recentTransactions,
    tokenomics: tokenomicsSummary,
    enable_holding_rule: enableHoldingRule,
    min_withdrawal: minWithdrawal,
    withdrawal_fee: parseFloat(db.getSetting('withdrawal_fee', '500')),
    hold_percent: holdPercent,
    min_hold_rex: minHoldRex,
    min_hold_days: minHoldDays,
    onchain_hold_start: onchainHoldStart,
    is_hold_passed: isHoldPassed,
    is_hold_exempt: isHoldExempt,
    anti_dump_active: Boolean(user.post_wd_monitored_until && Date.now() < user.post_wd_monitored_until),
    anti_dump_remaining_ms: Math.max(0, (user.post_wd_monitored_until || 0) - Date.now()),
    anti_dump_baseline: user.post_wd_baseline_rex || 0,
    hold_remaining_ms: holdRemainingMs,
    is_subscribed_channel: await isUserSubscribedToChannel(telegram_id),
    required_channel: getRequiredChannel(),
    maintenance: isMaint
  });
});

// Helper for Bilingual API Responses (Default: English)
function sendMsg(req, res, success, ar, en, extra = {}) {
  const isAr = req.body?.lang === 'ar' || req.query?.lang === 'ar' || req.headers['accept-language']?.startsWith('ar');
  return res.json({
    success,
    message: isAr ? ar : en,
    message_ar: ar,
    message_en: en,
    ...extra
  });
}

// ================================================================
// 2. WALLET & ACTIVATION
// ================================================================
app.post('/api/user/connect-wallet', telegramAuth, checkMaintenance, async (req, res) => {
  const { telegram_id, raw_address } = req.body;
  if (!raw_address) return sendMsg(req, res, false, 'عنوان المحفظة مفقود', 'Wallet address is missing');

  try {
    const parsedAddr = Address.parse(raw_address);
    const friendlyAddr = parsedAddr.toString({ bounceable: false });

    const existing = db.getUserByWallet(friendlyAddr);
    if (existing && existing.telegram_id !== telegram_id) {
      return sendMsg(req, res, false, 'هذه المحفظة مرتبطة بحساب آخر! محفظة واحدة لكل حساب.', 'This wallet is linked to another account! One wallet per user.');
    }

    db.updateWallet(telegram_id, friendlyAddr);

    // Invalidate cache and fetch fresh balance
    security.OnChainBalanceCache.invalidate(friendlyAddr);
    const onChainBalance = await getOnChainRexBalance(friendlyAddr);

    let multiplier = 1.0;
    if (onChainBalance >= 15000) multiplier = 15.0;
    else if (onChainBalance >= 5000) multiplier = 7.0;
    else if (onChainBalance >= 2000) multiplier = 4.0;
    else if (onChainBalance >= 500) multiplier = 2.0;

    db.setMultiplier(telegram_id, multiplier);

    // Award referral offer ONLY if wallet is connected AND account is fully activated/verified!
    const userObj = db.getUser(telegram_id);
    if (userObj && userObj.is_activated === 1) {
      await checkAndAwardReferralOffer(telegram_id, userObj.first_name);
    }

    sendMsg(req, res, true, 'تم ربط المحفظة وتوثيقها بنجاح!', 'Wallet verified and connected successfully!', { friendlyAddr, multiplier, onChainBalance });
    cloudSync.triggerCloudBackup();
  } catch (e) {
    if (e.message && e.message.includes('UNIQUE constraint failed')) {
      return sendMsg(req, res, false, 'هذه المحفظة مرتبطة بحساب آخر بالفعل! محفظة واحدة فقط لكل حساب.', 'This wallet is already linked to another account!');
    }
    sendMsg(req, res, false, 'عنوان المحفظة غير صالح', 'Invalid TON wallet address');
  }
});

// ── Strict On-Chain 0.1 TON Verification Helper ──
async function verifyOnChainFeePayment(walletAddress) {
  if (!walletAddress) return { verified: false, reason: 'NO_WALLET' };

  try {
    const userAddr = Address.parse(walletAddress);
    const adminAddr = Address.parse(ADMIN_WALLET);

    // Query last 20 transactions on ADMIN_WALLET from TON Blockchain
    const txs = await tonClient.getTransactions(adminAddr, { limit: 20 });
    const now = Math.floor(Date.now() / 1000);

    for (const t of txs) {
      const inMsg = t.inMessage;
      if (!inMsg || !inMsg.info || inMsg.info.type !== 'internal') continue;

      const srcAddr = inMsg.info.src;
      // Compare raw strings to be independent of user-friendly bounceable variants
      if (srcAddr && srcAddr.toRawString() === userAddr.toRawString()) {
        const coins = inMsg.info.value.coins;
        // 0.1 TON = 100,000,000 nanoTON. Accept >= 80,000,000 (0.08 TON) to account for forward fees/gas
        if (coins >= 80000000n) {
          // Transaction must be recent (within last 3 hours = 10800 seconds)
          if (now - t.now < 10800) {
            const txHash = t.hash().toString('hex');

            // Check if this txHash was already claimed by any account
            const existing = db.db.prepare('SELECT tx_hash FROM processed_fee_transactions WHERE tx_hash = ?').get(txHash);
            if (!existing) {
              return {
                verified: true,
                txHash,
                coins: coins.toString(),
                timestamp: t.now
              };
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('[ON-CHAIN FEE VERIFY ERROR]:', err.message);
  }

  return { verified: false, reason: 'NO_CONFIRMED_TX_FOUND' };
}

app.post('/api/user/confirm-activation', telegramAuth, checkMaintenance, async (req, res) => {
  const { telegram_id } = req.body;
  const user = db.getUser(telegram_id);
  if (!user) return res.json({ success: false, message: 'حساب غير موجود' });
  if (!user.wallet_address) return sendMsg(req, res, false, 'ارتبط بمحفظة أولاً', 'Connect TON wallet first');
  if (user.is_activated === 1) return sendMsg(req, res, true, 'حسابك مفعل بالفعل!', 'Account already activated!');

  // Strict On-Chain Blockchain Verification
  const verifyRes = await verifyOnChainFeePayment(user.wallet_address);
  if (!verifyRes.verified) {
    return sendMsg(req, res, false,
      'لم يتم العثور على معاملة تحويل 0.1 TON مؤكدة من محفظتك إلى محفظة الإدارة بعد! يرجى الانتظار 10-20 ثانية لتأكيد البلوكتشين ثم المحاولة مجدداً.',
      'No confirmed 0.1 TON transfer found on-chain from your wallet to admin wallet yet! Please wait 10-20 seconds for blockchain confirmation and try again.',
      { code: 'TX_NOT_FOUND_ON_CHAIN' }
    );
  }

  // Record transaction hash to permanently prevent reuse
  try {
    db.db.prepare('INSERT INTO processed_fee_transactions (tx_hash, telegram_id, sender_address, amount_coins, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(verifyRes.txHash, telegram_id, user.wallet_address, verifyRes.coins, Date.now());
  } catch(e) {}

  db.setActivated(telegram_id);
  cloudSync.triggerCloudBackup();
  await checkAndAwardReferralOffer(telegram_id, user.first_name);
  sendMsg(req, res, true, '🎉 تم التحقق من المعاملة على البلوكتشين وتفعيل الحساب بنجاح!', '🎉 On-chain fee payment confirmed and account activated successfully!', { tx_hash: verifyRes.txHash });
});

// Redeem Activation / Fee-Waiver Code
app.post('/api/user/redeem-activation-code', telegramAuth, checkMaintenance, async (req, res) => {
  const { telegram_id, code } = req.body;
  if (!telegram_id || !code) {
    return sendMsg(req, res, false, 'يرجى إدخال كود التفعيل', 'Please enter activation code');
  }

  const user = db.getUser(telegram_id);
  if (!user || user.is_banned) {
    return sendMsg(req, res, false, 'حساب غير مؤهل أو محظور', 'Account ineligible or suspended');
  }

  if (user.is_activated === 1) {
    return sendMsg(req, res, false, 'حسابك مفعّل بالفعل!', 'Your account is already activated!');
  }

  try {
    const actRes = db.redeemActivationCode(telegram_id, code);
    cloudSync.triggerCloudBackup();
    await checkAndAwardReferralOffer(telegram_id, user.first_name);

    // Notify on Telegram
    bot.telegram.sendMessage(
      telegram_id,
      `👑 *Royal Activation Successful!* 🎉\n\n` +
      `Your account has been verified and the 0.1 TON fee has been waived!\n` +
      `🔑 Activation Code: \`${actRes.code}\`\n` +
      (actRes.bonus_rex > 0 ? `💰 Bonus Credited: *+${actRes.bonus_rex.toLocaleString()} REX*\n` : '') +
      `\nMake sure your wallet is connected and you have joined our channel to begin mining! 🚀`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});

    return sendMsg(req, res, true,
      '🎉 تم تفعيل حسابك وإعفاء رسوم الـ 0.1 TON بنجاح!',
      '🎉 Account activated and 0.1 TON fee waived successfully!',
      { is_activated: true, bonus_rex: actRes.bonus_rex, code: actRes.code }
    );
  } catch (err) {
    let arErr = '⚠️ حدث خطأ أثناء تفعيل الكود';
    let enErr = '⚠️ Failed to redeem activation code';

    if (err.message === 'CODE_NOT_FOUND') {
      arErr = '❌ كود التفعيل غير صالح أو غير موجود';
      enErr = '❌ Invalid or non-existent activation code';
    } else if (err.message === 'CODE_EXPIRED') {
      arErr = '⏳ انتهت صلاحية هذا الكود الزمنيّة';
      enErr = '⏳ This activation code has expired';
    } else if (err.message === 'CODE_EXHAUSTED') {
      arErr = '🚫 اكتمل الحد الأقصى لعدد مستخدمي هذا الكود';
      enErr = '🚫 Activation code claim limit reached';
    } else if (err.message === 'ALREADY_REDEEMED') {
      arErr = '⚠️ لقد قمت باستخدام هذا الكود مسبقاً';
      enErr = '⚠️ You have already used this activation code';
    } else if (err.message === 'CODE_INACTIVE') {
      arErr = '🔒 هذا الكود متوقف حالياً من قِبل الإدارة';
      enErr = '🔒 This activation code is currently disabled';
    } else if (err.message === 'ALREADY_ACTIVATED') {
      arErr = '✅ حسابك مفعّل بالفعل، لا حاجة لاستخدام الكود';
      enErr = '✅ Your account is already activated';
    } else {
      arErr = '⚠️ فشل التفعيل: ' + err.message;
      enErr = '⚠️ Activation failed: ' + err.message;
    }

    return sendMsg(req, res, false, arErr, enErr, { error: err.message });
  }
});

// ================================================================
// 3. ATOMIC MINING ENGINE
// ================================================================
app.post('/api/user/start-mining', telegramAuth, checkMaintenance, requireChannelSubMiddleware, (req, res) => {
  const { telegram_id } = req.body;
  const user = db.getUser(telegram_id);
  if (!user || user.is_banned) return sendMsg(req, res, false, 'حساب محظور', 'Account suspended');
  if (!user.is_activated || !user.wallet_address) return sendMsg(req, res, false, 'فعّل حسابك أولاً!', 'Activate your account and connect wallet first!');
  if (user.is_mining) return sendMsg(req, res, false, 'التعدين يعمل بالفعل!', 'Mining is already active!');

  const now = Date.now();
  db.updateMining(telegram_id, 1, now);
  sendMsg(req, res, true, '⚡ انطلقت دورة التعدين الملكية بنجاح!', '⚡ 24h Royal Mining cycle started!', { last_mining_start: now });
});

app.post('/api/user/claim-mining', telegramAuth, checkMaintenance, requireChannelSubMiddleware, async (req, res) => {
  const { telegram_id, idempotency_key } = req.body;
  const user = db.getUser(telegram_id);
  if (!user || user.is_banned) return sendMsg(req, res, false, 'حساب محظور', 'Account suspended');
  if (!user.is_activated || !user.wallet_address) return sendMsg(req, res, false, 'فعّل حسابك أولاً!', 'Activate your account and connect wallet first!');
  if (!user.is_mining || !user.last_mining_start) return sendMsg(req, res, false, 'لا يوجد تعدين جاري', 'No active mining cycle');

  const elapsed = Date.now() - user.last_mining_start;
  if (elapsed < MINING_24H_DURATION) {
    return sendMsg(req, res, false, 'لم تكتمل دورة الـ 24 ساعة بعد!', '24h mining cycle not completed yet!');
  }

  // Idempotency check
  const idempKey = idempotency_key || `CLAIM_${telegram_id}_${user.last_mining_start}`;
  const existingRes = security.idempotencyRegistry.checkAndStore(idempKey, true);
  if (existingRes) {
    return sendMsg(req, res, false, 'تم إرسال هذا الطلب بالفعل.', 'This request has already been submitted.');
  }

  const baseDailyReward = parseFloat(db.getSetting('base_daily_reward', '25'));
  let onChainRex = 0;
  if (user.wallet_address) {
    try { onChainRex = await getOnChainRexBalance(user.wallet_address); } catch(e) {}
  }
  const dailyRate = Math.max(baseDailyReward, onChainRex * 0.10);
  const refPercent = parseFloat(db.getSetting('referral_percent', '5')) / 100;

  try {
    const claimRes = db.atomicClaimMining(telegram_id, dailyRate, idempKey);
    cloudSync.triggerCloudBackup();

    // Referral commission
    if (user.referrer_id) {
      const refCommission = dailyRate * refPercent;
      db.atomicAddReferralCommission(user.referrer_id, refCommission, telegram_id, user.first_name);

      bot.telegram.sendMessage(user.referrer_id,
        `👑 *Royal Referral Commission Earned!* 🎉\n\n` +
        `Your invited knight (${user.first_name}) claimed their mining yield! You earned your 5% royal commission:\n` +
        `💰 *+${refCommission.toFixed(2)} REX* has been added to your balance!`,
        { parse_mode: 'Markdown' }
      ).catch(() => {});
    }

    res.json({ success: true, claimed_amount: dailyRate, balance: claimRes.balance });
  } catch (err) {
    security.idempotencyRegistry.remove(idempKey);
    res.json({ success: false, message: err.message });
  }
});

// ================================================================
// 4. MULTI-STAGE WITHDRAWAL ENGINE
// ================================================================
app.post('/api/user/withdraw', telegramAuth, checkMaintenance, requireChannelSubMiddleware, async (req, res) => {
  const { telegram_id, amount, idempotency_key } = req.body;
  const user = db.getUser(telegram_id);

  if (!user || user.is_banned) return sendMsg(req, res, false, 'حساب غير مؤهل أو محظور', 'Account ineligible or suspended');
  if (!user.is_activated || !user.wallet_address) return sendMsg(req, res, false, 'فعّل حسابك وارتبط بمحفظة أولاً', 'Activate account and connect wallet first');

  const minWithdrawal = parseFloat(db.getSetting('min_withdrawal', '5000'));
  const holdPercent = parseFloat(db.getSetting('hold_percent', '20')) / 100;

  const reqAmount = parseFloat(amount);
  if (isNaN(reqAmount) || reqAmount <= 0) return sendMsg(req, res, false, 'مبلغ السحب غير صالح', 'Invalid withdrawal amount');

  if (reqAmount < minWithdrawal) {
    return sendMsg(req, res, false, `الحد الأدنى للسحب هو ${minWithdrawal.toLocaleString()} REX`, `Minimum withdrawal is ${minWithdrawal.toLocaleString()} REX`);
  }

  if (user.balance < reqAmount) {
    return sendMsg(req, res, false, `رصيدك في المنصة غير كافٍ! رصيدك المتاح: ${user.balance.toLocaleString()} REX والمطلوب: ${reqAmount.toLocaleString()} REX.`, `Insufficient platform balance! Available: ${user.balance.toLocaleString()} REX, Requested: ${reqAmount.toLocaleString()} REX.`);
  }

  // Holding Condition Evaluation (Controlled by enable_holding_rule toggle)
  const enableHoldingRule = db.getSetting('enable_holding_rule', '0') === '1';
  const isHoldExempt = Boolean(user.is_hold_exempt) || !enableHoldingRule;

  if (enableHoldingRule && !isHoldExempt) {
    // 1. On-Chain Hold Verification (Bypass cache for withdrawal check)
    const holdPercent = parseFloat(db.getSetting('hold_percent', '0')) / 100;
    if (holdPercent > 0) {
      security.OnChainBalanceCache.invalidate(user.wallet_address);
      const requiredOnChain = reqAmount * holdPercent;
      const onChainBalance = await getOnChainRexBalance(user.wallet_address);

      if (onChainBalance < requiredOnChain) {
        const shortfall = requiredOnChain - onChainBalance;
        const arMsg = `❌ شرط الأمان الملكي: يجب أن تكون مشتري ومحتفظ في محفظتك الخارجية (On-Chain) بـ ${(holdPercent*100).toFixed(0)}% على الأقل من قيمة السحب!\n\n• المطلوب في محفظتك: ${requiredOnChain.toLocaleString()} REX\n• رصيدك الفعلي في المحفظة: ${onChainBalance.toLocaleString()} REX\n• ينقصك: ${shortfall.toLocaleString()} REX في محفظتك.\n\nاشترِ REX واحتفظ بها في محفظتك لتفعيل السحب.`;
        const enMsg = `❌ Royal Security Rule: You must hold at least ${(holdPercent*100).toFixed(0)}% of the withdrawal amount in on-chain REX Jettons in your TON wallet!\n\n• Required On-Chain: ${requiredOnChain.toLocaleString()} REX\n• Your Wallet Balance: ${onChainBalance.toLocaleString()} REX\n• Shortfall: ${shortfall.toLocaleString()} REX in wallet.`;
        return sendMsg(req, res, false, arMsg, enMsg, {
          code: 'INSUFFICIENT_ONCHAIN_HOLD',
          required_hold: requiredOnChain,
          wallet_balance: onChainBalance,
          shortfall: shortfall
        });
      }
    }

    // 2. Mandatory Duration Holding Condition
    const minHoldRex = parseFloat(db.getSetting('min_hold_rex', '0'));
    const minHoldDays = parseFloat(db.getSetting('min_hold_days', '0'));
    if (minHoldRex > 0 && minHoldDays > 0) {
      const minHoldDurationMs = minHoldDays * 24 * 3600 * 1000;
      const onChainBalance = await getOnChainRexBalance(user.wallet_address);

      if (onChainBalance < minHoldRex) {
        if (user.onchain_hold_start > 0) {
          db.updateHoldStart(telegram_id, 0);
          user.onchain_hold_start = 0;
        }
        const arMsg = `❌ شرط الأمان الملكي: يجب شراء والاحتفاظ بـ ${minHoldRex.toLocaleString()} REX كحد أدنى في محفظتك On-Chain لمدة ${minHoldDays} أيام متتالية قبل السحب!\n• رصيدك الفعلي في المحفظة: ${onChainBalance.toLocaleString()} REX.\n⚠️ تم تصفير عداد الأيام لعدم استيفاء الحد الأدنى.`;
        const enMsg = `❌ Royal Security Rule: You must hold at least ${minHoldRex.toLocaleString()} REX in your TON wallet for ${minHoldDays} consecutive days before withdrawing!\n• Current Wallet Balance: ${onChainBalance.toLocaleString()} REX.`;
        return sendMsg(req, res, false, arMsg, enMsg, { code: 'INSUFFICIENT_HOLD_BALANCE' });
      }

      let onchainHoldStart = user.onchain_hold_start || 0;
      if (!onchainHoldStart) {
        onchainHoldStart = Date.now();
        db.updateHoldStart(telegram_id, onchainHoldStart);
        user.onchain_hold_start = onchainHoldStart;
      }

      const holdingElapsed = Date.now() - onchainHoldStart;
      if (holdingElapsed < minHoldDurationMs) {
        const remMs = minHoldDurationMs - holdingElapsed;
        const remDays = Math.floor(remMs / (24 * 3600 * 1000));
        const remHours = Math.floor((remMs % (24 * 3600 * 1000)) / 3600000);
        const remMins = Math.ceil((remMs % 3600000) / 60000);
        const arMsg = `⏳ شرط الأمان الملكي: يجب الاحتفاظ بـ ${minHoldRex.toLocaleString()} REX في محفظتك لمدة ${minHoldDays} أيام متتالية!\n\n• الوقت المتبقي لإتمام فترة الحيازة: ${remDays > 0 ? remDays + ' يوم و ' : ''}${remHours} ساعة و ${remMins} دقيقة.`;
        const enMsg = `⏳ Royal Security Rule: You must hold ${minHoldRex.toLocaleString()} REX in your TON wallet for ${minHoldDays} consecutive days!`;
        return sendMsg(req, res, false, arMsg, enMsg, { code: 'HOLD_PERIOD_NOT_ELAPSED' });
      }
    }
  }

  const withdrawalFee = parseFloat(db.getSetting('withdrawal_fee', '500'));
  if (reqAmount <= withdrawalFee) {
    return sendMsg(req, res, false,
      `مبلغ السحب (${reqAmount.toLocaleString()} REX) يجب أن يكون أكبر من رسوم السحب (${withdrawalFee.toLocaleString()} REX)!`,
      `Withdrawal amount (${reqAmount.toLocaleString()} REX) must be greater than withdrawal fee (${withdrawalFee.toLocaleString()} REX)!`
    );
  }
  const netAmount = Math.max(0, reqAmount - withdrawalFee);

  const idempKey = idempotency_key || `WD_${telegram_id}_${Date.now()}`;
  try {
    const reserveRes = db.atomicReserveWithdrawal(telegram_id, user.wallet_address, reqAmount, idempKey, withdrawalFee);
    cloudSync.triggerCloudBackup();

    // Notify Admin Telegram
    bot.telegram.sendMessage(ADMIN_TG_ID,
      `📤 *New On-Chain Withdrawal Request!* 👑\n\n` +
      `🆔 Order ID: #${reserveRes.withdrawal_id}\n` +
      `👤 User: ${user.first_name} (@${user.username || 'None'})\n` +
      `💰 Requested Amount: *${reqAmount.toLocaleString()} REX*\n` +
      `🏷️ Withdrawal Fee: *${withdrawalFee.toLocaleString()} REX*\n` +
      `💵 Net Payout to Wallet: *${netAmount.toLocaleString()} REX*\n` +
      `💼 On-Chain Wallet Balance: *${onChainBalance.toLocaleString()} REX* (20% Hold Condition Met ✅)\n` +
      `📍 Wallet: \`${user.wallet_address}\`\n\n` +
      `Current Status: \`PENDING\` (Under Audit)`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});

    const arMsg = `🎉 تم تسجيل طلب سحب ${reqAmount.toLocaleString()} REX بنجاح!\n• رسوم السحب: ${withdrawalFee.toLocaleString()} REX\n• الصافي الذي سيصل لمحفظتك: ${netAmount.toLocaleString()} REX\nبمجرد موافقة الإدارة، سيصل السحب لمحفظتك على البلوكتشين خلال 24 ساعة كحد أقصى.`;
    const enMsg = `🎉 Withdrawal request for ${reqAmount.toLocaleString()} REX submitted!\n• Fee: ${withdrawalFee.toLocaleString()} REX\n• Net amount to receive: ${netAmount.toLocaleString()} REX\nTokens will arrive in your TON wallet within 24 hours of approval.`;
    return sendMsg(req, res, true, arMsg, enMsg, {
      withdrawal_id: reserveRes.withdrawal_id,
      remaining_balance: reserveRes.remaining_balance,
      reserved_balance: reserveRes.reserved_balance,
      fee: withdrawalFee,
      net_amount: netAmount,
      status: 'pending'
    });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// ================================================================
// 5. REX INTELLIGENCE & ANALYTICS ENGINE
// ================================================================
app.get('/api/user/intelligence', telegramAuth, (req, res) => {
  const tid = parseInt(req.query.id || req.body?.telegram_id);
  const user = db.getUser(tid);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const rankInfo = db.getUserRank(user.xp_points || 0);
  const nextRankTargetXp = [150, 500, 1000, 2000, 5000][Math.min(rankInfo.rank - 1, 4)];
  const remainingXp = Math.max(0, nextRankTargetXp - (user.xp_points || 0));

  const baseDailyReward = parseFloat(db.getSetting('base_daily_reward', '100'));
  const dailyRate = baseDailyReward * user.mining_multiplier;

  // Estimated days to next rank (assuming 30 XP per day from mining & quests)
  const estimatedDaysToNextRank = Math.ceil(remainingXp / 30);

  // Historical earnings from last 14 days of ledger
  const txHistory = db.getUserTransactions(tid, 50);
  const earningsMap = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateKey = d.toISOString().slice(5, 10);
    earningsMap[dateKey] = 0;
  }

  txHistory.forEach(tx => {
    if (tx.amount > 0 && ['MINING_CLAIM', 'TASK_REWARD', 'REFERRAL_COMMISSION'].includes(tx.type)) {
      const d = new Date(tx.created_at);
      const dateKey = d.toISOString().slice(5, 10);
      if (earningsMap[dateKey] !== undefined) {
        earningsMap[dateKey] += tx.amount;
      }
    }
  });

  const chartLabels = Object.keys(earningsMap);
  const chartData = Object.values(earningsMap);

  res.json({
    mining_efficiency: (user.mining_multiplier * 100).toFixed(0) + '%',
    rank: rankInfo,
    current_xp: user.xp_points || 0,
    next_rank_xp: nextRankTargetXp,
    xp_progress: Math.min(100, Math.round(((user.xp_points || 0) / nextRankTargetXp) * 100)),
    estimated_days_to_rank: estimatedDaysToNextRank,
    daily_earning_potential: dailyRate,
    chart_labels: chartLabels,
    chart_data: chartData,
    recommendations: [
      user.mining_multiplier < 2 ? 'ارفع رصيدك في المحفظة إلى 500+ REX لتفعيل مضاعف التعدين 2x فما فوق.' : 'مضاعف التعدين الحالي ممتاز، واصل الحفاظ على رصيد المحفظة.',
      user.referrer_id ? 'شارك رابط إحالتك لزيادة عمولات الـ 5% مدى الحياة.' : 'انضم لنقابة ملكية لكسب نقاط قوة إضافية.'
    ],
    recommendations_ar: [
      user.mining_multiplier < 2 ? 'ارفع رصيدك في المحفظة إلى 500+ REX لتفعيل مضاعف التعدين 2x فما فوق.' : 'مضاعف التعدين الحالي ممتاز، واصل الحفاظ على رصيد المحفظة.',
      user.referrer_id ? 'شارك رابط إحالتك لزيادة عمولات الـ 5% مدى الحياة.' : 'انضم لنقابة ملكية لكسب نقاط قوة إضافية.'
    ],
    recommendations_en: [
      user.mining_multiplier < 2 ? 'Boost your on-chain wallet to 500+ REX to unlock the 2X+ mining multiplier.' : 'Your active mining multiplier is excellent; keep holding to maintain peak output.',
      user.referrer_id ? 'Share your referral link to maximize 5% lifetime mining commissions.' : 'Join a Royal Guild to earn additional alliance power points.'
    ]
  });
});

// ================================================================
// 6. PROOF OF REWARDS (PUBLIC EXPLORER & TRANSPARENCY)
// ================================================================
app.get('/api/public/proof-of-rewards', (req, res) => {
  const verifiedList = db.getPublicProofOfRewards(25);
  res.json({
    success: true,
    count: verifiedList.length,
    transactions: verifiedList
  });
});

app.get('/api/public/tokenomics', (req, res) => {
  res.json(db.getPublicTokenomicsStats());
});

let cachedMarketData = null;
let lastMarketFetch = 0;

app.get('/api/public/market-chart', async (req, res) => {
  const now = Date.now();
  if (cachedMarketData && (now - lastMarketFetch < 30000)) {
    return res.json(cachedMarketData);
  }

  const pairId = 'EQAng_73H-c1xVZrBK5RYhENU4gkQaGTG7tWIYCVa5VD9b4h';
  try {
    const apiRes = await fetch(`https://api.dexscreener.com/latest/dex/pairs/ton/${pairId}`);
    if (apiRes.ok) {
      const data = await apiRes.json();
      const pair = data.pair || (data.pairs && data.pairs[0]);
      if (pair) {
        cachedMarketData = {
          success: true,
          price_usd: parseFloat(pair.priceUsd || '0'),
          price_ton: parseFloat(pair.priceNative || '0'),
          price_change_24h: pair.priceChange?.h24 || 0,
          price_change_6h: pair.priceChange?.h6 || 0,
          price_change_1h: pair.priceChange?.h1 || 0,
          liquidity_usd: pair.liquidity?.usd || 0,
          volume_24h: pair.volume?.h24 || 0,
          fdv: pair.fdv || 0,
          market_cap: pair.marketCap || pair.fdv || 0,
          pair_address: pair.pairAddress,
          dex_url: pair.url || `https://dexscreener.com/ton/${pairId}`,
          embed_url: `https://dexscreener.com/ton/${pair.pairAddress}?embed=1&theme=dark&trades=0&info=0`,
          updated_at: now
        };
        lastMarketFetch = now;
        return res.json(cachedMarketData);
      }
    }
  } catch (err) {
    console.error('DexScreener fetch error:', err.message);
  }

  res.json(cachedMarketData || {
    success: true,
    price_usd: 0.0002008,
    price_ton: 0.0001823,
    price_change_24h: 9.28,
    liquidity_usd: 255.70,
    volume_24h: 11.0,
    fdv: 201,
    pair_address: 'EQAng_73H-c1xVZrBK5RYhENU4gkQaGTG7tWIYCVa5VD9b4h',
    dex_url: 'https://dexscreener.com/ton/eqang_73h-c1xvzrbk5ryhenu4gkqagtg7twiycva5vd9b4h',
    embed_url: 'https://dexscreener.com/ton/EQAng_73H-c1xVZrBK5RYhENU4gkQaGTG7tWIYCVa5VD9b4h?embed=1&theme=dark&trades=0&info=0',
    updated_at: now
  });
});

// ================================================================
// 7. ROYAL ACHIEVEMENTS
// ================================================================
app.get('/api/user/achievements', telegramAuth, (req, res) => {
  const tid = parseInt(req.query.id || req.body?.telegram_id);
  const list = db.getUserAchievements(tid);
  res.json(list);
});

app.post('/api/user/check-achievements', telegramAuth, (req, res) => {
  const { telegram_id } = req.body;
  const newlyUnlocked = db.checkAndUnlockAchievements(telegram_id);
  res.json({ success: true, newly_unlocked: newlyUnlocked });
});

// ================================================================
// 8. ROYAL VAULT (LOCKING)
// ================================================================
app.post('/api/vault/lock', telegramAuth, checkMaintenance, requireChannelSubMiddleware, (req, res) => {
  const { telegram_id, amount, duration_days } = req.body;
  const parsedAmt = parseFloat(amount);
  const days = parseInt(duration_days);

  if (isNaN(parsedAmt) || parsedAmt < 100) {
    return sendMsg(req, res, false, 'الحد الأدنى لقفل الخزينة هو 100 REX', 'Minimum vault lock is 100 REX');
  }
  if (![30, 60, 90].includes(days)) {
    return sendMsg(req, res, false, 'فترة القفل يجب أن تكون 30 أو 60 أو 90 يوماً', 'Lock duration must be 30, 60, or 90 days');
  }

  try {
    const lockRes = db.createVaultLock(telegram_id, parsedAmt, days);
    sendMsg(req, res, true, `تم قفل ${parsedAmt} REX في الخزينة بنجاح لـ ${days} يوماً بمضاعف +${lockRes.boost}x!`, `Successfully locked ${parsedAmt} REX in Royal Vault for ${days} days with +${lockRes.boost}x boost!`, { vault_id: lockRes.vault_id, unlock_at: lockRes.unlock_at });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

app.post('/api/vault/unlock', telegramAuth, checkMaintenance, (req, res) => {
  const { telegram_id, vault_id } = req.body;
  try {
    const unlockRes = db.unlockVaultLock(vault_id, telegram_id);
    sendMsg(req, res, true, `تم فك قفل الخزينة بنجاح واستعادة ${unlockRes.returned_amount} REX لرصيدك المتاح.`, `Vault lock released! Restored ${unlockRes.returned_amount} REX to your available balance.`);
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// ================================================================
// TOP 10 REX HOLDERS LEADERBOARD (Strictly excluding Admin Account)
// ================================================================
app.get(['/api/leaderboard', '/api/holders/leaderboard'], (req, res) => {
  try {
    const list = db.getTopHolders(ADMIN_TG_ID, 10);
    res.json(list);
  } catch (err) {
    console.error('[API LEADERBOARD ERROR]:', err);
    res.status(500).json({ error: 'Failed to load leaderboard' });
  }
});

// ================================================================
// 9. ROYAL GUILDS
// ================================================================
app.get('/api/guilds/leaderboard', (req, res) => {
  res.json(db.getGuildsLeaderboard());
});

app.get('/api/guilds/my-guild', telegramAuth, (req, res) => {
  const tid = parseInt(req.query.id || req.body?.telegram_id);
  res.json(db.getUserGuild(tid) || { in_guild: false });
});

app.post('/api/guilds/create', telegramAuth, checkMaintenance, (req, res) => {
  const { telegram_id, name, tag, description } = req.body;
  if (!name || !tag) return sendMsg(req, res, false, 'اسم ورمز النقابة مطلوبان', 'Guild name and tag are required');
  if (tag.length < 2 || tag.length > 5) return sendMsg(req, res, false, 'رمز النقابة يجب أن يكون من 2 إلى 5 أحرف', 'Guild tag must be between 2 and 5 characters');

  try {
    const guildRes = db.createGuild(telegram_id, name.trim(), tag.trim(), description || '');
    sendMsg(req, res, true, `تم تأسيس نقابة [${guildRes.tag}] ${guildRes.name} بنجاح!`, `Successfully founded Royal Guild [${guildRes.tag}] ${guildRes.name}!`, { guild: guildRes });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

app.post('/api/guilds/join', telegramAuth, checkMaintenance, (req, res) => {
  const { telegram_id, guild_id } = req.body;
  try {
    db.joinGuild(telegram_id, parseInt(guild_id));
    sendMsg(req, res, true, 'تم الانضمام إلى النقابة بنجاح!', 'Successfully joined the Royal Guild!');
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

app.post('/api/guilds/leave', telegramAuth, checkMaintenance, (req, res) => {
  const { telegram_id } = req.body;
  try {
    db.leaveGuild(telegram_id);
    sendMsg(req, res, true, 'تمت مغادرة النقابة بنجاح.', 'Successfully left the Royal Guild.');
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// ================================================================
// 10. REX ACADEMY
// ================================================================
app.get('/api/academy/lessons', telegramAuth, (req, res) => {
  const tid = parseInt(req.query.id || req.body?.telegram_id);
  res.json(db.getAcademyLessons(tid));
});

app.post('/api/academy/submit-quiz', telegramAuth, checkMaintenance, (req, res) => {
  const { telegram_id, lesson_id, selected_index } = req.body;
  try {
    const result = db.completeAcademyLesson(telegram_id, lesson_id, selected_index);
    sendMsg(req, res, true, `🎉 إجابة صحيحة! حصلت على +${result.reward_rex} REX و +${result.reward_xp} XP!`, `🎉 Correct answer! Earned +${result.reward_rex} REX and +${result.reward_xp} XP!`, { reward_rex: result.reward_rex, reward_xp: result.reward_xp, new_balance: result.balance });
  } catch (err) {
    if (err.message === 'INCORRECT_ANSWER') {
      return sendMsg(req, res, false, '❌ إجابة غير صحيحة، راجع محتوى الدرس وحاول مجدداً!', '❌ Incorrect answer. Review the lesson and try again!');
    }
    res.json({ success: false, message: err.message });
  }
});

// ================================================================
// 11. REPEATABLE TASKS
// ================================================================
app.post('/api/user/claim-task', telegramAuth, checkMaintenance, requireChannelSubMiddleware, (req, res) => {
  const { telegram_id, task_id, idempotency_key } = req.body;
  const user = db.getUser(telegram_id);
  if (!user || user.is_banned) return sendMsg(req, res, false, 'حساب غير مصرح', 'Unauthorized account');
  if (!user.is_activated) return sendMsg(req, res, false, 'فعّل حسابك أولاً', 'Activate your account first');

  const def = REPEATABLE_TASKS[task_id];
  if (!def) return sendMsg(req, res, false, 'مهمة غير صالحة', 'Invalid quest');

  const taskStatus = db.getTaskStatus(telegram_id, task_id);
  const now = Date.now();
  if (taskStatus && taskStatus.last_completed_at) {
    const elapsed = now - taskStatus.last_completed_at;
    if (elapsed < def.cooldown) {
      const waitH = Math.floor((def.cooldown - elapsed) / 3600000);
      const waitM = Math.ceil(((def.cooldown - elapsed) % 3600000) / 60000);
      return sendMsg(req, res, false, `انتظر ${waitH}س ${waitM}د لتجديد هذه المهمة.`, `Please wait ${waitH}h ${waitM}m before repeating this quest.`);
    }
  }

  let reward = def.reward;
  if (task_id === 'mystery_chest') {
    reward = Math.floor(Math.random() * (def.maxReward - def.minReward + 1)) + def.minReward;
  }

  const idempKey = idempotency_key || `TASK_${telegram_id}_${task_id}_${Math.floor(now / 10000)}`;
  try {
    const taskRes = db.atomicClaimTask(telegram_id, task_id, reward, idempKey, def.cooldown);
    cloudSync.triggerCloudBackup();
    sendMsg(req, res, true, `🎉 حصلت على ${reward} REX من "${def.name_ar || def.name}"!`, `🎉 Earned ${reward} REX from "${def.name_en || def.name}"!`, { reward, balance: taskRes.balance });
  } catch (err) {
    if (err.message === 'TASK_COOLDOWN_ACTIVE') {
      return sendMsg(req, res, false, 'هذه المهمة قيد الانتظار حالياً، يرجى الانتظار حتى انتهاء الوقت المحدد.', 'Quest cooldown active.');
    }
    res.json({ success: false, message: err.message });
  }
});

// ================================================================

// ================================================================
// 11.B DAILY CHECK-IN SYSTEM (7-Day Consecutive Streak)
// ================================================================
app.get('/api/daily-checkin', telegramAuth, (req, res) => {
  const tid = parseInt(req.query.id || req.body?.telegram_id || req.user?.id);
  if (!tid) return res.status(400).json({ error: 'Missing telegram_id' });
  const status = db.getDailyCheckinStatus(tid);
  res.json(status);
});

app.post('/api/daily-checkin/claim', telegramAuth, checkMaintenance, requireChannelSubMiddleware, (req, res) => {
  const { telegram_id } = req.body;
  const tid = parseInt(telegram_id);
  if (!tid) return sendMsg(req, res, false, 'معرف المستخدم غير صالح', 'Invalid user ID');

  try {
    const claimRes = db.claimDailyCheckin(tid);
    cloudSync.triggerCloudBackup();
    sendMsg(
      req,
      res,
      true,
      '🎉 تم تسجيل حضورك لليوم ' + claimRes.day + '! حصلت على +' + claimRes.reward + ' REX و +' + claimRes.xp + ' XP! 👑',
      '🎉 Day ' + claimRes.day + ' Check-In claimed! Received +' + claimRes.reward + ' REX and +' + claimRes.xp + ' XP! 👑',
      claimRes
    );
  } catch (err) {
    if (err.message === 'COOLDOWN_ACTIVE') {
      const status = db.getDailyCheckinStatus(tid);
      const waitH = Math.floor(status.cooldown_remaining / 3600000);
      const waitM = Math.ceil((status.cooldown_remaining % 3600000) / 60000);
      return sendMsg(
        req,
        res,
        false,
        'لقد سجلت حضورك بالفعل اليوم! انتظر ' + waitH + 'س ' + waitM + 'د للمطالبة التالية.',
        'You have already checked in today! Please wait ' + waitH + 'h ' + waitM + 'm for your next check-in.'
      );
    }
    res.json({ success: false, message: err.message });
  }
});


// ================================================================
// 12.B ADMIN PROMO & GIFT CODES ENGINE
// ================================================================
app.get('/api/admin/promo-codes', adminAuth, (req, res) => {
  try {
    const list = db.getAllPromoCodes();
    res.json({ success: true, promo_codes: list });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/admin/promo-codes/create', adminAuth, (req, res) => {
  const { code, reward_rex, reward_xp, max_uses, duration_hours } = req.body;
  try {
    const newPromo = db.createPromoCode({
      code,
      reward_rex,
      reward_xp: reward_xp || 0,
      max_uses,
      duration_hours,
      created_by: ADMIN_TG_ID
    });
    db.logAdminAction('CREATE_PROMO_CODE', `Created promo code ${newPromo.code} with ${newPromo.reward_rex} REX, ${newPromo.max_uses} uses, ${newPromo.duration_hours}h duration`, ADMIN_TG_ID);
    sendMsg(req, res, true, `تم إنشاء الكود الملكي ${newPromo.code} بنجاح!`, `Successfully created promo code ${newPromo.code}!`, { promo: newPromo });
  } catch (err) {
    let msgAr = err.message;
    if (err.message === 'CODE_ALREADY_EXISTS') msgAr = 'هذا الكود موجود بالفعل، يرجى اختيار رمز آخر';
    else if (err.message === 'INVALID_CODE_FORMAT') msgAr = 'صيغة الكود غير صالحة (يجب أن يتكون من 3 أحرف على الأقل)';
    else if (err.message === 'INVALID_REWARD_AMOUNT') msgAr = 'يرجى إدخال كمية REX صالحة';
    else if (err.message === 'INVALID_MAX_USES') msgAr = 'يرجى إدخال عدد مستخدمين أقصى صالح';
    else if (err.message === 'INVALID_DURATION') msgAr = 'يرجى إدخال مدة صلاحية صالحة بالساعات';
    res.json({ success: false, message: msgAr, code: err.message });
  }
});

app.post('/api/admin/promo-codes/delete', adminAuth, (req, res) => {
  const { id } = req.body;
  try {
    db.deletePromoCode(id);
    db.logAdminAction('DELETE_PROMO_CODE', `Deleted promo code ID ${id}`, ADMIN_TG_ID);
    sendMsg(req, res, true, 'تم حذف الكود بنجاح!', 'Promo code deleted successfully!');
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

app.post('/api/admin/promo-codes/toggle', adminAuth, (req, res) => {
  const { id } = req.body;
  try {
    db.togglePromoCode(id);
    db.logAdminAction('TOGGLE_PROMO_CODE', `Toggled active status for promo code ID ${id}`, ADMIN_TG_ID);
    sendMsg(req, res, true, 'تم تحديث حالة الكود بنجاح!', 'Promo code status updated successfully!');
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// ================================================================
// 12.C ADMIN ACTIVATION & FEE-WAIVER CODES ENGINE
// ================================================================
app.get('/api/admin/activation-codes', adminAuth, (req, res) => {
  try {
    const list = db.getAllActivationCodes();
    res.json({ success: true, activation_codes: list });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/admin/activation-codes/create', adminAuth, (req, res) => {
  try {
    const { code, max_uses, duration_hours, bonus_rex } = req.body;
    const created = db.createActivationCode({
      code,
      max_uses,
      duration_hours,
      bonus_rex,
      created_by: ADMIN_TG_ID
    });
    db.logAdminAction('CREATE_ACTIVATION_CODE', `إنشاء كود تفعيل: ${created.code} (مستخدمين: ${created.max_uses})`, ADMIN_TG_ID);
    sendMsg(req, res, true, `تم إنشاء كود التفعيل ${created.code} بنجاح!`, `Activation code ${created.code} created successfully!`, { activation_code: created });
  } catch (err) {
    let msgAr = err.message;
    if (err.message === 'CODE_ALREADY_EXISTS') msgAr = 'هذا الكود موجود مسبقاً، يرجى اختيار كود آخر';
    else if (err.message === 'INVALID_MAX_USES') msgAr = 'يرجى إدخال عدد مستخدمين أقصى صالح';
    else if (err.message === 'INVALID_DURATION') msgAr = 'يرجى إدخال مدة صلاحية صالحة';
    res.json({ success: false, message: msgAr, code: err.message });
  }
});

app.post('/api/admin/activation-codes/delete', adminAuth, (req, res) => {
  const { id } = req.body;
  try {
    db.deleteActivationCode(id);
    db.logAdminAction('DELETE_ACTIVATION_CODE', `Deleted activation code ID ${id}`, ADMIN_TG_ID);
    sendMsg(req, res, true, 'تم حذف كود التفعيل بنجاح!', 'Activation code deleted successfully!');
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

app.post('/api/admin/activation-codes/toggle', adminAuth, (req, res) => {
  const { id } = req.body;
  try {
    db.toggleActivationCode(id);
    db.logAdminAction('TOGGLE_ACTIVATION_CODE', `Toggled active status for activation code ID ${id}`, ADMIN_TG_ID);
    sendMsg(req, res, true, 'تم تحديث حالة كود التفعيل بنجاح!', 'Activation code status updated successfully!');
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// User API: Redeem Code inside Mini App
app.post('/api/user/redeem-code', telegramAuth, checkMaintenance, (req, res) => {
  const { telegram_id, code } = req.body;
  const tid = parseInt(telegram_id);
  if (!tid) return sendMsg(req, res, false, 'معرف المستخدم مطلوب', 'User ID required');
  if (!code) return sendMsg(req, res, false, 'يرجى إدخال الكود', 'Please enter a code');

  try {
    const redeemRes = db.redeemPromoCode(tid, code);
    sendMsg(
      req,
      res,
      true,
      `🎉 مبروك! تم تفعيل الكود ${redeemRes.code} وحصلت على +${redeemRes.reward_rex} REX!`,
      `🎉 Congrats! Redeemed code ${redeemRes.code} and received +${redeemRes.reward_rex} REX!`,
      redeemRes
    );
  } catch (err) {
    let msgAr = 'حدث خطأ أثناء استرداد الكود';
    let msgEn = 'Error redeeming code';
    if (err.message === 'CODE_NOT_FOUND') {
      msgAr = 'الكود غير صحيح أو غير موجود';
      msgEn = 'Invalid or non-existent code';
    } else if (err.message === 'CODE_EXPIRED') {
      msgAr = 'عذراً، انتهت صلاحية هذا الكود';
      msgEn = 'This promo code has expired';
    } else if (err.message === 'CODE_EXHAUSTED') {
      msgAr = 'عذراً، وصل هذا الكود إلى الحد الأقصى للمستخدمين';
      msgEn = 'This code reached maximum redemptions';
    } else if (err.message === 'ALREADY_REDEEMED') {
      msgAr = 'لقد قمت باستخدام هذا الكود مسبقاً';
      msgEn = 'You have already redeemed this code';
    } else if (err.message === 'CODE_INACTIVE') {
      msgAr = 'هذا الكود متوقف حالياً';
      msgEn = 'This code is currently inactive';
    } else if (err.message === 'USER_BANNED') {
      msgAr = 'حسابك محظور';
      msgEn = 'Your account is banned';
    }
    const isEn = req.body?.lang === 'en' || req.query?.lang === 'en';
    res.json({
      success: false,
      message: isEn ? msgEn : msgAr,
      message_ar: msgAr,
      message_en: msgEn,
      code: err.message
    });
  }
});


// ================================================================
// ADMIN DUAL REFERRAL BONUS OFFER ENGINE
// ================================================================
app.get('/api/admin/referral-offer', adminAuth, (req, res) => {
  try {
    const details = db.getReferralOfferDetails();
    res.json({ success: true, offer: details });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/admin/referral-offer/update', adminAuth, (req, res) => {
  try {
    const updated = db.updateReferralOffer(req.body);
    db.logAdminAction('UPDATE_REFERRAL_OFFER', `Updated referral offer: enabled=${updated.enabled}, referrer=${updated.referrer_rex}, referee=${updated.referee_rex}`, ADMIN_TG_ID);
    sendMsg(req, res, true, 'تم تحديث وحفظ إعدادات عرض الإحالة الملكي بنجاح!', 'Successfully updated and saved referral promotion settings!', { offer: updated });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// 12. ADMIN COMMAND CENTER 2.0 (WITH 2FA OTP & AUDIT)
// ================================================================

// Request 2FA OTP sent to Admin's Telegram
app.post('/api/admin/request-otp', adminAuth, async (req, res) => {
  const otp = security.adminOtpManager.generateOtp(ADMIN_TG_ID);
  try {
    await bot.telegram.sendMessage(ADMIN_TG_ID,
      `🔐 *Admin Security OTP (2FA):*\n\n` +
      `🔑 Secret Code: \`${otp}\`\n\n` +
      `⏳ Valid for 3 minutes. Do not share this code with anyone.`,
      { parse_mode: 'Markdown' }
    );
    res.json({ success: true, message: 'تم إرسال رمز الأمان إلى حساب التيليجرام الخاص بالأدمين.' });
  } catch (err) {
    res.json({ success: false, message: 'فشل إرسال كود التيليجرام: ' + err.message });
  }
});

// Verify 2FA OTP
app.post('/api/admin/verify-otp', adminAuth, (req, res) => {
  const { code } = req.body;
  const verified = security.adminOtpManager.verifyOtp(ADMIN_TG_ID, code);
  if (verified) {
    db.logAdminAction('ADMIN_2FA_LOGIN', 'تسجيل دخول ناجح بالأمان الثنائي 2FA', ADMIN_TG_ID);
    return res.json({ success: true });
  }
  res.status(401).json({ success: false, message: 'رمز الأمان غير صالح أو منتهي الصلاحية.' });
});

// Admin Stats with High-Speed In-Memory Cache (4s TTL) and Single-Pass DB Aggregation
let adminStatsCache = { data: null, timestamp: 0 };
app.get('/api/admin/stats', adminAuth, (req, res) => {
  const now = Date.now();
  if (adminStatsCache.data && (now - adminStatsCache.timestamp < 4000)) {
    return res.json(adminStatsCache.data);
  }
  try {
    const stats = db.getAdminDashboardStats();
    adminStatsCache = { data: stats, timestamp: now };
    res.json(stats);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin User Inspector
app.get('/api/admin/user/:id', adminAuth, async (req, res) => {
  const tid = parseInt(req.params.id);
  const profile = db.getUserFullProfile(tid);
  if (!profile || !profile.user) return res.status(404).json({ error: 'User not found' });
  let onChainRex = 0;
  if (profile.user.wallet_address) {
    onChainRex = await getOnChainRexBalance(profile.user.wallet_address);
  }

  const minHoldRex = parseFloat(db.getSetting('min_hold_rex', '5000'));
  const minHoldDays = parseFloat(db.getSetting('min_hold_days', '3'));
  const minHoldDurationMs = minHoldDays * 24 * 3600 * 1000;
  const isHoldExempt = Boolean(profile.user.is_hold_exempt);
  const holdStart = profile.user.onchain_hold_start || 0;
  const holdingElapsed = holdStart ? (Date.now() - holdStart) : 0;
  const isHoldPassed = isHoldExempt || ((onChainRex >= minHoldRex) && (holdingElapsed >= minHoldDurationMs));
  const holdRemainingMs = isHoldExempt ? 0 : Math.max(0, minHoldDurationMs - holdingElapsed);

  res.json({
    ...profile,
    onChainRex,
    holdInfo: {
      minHoldRex,
      minHoldDays,
      holdStart,
      holdingElapsed,
      isHoldPassed,
      holdRemainingMs,
      isHoldExempt
    }
  });
});

// Admin Toggle 3-Day Holding Exemption
app.post('/api/admin/toggle-hold-exemption', adminAuth, (req, res) => {
  const { telegram_id } = req.body;
  if (!telegram_id) return res.status(400).json({ success: false, message: 'معرف المستخدم مطلوب' });
  const tid = parseInt(telegram_id, 10);
  const user = db.getUser(tid);
  if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });

  db.toggleHoldExemption(tid);
  const updated = db.getUser(tid);
  const isExempt = Boolean(updated.is_hold_exempt);

  db.logAdminAction('TOGGLE_HOLD_EXEMPTION', `Toggle 3-day hold exemption for user ${tid} to ${isExempt ? 'EXEMPT' : 'ENFORCED'}`, ADMIN_TG_ID);

  if (isExempt) {
    bot.telegram.sendMessage(
      tid,
      `👑 *Royal Holding Exemption Granted!* 🎉\n\n` +
      `Your account has been granted VIP exemption from the 3-day holding requirement by Royal Administration!\n` +
      `You can now request withdrawals without the 72h holding period. 🚀`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});
  }

  res.json({
    success: true,
    is_hold_exempt: isExempt,
    message: isExempt ? 'تم إعفاء المستخدم من شرط الاحتفاظ 3 أيام بنجاح!' : 'تم إعادة تفعيل شرط الاحتفاظ 3 أيام للمستخدم.'
  });
});

// Admin Users List
app.get('/api/admin/users', adminAuth, (req, res) => {
  const { search = '', page = 0, limit = 30 } = req.query;
  res.json(db.getAllUsers(search, parseInt(page), parseInt(limit)));
});

// Admin Multi-Stage Withdrawal Workflow
app.get('/api/admin/withdrawals', adminAuth, (req, res) => {
  const { status = 'all', page = 0 } = req.query;
  if (status === 'pending') return res.json(db.getPendingWithdrawals());
  res.json(db.getAllWithdrawals(parseInt(page)));
});

app.post('/api/admin/withdrawals/status', adminAuth, async (req, res) => {
  const { id, telegram_id, new_status, tx_hash, explorer_url, audit_note } = req.body;
  if (!id || !new_status) return res.json({ success: false, message: 'معرف السحب والحالة مطلوبان' });

  try {
    db.atomicUpdateWithdrawalStatus(id, new_status, { tx_hash, explorer_url, audit_note });
    db.logAdminAction('UPDATE_WITHDRAWAL_STATUS', `سحب #${id} إلى ${new_status} (${audit_note || ''})`, ADMIN_TG_ID);

    if (new_status === 'confirmed') {
      const enableHoldingRule = db.getSetting('enable_holding_rule', '0') === '1';
      const enableAntiDump = db.getSetting('enable_anti_dump', '0') === '1';
      const user = db.getUser(telegram_id);
      const isExempt = !user || parseInt(telegram_id) === ADMIN_TG_ID || user.is_hold_exempt || user.is_sybil_exempt;
      const withdrawal = db.db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(id);
      const wdAmt = withdrawal ? withdrawal.amount : 0;

      if (enableHoldingRule && enableAntiDump && !isExempt) {
        let onChainBal = 0;
        if (user?.wallet_address) {
          security.OnChainBalanceCache.invalidate(user.wallet_address);
          try { onChainBal = (await getOnChainRexBalance(user.wallet_address)) || 0; } catch(e) {}
        }
        const minHoldRex = parseFloat(db.getSetting('min_hold_rex', '0'));
        const baselineRex = Math.max(onChainBal, minHoldRex + wdAmt);

        db.setPostWithdrawalMonitoring(telegram_id, id, baselineRex, 24);
        db.logAdminAction('ANTI_DUMP_MONITOR_START', `بدء مراقبة مكافحة الإغراق للمستخدم ${telegram_id} لـ 24 ساعة برصيد ${baselineRex} REX`, ADMIN_TG_ID);

        bot.telegram.sendMessage(telegram_id,
          `✅ *Your Withdrawal Has Been Confirmed & Dispatched On-Chain!* 👑\n\n` +
          `💰 *Amount Received:* *+${wdAmt.toLocaleString()} REX*\n` +
          (tx_hash ? `🔗 *Transaction Hash:* \`${tx_hash}\`\n` : '') +
          (explorer_url ? `🌐 *Explorer Link:* [View Transaction on Tonviewer](${explorer_url})\n\n` : '\n') +
          `🛡️ *Royal Security Law (Anti-Dump Protection — 24h):*\n` +
          `Selling or transferring any part of your REX tokens (locked baseline: *${baselineRex.toLocaleString()} REX*) is strictly forbidden for the next *24 hours* to safeguard tokenomics stability.\n\n` +
          `⚠️ *Strict Warning:* Selling any tokens within 24h will trigger an **instant permanent ban** from the platform!`,
          { parse_mode: 'Markdown' }
        ).catch(() => {});
      } else {
        bot.telegram.sendMessage(telegram_id,
          `✅ *تم تأكيد وإرسال سحب أرباحك بنجاح On-Chain!* 👑\n\n` +
          `💰 *المبلغ المستلم:* *+${wdAmt.toLocaleString()} REX*\n` +
          (tx_hash ? `🔗 *رمز المعاملة:* \`${tx_hash}\`\n` : '') +
          (explorer_url ? `🌐 *عرض المعاملة في المستكشف:* [Tonviewer](${explorer_url})\n\n` : '\n') +
          `🎉 تهانينا لك ومبروك أرباحك في منصة ROYAL ELITE X!`,
          { parse_mode: 'Markdown' }
        ).catch(() => {});
      }
    } else if (new_status === 'approved') {
      bot.telegram.sendMessage(telegram_id,
        `✅ *Your Withdrawal Request Has Been Approved!* 👑\n\n` +
        `⏳ *Estimated Delivery:* Your withdrawal will be dispatched to your blockchain wallet within a maximum of 24 hours.\n\n` +
        `Thank you for your trust in ROYAL ELITE X Sovereign Court.`,
        { parse_mode: 'Markdown' }
      ).catch(() => {});
    } else if (new_status === 'rejected' || new_status === 'failed') {
      bot.telegram.sendMessage(telegram_id,
        `❌ Your withdrawal request status was updated to (${new_status}).\n` +
        `Reason: ${audit_note || 'Security Review'}\n` +
        `Your reserved balance has been safely restored to your available balance.`
      ).catch(() => {});
    }

    cloudSync.triggerCloudBackup();
    res.json({ success: true, new_status });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// Admin Automated On-Chain Payout from Bot Wallet
app.post('/api/admin/withdrawals/auto-payout', adminAuth, async (req, res) => {
  const { id } = req.body;
  if (!id) return res.json({ success: false, message: 'معرف طلب السحب مطلوب' });

  const withdrawal = db.db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(id);
  if (!withdrawal) return res.json({ success: false, message: 'طلب السحب غير موجود' });
  if (withdrawal.status !== 'pending' && withdrawal.status !== 'approved') {
    return res.json({ success: false, message: `لا يمكن صرف طلب بحالة (${withdrawal.status})` });
  }

  const user = db.getUser(withdrawal.telegram_id);
  const recipientWallet = withdrawal.wallet_address || user?.wallet_address;
  if (!recipientWallet) {
    return res.json({ success: false, message: 'المستخدم ليس لديه عنوان محفظة TON مسجل' });
  }

  try {
    const netPayout = withdrawal.net_amount || (withdrawal.amount - (withdrawal.fee || 500));
    const txResult = await payout.sendOnChainRexPayout({
      recipientAddress: recipientWallet,
      amountRex: netPayout,
      memo: `REX Withdrawal #${id} Payout (Net: ${netPayout.toLocaleString()} REX) 👑`
    });

    const txHash = `seqno-${txResult.seqno}`;
    const explorerUrl = txResult.explorerUrl;

    db.atomicUpdateWithdrawalStatus(id, 'confirmed', {
      tx_hash: txHash,
      explorer_url: explorerUrl,
      audit_note: `تم الصرف الآلي على البلوكتشين من محفظة البوت (${txResult.sender})`
    });

    // Anti-Dump Monitoring for 24h (Only if both holding and anti-dump are enabled and not admin/exempt)
    const enableHoldingRule = db.getSetting('enable_holding_rule', '0') === '1';
    const enableAntiDump = db.getSetting('enable_anti_dump', '0') === '1';
    const isExempt = !user || parseInt(withdrawal.telegram_id) === ADMIN_TG_ID || user.is_hold_exempt || user.is_sybil_exempt;

    if (enableHoldingRule && enableAntiDump && !isExempt) {
      const minHoldRex = parseFloat(db.getSetting('min_hold_rex', '0'));
      let onChainBal = 0;
      try { onChainBal = (await getOnChainRexBalance(recipientWallet)) || 0; } catch(e) {}
      const baselineRex = Math.max(onChainBal, minHoldRex + withdrawal.amount);
      db.setPostWithdrawalMonitoring(withdrawal.telegram_id, id, baselineRex, 24);

      bot.telegram.sendMessage(withdrawal.telegram_id,
        `✅ *Your Withdrawal Was Dispatched Automatically On-Chain!* 👑\n\n` +
        `💰 *Net Amount Received:* *+${netPayout.toLocaleString()} REX*\n` +
        `🏷️ *Withdrawal Fee:* *${(withdrawal.fee || 500).toLocaleString()} REX*\n` +
        `📥 *Recipient Wallet:* \`${recipientWallet.slice(0,8)}...${recipientWallet.slice(-6)}\`\n` +
        `🌐 *Verification Link:* [View Transaction on Tonviewer](${explorerUrl})\n\n` +
        `🛡️ *Royal Security Law (Anti-Dump Protection — 24h):*\n` +
        `Selling or transferring any part of your REX tokens (monitored baseline: *${baselineRex.toLocaleString()} REX*) is strictly prohibited for the next *24 hours* to protect liquidity stability.\n\n` +
        `⚠️ *Strict Warning:* Selling any tokens within 24h will trigger an **instant permanent ban** from the platform!`,
        { parse_mode: 'Markdown' }
      ).catch(() => {});
    } else {
      bot.telegram.sendMessage(withdrawal.telegram_id,
        `✅ *تم الصرف الآلي لسحبك بنجاح على البلوكتشين!* 👑\n\n` +
        `💰 *الصافي المستلم:* *+${netPayout.toLocaleString()} REX*\n` +
        `🏷️ *رسوم المعالجة والشبكة:* *${(withdrawal.fee || 500).toLocaleString()} REX*\n` +
        `📥 *محفظة الاستلام:* \`${recipientWallet.slice(0,8)}...${recipientWallet.slice(-6)}\`\n` +
        `🌐 *رابط المعاملة:* [عرض في Tonviewer](${explorerUrl})\n\n` +
        `🎉 تهانينا لك! تم إرسال العملات مباشرة لمحفظتك بنجاح وبدون أي قيود أو شروط حظر.`,
        { parse_mode: 'Markdown' }
      ).catch(() => {});
    }

    db.logAdminAction('AUTO_PAYOUT_SUCCESS', `تم صرف سحب #${id} بقيمة ${withdrawal.amount} REX إلى ${recipientWallet}`, ADMIN_TG_ID);
    cloudSync.triggerCloudBackup();

    return res.json({
      success: true,
      message: `تم صرف ${withdrawal.amount.toLocaleString()} REX بنجاح على البلوكتشين وإرسالها للمستخدم!`,
      txResult
    });
  } catch (err) {
    console.error('Auto payout error:', err);
    return res.json({
      success: false,
      message: `فشل التحويل التلقائي: ${err.message}`
    });
  }
});

// Admin Bot Payout Wallet Status (Cached for 30s for lightning dashboard loading)
let botWalletCache = { data: null, timestamp: 0 };
app.get('/api/admin/bot-wallet', adminAuth, async (req, res) => {
  const now = Date.now();
  if (botWalletCache.data && (now - botWalletCache.timestamp < 30000)) {
    return res.json(botWalletCache.data);
  }
  try {
    const info = await payout.getBotWalletInfo();
    botWalletCache = { data: info, timestamp: now };
    res.json(info);
  } catch (err) {
    res.json({ configured: false, error: err.message });
  }
});

// Admin Settings
app.get('/api/admin/settings', adminAuth, (req, res) => {
  res.json(db.getAllSettings());
});

app.post('/api/admin/settings', adminAuth, (req, res) => {
  const { settings } = req.body;
  if (settings && typeof settings === 'object') {
    for (const [k, v] of Object.entries(settings)) {
      db.updateSetting(k, String(v));
    }
    db.logAdminAction('UPDATE_SETTINGS', JSON.stringify(settings), ADMIN_TG_ID);
    cloudSync.triggerCloudBackup();
    return res.json({ success: true });
  }
  res.json({ success: false });
});

app.post('/api/admin/toggle-maintenance', adminAuth, (req, res) => {
  const current = db.getSetting('maintenance_mode', '0');
  const next = current === '1' ? '0' : '1';
  db.updateSetting('maintenance_mode', next);
  db.logAdminAction('TOGGLE_MAINTENANCE', `Maintenance mode set to ${next === '1' ? 'ACTIVE' : 'OFF'}`, ADMIN_TG_ID);
  res.json({ success: true, maintenance_mode: next });
});

// Sybil Radar
app.get('/api/admin/sybil-radar', adminAuth, (req, res) => {
  res.json(db.getSybilAlerts());
});

app.post('/api/admin/sybil/clear', adminAuth, (req, res) => {
  const { fingerprint } = req.body;
  if (!fingerprint) return res.status(400).json({ error: 'Missing fingerprint' });
  db.clearSybilConflict(fingerprint);
  db.logAdminAction('CLEAR_SYBIL_CONFLICT', `مسح تعارض البصمة ${fingerprint} وفك الحظر`, ADMIN_TG_ID);
  res.json({ success: true });
});

// Audit Logs
app.get('/api/admin/audit-logs', adminAuth, (req, res) => {
  res.json(db.getAdminLogs(50));
});

// User Management (Ban/Unban)
app.post('/api/admin/ban', adminAuth, (req, res) => {
  const { telegram_id, reason } = req.body;
  db.banUser(telegram_id, reason || 'حظر إداري');
  db.logAdminAction('BAN_USER', `حظر ${telegram_id}: ${reason || 'حظر إداري'}`, ADMIN_TG_ID);
  bot.telegram.sendMessage(telegram_id,
    `⛔ Your account has been suspended from ROYAL ELITE X.\nReason: ${reason || 'Terms of Service violation'}`
  ).catch(() => {});
  res.json({ success: true });
});

app.post('/api/admin/unban', adminAuth, (req, res) => {
  const { telegram_id } = req.body;
  db.unbanUser(telegram_id);
  db.logAdminAction('UNBAN_USER', `فك حظر ${telegram_id}`, ADMIN_TG_ID);
  bot.telegram.sendMessage(telegram_id,
    '✅ Your account suspension has been lifted! Welcome back to ROYAL ELITE X 👑'
  ).catch(() => {});
  res.json({ success: true });
});

// Admin Balance & Mining Controls
app.post('/api/admin/add-balance', adminAuth, (req, res) => {
  const { telegram_id, amount, reason } = req.body;
  if (!telegram_id || amount === undefined || isNaN(parseFloat(amount))) {
    return res.status(400).json({ success: false, message: 'معرف المستخدم والمبلغ مطلوبان' });
  }

  const tid = parseInt(telegram_id, 10);
  const amt = parseFloat(amount);

  try {
    const result = db.addBalance(tid, amt, ADMIN_TG_ID, reason);
    db.logAdminAction('ADD_BALANCE', `إضافة ${amt} REX للمستخدم ${tid}`, ADMIN_TG_ID);

    // Send Telegram Notification to the user if credit
    if (amt > 0) {
      bot.telegram.sendMessage(
        tid,
        `🎁 *Royal Balance Credited!*\n\n` +
        `*+${amt.toLocaleString()} REX* has been deposited into your account by Royal Administration 👑\n` +
        `Current Available Balance: *${Number(result.balance).toFixed(2)} REX*`,
        { parse_mode: 'Markdown' }
      ).catch(() => {});
    }

    cloudSync.triggerCloudBackup();
    res.json({ success: true, new_balance: result.balance, added: amt });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/admin/set-balance', adminAuth, (req, res) => {
  const { telegram_id, amount, reason } = req.body;
  if (!telegram_id || amount === undefined || isNaN(parseFloat(amount))) {
    return res.status(400).json({ success: false, message: 'معرف المستخدم والمبلغ مطلوبان' });
  }

  const tid = parseInt(telegram_id, 10);
  const amt = parseFloat(amount);

  try {
    const result = db.setBalance(tid, amt, ADMIN_TG_ID, reason);
    db.logAdminAction('SET_BALANCE', `تعيين رصيد المستخدم ${tid} إلى ${amt} REX`, ADMIN_TG_ID);
    cloudSync.triggerCloudBackup();
    res.json({ success: true, new_balance: result.balance });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/admin/reset-mining', adminAuth, (req, res) => {
  const { telegram_id } = req.body;
  if (!telegram_id) return res.status(400).json({ success: false, message: 'معرف المستخدم مطلوب' });
  const tid = parseInt(telegram_id, 10);
  db.resetMining(tid);
  db.logAdminAction('RESET_MINING', `إعادة تعيين دورة التعدين للمستخدم ${tid}`, ADMIN_TG_ID);
  cloudSync.triggerCloudBackup();
  res.json({ success: true });
});

app.post('/api/admin/clear-reserved-balance', adminAuth, (req, res) => {
  const { telegram_id } = req.body;
  if (!telegram_id) return res.status(400).json({ success: false, message: 'معرف المستخدم مطلوب' });
  const tid = parseInt(telegram_id, 10);
  db.clearReservedBalance(tid);
  db.logAdminAction('CLEAR_RESERVED_BALANCE', `تصفير الرصيد المحجوز للمستخدم ${tid}`, ADMIN_TG_ID);
  cloudSync.triggerCloudBackup();
  res.json({ success: true });
});

// Admin Cloud Backup & Persistence Controls (Supabase)
app.post('/api/admin/cloud-sync/backup', adminAuth, async (req, res) => {
  const success = await cloudSync.backupToCloud();
  res.json({
    success,
    message: success ? 'تم أخذ نسخة احتياطية سحابية كاملة وحفظها في Supabase بنجاح! ☁️' : 'فشل أخذ النسخة السحابية'
  });
});

app.post('/api/admin/cloud-sync/restore', adminAuth, async (req, res) => {
  const success = await cloudSync.restoreFromCloud();
  res.json({
    success,
    message: success ? 'تم استرجاع قاعدة البيانات بنجاح من سحابة Supabase! ☁️' : 'لم يتم العثور على نسخة سحابية جديدة أو فشل الاسترجاع'
  });
});

// Direct Admin DM to User
app.post('/api/admin/send-message', adminAuth, async (req, res) => {
  const { telegram_id, message } = req.body;
  if (!telegram_id || !message) {
    return res.status(400).json({ success: false, message: 'معرف المستخدم أو الرسالة مفقود' });
  }

  const tid = parseInt(telegram_id, 10);
  try {
    // Attempt 1: Markdown
    try {
      await bot.telegram.sendMessage(
        tid,
        `👑 *Direct Message from ROYAL ELITE X Administration:*\n\n${message}`,
        { parse_mode: 'Markdown' }
      );
    } catch (parseErr) {
      // Attempt 2: Fallback to plain text if Markdown parsing fails
      await bot.telegram.sendMessage(
        tid,
        `👑 Direct Message from ROYAL ELITE X Administration:\n\n${message}`
      );
    }

    db.logAdminAction('SEND_DM', `إرسال رسالة للمستخدم ${tid}: ${message.slice(0, 50)}`, ADMIN_TG_ID);
    return res.json({ success: true, message: 'تم إرسال الرسالة بنجاح' });
  } catch (err) {
    console.error(`Failed to send DM to ${tid}:`, err.message);
    return res.json({ 
      success: false, 
      message: err.description || err.message || 'فشل التسليم (المستخدم قد يكون حظر البوت)' 
    });
  }
});

// Broadcast to All Users
app.post('/api/admin/broadcast', adminAuth, async (req, res) => {
  const { message } = req.body;
  if (!message) return res.json({ success: false, message: 'محتوى الرسالة فارغ' });
  const users = db.getAllUsers('', 0, 9999);
  let sent = 0, failed = 0;
  for (const u of users) {
    try {
      try {
        await bot.telegram.sendMessage(
          u.telegram_id,
          `📢 *Official Announcement from ROYAL ELITE X Administration*\n\n${message}`,
          { parse_mode: 'Markdown' }
        );
      } catch (mdErr) {
        await bot.telegram.sendMessage(
          u.telegram_id,
          `📢 Official Announcement from ROYAL ELITE X Administration\n\n${message}`
        );
      }
      sent++;
      await new Promise(r => setTimeout(r, 40));
    } catch { failed++; }
  }
  db.logAdminAction('BROADCAST', `إرسال رسالة جماعية إلى ${sent} مستخدم (فشل: ${failed})`, ADMIN_TG_ID);
  res.json({ success: true, sent, failed });
});

// Endpoint for Web Verification of Channel Subscription
app.post('/api/user/check-channel', telegramAuth, async (req, res) => {
  const telegram_id = req.telegramUser?.id || req.body?.telegram_id;
  if (telegram_id) channelSubCache.delete(parseInt(telegram_id));
  const isSub = await isUserSubscribedToChannel(telegram_id);
  const chan = getRequiredChannel();
  return res.json({
    success: isSub || parseInt(telegram_id) === ADMIN_TG_ID,
    is_subscribed: isSub || parseInt(telegram_id) === ADMIN_TG_ID,
    required_channel: chan,
    channel_url: `https://t.me/${chan.replace(/^@/, '')}`
  });
});

// Admin Diagnostic Endpoint to verify bot permissions in required channel
app.get('/api/admin/check-channel-status', adminAuth, async (req, res) => {
  const chan = getRequiredChannel();
  try {
    const chat = await bot.telegram.getChat(chan);
    const botMe = await bot.telegram.getMe();
    let botMember = null;
    try {
      botMember = await bot.telegram.getChatMember(chan, botMe.id);
    } catch(be) {
      botMember = { error: be.message };
    }
    let adminMember = null;
    try {
      adminMember = await bot.telegram.getChatMember(chan, ADMIN_TG_ID);
    } catch(ae) {
      adminMember = { error: ae.message };
    }
    res.json({
      success: true,
      channel: chan,
      chat_title: chat.title,
      bot_username: botMe.username,
      bot_membership: botMember,
      admin_membership: adminMember,
      force_sub_enabled: db.getSetting('force_sub_enabled', '1')
    });
  } catch (err) {
    res.json({
      success: false,
      channel: chan,
      error: err.message
    });
  }
});

// ================================================================
// 13. TELEGRAM BOT COMMANDS & INTERACTIVE FLOWS (ENGLISH)
// ================================================================


async function checkAndAwardReferralOffer(newUserId, firstName) {
  try {
    const offer = db.getReferralOfferDetails();
    if (!offer || !offer.enabled) return;

    const user = db.getUser(newUserId);
    if (!user || !user.referrer_id) return;
    if (user.ref_bonus_awarded === 1) return;
    if (!user.wallet_address || user.wallet_address.trim() === '') return;
    if (user.is_activated !== 1) return; // STRICT: Referral reward ONLY awarded after account verification/activation!

    const refBonus = offer.referrer_rex;
    const newBonus = offer.referee_rex;
    if (refBonus <= 0 && newBonus <= 0) return;

    const awardRes = db.atomicAwardReferralOffer(newUserId, user.referrer_id, newBonus, refBonus);
    if (!awardRes || !awardRes.success) return;

    // Send notification to Referrer in Telegram
    bot.telegram.sendMessage(
      user.referrer_id,
      `🎉 *${offer.title || 'Royal Referral Campaign'} Bonus!* 👑\n\n` +
      `Your invited knight (*${firstName || 'Knight'}*) has just verified their TON wallet!\n` +
      `💰 Your referral reward: *+${refBonus.toLocaleString()} REX* has been credited immediately!\n\n` +
      `💳 Total Balance Now: *${Number(awardRes.referrer.balance).toLocaleString()} REX* 🚀`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});

    // Send notification to New User in Telegram
    bot.telegram.sendMessage(
      newUserId,
      `🎁 *Royal Welcome Gift from ${offer.title || 'Referral Campaign'}!* 🎉\n\n` +
      `Because you verified your TON wallet after joining via your friend's invite (*${awardRes.referrer.name || 'Royal Knight'}*), you received a special welcome bonus:\n` +
      `💰 *+${newBonus.toLocaleString()} REX* credited to your wallet immediately!\n\n` +
      `💳 Current Balance: *${Number(awardRes.new_user.balance).toLocaleString()} REX* 👑`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});
  } catch (err) {
    console.error('[REFERRAL OFFER AWARD ERROR]:', err.message);
  }
}

async function sendWelcomeMessage(ctx, firstName, payload) {
  await ctx.reply(
    `👑 *Welcome to ROYAL ELITE X (REX) — Sovereign Platform*\n\n` +
    `🏰 Welcome, ${firstName}! The official Web3 Cloud Mining and Telegram Mini App for *REX* on *TON Blockchain* is now LIVE.\n\n` +
    `🔒 *Royal Gate Requirements:*\n` +
    `• Connect Official TON Wallet (Tonkeeper / MyTonWallet)\n` +
    `• One-time Anti-Sybil Security Verification Fee: *0.1 TON*\n\n` +
    `⚡ 24-hour mining cycles, daily recurring quests, royal guilds, and on-chain vaults!\n\n` +
    `Tap the royal button below to launch the platform 👇`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.webApp('👑 Launch ROYAL ELITE X', WEBAPP_URL)]])
    }
  );
}

bot.start(async (ctx) => {
  const tid = ctx.from.id;
  const firstName = ctx.from.first_name || 'Knight';
  const username = ctx.from.username || '';
  const payload = ctx.message.text.split(' ')[1];

  let referrer_id = null;
  if (payload?.startsWith('ref_')) {
    const r = parseInt(payload.replace('ref_', ''));
    if (r && r !== tid) referrer_id = r;
  }

  let user = db.getUser(tid);
  if (!user) {
    db.createUser({ telegram_id: tid, first_name: firstName, username, referrer_id, created_at: Date.now() });
    user = db.getUser(tid);
  }

  // Maintenance check
  if (isMaintenanceActive() && tid !== ADMIN_TG_ID) {
    return ctx.reply(
      `🛠 *System Under Maintenance*\n\n` +
      `ROYAL ELITE X is currently undergoing scheduled platform upgrades and maintenance. All user balances, ranks, and mining timers are 100% safe.\n\n` +
      `Please check back shortly! 👑`,
      { parse_mode: 'Markdown' }
    );
  }

  if (user.is_banned) {
    return ctx.reply(`⛔ *Account Suspended*\nReason: ${user.ban_reason || 'Anti-Sybil security policy violation'}`);
  }

  await sendWelcomeMessage(ctx, firstName, payload);
});

// Callback Query Handler: Verify Channel Subscription
bot.action(/verify_sub_(.*)/, async (ctx) => {
  const tid = ctx.from.id;
  const firstName = ctx.from.first_name || 'Knight';
  const payload = ctx.match[1];
  const isSubscribed = await isUserSubscribedToChannel(tid);

  if (isSubscribed || tid === ADMIN_TG_ID) {
    await ctx.answerCbQuery('✅ Verification successful! Welcome to Royal Elite X 👑');
    try { await ctx.deleteMessage(); } catch(e) {}
    return sendWelcomeMessage(ctx, firstName, payload !== 'none' ? payload : null);
  } else {
    const channel = getRequiredChannel();
    return ctx.answerCbQuery(
      `⚠️ You haven't joined ${channel} yet! Please join the channel first.`,
      { show_alert: true }
    );
  }
});

bot.command('balance', (ctx) => {
  if (isMaintenanceActive() && ctx.from.id !== ADMIN_TG_ID) {
    return ctx.reply(`🛠 *System Under Maintenance*\n\nPlease check back shortly! 👑`, { parse_mode: 'Markdown' });
  }

  const user = db.getUser(ctx.from.id);
  if (!user) return ctx.reply('⚠️ You have not joined the royal court yet. Send /start');
  const rank = db.getUserRank(user.xp_points || 0);
  ctx.reply(
    `💰 *Your Royal Balance in ROYAL ELITE X:*\n\n` +
    `• Available Balance: *${Number(user.balance).toFixed(2)} REX*\n` +
    `• Reserved for Withdrawal: *${Number(user.reserved_balance || 0).toFixed(2)} REX*\n` +
    `• Total Mined: *${Number(user.mined_total).toFixed(2)} REX*\n` +
    `• Royal Rank: *${rank.title_en}* (XP: ${user.xp_points || 0})\n` +
    `• Current Mining Multiplier: *${user.mining_multiplier}x*\n` +
    `• Account Status: ${user.is_activated ? '✅ Activated' : '⏳ Pending Activation'}\n\n` +
    `Open the Mini App for full details and controls 👑`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.webApp('🚀 Open Mini App', WEBAPP_URL)]])
    }
  );
});

bot.command('stats', (ctx) => {
  const tokenomics = db.getPublicTokenomicsStats();
  ctx.reply(
    `📊 *ROYAL ELITE X — Ecosystem Statistics* 👑\n\n` +
    `💎 Token: *REX*\n` +
    `🌐 Network: *TON Blockchain*\n` +
    `📜 Smart Contract: \`${REX_MASTER_CONTRACT}\`\n\n` +
    `🪙 Total Supply: *1,000,000 REX*\n` +
    `⛏️ Mining Reserve Remaining: *${tokenomics.reserve_remaining.toLocaleString()} REX*\n` +
    `👥 Registered Knights: *${tokenomics.total_users}*\n` +
    `📤 Confirmed On-Chain Withdrawals: *${tokenomics.total_confirmed_withdrawals.toLocaleString()} REX*`,
    { parse_mode: 'Markdown' }
  );
});

bot.command(['whitepaper', 'wp'], (ctx) => {
  ctx.reply(
    `📜 *Official Sovereign Whitepaper — ROYAL ELITE X (REX)* 👑\n\n` +
    `💎 *Tokenomics & Ecosystem Architecture:*\n` +
    `• Token Symbol: *REX*\n` +
    `• Network: *TON Blockchain (Mainnet)*\n` +
    `• Smart Contract: \`${REX_MASTER_CONTRACT}\`\n` +
    `• Total Fixed Supply: *1,000,000 REX* (100% Mint Revoked)\n` +
    `• Official DEX Pair: *REX / GRAM on STON.fi DEX*\n` +
    `• Liquidity Pool: \`EQAng_73H-c1xVZrBK5RYhENU4gkQaGTG7tWIYCVa5VD9b4h\`\n\n` +
    `🛡️ *Sovereign Protocol & Withdrawal Rules:*\n` +
    `1. Anti-Sybil Gate: One-time *0.1 TON* access fee.\n` +
    `2. 10% Daily HODL Mining: Earn 10% daily yield of your held REX tokens.\n` +
    `3. Withdrawal Hold Rule: Hold *5,000 REX* on-chain for *3 consecutive days (72h)*.\n` +
    `4. Selling Resets Timer: Any sell before 72h resets the timer immediately to 0.\n` +
    `5. Anti-Dump Guard: Selling within *24h* after withdrawal triggers an instant permanent ban.\n` +
    `6. Manual Admin Approval: Guaranteed delivery within *24 hours*.\n\n` +
    `Tap the buttons below to open the complete Whitepaper in the Mini App 👇`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.webApp('📖 Open Whitepaper in Mini App', `${WEBAPP_URL}?modal=whitepaper`)],
        [Markup.button.url('📊 Live DexScreener Chart', 'https://dexscreener.com/ton/eqang_73h-c1xvzrbk5ryhenu4gkqagtg7twiycva5vd9b4h')],
        [Markup.button.url('🦄 Trade REX on STON.fi DEX', 'https://app.ston.fi/swap?chartVisible=true&ft=EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c&tt=EQBSYVo_WE0fAlAWUSec1o42x1LiYKNFOCoaxb8Dz_vsU_53')]
      ])
    }
  );
});

// Endpoint to fetch Holding Tiers specification
app.get('/api/holding-tiers', (req, res) => {
  res.json({
    tiers: HOLDING_TIERS,
    base_daily_reward: parseFloat(db.getSetting('base_daily_reward', '100'))
  });
});

// Bot Command: Sovereign 10% Daily HODL Mining & Yield Calculator
bot.command(['tiers', 'levels', 'boost', 'holding', 'yield'], (ctx) => {
  let msg = `💎 *10% Daily HODL Mining Protocol (ROYAL ELITE X)* ⚡\n\n` +
    `💡 *Linear Sovereign Yield: Earn 10% daily yield of your verified on-chain REX token holdings!*\n\n` +
    `• *Holding 1,000 REX* → *+100 REX / day* (+3,000 REX / mo)\n` +
    `• *Holding 5,000 REX* → *+500 REX / day* (+15,000 REX / mo)\n` +
    `• *Holding 10,000 REX* → *+1,000 REX / day* (+30,000 REX / mo)\n` +
    `• *Holding 50,000 REX* → *+5,000 REX / day* (+150,000 REX / mo)\n\n` +
    `🛡️ *Withdrawal Requirements:*\n` +
    `1. Hold 5,000+ REX for 3 consecutive days (72h) before requesting withdrawal.\n` +
    `2. Anti-Dump Rule: Zero sales within 24h after receiving a withdrawal.\n\n` +
    `🔗 *Smart Contract (Jetton Master):*\n\`${REX_MASTER_CONTRACT}\`\n\n` +
    `Tap below to calculate your yield or buy REX on STON.fi DEX 🚀`;

  ctx.reply(msg, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.webApp('💎 Open Yield Calculator in Mini App', `${WEBAPP_URL}?modal=tiers`)],
      [Markup.button.url('🛒 Buy REX on STON.fi DEX', 'https://app.ston.fi/swap?chartVisible=true&ft=EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c&tt=EQBSYVo_WE0fAlAWUSec1o42x1LiYKNFOCoaxb8Dz_vsU_53')],
      [Markup.button.url('📊 Live DexScreener Chart', 'https://dexscreener.com/ton/eqang_73h-c1xvzrbk5ryhenu4gkqagtg7twiycva5vd9b4h')]
    ])
  });
});



// Bot Command: Activate Account via Fee-Waiver Code
bot.command(['activate', 'vip', 'pass', 'free'], async (ctx) => {
  if (isMaintenanceActive() && ctx.from.id !== ADMIN_TG_ID) {
    return ctx.reply('🛠 *System Under Maintenance*\n\nPlease check back shortly! 👑', { parse_mode: 'Markdown' });
  }

  const tid = ctx.from.id;
  const parts = ctx.message.text.trim().split(/\s+/);

  if (parts.length < 2) {
    return ctx.reply(
      '🔑 *Activate Account — Fee Waiver Code*\n\n' +
      'Please enter your activation code next to the command:\n' +
      '`/activate <CODE>`\n\n' +
      '📌 *Example:* `/activate VIP-FREE-2026`\n\n' +
      '💡 This code unlocks your account and waives the 0.1 TON verification fee!',
      { parse_mode: 'Markdown' }
    );
  }

  const code = parts[1].trim();
  const user = db.getUser(tid);
  if (user && user.is_activated === 1) {
    return ctx.reply('✅ *Your account is already verified & activated!* 👑\n\nYou do not need an activation code.', { parse_mode: 'Markdown' });
  }

  try {
    const actRes = db.redeemActivationCode(tid, code);
    await checkAndAwardReferralOffer(tid, ctx.from.first_name);
    return ctx.reply(
      `👑 *Royal Activation Successful, ${ctx.from.first_name || 'Knight'}!* 🎉\n\n` +
      `• Code: \`${actRes.code}\`\n` +
      `• Status: *0.1 TON Verification Fee Waived* ✅\n` +
      (actRes.bonus_rex > 0 ? `• Bonus: *+${actRes.bonus_rex.toLocaleString()} REX*\n` : '') +
      `\nYour royal gate fee requirement is fulfilled! Make sure to connect your wallet and join @REXCEO1A to access the platform! 🚀`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.webApp('👑 Launch ROYAL ELITE X', WEBAPP_URL)]
        ])
      }
    );
  } catch (err) {
    let msg = '⚠️ Failed to redeem activation code.';
    if (err.message === 'CODE_NOT_FOUND') msg = '❌ *Invalid or Non-Existent Activation Code.*\nPlease check the code and try again.';
    else if (err.message === 'CODE_EXPIRED') msg = '⏳ *Expired Code.*\nThis activation code has expired.';
    else if (err.message === 'CODE_EXHAUSTED') msg = '🚫 *Claim Limit Reached.*\nThis activation code has reached its maximum user limit.';
    else if (err.message === 'ALREADY_REDEEMED') msg = '⚠️ *Already Claimed!*\nYou have already used this activation code.';
    else if (err.message === 'CODE_INACTIVE') msg = '🔒 *This activation code is currently disabled by administration.*';
    else if (err.message === 'ALREADY_ACTIVATED') msg = '✅ *Your account is already activated!*';

    return ctx.reply(msg, { parse_mode: 'Markdown' });
  }
});

// Bot Command: Redeem Promo / Gift Code
bot.command(['redeem', 'code', 'promo', 'gift'], async (ctx) => {
  if (isMaintenanceActive() && ctx.from.id !== ADMIN_TG_ID) {
    return ctx.reply('🛠 *System Under Maintenance*\n\nPlease check back shortly! 👑', { parse_mode: 'Markdown' });
  }

  const tid = ctx.from.id;
  const parts = ctx.message.text.trim().split(/\s+/);

  if (parts.length < 2) {
    return ctx.reply(
      '🎁 *Redeem Royal Promo Code*\n\n' +
      'Please enter your promo code next to the command:\n' +
      '`/redeem <CODE>`\n\n' +
      '📌 *Example:* `/redeem REX100`',
      { parse_mode: 'Markdown' }
    );
  }

  const promoCode = parts[1].trim();

  try {
    const redeemRes = db.redeemPromoCode(tid, promoCode);
    const firstName = ctx.from.first_name || 'Knight';

    const msg =
      '👑 *Royal Congratulations, ' + firstName + '! Promo Code Redeemed Successfully* 🎉\n\n' +
      '🎁 *Redeemed Code:* `' + redeemRes.code + '`\n' +
      '💰 *Reward Credited:* *+' + Number(redeemRes.reward_rex).toLocaleString() + ' REX*\n' +
      (redeemRes.reward_xp > 0 ? '⚡ *Experience Points:* *+' + redeemRes.reward_xp + ' XP*\n' : '') +
      '💳 *Total Balance Now:* *' + Number(redeemRes.new_balance).toLocaleString() + ' REX*\n\n' +
      'Tokens have been deposited into your royal account immediately! 🚀';

    return ctx.reply(msg, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.webApp('👑 Open Platform & Check Balance', WEBAPP_URL)]
      ])
    });
  } catch (err) {
    let errorMsg = '⚠️ An error occurred while redeeming this promo code.';
    if (err.message === 'CODE_NOT_FOUND') {
      errorMsg = '❌ *Invalid or Non-Existent Code.*\nPlease check the code and try again.';
    } else if (err.message === 'CODE_EXPIRED') {
      errorMsg = '⏳ *Expired Code.*\nThis promo code has expired and is no longer available.';
    } else if (err.message === 'CODE_EXHAUSTED') {
      errorMsg = '🚫 *Claim Limit Reached.*\nThis promo code has reached its maximum user limit.';
    } else if (err.message === 'ALREADY_REDEEMED') {
      errorMsg = '⚠️ *Already Claimed!*\nYou have already redeemed this promo code. Each user can redeem once.';
    } else if (err.message === 'CODE_INACTIVE') {
      errorMsg = '🔒 *This promo code has been temporarily disabled by administration.*';
    } else if (err.message === 'USER_BANNED') {
      errorMsg = '⛔ *Your account is restricted from claiming rewards.*';
    }

    return ctx.reply(errorMsg, { parse_mode: 'Markdown' });
  }
});

// Bot Command: Daily Check-In
bot.command(['checkin', 'daily'], async (ctx) => {
  if (isMaintenanceActive() && ctx.from.id !== ADMIN_TG_ID) {
    return ctx.reply('🛠 *System Under Maintenance*\n\nPlease check back shortly! 👑', { parse_mode: 'Markdown' });
  }

  const tid = ctx.from.id;
  const status = db.getDailyCheckinStatus(tid);

  if (status.can_claim) {
    try {
      const claimRes = db.claimDailyCheckin(tid);
      const streakIcons = ['🪙', '💰', '💎', '⚡', '🔥', '🏆', '👑'];
      const icon = streakIcons[claimRes.day - 1] || '🎁';
      return ctx.reply(
        '🎉 *Daily Check-in Claimed Successfully!* 👑\n\n' +
        '• Claimed Day: *Day ' + claimRes.day + '* ' + icon + '\n' +
        '• Reward: *+' + claimRes.reward + ' REX*\n' +
        '• Experience Points: *+' + claimRes.xp + ' XP*\n' +
        '• Streak: *' + claimRes.new_streak + ' consecutive days* 🔥\n' +
        '• Total Balance Now: *' + Number(claimRes.new_balance).toLocaleString() + ' REX*\n\n' +
        'Check in tomorrow for even greater rewards! 🚀',
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([[Markup.button.webApp('📅 Open Quests Calendar in App', WEBAPP_URL + '?tab=quests')]])
        }
      );
    } catch (e) {
      // fallback
    }
  }

  const waitH = Math.floor(status.cooldown_remaining / 3600000);
  const waitM = Math.ceil((status.cooldown_remaining % 3600000) / 60000);
  ctx.reply(
    '📅 *Royal Daily Check-in Status* 👑\n\n' +
    '• Current Streak: *' + status.current_streak + ' days* 🔥\n' +
    '• Next Reward: *Day ' + status.next_day + '* (+' + status.today_reward + ' REX)\n' +
    '• Today\'s Status: *Claimed Successfully* ✅\n' +
    '• Next Reset: *In ' + waitH + 'h ' + waitM + 'm* ⏳\n\n' +
    'Check in daily to unlock the Day 7 grand reward (1,000 REX)! 🎁',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.webApp('📅 Open Quests Calendar in App', WEBAPP_URL + '?tab=quests')]])
    }
  );
});

// Bot Command: Top 10 Currency Holders Leaderboard
bot.command(['top', 'leaderboard', 'holders', 'top10', 'whales'], (ctx) => {
  if (isMaintenanceActive() && ctx.from.id !== ADMIN_TG_ID) {
    return ctx.reply(`🛠 *System Under Maintenance*\n\nPlease check back shortly! 👑`, { parse_mode: 'Markdown' });
  }

  const topHolders = db.getTopHolders(ADMIN_TG_ID, 10);
  const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

  let msg = `🏆 *Top 10 REX Token Holders Leaderboard* 👑\n` +
    `*(Top 10 Sovereign REX Holders)*\n\n` +
    `📊 *Largest Verified Holders Across The Ecosystem:*\n\n`;

  topHolders.forEach((u, i) => {
    const medal = medals[i] || `#${i+1}`;
    const name = u.first_name || 'Royal Knight';
    const tag = u.username ? ` (${u.username})` : '';
    const badge = u.tier_badge || '💠';
    msg += `${medal} *${name}*${tag}\n` +
           `   └ 💰 *${Number(u.balance).toLocaleString()} REX* • ${badge} ${u.tier_title}\n\n`;
  });

  msg += `🛡️ _Note: Admin wallets and liquidity pool reserves are excluded to guarantee full transparency._\n\n` +
         `🚀 *Increase your holdings to climb the Royal Leaderboard!*\n`;

  ctx.reply(msg, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.webApp('🏆 View Full Leaderboard in App', `${WEBAPP_URL}?tab=friends`)],
      [Markup.button.url('🛒 Buy REX on STON.fi DEX', 'https://app.ston.fi/swap?chartVisible=true&ft=EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c&tt=EQBSYVo_WE0fAlAWUSec1o42x1LiYKNFOCoaxb8Dz_vsU_53')],
      [Markup.button.url('📊 DexScreener Live Chart', 'https://dexscreener.com/ton/eqang_73h-c1xvzrbk5ryhenu4gkqagtg7twiycva5vd9b4h')]
    ])
  });
});

// Admin command to add balance via Telegram directly: /addbalance <id> <amount> or /give <id> <amount>
bot.command(['addbalance', 'give'], (ctx) => {
  if (ctx.from.id !== ADMIN_TG_ID) return;
  const parts = ctx.message.text.trim().split(/\s+/);
  if (parts.length < 3) {
    return ctx.reply('⚠️ Invalid format. Use:\n/addbalance <telegram_id> <amount>\nExample: `/addbalance 7082457308 1000`', { parse_mode: 'Markdown' });
  }
  const targetId = parseInt(parts[1], 10);
  const amount = parseFloat(parts[2]);
  if (isNaN(targetId) || isNaN(amount)) {
    return ctx.reply('⚠️ Invalid ID or amount');
  }

  try {
    const r = db.addBalance(targetId, amount, ADMIN_TG_ID, 'Telegram Admin Command');
    db.logAdminAction('ADD_BALANCE_TG', `Credited ${amount} REX to user ${targetId} via Telegram command`, ADMIN_TG_ID);
    
    // Notify user in English
    bot.telegram.sendMessage(
      targetId,
      `🎁 *Royal Balance Credited!*\n\n` +
      `Your account has been credited with *+${amount.toLocaleString()} REX* by Royal Administration 👑\n` +
      `Current Available Balance: *${Number(r.balance).toFixed(2)} REX*`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});

    ctx.reply(`✅ *Balance added successfully!*\n\n• User ID: \`${targetId}\`\n• Added: *+${amount.toLocaleString()} REX*\n• New Balance: *${Number(r.balance).toFixed(2)} REX*`, { parse_mode: 'Markdown' });
  } catch(e) {
    ctx.reply(`❌ Operation failed: ${e.message}`);
  }
});

// Admin command to set balance via Telegram directly: /setbalance <id> <amount>
bot.command('setbalance', (ctx) => {
  if (ctx.from.id !== ADMIN_TG_ID) return;
  const parts = ctx.message.text.trim().split(/\s+/);
  if (parts.length < 3) {
    return ctx.reply('⚠️ Invalid format. Use:\n/setbalance <telegram_id> <new_balance>\nExample: `/setbalance 7082457308 5000`', { parse_mode: 'Markdown' });
  }
  const targetId = parseInt(parts[1], 10);
  const amount = parseFloat(parts[2]);
  if (isNaN(targetId) || isNaN(amount) || amount < 0) {
    return ctx.reply('⚠️ Invalid ID or amount');
  }

  try {
    const r = db.setBalance(targetId, amount, ADMIN_TG_ID, 'Telegram Admin Command');
    db.logAdminAction('SET_BALANCE_TG', `Set user ${targetId} balance to ${amount} REX via Telegram command`, ADMIN_TG_ID);
    ctx.reply(`✅ *Balance set successfully!*\n\n• User ID: \`${targetId}\`\n• New Balance: *${Number(r.balance).toFixed(2)} REX*`, { parse_mode: 'Markdown' });
  } catch(e) {
    ctx.reply(`❌ Operation failed: ${e.message}`);
  }
});

bot.command('admin', (ctx) => {
  if (ctx.from.id === ADMIN_TG_ID) {
    const directUrl = `${WEBAPP_URL}/admin/?secret=${ADMIN_SECRET}`;
    ctx.reply(
      `👑 *Welcome Commander to ROYAL ELITE X Admin Console!* 🏛️\n\n` +
      `🔗 *Direct Access Link (Auto-Authenticated):*\n${directUrl}\n\n` +
      `🔑 *Admin Secret (Backup):*\n\`${ADMIN_SECRET}\``,
      { parse_mode: 'Markdown' }
    );
  }
});

// Admin command: Set mandatory channel username: /setchannel @Channel
bot.command('setchannel', (ctx) => {
  if (ctx.from.id !== ADMIN_TG_ID) return;
  const parts = ctx.message.text.trim().split(/\s+/);
  if (parts.length < 2) {
    const current = getRequiredChannel();
    const enabled = db.getSetting('force_sub_enabled', '1') === '1' ? 'Active ✅' : 'Disabled ❌';
    return ctx.reply(
      `📢 *Mandatory Channel Settings:*\n\n` +
      `• Current Channel: \`${current || 'None'}\`\n` +
      `• Force-Subscription Gate: *${enabled}*\n\n` +
      `To update channel username, send:\n\`/setchannel @YourChannel\`\n\n` +
      `To toggle requirement on/off, send:\n\`/togglesub\`\n\n` +
      `⚠️ *IMPORTANT:* Please add @Royalelitexbot as an *Administrator* in your channel so it can verify subscribers!`,
      { parse_mode: 'Markdown' }
    );
  }
  let newChannel = parts[1].trim();
  if (!newChannel.startsWith('@')) newChannel = '@' + newChannel;
  db.updateSetting('required_channel', newChannel);
  ctx.reply(
    `✅ *Required Channel Updated Successfully!*\n\n` +
    `• New Channel: \`${newChannel}\`\n\n` +
    `⚠️ *REMINDER:* Make sure to add @Royalelitexbot as an *Administrator* inside ${newChannel}!`,
    { parse_mode: 'Markdown' }
  );
});

// Admin command: Toggle mandatory channel gate: /togglesub
bot.command('togglesub', (ctx) => {
  if (ctx.from.id !== ADMIN_TG_ID) return;
  const current = db.getSetting('force_sub_enabled', '1');
  const next = current === '1' ? '0' : '1';
  db.updateSetting('force_sub_enabled', next);
  ctx.reply(`🛡️ *Mandatory Channel Subscription Gate is now: ${next === '1' ? 'ENABLED ✅' : 'DISABLED ❌'}*`);
});

// Proactive channel departure event listener
bot.on('chat_member', async (ctx) => {
  try {
    const chat = ctx.chat;
    const required = getRequiredChannel().replace(/^@/, '').toLowerCase();
    const chatUser = (chat.username || '').toLowerCase();

    if (chatUser === required) {
      const update = ctx.chatMember;
      const newStatus = update.new_chat_member.status;
      const oldStatus = update.old_chat_member.status;
      const userId = update.new_chat_member.user.id;

      // If user left or was kicked from the channel
      if (['left', 'kicked'].includes(newStatus) && !['left', 'kicked'].includes(oldStatus)) {
        bot.telegram.sendMessage(
          userId,
          `🔒 *Platform Access Paused*\n\n` +
          `You have left our official channel *@REXCEO1A*!\n` +
          `Your mining and platform access have been temporarily locked.\n\n` +
          `Rejoin the channel anytime below to immediately restore full access! 👇`,
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [Markup.button.url('📢 Rejoin @REXCEO1A', `https://t.me/${required}`)],
              [Markup.button.callback('🔄 Restore Access', 'verify_sub_none')]
            ])
          }
        ).catch(() => {});
      }
    }
  } catch (err) {
    console.error('[CHAT_MEMBER EVENT ERROR]:', err.message);
  }
});

// Start Server & Bot
app.listen(PORT, () => {
  console.log(`🚀 ROYAL ELITE X Enterprise Server running on port ${PORT}`);
});

// ── Render Free-Tier Anti-Sleep Keep-Alive Engine ──
// Render hibernates free web services after 15m idle. This self-pings every 9m to maintain persistent active state.
if (WEBAPP_URL && !WEBAPP_URL.includes('localhost')) {
  setInterval(() => {
    try {
      const pingUrl = `${WEBAPP_URL}/api/public/tokenomics`;
      fetch(pingUrl, { headers: { 'User-Agent': 'REX-KeepAlive/1.0' } })
        .then(res => {
          if (!res.ok) console.log(`[KeepAlive] Ping status: ${res.status}`);
        })
        .catch(err => console.log(`[KeepAlive] Ping error: ${err.message}`));
    } catch (e) {}
  }, 9 * 60 * 1000);
}

// ── Background Watchdog: Anti-Dump Sentinel (scans every 60s) ──
setInterval(async () => {
  try {
    const isHolding = db.getSetting('enable_holding_rule', '0') === '1';
    const isAntiDump = db.getSetting('enable_anti_dump', '0') === '1';
    if (!isHolding || !isAntiDump) return;

    const monitoredUsers = db.getUsersUnderWithdrawalMonitoring();
    if (!monitoredUsers || monitoredUsers.length === 0) return;

    for (const u of monitoredUsers) {
      if (parseInt(u.telegram_id) === ADMIN_TG_ID || u.is_hold_exempt || u.is_sybil_exempt) {
        db.clearPostWdMonitoring(u.telegram_id);
        continue;
      }
      try {
        security.OnChainBalanceCache.invalidate(u.wallet_address);
        const liveBal = await getOnChainRexBalance(u.wallet_address);
        if (liveBal !== null) {
          await checkAntiDumpViolation(u, liveBal);
        }
      } catch (err) {
        console.error(`[ANTI-DUMP SCAN] Error checking ${u.telegram_id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[ANTI-DUMP SENTINEL] Error in monitoring cycle:', err.message);
  }
}, 60000);

async function startBotWithRetry(retries = 15) {
  for (let i = 0; i < retries; i++) {
    try {
      await bot.launch({
        allowedUpdates: ['message', 'callback_query', 'chat_member']
      });
      console.log('🤖 Telegram Bot @Royalelitexbot is LIVE with Enterprise Security v4.0!');
      try {
        await bot.telegram.setChatMenuButton({
          menu_button: {
            type: 'web_app',
            text: '👑 Royal App',
            web_app: { url: WEBAPP_URL }
          }
        });
      } catch (e) {}
      return;
    } catch (err) {
      console.error(`Bot launch attempt ${i + 1}/${retries} failed (${err.message}). Retrying in 4s...`);
      await new Promise(r => setTimeout(r, 4000));
    }
  }
}
process.on('uncaughtException', (err) => {
  console.error('[CRITICAL] Uncaught Exception caught by enterprise handler:', err.message);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRITICAL] Unhandled Rejection caught by enterprise handler:', reason);
});

startBotWithRetry();
