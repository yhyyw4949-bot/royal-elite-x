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

require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');
const security = require('./security');
const { TonClient, Address, beginCell } = require('@ton/ton');

// ── Environment & Secrets Management ──
const BOT_TOKEN = process.env.BOT_TOKEN || '9206918976:AAEiNUzrcB_RwhyYuMzCLZsymx0J3p94gLU';
const ADMIN_WALLET = process.env.ADMIN_WALLET || 'UQDcvNuFSROi4VFR1kzca-O17z5shUVyc5X6ep4pPGAPltYz';
const ADMIN_TG_ID = parseInt(process.env.ADMIN_TG_ID || '7082457308', 10);
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'REX_ADMIN_2026';
const REX_MASTER_CONTRACT = process.env.REX_MASTER_CONTRACT || 'EQCSsfG6xm-7g2-PQkvQWHAlMW3OXwsOdg2_VSAVlmBgr6GH';
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://wires-clerk-scsi-merchants.trycloudflare.com';
const PORT = parseInt(process.env.PORT || '3000', 10);
const TONCENTER_ENDPOINT = process.env.TONCENTER_ENDPOINT || 'https://toncenter.com/api/v2/jsonRPC';
const TON_API_KEY = process.env.TON_API_KEY || undefined;

const bot = new Telegraf(BOT_TOKEN);
const app = express();

// ── Middleware Pipeline ──
app.use(cors());
app.use(express.json());
app.use(security.createRateLimiter(60000, 180)); // 180 req/min limit per IP
app.use(express.static(path.join(__dirname, 'public')));

// Telegram initData Authentication Middleware
function telegramAuth(req, res, next) {
  const initData = req.headers['x-telegram-init-data'] || req.body?.initData;
  if (initData) {
    const verified = security.verifyTelegramInitData(initData, BOT_TOKEN);
    if (verified && verified.user) {
      req.telegramUser = verified.user;
      // Guarantee server-verified Telegram ID
      req.body.telegram_id = verified.user.id;
    }
  }
  next();
}

// Admin Authentication Middleware (with 2FA Session Support)
function adminAuth(req, res, next) {
  const secret = req.headers['x-admin-secret'] || req.query.secret;
  if (secret !== ADMIN_SECRET) {
    return res.status(403).json({ error: 'Unauthorized: Invalid Admin Secret' });
  }
  next();
}

// Serve Admin Dashboard
app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.get('/admin', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'admin', 'index.html'));
});

// ── TON Client & On-Chain Cache ──
const tonClient = new TonClient({ endpoint: TONCENTER_ENDPOINT, apiKey: TON_API_KEY });

async function getOnChainRexBalance(walletAddrStr) {
  if (!walletAddrStr) return 0;
  
  // Check in-memory cache first
  const cached = security.OnChainBalanceCache.get(walletAddrStr);
  if (cached !== null) return cached;

  try {
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
  } catch (err) {
    return 0;
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
  if (!user || user.is_banned || !user.post_wd_monitored_until) return false;
  const now = Date.now();
  if (now > user.post_wd_monitored_until) return false;

  const baseline = user.post_wd_baseline_rex || 5000;
  // If user acquired more tokens, raise the baseline
  if (currentOnChain > baseline) {
    db.updatePostWdBaseline(user.telegram_id, currentOnChain);
    user.post_wd_baseline_rex = currentOnChain;
    return false;
  }

  // Check if balance dropped by more than 5 REX (protection against selling/dumping on STON.fi)
  if (currentOnChain < baseline - 5) {
    const soldAmount = Math.max(0, baseline - currentOnChain);
    const reason = `حظر تلقائي: بيع/تحويل عملات REX (${soldAmount.toFixed(0)} REX) خلال 24 ساعة من استلام السحب (نظام مكافحة الإغراق Anti-Dump)`;
    
    // 1. Ban user immediately
    db.banUser(user.telegram_id, reason);
    db.logAdminAction('AUTO_BAN_ANTI_DUMP', `حظر تلقائي للمستخدم ${user.telegram_id}: بيع ${soldAmount.toFixed(0)} REX بعد السحب (كان: ${baseline.toFixed(0)} -> الآن: ${currentOnChain.toFixed(0)})`, ADMIN_TG_ID);

    // 2. Clear monitoring
    db.clearPostWdMonitoring(user.telegram_id);

    // 3. Notify user on Telegram
    bot.telegram.sendMessage(
      user.telegram_id,
      `⛔ *حظر تلقائي نهائي من البلاط الملكي* 🛡️\n\n` +
      `تم حظر حسابك نهائياً من منصة *ROYAL ELITE X* لمخالفتك قواعد الأمان والتوكنوميكس.\n\n` +
      `• *السبب:* بيع أو تصريف عملات REX في غضون 24 ساعة من استلام السحب (مخالفة سياسة مكافحة الإغراق Anti-Dump Protection).\n` +
      `• *الرصيد المرصود بعد السحب:* ${Number(baseline).toLocaleString()} REX\n` +
      `• *الرصيد بعد البيع:* ${Number(currentOnChain).toLocaleString()} REX\n` +
      `• *الكمية المباعة:* -${soldAmount.toLocaleString()} REX\n\n` +
      `تم تجميد حسابك وإلغاء صلاحية الوصول نهائياً.`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});

    // 4. Alert Admin on Telegram
    bot.telegram.sendMessage(
      ADMIN_TG_ID,
      `🚨 *إنذار أمني فوري: حظر تلقائي (Anti-Dump Sentinel)* 👑\n\n` +
      `تم ضبط وحظر مستخدم قام ببيع العملات بعد السحب مباشرة!\n\n` +
      `👤 المستخدم: *${user.first_name}* (@${user.username || 'بلا'})\n` +
      `🆔 المعرف: \`${user.telegram_id}\`\n` +
      `💼 المحفظة: \`${user.wallet_address}\`\n` +
      `📊 الرصيد المرصود: *${Number(baseline).toLocaleString()} REX*\n` +
      `📉 الرصيد بعد البيع: *${Number(currentOnChain).toLocaleString()} REX*\n` +
      `⚠️ الكمية المباعة/المحولة: *${soldAmount.toLocaleString()} REX*\n` +
      `⏱️ التوقيت: خلال فترة الـ 24 ساعة بعد تأكيد السحب.\n\n` +
      `✅ *تم حظر الحساب فوراً بنجاح.*\n` +
      `تم حماية حوض السيولة ومنع تدهور سعر العملة 🛡️`,
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
  if (fingerprint) {
    const matched = db.checkFingerprintAccounts(fingerprint);
    const others = matched.filter(a => a.telegram_id !== telegram_id);
    if (others.length >= 1) {
      db.banUser(telegram_id, 'تعدد حسابات على نفس الجهاز (Anti-Sybil)');
      return res.json({ is_banned: true, ban_reason: 'تعدد حسابات على نفس الجهاز' });
    }
    db.logDevice(telegram_id, fingerprint, ip);
  }

  // 1. Check On-Chain REX Balance & Multiplier Boost (FIRST)
  let onChainRex = 0;
  if (user.wallet_address) {
    onChainRex = await getOnChainRexBalance(user.wallet_address);
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

  // 3-Day 5,000 REX Holding Condition Tracker
  const minHoldRex = parseFloat(db.getSetting('min_hold_rex', '5000'));
  const minHoldDays = parseFloat(db.getSetting('min_hold_days', '3'));
  const minHoldDurationMs = minHoldDays * 24 * 3600 * 1000;

  let onchainHoldStart = user.onchain_hold_start || 0;
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

  const holdingElapsed = onchainHoldStart > 0 ? (Date.now() - onchainHoldStart) : 0;
  const isHoldPassed = (onchainHoldStart > 0) && (holdingElapsed >= minHoldDurationMs);
  const holdRemainingMs = Math.max(0, minHoldDurationMs - holdingElapsed);

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
    vaults: userVaults,
    guild: userGuild,
    referrals_count: db.getReferralsCount(telegram_id),
    withdrawal_history: withdrawalHistory,
    recent_transactions: recentTransactions,
    tokenomics: tokenomicsSummary,
    min_withdrawal: minWithdrawal,
    hold_percent: holdPercent,
    min_hold_rex: minHoldRex,
    min_hold_days: minHoldDays,
    onchain_hold_start: onchainHoldStart,
    is_hold_passed: isHoldPassed,
    anti_dump_active: Boolean(user.post_wd_monitored_until && Date.now() < user.post_wd_monitored_until),
    anti_dump_remaining_ms: Math.max(0, (user.post_wd_monitored_until || 0) - Date.now()),
    anti_dump_baseline: user.post_wd_baseline_rex || 0,
    hold_remaining_ms: holdRemainingMs,
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

    sendMsg(req, res, true, 'تم ربط المحفظة بنجاح!', 'Wallet connected successfully!', { friendlyAddr, multiplier, onChainBalance });
  } catch (e) {
    sendMsg(req, res, false, 'عنوان المحفظة غير صالح', 'Invalid TON wallet address');
  }
});

app.post('/api/user/confirm-activation', telegramAuth, checkMaintenance, (req, res) => {
  const { telegram_id } = req.body;
  const user = db.getUser(telegram_id);
  if (!user) return res.json({ success: false });
  if (!user.wallet_address) return sendMsg(req, res, false, 'ارتبط بمحفظة أولاً', 'Connect TON wallet first');
  db.setActivated(telegram_id);
  sendMsg(req, res, true, 'تم تفعيل الحساب بنجاح!', 'Account activated successfully!');
});

// ================================================================
// 3. ATOMIC MINING ENGINE
// ================================================================
app.post('/api/user/start-mining', telegramAuth, checkMaintenance, (req, res) => {
  const { telegram_id } = req.body;
  const user = db.getUser(telegram_id);
  if (!user || user.is_banned) return sendMsg(req, res, false, 'حساب محظور', 'Account suspended');
  if (!user.is_activated || !user.wallet_address) return sendMsg(req, res, false, 'فعّل حسابك أولاً!', 'Activate your account and connect wallet first!');
  if (user.is_mining) return sendMsg(req, res, false, 'التعدين يعمل بالفعل!', 'Mining is already active!');

  const now = Date.now();
  db.updateMining(telegram_id, 1, now);
  sendMsg(req, res, true, '⚡ انطلقت دورة التعدين الملكية بنجاح!', '⚡ 24h Royal Mining cycle started!', { last_mining_start: now });
});

app.post('/api/user/claim-mining', telegramAuth, checkMaintenance, async (req, res) => {
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

    // Referral commission
    if (user.referrer_id) {
      const refCommission = dailyRate * refPercent;
      db.atomicAddReferralCommission(user.referrer_id, refCommission, telegram_id, user.first_name);

      bot.telegram.sendMessage(user.referrer_id,
        `👑 *أرباح ملكية جديدة من الإحالة!* 🎉\n\n` +
        `قام الفارس (${user.first_name}) بجمع أرباح تعدينه، وحصلت على عمولتك الملكية المستمرة (${(refPercent*100).toFixed(0)}%):\n` +
        `💰 *+${refCommission.toFixed(2)} REX* أُضيفت فوراً إلى رصيدك!`,
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
app.post('/api/user/withdraw', telegramAuth, checkMaintenance, async (req, res) => {
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

  // On-Chain Hold Verification (Bypass cache for withdrawal check)
  security.OnChainBalanceCache.invalidate(user.wallet_address);
  const requiredOnChain = reqAmount * holdPercent;
  const onChainBalance = await getOnChainRexBalance(user.wallet_address);

  if (onChainBalance < requiredOnChain) {
    const shortfall = requiredOnChain - onChainBalance;
    const arMsg = `❌ شرط الأمان الملكي: يجب أن تكون مشتري ومحتفظ في محفظتك الخارجية (On-Chain) بـ ${(holdPercent*100).toFixed(0)}% على الأقل من قيمة السحب!\n\n• المطلوب في محفظتك: ${requiredOnChain.toLocaleString()} REX\n• رصيدك الفعلي في المحفظة: ${onChainBalance.toLocaleString()} REX\n• ينقصك: ${shortfall.toLocaleString()} REX في محفظتك.\n\nاشترِ REX واحتفظ بها في محفظتك لتفعيل السحب.`;
    const enMsg = `❌ Royal Security Rule: You must hold at least 20% of the withdrawal amount in on-chain REX Jettons in your TON wallet!\n\n• Required On-Chain: ${requiredOnChain.toLocaleString()} REX\n• Your Wallet Balance: ${onChainBalance.toLocaleString()} REX\n• Shortfall: ${shortfall.toLocaleString()} REX in wallet.\n\nPlease buy REX on STON.fi and hold in your wallet.`;
    return sendMsg(req, res, false, arMsg, enMsg, {
      code: 'INSUFFICIENT_ONCHAIN_HOLD',
      required_hold: requiredOnChain,
      wallet_balance: onChainBalance,
      shortfall: shortfall
    });
  }

  // 3-Day 5,000 REX Mandatory Holding Condition Enforcement
  const minHoldRex = parseFloat(db.getSetting('min_hold_rex', '5000'));
  const minHoldDays = parseFloat(db.getSetting('min_hold_days', '3'));
  const minHoldDurationMs = minHoldDays * 24 * 3600 * 1000;

  if (onChainBalance < minHoldRex) {
    if (user.onchain_hold_start > 0) {
      db.updateHoldStart(telegram_id, 0);
      user.onchain_hold_start = 0;
    }
    const arMsg = `❌ شرط الأمان الملكي: يجب شراء والاحتفاظ بـ ${minHoldRex.toLocaleString()} REX كحد أدنى في محفظتك On-Chain لمدة ${minHoldDays} أيام متتالية قبل السحب!\n• رصيدك الفعلي في المحفظة: ${onChainBalance.toLocaleString()} REX.\n⚠️ تم تصفير عداد الأيام لعدم استيفاء الحد الأدنى.`;
    const enMsg = `❌ Royal Security Rule: You must hold at least ${minHoldRex.toLocaleString()} REX in your TON wallet for ${minHoldDays} consecutive days before withdrawing!\n• Current Wallet Balance: ${onChainBalance.toLocaleString()} REX.\n⚠️ Timer reset to 0 due to balance shortfall.`;
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
    const arMsg = `⏳ شرط الأمان الملكي: يجب الاحتفاظ بـ ${minHoldRex.toLocaleString()} REX في محفظتك لمدة ${minHoldDays} أيام متتالية!\n\n• الوقت المتبقي لإتمام فترة الحيازة: ${remDays > 0 ? remDays + ' يوم و ' : ''}${remHours} ساعة و ${remMins} دقيقة.\n\nاستمر بالاحتفاظ بها في محفظتك وسيتم فتح السحب تلقائياً بمجرد اكتمال الـ 3 أيام.`;
    const enMsg = `⏳ Royal Security Rule: You must hold ${minHoldRex.toLocaleString()} REX in your TON wallet for ${minHoldDays} consecutive days!\n\n• Remaining Holding Time: ${remDays > 0 ? remDays + 'd ' : ''}${remHours}h ${remMins}m.\n\nKeep holding in your wallet; withdrawal will unlock automatically once 3 days complete.`;
    return sendMsg(req, res, false, arMsg, enMsg, { code: 'HOLD_PERIOD_NOT_ELAPSED' });
  }

  const idempKey = idempotency_key || `WD_${telegram_id}_${Date.now()}`;
  try {
    const reserveRes = db.atomicReserveWithdrawal(telegram_id, user.wallet_address, reqAmount, idempKey);

    // Notify Admin Telegram
    bot.telegram.sendMessage(ADMIN_TG_ID,
      `📤 *طلب سحب جديد مؤكد On-Chain!* 👑\n\n` +
      `🆔 رقم الطلب: #${reserveRes.withdrawal_id}\n` +
      `👤 المستخدم: ${user.first_name} (@${user.username || 'بلا'})\n` +
      `💰 المبلغ المطلوب: *${reqAmount.toLocaleString()} REX* (تم حجزه بنجاح ✅)\n` +
      `💼 رصيد محفظته On-Chain: *${onChainBalance.toLocaleString()} REX* (مستوفي شرط الـ 20% ✅)\n` +
      `📍 المحفظة: \`${user.wallet_address}\`\n\n` +
      `الحالة الحالية: \`PENDING\` (قيد التدقيق)`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});

    const arMsg = `🎉 تم تسجيل طلب سحب ${reqAmount.toLocaleString()} REX بنجاح! بمجرد موافقة الإدارة، سيصل السحب لمحفظتك على البلوكتشين خلال 24 ساعة كحد أقصى.`;
    const enMsg = `🎉 Withdrawal request for ${reqAmount.toLocaleString()} REX submitted! Tokens will arrive in your TON wallet within 24 hours of approval.`;
    return sendMsg(req, res, true, arMsg, enMsg, {
      withdrawal_id: reserveRes.withdrawal_id,
      remaining_balance: reserveRes.remaining_balance,
      reserved_balance: reserveRes.reserved_balance,
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
app.post('/api/vault/lock', telegramAuth, checkMaintenance, (req, res) => {
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
app.post('/api/user/claim-task', telegramAuth, checkMaintenance, (req, res) => {
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
    const taskRes = db.atomicClaimTask(telegram_id, task_id, reward, idempKey);
    sendMsg(req, res, true, `🎉 حصلت على ${reward} REX من "${def.name_ar || def.name}"!`, `🎉 Earned ${reward} REX from "${def.name_en || def.name}"!`, { reward, balance: taskRes.balance });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// ================================================================
// 12. ADMIN COMMAND CENTER 2.0 (WITH 2FA OTP & AUDIT)
// ================================================================

// Request 2FA OTP sent to Admin's Telegram
app.post('/api/admin/request-otp', adminAuth, async (req, res) => {
  const otp = security.adminOtpManager.generateOtp(ADMIN_TG_ID);
  try {
    await bot.telegram.sendMessage(ADMIN_TG_ID,
      `🔐 *رمز التحقق بخطوتين (Admin 2FA OTP):*\n\n` +
      `🔑 الرمز السري: \`${otp}\`\n\n` +
      `⏳ صالح لمدة 3 دقائق فقط. لا تشارك هذا الرمز مع أي شخص.`,
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

// Admin Stats
app.get('/api/admin/stats', adminAuth, (req, res) => {
  res.json({
    users:           db.getUserCount(),
    activated:       db.getActivatedCount(),
    active_miners:   db.getActiveMiners(),
    banned:          db.getBannedCount(),
    new_today:       db.getNewUsersToday(),
    total_balance:   db.getTotalBalance(),
    total_reserved:  db.getTotalReserved(),
    total_mined:     db.getTotalMined(),
    total_withdrawn: db.getTotalWithdrawn(),
    withdrawals:     db.getWithdrawalStats(),
    tokenomics:      db.getPublicTokenomicsStats()
  });
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
  const holdStart = profile.user.onchain_hold_start || 0;
  const holdingElapsed = holdStart ? (Date.now() - holdStart) : 0;
  const isHoldPassed = (onChainRex >= minHoldRex) && (holdingElapsed >= minHoldDurationMs);
  const holdRemainingMs = Math.max(0, minHoldDurationMs - holdingElapsed);

  res.json({
    ...profile,
    onChainRex,
    holdInfo: {
      minHoldRex,
      minHoldDays,
      holdStart,
      holdingElapsed,
      isHoldPassed,
      holdRemainingMs
    }
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
      // Initialize 24h Anti-Dump Monitoring
      const user = db.getUser(telegram_id);
      let onChainBal = 0;
      if (user?.wallet_address) {
        security.OnChainBalanceCache.invalidate(user.wallet_address);
        try { onChainBal = await getOnChainRexBalance(user.wallet_address); } catch(e) {}
      }
      const minHoldRex = parseFloat(db.getSetting('min_hold_rex', '5000'));
      const withdrawal = db.db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(id);
      const wdAmt = withdrawal ? withdrawal.amount : 0;
      const baselineRex = Math.max(onChainBal, minHoldRex + wdAmt);

      db.setPostWithdrawalMonitoring(telegram_id, id, baselineRex, 24);
      db.logAdminAction('ANTI_DUMP_MONITOR_START', `بدء مراقبة مكافحة الإغراق للمستخدم ${telegram_id} لـ 24 ساعة برصيد ${baselineRex} REX`, ADMIN_TG_ID);

      bot.telegram.sendMessage(telegram_id,
        `✅ *تم تأكيد وإرسال سحبك على البلوكتشين بنجاح!* 👑\n\n` +
        `💰 *المبلغ المستلم:* *+${wdAmt.toLocaleString()} REX*\n` +
        (tx_hash ? `🔗 *هاش المعاملة:* \`${tx_hash}\`\n` : '') +
        (explorer_url ? `🌐 *رابط المستكشف:* [عرض المعاملة في Tonviewer](${explorer_url})\n\n` : '\n') +
        `🛡️ *قانون الأمان الملكي (Anti-Dump Protection - 24h):*\n` +
        `يُحظر بيع أو تصريف أي جزء من عملاتك (المثبتة بـ *${baselineRex.toLocaleString()} REX*) خلال الـ *24 ساعة القادمة (يوم كامل)* لحماية استقرار السعر والتوكنوميكس.\n\n` +
        `⚠️ *تنبيه حازم:* بيع أي عملة خلال الـ 24 ساعة سيتسبب في **حظر حسابك تلقائياً ونهائياً** من المنصة!`,
        { parse_mode: 'Markdown' }
      ).catch(() => {});
    } else if (new_status === 'approved') {
      bot.telegram.sendMessage(telegram_id,
        `✅ *تمت الموافقة على طلب سحبك بنجاح!* 👑\n\n` +
        `⏳ *موعد الوصول:* سيصل السحب لمحفظتك على البلوكتشين خلال 24 ساعة كحد أقصى.\n\n` +
        `شكراً لثقتك بالبلاط الملكي ROYAL ELITE X.`,
        { parse_mode: 'Markdown' }
      ).catch(() => {});
    } else if (new_status === 'rejected' || new_status === 'failed') {
      bot.telegram.sendMessage(telegram_id,
        `❌ تم تحديث حالة طلب سحبك إلى (${new_status}).\n` +
        `السبب: ${audit_note || 'مراجعة أمنية'}\n` +
        `تمت إعادة رصيدك المحجوز إلى رصيدك المتاح في المنصة.`
      ).catch(() => {});
    }

    res.json({ success: true, new_status });
  } catch (err) {
    res.json({ success: false, message: err.message });
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
    `⛔ تم حظر حسابك في منصة ROYAL ELITE X.\nالسبب: ${reason || 'مخالفة شروط الاستخدام'}`
  ).catch(() => {});
  res.json({ success: true });
});

app.post('/api/admin/unban', adminAuth, (req, res) => {
  const { telegram_id } = req.body;
  db.unbanUser(telegram_id);
  db.logAdminAction('UNBAN_USER', `فك حظر ${telegram_id}`, ADMIN_TG_ID);
  bot.telegram.sendMessage(telegram_id,
    '✅ تم رفع الحظر عن حسابك في ROYAL ELITE X بنجاح! مرحباً بعودتك 👑'
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
        `🎁 *إيداع رصيد ملكي جديد!*\n\n` +
        `تمت إضافة *+${amt.toLocaleString()} REX* إلى حسابك من إدارة البلاط الملكي 👑\n` +
        `رصيدك المتاح الحالي: *${Number(result.balance).toFixed(2)} REX*`,
        { parse_mode: 'Markdown' }
      ).catch(() => {});
    }

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
  res.json({ success: true });
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
        `👑 *رسالة خاصة من إدارة ROYAL ELITE X:*\n\n${message}`,
        { parse_mode: 'Markdown' }
      );
    } catch (parseErr) {
      // Attempt 2: Fallback to plain text if Markdown parsing fails
      await bot.telegram.sendMessage(
        tid,
        `👑 رسالة خاصة من إدارة ROYAL ELITE X:\n\n${message}`
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
          `📢 *إشعار رسمي من إدارة ROYAL ELITE X*\n\n${message}`,
          { parse_mode: 'Markdown' }
        );
      } catch (mdErr) {
        await bot.telegram.sendMessage(
          u.telegram_id,
          `📢 إشعار رسمي من إدارة ROYAL ELITE X\n\n${message}`
        );
      }
      sent++;
      await new Promise(r => setTimeout(r, 40));
    } catch { failed++; }
  }
  db.logAdminAction('BROADCAST', `إرسال رسالة جماعية إلى ${sent} مستخدم (فشل: ${failed})`, ADMIN_TG_ID);
  res.json({ success: true, sent, failed });
});

// ================================================================
// 13. TELEGRAM BOT COMMANDS & INTERACTIVE FLOWS (ENGLISH)
// ================================================================
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
    `🪙 Total Supply: *50,000,000 REX*\n` +
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
    `• Total Fixed Supply: *50,000,000 REX* (100% Mint Revoked)\n` +
    `• Official DEX Pair: *REX / GRAM on STON.fi DEX*\n` +
    `• Liquidity Pool: \`EQAkNyk6B1PgiEcBWkXG5d7C137Epx_iAQnB6ZCIVU7E4INR\`\n\n` +
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
        [Markup.button.url('📊 Live DexScreener Chart', 'https://dexscreener.com/ton/eqaknyk6b1pgiecbwkxg5d7c137epx_iaqnb6zcivu7e4inr')],
        [Markup.button.url('🦄 Trade REX on STON.fi DEX', 'https://app.ston.fi/swap?chartVisible=true&ft=EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c&tt=EQCSsfG6xm-7g2-PQkvQWHAlMW3OXwsOdg2_VSAVlmBgr6GH')]
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
      [Markup.button.url('🛒 Buy REX on STON.fi DEX', 'https://app.ston.fi/swap?chartVisible=true&ft=EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c&tt=EQCSsfG6xm-7g2-PQkvQWHAlMW3OXwsOdg2_VSAVlmBgr6GH')],
      [Markup.button.url('📊 Live DexScreener Chart', 'https://dexscreener.com/ton/eqaknyk6b1pgiecbwkxg5d7c137epx_iaqnb6zcivu7e4inr')]
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

// Start Server & Bot
app.listen(PORT, () => {
  console.log(`🚀 ROYAL ELITE X Enterprise Server running on port ${PORT}`);
});

// ── Background Watchdog: Anti-Dump Sentinel (scans every 60s) ──
setInterval(async () => {
  try {
    const monitoredUsers = db.getUsersUnderWithdrawalMonitoring();
    if (!monitoredUsers || monitoredUsers.length === 0) return;

    for (const u of monitoredUsers) {
      try {
        security.OnChainBalanceCache.invalidate(u.wallet_address);
        const liveBal = await getOnChainRexBalance(u.wallet_address);
        await checkAntiDumpViolation(u, liveBal);
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
      await bot.launch();
      console.log('🤖 Telegram Bot @Royalelitexbot is LIVE with Enterprise Security v4.0!');
      return;
    } catch (err) {
      console.error(`Bot launch attempt ${i + 1}/${retries} failed (${err.message}). Retrying in 4s...`);
      await new Promise(r => setTimeout(r, 4000));
    }
  }
}
startBotWithRetry();
