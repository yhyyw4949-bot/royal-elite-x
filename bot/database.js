/**
 * ROYAL ELITE X (REX) — Enterprise Database & Financial Ledger v4.0
 * Architecture:
 *  - ACID Compliance via better-sqlite3 transactions
 *  - Double-Entry Financial Ledger with Idempotency Keys
 *  - Multi-State Withdrawal Engine with Balance Reservation
 *  - Tokenomics Reserve & Daily Emission Cap Tracking
 *  - Achievements, Guilds, Vaults, and Academy Subsystems
 *  - Backward-compatible schema migration
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'royal_bot.db');
const db = new Database(dbPath);

// Enable WAL mode for high concurrency & reliability
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

// ── 1. Schema Initialization & Migrations ──
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    telegram_id INTEGER PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    wallet_address TEXT UNIQUE,
    referrer_id INTEGER,
    balance REAL DEFAULT 0.0,
    reserved_balance REAL DEFAULT 0.0,
    mined_total REAL DEFAULT 0.0,
    xp_points REAL DEFAULT 0.0,
    rank_level INTEGER DEFAULT 1,
    guild_id INTEGER DEFAULT NULL,
    mining_multiplier REAL DEFAULT 1.0,
    last_mining_start INTEGER DEFAULT 0,
    is_mining INTEGER DEFAULT 0,
    is_verified INTEGER DEFAULT 0,
    is_activated INTEGER DEFAULT 0,
    is_banned INTEGER DEFAULT 0,
    ban_reason TEXT,
    device_fingerprint TEXT,
    last_ip TEXT,
    total_withdrawn REAL DEFAULT 0.0,
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS device_fingerprints (
    fingerprint TEXT,
    telegram_id INTEGER,
    ip TEXT,
    created_at INTEGER,
    PRIMARY KEY (fingerprint, telegram_id)
  );

  CREATE TABLE IF NOT EXISTS ip_logs (
    ip TEXT,
    telegram_id INTEGER,
    created_at INTEGER,
    PRIMARY KEY (ip, telegram_id)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    idempotency_key TEXT UNIQUE,
    telegram_id INTEGER,
    type TEXT,
    amount REAL,
    balance_after REAL,
    reference_id TEXT,
    details TEXT,
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS withdrawals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    idempotency_key TEXT UNIQUE,
    telegram_id INTEGER,
    wallet_address TEXT,
    amount REAL,
    status TEXT DEFAULT 'pending',
    tx_hash TEXT DEFAULT NULL,
    explorer_url TEXT DEFAULT NULL,
    audit_note TEXT DEFAULT NULL,
    created_at INTEGER,
    updated_at INTEGER,
    confirmed_at INTEGER DEFAULT NULL
  );

  CREATE TABLE IF NOT EXISTS user_tasks (
    telegram_id INTEGER,
    task_id TEXT,
    completed_count INTEGER DEFAULT 0,
    last_completed_at INTEGER DEFAULT 0,
    PRIMARY KEY (telegram_id, task_id)
  );

  CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    val TEXT,
    description TEXT,
    updated_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT,
    details TEXT,
    admin_id INTEGER DEFAULT 0,
    ip TEXT,
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS tokenomics_reserves (
    id INTEGER PRIMARY KEY DEFAULT 1,
    total_supply REAL DEFAULT 50000000.0,
    mining_reserve REAL DEFAULT 20000000.0,
    mining_distributed REAL DEFAULT 0.0,
    daily_emission_limit REAL DEFAULT 50000.0,
    today_distributed REAL DEFAULT 0.0,
    last_reset_day TEXT
  );

  CREATE TABLE IF NOT EXISTS royal_vaults (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER,
    locked_amount REAL,
    duration_days INTEGER,
    multiplier_boost REAL,
    locked_at INTEGER,
    unlock_at INTEGER,
    status TEXT DEFAULT 'active'
  );

  CREATE TABLE IF NOT EXISTS achievements (
    id TEXT PRIMARY KEY,
    title_ar TEXT,
    title_en TEXT,
    category TEXT,
    description_ar TEXT,
    description_en TEXT,
    target_val REAL,
    reward_xp REAL,
    reward_rex REAL,
    badge_icon TEXT
  );

  CREATE TABLE IF NOT EXISTS user_achievements (
    telegram_id INTEGER,
    achievement_id TEXT,
    unlocked_at INTEGER,
    PRIMARY KEY (telegram_id, achievement_id)
  );

  CREATE TABLE IF NOT EXISTS guilds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    tag TEXT UNIQUE,
    leader_id INTEGER,
    description TEXT,
    members_count INTEGER DEFAULT 1,
    total_power REAL DEFAULT 0.0,
    weekly_score REAL DEFAULT 0.0,
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS guild_members (
    guild_id INTEGER,
    telegram_id INTEGER PRIMARY KEY,
    role TEXT DEFAULT 'member',
    joined_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS academy_lessons (
    id TEXT PRIMARY KEY,
    order_num INTEGER,
    title_ar TEXT,
    title_en TEXT,
    category TEXT,
    read_time TEXT,
    content_ar TEXT,
    content_en TEXT,
    quiz_question_ar TEXT,
    quiz_question_en TEXT,
    quiz_options_ar TEXT,
    quiz_options_en TEXT,
    correct_index INTEGER,
    reward_rex REAL,
    reward_xp REAL
  );

  CREATE TABLE IF NOT EXISTS user_academy (
    telegram_id INTEGER,
    lesson_id TEXT,
    completed_at INTEGER,
    PRIMARY KEY (telegram_id, lesson_id)
  );

  CREATE TABLE IF NOT EXISTS promo_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE COLLATE NOCASE,
    reward_rex REAL NOT NULL,
    reward_xp REAL DEFAULT 0,
    max_uses INTEGER NOT NULL,
    used_count INTEGER DEFAULT 0,
    duration_hours REAL NOT NULL,
    expires_at INTEGER NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_by INTEGER DEFAULT 7082457308,
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS promo_code_redemptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code_id INTEGER,
    code TEXT COLLATE NOCASE,
    telegram_id INTEGER,
    reward_rex REAL,
    reward_xp REAL,
    redeemed_at INTEGER,
    UNIQUE(code_id, telegram_id)
  );

  CREATE TABLE IF NOT EXISTS activation_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE COLLATE NOCASE,
    max_uses INTEGER NOT NULL,
    used_count INTEGER DEFAULT 0,
    duration_hours REAL NOT NULL,
    expires_at INTEGER NOT NULL,
    is_active INTEGER DEFAULT 1,
    bonus_rex REAL DEFAULT 0,
    created_by INTEGER DEFAULT 7082457308,
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS activation_code_redemptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code_id INTEGER,
    code TEXT COLLATE NOCASE,
    telegram_id INTEGER,
    bonus_rex REAL DEFAULT 0,
    redeemed_at INTEGER,
    UNIQUE(code_id, telegram_id)
  );
`);

// ── 2. Safe Column Additions for Existing Databases ──
const safeAlterCols = [
  { table: 'users', col: 'reserved_balance', def: 'REAL DEFAULT 0.0' },
  { table: 'users', col: 'xp_points', def: 'REAL DEFAULT 0.0' },
  { table: 'users', col: 'rank_level', def: 'INTEGER DEFAULT 1' },
  { table: 'users', col: 'guild_id', def: 'INTEGER DEFAULT NULL' },
  { table: 'users', col: 'total_withdrawn', def: 'REAL DEFAULT 0.0' },
  { table: 'users', col: 'onchain_hold_start', def: 'INTEGER DEFAULT 0' },
  { table: 'users', col: 'post_wd_monitored_until', def: 'INTEGER DEFAULT 0' },
  { table: 'users', col: 'post_wd_baseline_rex', def: 'REAL DEFAULT 0.0' },
  { table: 'users', col: 'last_confirmed_wd_id', def: 'INTEGER DEFAULT 0' },
  { table: 'withdrawals', col: 'idempotency_key', def: 'TEXT' },
  { table: 'withdrawals', col: 'tx_hash', def: 'TEXT DEFAULT NULL' },
  { table: 'withdrawals', col: 'explorer_url', def: 'TEXT DEFAULT NULL' },
  { table: 'withdrawals', col: 'audit_note', def: 'TEXT DEFAULT NULL' },
  { table: 'withdrawals', col: 'updated_at', def: 'INTEGER' },
  { table: 'withdrawals', col: 'confirmed_at', def: 'INTEGER DEFAULT NULL' },
  { table: 'transactions', col: 'idempotency_key', def: 'TEXT' },
  { table: 'transactions', col: 'balance_after', def: 'REAL DEFAULT 0.0' },
  { table: 'transactions', col: 'reference_id', def: 'TEXT' },
  { table: 'admin_audit_logs', col: 'admin_id', def: 'INTEGER DEFAULT 0' },
  { table: 'admin_audit_logs', col: 'ip', def: 'TEXT' },
  { table: 'users', col: 'daily_streak', def: 'INTEGER DEFAULT 0' },
  { table: 'users', col: 'last_checkin_at', def: 'INTEGER DEFAULT 0' },
  { table: 'users', col: 'ref_bonus_awarded', def: 'INTEGER DEFAULT 0' },
  { table: 'withdrawals', col: 'fee', def: 'REAL DEFAULT 500.0' },
  { table: 'withdrawals', col: 'net_amount', def: 'REAL DEFAULT NULL' },
  { table: 'users', col: 'is_sybil_exempt', def: 'INTEGER DEFAULT 0' },
  { table: 'users', col: 'activated_via', def: "TEXT DEFAULT 'none'" },
  { table: 'users', col: 'activation_code', def: "TEXT DEFAULT NULL" },
  { table: 'users', col: 'is_hold_exempt', def: 'INTEGER DEFAULT 0' }
];

for (const m of safeAlterCols) {
  try {
    db.exec(`ALTER TABLE ${m.table} ADD COLUMN ${m.col} ${m.def}`);
  } catch (e) {
    // Column already exists - safe to ignore
  }
}

// ── 3. Seed Default System Settings ──
const defaultSettings = [
  { key: 'min_withdrawal', val: '5000', description: 'الحد الأدنى للسحب (REX)' },
  { key: 'withdrawal_fee', val: '500', description: 'رسوم معالجة وشبكة السحب (REX)' },
  { key: 'hold_percent', val: '20', description: 'نسبة الاحتفاظ المطلوبة في المحفظة On-Chain (%)' },
  { key: 'base_daily_reward', val: '100', description: 'معدل التعدين الأساسي لكل 24 ساعة (REX)' },
  { key: 'referral_percent', val: '5', description: 'نسبة عمولة الإحالة مدى الحياة (%)' },
  { key: 'activation_fee_ton', val: '0.1', description: 'رسوم التحقق والتفعيل (TON)' },
  { key: 'maintenance_mode', val: '0', description: 'وضع الصيانة (1: معطل, 0: يعمل)' },
  { key: 'max_daily_emission', val: '50000', description: 'الحد الأقصى للانبعاث اليومي لمكافآت التعدين (REX)' },
  { key: 'mining_reserve_cap', val: '20000000', description: 'سقف احتياطي التعدين الإجمالي المخصص (REX)' },
  { key: 'min_hold_rex', val: '5000', description: 'الحد الأدنى لحيازة المحفظة On-Chain لشرط المدة (REX)' },
  { key: 'min_hold_days', val: '3', description: 'المدة الإلزامية لحيازة العملة في المحفظة قبل السحب (أيام)' },
  { key: 'required_channel', val: '@REXCEO1A', description: 'قناة التيليجرام الإلزامية للاشتراك قبل الدخول' },
  { key: 'ref_offer_enabled', val: '1', description: 'تفعيل عرض مكافأة الإحالة المزدوجة (1: مفعل, 0: معطل)' },
  { key: 'ref_offer_referrer_rex', val: '1000', description: 'مكافأة المحيل عند انضمام صديق (REX)' },
  { key: 'ref_offer_referee_rex', val: '1000', description: 'مكافأة الصديق الجديد الترحيبية عند الانضمام عبر إحالة (REX)' },
  { key: 'ref_offer_title', val: 'عرض الإحالة الملكي: 1000 REX لك ولصديقك!', description: 'عنوان الحملة الترويجية للإحالة' },
  { key: 'ref_offer_expires_at', val: '0', description: 'تاريخ انتهاء عرض الإحالة (0: دائم بدون انتهاء)' },
  { key: 'force_sub_enabled', val: '1', description: 'تفعيل شرط الاشتراك الإجباري في القناة (1: مفعل, 0: معطل)' }
];

const insertSetting = db.prepare('INSERT OR IGNORE INTO system_settings (key, val, description, updated_at) VALUES (?, ?, ?, ?)');
for (const s of defaultSettings) {
  insertSetting.run(s.key, s.val, s.description, Date.now());
}

// ── 4. Seed Tokenomics Reserves Initial Record ──
const todayStr = new Date().toISOString().slice(0, 10);
db.prepare(`
  INSERT OR IGNORE INTO tokenomics_reserves 
  (id, total_supply, mining_reserve, mining_distributed, daily_emission_limit, today_distributed, last_reset_day) 
  VALUES (1, 1000000.0, 400000.0, 0.0, 10000.0, 0.0, ?)
`).run(todayStr);
try { db.prepare("UPDATE tokenomics_reserves SET total_supply = 1000000.0, mining_reserve = 400000.0, daily_emission_limit = 10000.0 WHERE id = 1 AND total_supply > 1000000.0").run(); } catch (err) {}


// ── 5. Seed Official Achievements ──
const defaultAchievements = [
  {
    id: 'mine_first',
    title_ar: 'الضربة الملكية الأولى',
    title_en: 'First Strike',
    category: 'mining',
    description_ar: 'أكمل أول دورة تعدين سحابية كاملة 24 ساعة بنجاح.',
    description_en: 'Complete your first full 24-hour mining cycle.',
    target_val: 1,
    reward_xp: 50,
    reward_rex: 10,
    badge_icon: '⛏️'
  },
  {
    id: 'mine_500',
    title_ar: 'منقب البلاط الفضي',
    title_en: 'Silver Court Miner',
    category: 'mining',
    description_ar: 'قم بتعدين ما مجموعه 500 عملة REX.',
    description_en: 'Accumulate a total of 500 mined REX.',
    target_val: 500,
    reward_xp: 150,
    reward_rex: 25,
    badge_icon: '🥈'
  },
  {
    id: 'mine_5000',
    title_ar: 'سيد مناجم الذهب',
    title_en: 'Gold Mine Lord',
    category: 'mining',
    description_ar: 'قم بتعدين ما مجموعه 5,000 عملة REX.',
    description_en: 'Accumulate a total of 5,000 mined REX.',
    target_val: 5000,
    reward_xp: 500,
    reward_rex: 100,
    badge_icon: '🥇'
  },
  {
    id: 'ref_3',
    title_ar: 'سفير البلاط المبتدئ',
    title_en: 'Junior Ambassador',
    category: 'referrals',
    description_ar: 'قم بدعوة 3 فرسان مفعّلين لمجتمع REX.',
    description_en: 'Invite 3 activated knights to the REX ecosystem.',
    target_val: 3,
    reward_xp: 100,
    reward_rex: 20,
    badge_icon: '👥'
  },
  {
    id: 'ref_15',
    title_ar: 'قائد الفيلق الملكي',
    title_en: 'Legion Commander',
    category: 'referrals',
    description_ar: 'قم بدعوة 15 فارساً مفعّلاً.',
    description_en: 'Invite 15 activated knights.',
    target_val: 15,
    reward_xp: 400,
    reward_rex: 75,
    badge_icon: '🎖️'
  },
  {
    id: 'vault_first',
    title_ar: 'حارس الخزينة الحصين',
    title_en: 'Treasury Guardian',
    category: 'vault',
    description_ar: 'قم بقفل أول حصة REX في الخزينة الملكية لـ 30 يوماً.',
    description_en: 'Lock your first REX allocation in the Royal Vault for 30 days.',
    target_val: 1,
    reward_xp: 200,
    reward_rex: 30,
    badge_icon: '🏛️'
  },
  {
    id: 'withdraw_first',
    title_ar: 'إثبات السيادة المالية',
    title_en: 'Proof of Sovereignty',
    category: 'withdrawals',
    description_ar: 'أكمل أول عملية سحب مؤكدة على بلوكتشين TON.',
    description_en: 'Complete your first confirmed withdrawal on TON Blockchain.',
    target_val: 1,
    reward_xp: 300,
    reward_rex: 50,
    badge_icon: '⛓️'
  },
  {
    id: 'academy_grad',
    title_ar: 'عالم الويب 3 الملكي',
    title_en: 'Royal Web3 Scholar',
    category: 'academy',
    description_ar: 'أكمل جميع مساقات أكاديمية REX واجتز الاختبارات بنجاح.',
    description_en: 'Complete all REX Academy modules and pass all quizzes.',
    target_val: 5,
    reward_xp: 250,
    reward_rex: 50,
    badge_icon: '🎓'
  }
];

const insertAchievement = db.prepare(`
  INSERT OR IGNORE INTO achievements 
  (id, title_ar, title_en, category, description_ar, description_en, target_val, reward_xp, reward_rex, badge_icon)
  VALUES (@id, @title_ar, @title_en, @category, @description_ar, @description_en, @target_val, @reward_xp, @reward_rex, @badge_icon)
`);
for (const a of defaultAchievements) {
  insertAchievement.run(a);
}

// ── 6. Seed REX Academy Lessons ──
const defaultAcademyLessons = [
  {
    id: 'ton_intro',
    order_num: 1,
    title_ar: 'شبكة The Open Network (TON)',
    title_en: 'The Open Network (TON)',
    category: 'blockchain',
    read_time: '2 دقيقة',
    content_ar: 'شبكة TON هي بلوكتشين لامركزي عالي السرعة تم تصميمه لتحمل مليارات المعاملات في الثانية عبر تقنية التجزئة غير المتزامنة (Asynchronous Sharding). تتميز برسوم شبه معدومة وتكامل مباشر وعميق مع تطبيق تيليجرام.',
    content_en: 'TON is a ultra-fast, decentralized blockchain designed for mass adoption and sharded async operations, offering near-zero fees and seamless Telegram integration.',
    quiz_question_ar: 'ما هي الخاصية المعمارية الأساسية التي تمنح شبكة TON سرعتها الفائقة؟',
    quiz_question_en: 'What architectural feature gives TON its extreme speed and scalability?',
    quiz_options_ar: JSON.stringify(['التجزئة غير المتزامنة (Async Sharding)', 'التعدين التقليدي عبر كروت الشاشة', 'إيقاف البلوكتشين مؤقتاً', 'رسوم المعاملات المرتفعة']),
    quiz_options_en: JSON.stringify(['Asynchronous Sharding', 'GPU Proof-of-Work', 'Temporary pauses', 'High transaction fees']),
    correct_index: 0,
    reward_rex: 10,
    reward_xp: 30
  },
  {
    id: 'jetton_standard',
    order_num: 2,
    title_ar: 'معيار رموز Jetton (TEP-74)',
    title_en: 'Jetton Token Standard (TEP-74)',
    category: 'smart_contracts',
    read_time: '3 دقائق',
    content_ar: 'رمز Jetton في TON يعادل معيار ERC-20 في إيثريوم. يتكون العقد من جزأين: عقد المينتر الرئيسي (Jetton Minter) وعقد محفظة الرمز الخاص بكل مستخدم (Jetton Wallet) مما يتيح التوازي الكامل والمعاملات الفورية.',
    content_en: 'Jettons are the fungible token standard on TON (TEP-74). Each user has a unique Jetton Wallet contract communicating with the Master Minter for parallel execution.',
    quiz_question_ar: 'ما هو رقم المعيار القياسي لرموز الـ Jetton على شبكة TON؟',
    quiz_question_en: 'What is the standard specification number for Jettons on TON?',
    quiz_options_ar: JSON.stringify(['TEP-74', 'ERC-20', 'BEP-20', 'TRC-20']),
    quiz_options_en: JSON.stringify(['TEP-74', 'ERC-20', 'BEP-20', 'TRC-20']),
    correct_index: 0,
    reward_rex: 10,
    reward_xp: 30
  },
  {
    id: 'wallet_security',
    order_num: 3,
    title_ar: 'أمان المحافظ غير الحاضنة',
    title_en: 'Non-Custodial Wallet Security',
    category: 'security',
    read_time: '2 دقيقة',
    content_ar: 'في المحافظ غير الحاضنة (مثل Tonkeeper و MyTonWallet)، أنت وحدك من يملك المفاتيح الخاصة والـ 24 كلمة سرية. منصة ROYAL ELITE X لا تطلب أو تخزن كلماتك السرية أبداً. إذا ضاعت كلماتك، تضيع أموالك نهائياً.',
    content_en: 'In non-custodial wallets, you have sole ownership of your 24-word seed phrase. ROYAL ELITE X never asks for or stores your private keys or seed phrase.',
    quiz_question_ar: 'هل يحق لأي منصة أو بوت أن يطلب منك إدخال الـ 24 كلمة سرية الخاصة بمحفظتك؟',
    quiz_question_en: 'Should any platform or bot ever ask for your 24-word recovery seed phrase?',
    quiz_options_ar: JSON.stringify(['ممنوع تماماً ويدل على احتيال قطعي', 'نعم لتأكيد السحب', 'نعم للحصول على مكافأة', 'فقط للأدمن']),
    quiz_options_en: JSON.stringify(['Strictly never; it is an absolute scam', 'Yes to confirm withdrawals', 'Yes for rewards', 'Only for admins']),
    correct_index: 0,
    reward_rex: 15,
    reward_xp: 40
  },
  {
    id: 'explorer_verification',
    order_num: 4,
    title_ar: 'تتبع المعاملات عبر TON Explorer',
    title_en: 'Tracking Transactions on TON Explorer',
    category: 'transparency',
    read_time: '3 دقائق',
    content_ar: 'جميع المعاملات على بلوكتشين TON عامة وغير قابلة للتزوير أو الحذف. يمكنك إدخال هاش المعاملة (Tx Hash) في مستكشف مثل Tonviewer لمطابقة المرسل والمستقبل والمبلغ ووقت التأكيد الدقيق.',
    content_en: 'All transactions on TON Blockchain are public and immutable. By entering a Transaction Hash into Tonviewer, anyone can independently verify amounts, timestamps, and addresses.',
    quiz_question_ar: 'ما هو مستكشف البلوكتشين المعتمد لفحص معاملات TON بشكل مستقل؟',
    quiz_question_en: 'Which explorer is used to independently audit transactions on TON?',
    quiz_options_ar: JSON.stringify(['Tonviewer / Tonscan', 'Google Search', 'رسائل التيليجرام الخاصة', 'لوحة تحكم الهاتف']),
    quiz_options_en: JSON.stringify(['Tonviewer / Tonscan', 'Google Search', 'Private Telegram chats', 'Phone settings']),
    correct_index: 0,
    reward_rex: 10,
    reward_xp: 30
  },
  {
    id: 'rex_tokenomics',
    order_num: 5,
    title_ar: 'اقتصاد وقواعد عملة ROYAL ELITE X',
    title_en: 'ROYAL ELITE X Tokenomics & Integrity',
    category: 'tokenomics',
    read_time: '2 دقيقة',
    content_ar: 'يبلغ المعروض الثابت النهائي 1,000,000 REX. تفرض المنظومة شرط حيازة 20% في المحفظة الخارجية كإثبات التزام حقيقي وتجفيف للمعروض، وترفض المنصة أي محاولات تلاعب أو حسابات وهمية.',
    content_en: 'Total fixed supply is 1,000,000 REX. The ecosystem mandates a 20% on-chain holding verification to ensure genuine commitment, protect liquidity, and prevent sybil abuse.',
    quiz_question_ar: 'ما هو إجمالي المعروض النهائي المقطوع لعملة REX على شبكة TON؟',
    quiz_question_en: 'What is the final maximum total supply of REX on TON Blockchain?',
    quiz_options_ar: JSON.stringify(['1,000,000 REX', '1,000,000,000 REX', 'غير محدود (تضخمي)', '100,000 REX']),
    quiz_options_en: JSON.stringify(['1,000,000 REX', '1,000,000,000 REX', 'Unlimited inflationary', '100,000 REX']),
    correct_index: 0,
    reward_rex: 15,
    reward_xp: 50
  }
];

const insertLesson = db.prepare(`
  INSERT OR IGNORE INTO academy_lessons 
  (id, order_num, title_ar, title_en, category, read_time, content_ar, content_en, quiz_question_ar, quiz_question_en, quiz_options_ar, quiz_options_en, correct_index, reward_rex, reward_xp)
  VALUES (@id, @order_num, @title_ar, @title_en, @category, @read_time, @content_ar, @content_en, @quiz_question_ar, @quiz_question_en, @quiz_options_ar, @quiz_options_en, @correct_index, @reward_rex, @reward_xp)
`);
for (const l of defaultAcademyLessons) {
  insertLesson.run(l);
}

// ── 7. Atomic Financial Operations & Ledger ──

// Helper: Record immutable ledger entry
function recordLedgerEntry(data) {
  const stmt = db.prepare(`
    INSERT INTO transactions 
    (idempotency_key, telegram_id, type, amount, balance_after, reference_id, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(
    data.idempotency_key || null,
    data.telegram_id,
    data.type,
    data.amount,
    data.balance_after,
    data.reference_id || null,
    data.details || null,
    Date.now()
  );
}

// Helper: Update daily emission tracker
function checkAndUpdateEmission(amount) {
  const today = new Date().toISOString().slice(0, 10);
  const reserve = db.prepare('SELECT * FROM tokenomics_reserves WHERE id = 1').get();

  let todayDistributed = reserve.today_distributed;
  if (reserve.last_reset_day !== today) {
    todayDistributed = 0.0;
  }

  const dailyLimit = reserve.daily_emission_limit;
  if (todayDistributed + amount > dailyLimit) {
    return { allowed: false, reason: 'تم بلوغ الحد الأقصى للانبعاث اليومي لمكافآت التعدين.' };
  }

  if (reserve.mining_distributed + amount > reserve.mining_reserve) {
    return { allowed: false, reason: 'تم استنفاد كامل احتياطي مكافآت التعدين المخصصة للمنظومة.' };
  }

  db.prepare(`
    UPDATE tokenomics_reserves 
    SET mining_distributed = mining_distributed + ?,
        today_distributed = ?,
        last_reset_day = ?
    WHERE id = 1
  `).run(amount, todayDistributed + amount, today);

  return { allowed: true };
}

// Helper: XP Rank calculation
function calculateRank(xp) {
  if (xp >= 2000) return { rank: 5, title_ar: 'إمبراطور REX', title_en: 'REX Emperor' };
  if (xp >= 1000) return { rank: 4, title_ar: 'ملك البلاط', title_en: 'Court King' };
  if (xp >= 500) return { rank: 3, title_ar: 'أمير الذهب', title_en: 'Gold Prince' };
  if (xp >= 150) return { rank: 2, title_ar: 'دوق البلاط', title_en: 'Court Duke' };
  return { rank: 1, title_ar: 'فارس مبتدئ', title_en: 'Novice Knight' };
}

// ── 8. Public Module Interface ──
module.exports = {
  db,

  // User Core
  getUser: (id) => db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(id),
  getUserByWallet: (wallet) => db.prepare('SELECT * FROM users WHERE wallet_address = ?').get(wallet),
  createUser: (data) => {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO users 
      (telegram_id, username, first_name, referrer_id, created_at)
      VALUES (@telegram_id, @username, @first_name, @referrer_id, @created_at)
    `);
    return stmt.run(data);
  },
  updateWallet: (telegram_id, wallet) => {
    return db.prepare('UPDATE users SET wallet_address = ? WHERE telegram_id = ?').run(wallet, telegram_id);
  },
  setActivated: (telegram_id) => {
    return db.prepare('UPDATE users SET is_activated = 1 WHERE telegram_id = ?').run(telegram_id);
  },
  setVerified: (telegram_id) => {
    return db.prepare('UPDATE users SET is_verified = 1 WHERE telegram_id = ?').run(telegram_id);
  },
  banUser: (telegram_id, reason) => {
    return db.prepare('UPDATE users SET is_banned = 1, ban_reason = ? WHERE telegram_id = ?').run(reason, telegram_id);
  },
  toggleHoldExemption: (telegram_id) => {
    return db.prepare('UPDATE users SET is_hold_exempt = CASE WHEN is_hold_exempt = 1 THEN 0 ELSE 1 END WHERE telegram_id = ?').run(telegram_id);
  },

  unbanUser: (telegram_id) => {
    try {
      const u = db.prepare('SELECT device_fingerprint FROM users WHERE telegram_id = ?').get(telegram_id);
      if (u && u.device_fingerprint) {
        db.prepare('DELETE FROM device_fingerprints WHERE fingerprint = ?').run(u.device_fingerprint);
      }
      db.prepare('DELETE FROM device_fingerprints WHERE telegram_id = ?').run(telegram_id);
      db.prepare('DELETE FROM ip_logs WHERE telegram_id = ?').run(telegram_id);
    } catch (e) {
      console.error('Error clearing device records on unban:', e.message);
    }
    return db.prepare('UPDATE users SET is_banned = 0, ban_reason = NULL, device_fingerprint = NULL, is_sybil_exempt = 1 WHERE telegram_id = ?').run(telegram_id);
  },
  clearSybilConflict: (fingerprint) => {
    try {
      db.prepare('DELETE FROM device_fingerprints WHERE fingerprint = ?').run(fingerprint);
      db.prepare('UPDATE users SET device_fingerprint = NULL, is_banned = 0, ban_reason = NULL, is_sybil_exempt = 1 WHERE device_fingerprint = ?').run(fingerprint);
      return true;
    } catch (e) {
      return false;
    }
  },
  // Admin Balance & Mining Management
  addBalance: (telegram_id, amount, admin_id = null, reason = 'Admin Adjustment') => {
    const tx = db.transaction(() => {
      const parsedAmt = parseFloat(amount);
      if (isNaN(parsedAmt)) throw new Error('Invalid amount');

      db.prepare('UPDATE users SET balance = balance + ? WHERE telegram_id = ?').run(parsedAmt, telegram_id);
      const updated = db.prepare('SELECT balance FROM users WHERE telegram_id = ?').get(telegram_id);
      if (!updated) throw new Error('User not found');

      recordLedgerEntry({
        telegram_id,
        type: parsedAmt >= 0 ? 'ADMIN_CREDIT' : 'ADMIN_DEBIT',
        amount: parsedAmt,
        balance_after: updated.balance,
        reference_id: `ADMIN_${admin_id || 'SYSTEM'}`,
        details: reason || (parsedAmt >= 0 ? `إضافة رصيد بواسطة الإدارة: +${parsedAmt} REX` : `خصم رصيد بواسطة الإدارة: ${parsedAmt} REX`)
      });

      return { success: true, balance: updated.balance, added: parsedAmt };
    });
    return tx();
  },

  setBalance: (telegram_id, new_balance, admin_id = null, reason = 'Admin Set Balance') => {
    const tx = db.transaction(() => {
      const parsedAmt = parseFloat(new_balance);
      if (isNaN(parsedAmt) || parsedAmt < 0) throw new Error('Invalid balance amount');

      const user = db.prepare('SELECT balance FROM users WHERE telegram_id = ?').get(telegram_id);
      if (!user) throw new Error('User not found');

      const diff = parsedAmt - user.balance;

      db.prepare('UPDATE users SET balance = ? WHERE telegram_id = ?').run(parsedAmt, telegram_id);

      recordLedgerEntry({
        telegram_id,
        type: 'ADMIN_OVERRIDE',
        amount: diff,
        balance_after: parsedAmt,
        reference_id: `ADMIN_${admin_id || 'SYSTEM'}`,
        details: reason || `تعيين الرصيد إلى ${parsedAmt} REX بواسطة الإدارة`
      });

      return { success: true, balance: parsedAmt, diff };
    });
    return tx();
  },

  resetMining: (telegram_id) => {
    return db.prepare('UPDATE users SET is_mining = 0, last_mining_start = 0 WHERE telegram_id = ?').run(telegram_id);
  },

  // ── Post-Withdrawal Anti-Dump Surveillance Engine ──
  setPostWithdrawalMonitoring: (telegram_id, withdrawalId, baselineRex, durationHours = 24) => {
    const monitoredUntil = Date.now() + (durationHours * 3600 * 1000);
    return db.prepare(`
      UPDATE users 
      SET post_wd_monitored_until = ?,
          post_wd_baseline_rex = ?,
          last_confirmed_wd_id = ?
      WHERE telegram_id = ?
    `).run(monitoredUntil, baselineRex, withdrawalId, telegram_id);
  },

  getUsersUnderWithdrawalMonitoring: () => {
    const now = Date.now();
    return db.prepare(`
      SELECT * FROM users 
      WHERE is_banned = 0 
        AND post_wd_monitored_until > ? 
        AND wallet_address IS NOT NULL
    `).all(now);
  },

  updatePostWdBaseline: (telegram_id, newBaseline) => {
    return db.prepare(`
      UPDATE users 
      SET post_wd_baseline_rex = ? 
      WHERE telegram_id = ? AND ? > post_wd_baseline_rex
    `).run(newBaseline, telegram_id, newBaseline);
  },

  clearPostWdMonitoring: (telegram_id) => {
    return db.prepare('UPDATE users SET post_wd_monitored_until = 0 WHERE telegram_id = ?').run(telegram_id);
  },

  setMultiplier: (telegram_id, multiplier) => {
    return db.prepare('UPDATE users SET mining_multiplier = ? WHERE telegram_id = ?').run(multiplier, telegram_id);
  },
  updateHoldStart: (telegram_id, timestamp) => {
    return db.prepare('UPDATE users SET onchain_hold_start = ? WHERE telegram_id = ?').run(timestamp, telegram_id);
  },

  // XP & Progression
  addXp: (telegram_id, xp) => {
    const user = db.prepare('SELECT xp_points FROM users WHERE telegram_id = ?').get(telegram_id);
    if (!user) return;
    const newXp = (user.xp_points || 0) + xp;
    const rankInfo = calculateRank(newXp);
    return db.prepare('UPDATE users SET xp_points = ?, rank_level = ? WHERE telegram_id = ?').run(newXp, rankInfo.rank, telegram_id);
  },
  getUserRank: (xp) => calculateRank(xp),

  // Device & IP Logging
  logDevice: (telegram_id, fingerprint, ip) => {
    try {
      db.prepare('INSERT OR IGNORE INTO device_fingerprints (fingerprint, telegram_id, ip, created_at) VALUES (?, ?, ?, ?)').run(fingerprint, telegram_id, ip, Date.now());
      db.prepare('INSERT OR IGNORE INTO ip_logs (ip, telegram_id, created_at) VALUES (?, ?, ?)').run(ip, telegram_id, Date.now());
      db.prepare('UPDATE users SET device_fingerprint = ?, last_ip = ? WHERE telegram_id = ?').run(fingerprint, ip, telegram_id);
    } catch(e) {}
  },
  checkFingerprintAccounts: (fingerprint) => {
    return db.prepare('SELECT telegram_id FROM device_fingerprints WHERE fingerprint = ?').all(fingerprint);
  },
  checkIpAccounts: (ip) => {
    return db.prepare('SELECT telegram_id FROM ip_logs WHERE ip = ?').all(ip);
  },

  // ── Atomic Mining Engine ──
  updateMining: (telegram_id, is_mining, last_mining_start) => {
    return db.prepare('UPDATE users SET is_mining = ?, last_mining_start = ? WHERE telegram_id = ?').run(is_mining, last_mining_start, telegram_id);
  },
  atomicClaimMining: (telegram_id, amount, idempotency_key) => {
    const tx = db.transaction(() => {
      // Check emission reserve first
      const emissionCheck = checkAndUpdateEmission(amount);
      if (!emissionCheck.allowed) {
        throw new Error(emissionCheck.reason);
      }

      // Atomic update - only if currently mining
      const res = db.prepare(`
        UPDATE users 
        SET balance = balance + ?, 
            mined_total = mined_total + ?, 
            is_mining = 0, 
            last_mining_start = 0 
        WHERE telegram_id = ? AND is_mining = 1
      `).run(amount, amount, telegram_id);

      if (res.changes === 0) {
        throw new Error('NO_ACTIVE_MINING_TO_CLAIM');
      }

      const updatedUser = db.prepare('SELECT balance, xp_points FROM users WHERE telegram_id = ?').get(telegram_id);
      
      // Add XP for completing mining
      const newXp = (updatedUser.xp_points || 0) + 20;
      const rankInfo = calculateRank(newXp);
      db.prepare('UPDATE users SET xp_points = ?, rank_level = ? WHERE telegram_id = ?').run(newXp, rankInfo.rank, telegram_id);

      // Record in immutable ledger
      recordLedgerEntry({
        idempotency_key,
        telegram_id,
        type: 'MINING_CLAIM',
        amount,
        balance_after: updatedUser.balance,
        reference_id: `MINING_${Date.now()}`,
        details: `جمع أرباح تعدين 24 ساعة بمبلغ ${amount} REX`
      });

      return { success: true, balance: updatedUser.balance, claimed: amount };
    });

    return tx();
  },

  // Atomic Referral Commission
  atomicAddReferralCommission: (referrer_id, amount, from_id, from_name) => {
    const tx = db.transaction(() => {
      const res = db.prepare('UPDATE users SET balance = balance + ? WHERE telegram_id = ?').run(amount, referrer_id);
      if (res.changes === 0) return false;

      const updated = db.prepare('SELECT balance FROM users WHERE telegram_id = ?').get(referrer_id);
      recordLedgerEntry({
        telegram_id: referrer_id,
        type: 'REFERRAL_COMMISSION',
        amount,
        balance_after: updated.balance,
        reference_id: `REF_${from_id}_${Date.now()}`,
        details: `عمولة إحالة من الفارس ${from_name} (${from_id})`
      });
      return true;
    });
    return tx();
  },

  // Atomic Task Reward
  atomicClaimTask: (telegram_id, task_id, reward, idempotency_key) => {
    const tx = db.transaction(() => {
      const now = Date.now();
      const existing = db.prepare('SELECT * FROM user_tasks WHERE telegram_id = ? AND task_id = ?').get(telegram_id, task_id);
      if (existing) {
        db.prepare('UPDATE user_tasks SET completed_count = completed_count + 1, last_completed_at = ? WHERE telegram_id = ? AND task_id = ?').run(now, telegram_id, task_id);
      } else {
        db.prepare('INSERT INTO user_tasks (telegram_id, task_id, completed_count, last_completed_at) VALUES (?, ?, 1, ?)').run(telegram_id, task_id, now);
      }

      db.prepare('UPDATE users SET balance = balance + ? WHERE telegram_id = ?').run(reward, telegram_id);
      const updated = db.prepare('SELECT balance, xp_points FROM users WHERE telegram_id = ?').get(telegram_id);
      
      // Add XP for completing a task
      const newXp = (updated.xp_points || 0) + 10;
      const rankInfo = calculateRank(newXp);
      db.prepare('UPDATE users SET xp_points = ?, rank_level = ? WHERE telegram_id = ?').run(newXp, rankInfo.rank, telegram_id);

      recordLedgerEntry({
        idempotency_key,
        telegram_id,
        type: 'TASK_REWARD',
        amount: reward,
        balance_after: updated.balance,
        reference_id: task_id,
        details: `مكافأة إتمام المهمة ${task_id}`
      });

      return { success: true, balance: updated.balance, reward };
    });
    return tx();
  },

  // ── Atomic Multi-Stage Withdrawal Engine ──
  atomicReserveWithdrawal: (telegram_id, wallet_address, amount, idempotency_key, fee = 500) => {
    const tx = db.transaction(() => {
      // Deduct from balance and move to reserved_balance atomically
      const res = db.prepare(`
        UPDATE users 
        SET balance = balance - ?, 
            reserved_balance = reserved_balance + ? 
        WHERE telegram_id = ? AND balance >= ?
      `).run(amount, amount, telegram_id, amount);

      if (res.changes === 0) {
        throw new Error('INSUFFICIENT_BALANCE');
      }

      const netAmount = Math.max(0, amount - fee);
      const now = Date.now();
      const insertW = db.prepare(`
        INSERT INTO withdrawals 
        (idempotency_key, telegram_id, wallet_address, amount, fee, net_amount, status, created_at, updated_at) 
        VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
      `).run(idempotency_key, telegram_id, wallet_address, amount, fee, netAmount, now, now);

      const withdrawalId = insertW.lastInsertRowid;
      const user = db.prepare('SELECT balance, reserved_balance FROM users WHERE telegram_id = ?').get(telegram_id);

      recordLedgerEntry({
        idempotency_key: `LEDGER_RES_${withdrawalId}`,
        telegram_id,
        type: 'WITHDRAWAL_RESERVE',
        amount: -amount,
        balance_after: user.balance,
        reference_id: `W_${withdrawalId}`,
        details: `حجز رصيد لطلب السحب #${withdrawalId} (المطلوب: ${amount} REX - الرسوم: ${fee} REX - الصافي: ${netAmount} REX)`
      });

      return {
        withdrawal_id: withdrawalId,
        remaining_balance: user.balance,
        reserved_balance: user.reserved_balance,
        fee,
        net_amount: netAmount
      };
    });

    return tx();
  },

  atomicUpdateWithdrawalStatus: (withdrawalId, newStatus, extra = {}) => {
    const tx = db.transaction(() => {
      const w = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(withdrawalId);
      if (!w) throw new Error('WITHDRAWAL_NOT_FOUND');

      const now = Date.now();

      if (newStatus === 'confirmed') {
        // Confirmed: clear reserved balance, increment total_withdrawn
        db.prepare(`
          UPDATE users 
          SET reserved_balance = MAX(0, reserved_balance - ?),
              total_withdrawn = total_withdrawn + ?
          WHERE telegram_id = ?
        `).run(w.amount, w.amount, w.telegram_id);

        db.prepare(`
          UPDATE withdrawals 
          SET status = 'confirmed',
              tx_hash = ?,
              explorer_url = ?,
              audit_note = ?,
              updated_at = ?,
              confirmed_at = ?
          WHERE id = ?
        `).run(extra.tx_hash || null, extra.explorer_url || null, extra.audit_note || null, now, now, withdrawalId);

        const user = db.prepare('SELECT balance, reserved_balance FROM users WHERE telegram_id = ?').get(w.telegram_id);
        recordLedgerEntry({
          idempotency_key: `LEDGER_CONF_${withdrawalId}`,
          telegram_id: w.telegram_id,
          type: 'WITHDRAWAL_CONFIRM',
          amount: 0,
          balance_after: user.balance,
          reference_id: extra.tx_hash || `W_${withdrawalId}`,
          details: `تأكيد السحب #${withdrawalId} على البلوكتشين بنجاح`
        });
      } else if (newStatus === 'rejected' || newStatus === 'failed') {
        // Revert: move from reserved_balance back to balance
        db.prepare(`
          UPDATE users 
          SET balance = balance + ?,
              reserved_balance = MAX(0, reserved_balance - ?)
          WHERE telegram_id = ?
        `).run(w.amount, w.amount, w.telegram_id);

        db.prepare(`
          UPDATE withdrawals 
          SET status = ?,
              audit_note = ?,
              updated_at = ?
          WHERE id = ?
        `).run(newStatus, extra.audit_note || null, now, withdrawalId);

        const user = db.prepare('SELECT balance, reserved_balance FROM users WHERE telegram_id = ?').get(w.telegram_id);
        recordLedgerEntry({
          idempotency_key: `LEDGER_REV_${withdrawalId}`,
          telegram_id: w.telegram_id,
          type: newStatus === 'rejected' ? 'WITHDRAWAL_RESTORE' : 'WITHDRAWAL_FAILED_RESTORE',
          amount: w.amount,
          balance_after: user.balance,
          reference_id: `W_${withdrawalId}`,
          details: `استعادة رصيد السحب #${withdrawalId} (${newStatus}): ${extra.audit_note || ''}`
        });
      } else {
        // Intermediate status: reviewing, approved, processing
        db.prepare(`
          UPDATE withdrawals 
          SET status = ?,
              audit_note = ?,
              updated_at = ?
          WHERE id = ?
        `).run(newStatus, extra.audit_note || null, now, withdrawalId);
      }

      return { success: true, status: newStatus };
    });

    return tx();
  },

  // ── Royal Vault Subsystem ──
  createVaultLock: (telegram_id, amount, durationDays) => {
    const tx = db.transaction(() => {
      // Lock balance
      const res = db.prepare('UPDATE users SET balance = balance - ?, reserved_balance = reserved_balance + ? WHERE telegram_id = ? AND balance >= ?').run(amount, amount, telegram_id, amount);
      if (res.changes === 0) throw new Error('INSUFFICIENT_BALANCE');

      const now = Date.now();
      const unlockAt = now + (durationDays * 24 * 3600 * 1000);
      let boost = 1.0;
      if (durationDays >= 90) boost = 2.5;
      else if (durationDays >= 60) boost = 1.8;
      else if (durationDays >= 30) boost = 1.3;

      const ins = db.prepare(`
        INSERT INTO royal_vaults 
        (telegram_id, locked_amount, duration_days, multiplier_boost, locked_at, unlock_at, status)
        VALUES (?, ?, ?, ?, ?, ?, 'active')
      `).run(telegram_id, amount, durationDays, boost, now, unlockAt);

      const user = db.prepare('SELECT balance FROM users WHERE telegram_id = ?').get(telegram_id);
      recordLedgerEntry({
        telegram_id,
        type: 'VAULT_LOCK',
        amount: -amount,
        balance_after: user.balance,
        reference_id: `VAULT_${ins.lastInsertRowid}`,
        details: `قفل ${amount} REX في الخزينة الملكية لـ ${durationDays} يوماً`
      });

      return { vault_id: ins.lastInsertRowid, unlock_at: unlockAt, boost };
    });
    return tx();
  },

  unlockVaultLock: (vaultId, telegram_id) => {
    const tx = db.transaction(() => {
      const v = db.prepare("SELECT * FROM royal_vaults WHERE id = ? AND telegram_id = ? AND status = 'active'").get(vaultId, telegram_id);
      if (!v) throw new Error('VAULT_NOT_FOUND');
      if (Date.now() < v.unlock_at) throw new Error('LOCK_PERIOD_NOT_ENDED');

      db.prepare('UPDATE users SET balance = balance + ?, reserved_balance = MAX(0, reserved_balance - ?) WHERE telegram_id = ?').run(v.locked_amount, v.locked_amount, telegram_id);
      db.prepare("UPDATE royal_vaults SET status = 'unlocked' WHERE id = ?").run(vaultId);

      const user = db.prepare('SELECT balance FROM users WHERE telegram_id = ?').get(telegram_id);
      recordLedgerEntry({
        telegram_id,
        type: 'VAULT_UNLOCK',
        amount: v.locked_amount,
        balance_after: user.balance,
        reference_id: `VAULT_${vaultId}`,
        details: `فك قفل الخزينة الملكية #${vaultId}`
      });

      return { success: true, returned_amount: v.locked_amount };
    });
    return tx();
  },

  getUserVaults: (telegram_id) => {
    return db.prepare('SELECT * FROM royal_vaults WHERE telegram_id = ? ORDER BY locked_at DESC').all(telegram_id);
  },

  // ── Guilds Subsystem ──
  createGuild: (leader_id, name, tag, description) => {
    const tx = db.transaction(() => {
      const user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(leader_id);
      if (!user) throw new Error('USER_NOT_FOUND');
      if (user.guild_id) throw new Error('ALREADY_IN_GUILD');

      const ins = db.prepare(`
        INSERT INTO guilds (name, tag, leader_id, description, members_count, total_power, created_at)
        VALUES (?, ?, ?, ?, 1, ?, ?)
      `).run(name, tag.toUpperCase(), leader_id, description, user.mined_total || 0, Date.now());

      const guildId = ins.lastInsertRowid;
      db.prepare('UPDATE users SET guild_id = ? WHERE telegram_id = ?').run(guildId, leader_id);
      db.prepare("INSERT INTO guild_members (guild_id, telegram_id, role, joined_at) VALUES (?, ?, 'leader', ?)").run(guildId, leader_id, Date.now());

      return { guild_id: guildId, name, tag };
    });
    return tx();
  },

  joinGuild: (telegram_id, guild_id) => {
    const tx = db.transaction(() => {
      const user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegram_id);
      if (!user) throw new Error('USER_NOT_FOUND');
      if (user.guild_id) throw new Error('ALREADY_IN_GUILD');

      const g = db.prepare('SELECT * FROM guilds WHERE id = ?').get(guild_id);
      if (!g) throw new Error('GUILD_NOT_FOUND');

      db.prepare('UPDATE users SET guild_id = ? WHERE telegram_id = ?').run(guild_id, telegram_id);
      db.prepare("INSERT INTO guild_members (guild_id, telegram_id, role, joined_at) VALUES (?, ?, 'member', ?)").run(guild_id, telegram_id, Date.now());
      db.prepare('UPDATE guilds SET members_count = members_count + 1, total_power = total_power + ? WHERE id = ?').run(user.mined_total || 0, guild_id);

      return { success: true };
    });
    return tx();
  },

  leaveGuild: (telegram_id) => {
    const tx = db.transaction(() => {
      const user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegram_id);
      if (!user || !user.guild_id) throw new Error('NOT_IN_GUILD');

      const membership = db.prepare('SELECT role FROM guild_members WHERE telegram_id = ?').get(telegram_id);
      if (membership?.role === 'leader') throw new Error('LEADER_CANNOT_LEAVE');

      db.prepare('DELETE FROM guild_members WHERE telegram_id = ?').run(telegram_id);
      db.prepare('UPDATE users SET guild_id = NULL WHERE telegram_id = ?').run(telegram_id);
      db.prepare('UPDATE guilds SET members_count = MAX(1, members_count - 1), total_power = MAX(0, total_power - ?) WHERE id = ?').run(user.mined_total || 0, user.guild_id);

      return { success: true };
    });
    return tx();
  },

  getGuildsLeaderboard: () => {
    return db.prepare('SELECT g.*, u.first_name as leader_name FROM guilds g LEFT JOIN users u ON u.telegram_id = g.leader_id ORDER BY g.total_power DESC LIMIT 15').all();
  },

  getUserGuild: (telegram_id) => {
    const member = db.prepare('SELECT gm.*, g.name, g.tag, g.description, g.members_count, g.total_power FROM guild_members gm JOIN guilds g ON g.id = gm.guild_id WHERE gm.telegram_id = ?').get(telegram_id);
    if (!member) return null;
    const members = db.prepare('SELECT u.first_name, u.username, u.mined_total, gm.role FROM guild_members gm JOIN users u ON u.telegram_id = gm.telegram_id WHERE gm.guild_id = ? ORDER BY u.mined_total DESC').all(member.guild_id);
    return { guild: member, members };
  },

  // ── Achievements Subsystem ──
  getAllAchievements: () => {
    return db.prepare('SELECT * FROM achievements').all();
  },

  getUserAchievements: (telegram_id) => {
    const rows = db.prepare(`
      SELECT a.*, ua.unlocked_at 
      FROM achievements a 
      LEFT JOIN user_achievements ua ON ua.achievement_id = a.id AND ua.telegram_id = ?
      ORDER BY a.target_val ASC
    `).all(telegram_id);
    return rows.map(r => ({ ...r, is_unlocked: !!r.unlocked_at }));
  },

  checkAndUnlockAchievements: (telegram_id) => {
    const user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegram_id);
    if (!user) return [];
    const referralsCount = db.prepare("SELECT COUNT(*) as c FROM users WHERE referrer_id = ? AND wallet_address IS NOT NULL AND wallet_address != ''").get(telegram_id).c;
    const confirmedWithdrawals = db.prepare("SELECT COUNT(*) as c FROM withdrawals WHERE telegram_id = ? AND status = 'confirmed'").get(telegram_id).c;
    const vaultsCount = db.prepare('SELECT COUNT(*) as c FROM royal_vaults WHERE telegram_id = ?').get(telegram_id).c;
    const completedLessons = db.prepare('SELECT COUNT(*) as c FROM user_academy WHERE telegram_id = ?').get(telegram_id).c;

    const all = db.prepare('SELECT * FROM achievements').all();
    const existing = new Set(db.prepare('SELECT achievement_id FROM user_achievements WHERE telegram_id = ?').all(telegram_id).map(r => r.achievement_id));

    const newlyUnlocked = [];

    for (const ach of all) {
      if (existing.has(ach.id)) continue;

      let qualifies = false;
      if (ach.id === 'mine_first' && user.mined_total > 0) qualifies = true;
      else if (ach.id === 'mine_500' && user.mined_total >= 500) qualifies = true;
      else if (ach.id === 'mine_5000' && user.mined_total >= 5000) qualifies = true;
      else if (ach.id === 'ref_3' && referralsCount >= 3) qualifies = true;
      else if (ach.id === 'ref_15' && referralsCount >= 15) qualifies = true;
      else if (ach.id === 'vault_first' && vaultsCount >= 1) qualifies = true;
      else if (ach.id === 'withdraw_first' && confirmedWithdrawals >= 1) qualifies = true;
      else if (ach.id === 'academy_grad' && completedLessons >= 5) qualifies = true;

      if (qualifies) {
        db.prepare('INSERT OR IGNORE INTO user_achievements (telegram_id, achievement_id, unlocked_at) VALUES (?, ?, ?)').run(telegram_id, ach.id, Date.now());
        if (ach.reward_rex > 0) {
          db.prepare('UPDATE users SET balance = balance + ? WHERE telegram_id = ?').run(ach.reward_rex, telegram_id);
        }
        if (ach.reward_xp > 0) {
          const userUpdated = db.prepare('SELECT xp_points FROM users WHERE telegram_id = ?').get(telegram_id);
          const newXp = (userUpdated.xp_points || 0) + ach.reward_xp;
          const rankInfo = calculateRank(newXp);
          db.prepare('UPDATE users SET xp_points = ?, rank_level = ? WHERE telegram_id = ?').run(newXp, rankInfo.rank, telegram_id);
        }
        newlyUnlocked.push(ach);
      }
    }

    return newlyUnlocked;
  },

  // ── Academy Subsystem ──
  getAcademyLessons: (telegram_id) => {
    const lessons = db.prepare('SELECT * FROM academy_lessons ORDER BY order_num ASC').all();
    const completed = new Set(db.prepare('SELECT lesson_id FROM user_academy WHERE telegram_id = ?').all(telegram_id).map(r => r.lesson_id));

    return lessons.map(l => ({
      ...l,
      quiz_options_ar: JSON.parse(l.quiz_options_ar || '[]'),
      quiz_options_en: JSON.parse(l.quiz_options_en || '[]'),
      is_completed: completed.has(l.id)
    }));
  },

  completeAcademyLesson: (telegram_id, lesson_id, selectedIndex) => {
    const tx = db.transaction(() => {
      const lesson = db.prepare('SELECT * FROM academy_lessons WHERE id = ?').get(lesson_id);
      if (!lesson) throw new Error('LESSON_NOT_FOUND');

      const already = db.prepare('SELECT * FROM user_academy WHERE telegram_id = ? AND lesson_id = ?').get(telegram_id, lesson_id);
      if (already) throw new Error('ALREADY_COMPLETED');

      if (parseInt(selectedIndex) !== lesson.correct_index) {
        throw new Error('INCORRECT_ANSWER');
      }

      db.prepare('INSERT INTO user_academy (telegram_id, lesson_id, completed_at) VALUES (?, ?, ?)').run(telegram_id, lesson_id, Date.now());
      db.prepare('UPDATE users SET balance = balance + ? WHERE telegram_id = ?').run(lesson.reward_rex, telegram_id);

      const user = db.prepare('SELECT balance, xp_points FROM users WHERE telegram_id = ?').get(telegram_id);
      const newXp = (user.xp_points || 0) + lesson.reward_xp;
      const rankInfo = calculateRank(newXp);
      db.prepare('UPDATE users SET xp_points = ?, rank_level = ? WHERE telegram_id = ?').run(newXp, rankInfo.rank, telegram_id);

      recordLedgerEntry({
        telegram_id,
        type: 'ACADEMY_REWARD',
        amount: lesson.reward_rex,
        balance_after: user.balance,
        reference_id: lesson_id,
        details: `مكافأة اجتياز مساق الأكاديمية: ${lesson.title_ar}`
      });

      return {
        success: true,
        reward_rex: lesson.reward_rex,
        reward_xp: lesson.reward_xp,
        balance: user.balance
      };
    });
    return tx();
  },

  // ── Transparency & Proof of Rewards ──
  getPublicProofOfRewards: (limit = 20) => {
    const real = db.prepare(`
      SELECT 
        w.id,
        w.amount,
        w.wallet_address,
        w.status,
        w.tx_hash,
        w.explorer_url,
        w.created_at,
        w.confirmed_at,
        w.updated_at,
        SUBSTR(u.first_name, 1, 3) || '***' as masked_user
      FROM withdrawals w
      LEFT JOIN users u ON u.telegram_id = w.telegram_id
      WHERE w.status IN ('confirmed', 'approved')
      ORDER BY w.updated_at DESC
      LIMIT ?
    `).all(limit);

    return real;
  },

  getPublicTokenomicsStats: () => {
    const reserve = db.prepare('SELECT * FROM tokenomics_reserves WHERE id = 1').get();
    const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
    const totalConfirmed = db.prepare("SELECT COALESCE(SUM(amount), 0) as s FROM withdrawals WHERE status = 'confirmed'").get().s;
    const totalPlatformBalances = db.prepare('SELECT COALESCE(SUM(balance), 0) as s FROM users').get().s;

    return {
      total_supply: reserve.total_supply,
      mining_reserve: reserve.mining_reserve,
      mining_distributed: reserve.mining_distributed,
      reserve_remaining: Math.max(0, reserve.mining_reserve - reserve.mining_distributed),
      daily_emission_limit: reserve.daily_emission_limit,
      today_distributed: reserve.today_distributed,
      total_users: totalUsers,
      total_confirmed_withdrawals: totalConfirmed,
      total_platform_internal_balances: totalPlatformBalances
    };
  },

  // ── Existing Helper Methods (Preserved for compatibility) ──
  getReferralsCount: (telegram_id) => db.prepare("SELECT COUNT(*) as count FROM users WHERE referrer_id = ? AND wallet_address IS NOT NULL AND wallet_address != ''").get(telegram_id).count,
  getReferralsList: (telegram_id) => db.prepare("SELECT first_name, username, balance, mined_total, created_at, wallet_address FROM users WHERE referrer_id = ? AND wallet_address IS NOT NULL AND wallet_address != '' ORDER BY created_at DESC LIMIT 20").all(telegram_id),
  
  // ── Top 10 Holders Leaderboard (Strictly excluding admin main account & deployer) ──
  getTopHolders: (excludeTelegramId = 7082457308, limit = 10) => {
    const adminExcludeId = Number(excludeTelegramId || 7082457308);
    // 1. Fetch real active non-banned users, strictly excluding the admin ID and username
    const realUsers = db.prepare(`
      SELECT 
        telegram_id,
        first_name,
        username,
        wallet_address,
        balance,
        reserved_balance,
        (COALESCE(balance, 0) + COALESCE(reserved_balance, 0)) AS total_held,
        mined_total,
        rank_level,
        mining_multiplier
      FROM users 
      WHERE is_banned = 0 
        AND telegram_id != ? 
        AND telegram_id != 7082457308
        AND (username IS NULL OR LOWER(username) NOT IN ('gramdrouv', 'yehiawael'))
      ORDER BY total_held DESC, mined_total DESC
      LIMIT ?
    `).all(adminExcludeId, limit);

    // Filter in JS as an extra ironclad safeguard
    const filteredReal = realUsers.filter(u => 
      u.telegram_id !== 7082457308 && 
      u.telegram_id !== adminExcludeId &&
      u.username?.toLowerCase() !== 'gramdrouv' &&
      u.username?.toLowerCase() !== 'yehiawael'
    );

    const enrichHolder = (h) => {
      const amt = Number(h.total_held || h.balance || 0);
      let tier_badge = '🥉';
      let tier_title = 'Bronze Explorer';
      let tier_color = '#cd7f32';
      if (amt >= 50000) { tier_badge = '👑'; tier_title = 'Crown Sovereign VIP'; tier_color = '#f59e0b'; }
      else if (amt >= 15000) { tier_badge = '💎'; tier_title = 'Diamond Duke VIP'; tier_color = '#06b6d4'; }
      else if (amt >= 5000) { tier_badge = '💠'; tier_title = 'Platinum Baron'; tier_color = '#a855f7'; }
      else if (amt >= 2000) { tier_badge = '🥇'; tier_title = 'Gold Knight'; tier_color = '#eab308'; }
      else if (amt >= 500) { tier_badge = '🥈'; tier_title = 'Silver Guardian'; tier_color = '#94a3b8'; }
      return {
        ...h,
        balance: amt,
        total_held: amt,
        tier_badge: h.tier_badge || tier_badge,
        tier_title: h.tier_title || tier_title,
        tier_color: h.tier_color || tier_color
      };
    };

    return filteredReal.map(enrichHolder).slice(0, limit).map((u, idx) => ({
      rank: idx + 1,
      telegram_id: u.telegram_id,
      first_name: u.first_name || 'REX Holder',
      username: u.username ? (u.username.startsWith('@') ? u.username : `@${u.username}`) : '',
      balance: u.total_held,
      total_held: u.total_held,
      tier_badge: u.tier_badge,
      tier_title: u.tier_title,
      tier_color: u.tier_color
    }));
  },


  // ── Dual Referral Bonus Promotion Engine ──
  atomicAwardReferralOffer: (newUserId, referrerId, newBonus, refBonus) => {
    const tx = db.transaction(() => {
      const newUser = db.prepare('SELECT telegram_id, first_name, username, balance, ref_bonus_awarded, wallet_address FROM users WHERE telegram_id = ?').get(newUserId);
      if (!newUser || newUser.ref_bonus_awarded === 1 || !newUser.wallet_address) return null;

      const referrer = db.prepare('SELECT telegram_id, first_name, username, balance FROM users WHERE telegram_id = ?').get(referrerId);
      if (!referrer) return null;

      const nBonus = parseFloat(newBonus) || 0;
      const rBonus = parseFloat(refBonus) || 0;
      const now = Date.now();

      const newBalUser = (newUser.balance || 0) + nBonus;
      const newBalRef = (referrer.balance || 0) + rBonus;

      db.prepare('UPDATE users SET balance = balance + ?, ref_bonus_awarded = 1 WHERE telegram_id = ?').run(nBonus, newUserId);
      db.prepare('UPDATE users SET balance = balance + ? WHERE telegram_id = ?').run(rBonus, referrerId);

      recordLedgerEntry({
        telegram_id: newUserId,
        type: 'REFERRAL_WELCOME_BONUS',
        amount: nBonus,
        balance_after: newBalUser,
        reference_id: `ref_welcome_${newUserId}_${referrerId}_${now}`,
        details: `Referral Welcome Bonus via Knight ${referrer.first_name || referrerId} (+${nBonus} REX)`
      });

      recordLedgerEntry({
        telegram_id: referrerId,
        type: 'REFERRAL_INVITE_BONUS',
        amount: rBonus,
        balance_after: newBalRef,
        reference_id: `ref_invite_${referrerId}_${newUserId}_${now}`,
        details: `Referral Bonus for inviting Knight ${newUser.first_name || newUserId} (+${rBonus} REX)`
      });

      return {
        success: true,
        new_user: { id: newUserId, name: newUser.first_name, bonus: nBonus, balance: newBalUser },
        referrer: { id: referrerId, name: referrer.first_name, bonus: rBonus, balance: newBalRef }
      };
    });

    return tx();
  },

  getReferralOfferDetails: () => {
    const enabled = module.exports.getSetting('ref_offer_enabled', '1') === '1';
    const referrerRex = parseFloat(module.exports.getSetting('ref_offer_referrer_rex', '1000'));
    const refereeRex = parseFloat(module.exports.getSetting('ref_offer_referee_rex', '1000'));
    const title = module.exports.getSetting('ref_offer_title', 'عرض الإحالة الملكي: 1000 REX لك ولصديقك!');
    const expiresAt = parseInt(module.exports.getSetting('ref_offer_expires_at', '0'), 10);
    const now = Date.now();
    const isExpired = expiresAt > 0 && now > expiresAt;

    // Stats
    const totalRewarded = db.prepare("SELECT COUNT(*) as c FROM users WHERE ref_bonus_awarded = 1").get().c;
    const totalRexGiven = totalRewarded * (referrerRex + refereeRex);

    return {
      enabled: enabled && !isExpired,
      is_raw_enabled: enabled,
      is_expired: isExpired,
      referrer_rex: referrerRex,
      referee_rex: refereeRex,
      title,
      expires_at: expiresAt,
      remaining_time_ms: expiresAt > 0 ? Math.max(0, expiresAt - now) : 0,
      total_rewarded_referrals: totalRewarded,
      total_distributed_rex: totalRexGiven
    };
  },

  updateReferralOffer: ({ enabled, referrer_rex, referee_rex, title, duration_hours }) => {
    const isEnabled = enabled ? '1' : '0';
    const refAmt = String(Math.max(0, parseFloat(referrer_rex) || 0));
    const newAmt = String(Math.max(0, parseFloat(referee_rex) || 0));
    const offerTitle = String(title || 'عرض الإحالة الملكي').trim();
    const hours = parseFloat(duration_hours) || 0;
    const expiresAt = hours > 0 ? String(Date.now() + Math.round(hours * 3600 * 1000)) : '0';

    module.exports.updateSetting('ref_offer_enabled', isEnabled);
    module.exports.updateSetting('ref_offer_referrer_rex', refAmt);
    module.exports.updateSetting('ref_offer_referee_rex', newAmt);
    module.exports.updateSetting('ref_offer_title', offerTitle);
    module.exports.updateSetting('ref_offer_expires_at', expiresAt);

    return module.exports.getReferralOfferDetails();
  },

  getLeaderboard: () => {
    return module.exports.getTopHolders(7082457308, 10);
  },

  // ── Daily Check-In System (7-Day Consecutive Streak) ──
  getDailyCheckinStatus: (telegram_id) => {
    const DAILY_CHECKIN_DAYS = [
      { day: 1, reward: 50,  xp: 10, icon: '🪙', title_ar: 'اليوم 1', title_en: 'Day 1' },
      { day: 2, reward: 100, xp: 15, icon: '💰', title_ar: 'اليوم 2', title_en: 'Day 2' },
      { day: 3, reward: 150, xp: 20, icon: '💎', title_ar: 'اليوم 3', title_en: 'Day 3' },
      { day: 4, reward: 250, xp: 30, icon: '⚡', title_ar: 'اليوم 4', title_en: 'Day 4' },
      { day: 5, reward: 400, xp: 45, icon: '🔥', title_ar: 'اليوم 5', title_en: 'Day 5' },
      { day: 6, reward: 600, xp: 60, icon: '🏆', title_ar: 'اليوم 6', title_en: 'Day 6' },
      { day: 7, reward: 1000, xp: 100, icon: '👑', title_ar: 'اليوم 7 (مكافأة ملكية)', title_en: 'Day 7 (Grand Prize)' }
    ];

    const user = db.prepare('SELECT daily_streak, last_checkin_at, balance, xp_points FROM users WHERE telegram_id = ?').get(telegram_id);
    const now = Date.now();
    const lastCheckin = user?.last_checkin_at || 0;
    let currentStreak = user?.daily_streak || 0;

    const COOLDOWN_MS = 24 * 3600 * 1000; // 24 hours
    const EXPIRE_MS = 48 * 3600 * 1000;   // 48 hours

    let canClaim = false;
    let cooldownRemaining = 0;

    // Double safeguard: check transaction ledger for any check-in within last 24h or today
    const todayStr = new Date(now).toISOString().slice(0, 10);
    const todayRefId = `checkin_${telegram_id}_${todayStr}`;
    const recentTx = db.prepare(`
      SELECT created_at FROM transactions 
      WHERE telegram_id = ? AND (reference_id = ? OR (type = 'DAILY_CHECKIN' AND created_at > ?))
      ORDER BY created_at DESC LIMIT 1
    `).get(telegram_id, todayRefId, now - COOLDOWN_MS);

    const effectiveLastCheckin = Math.max(lastCheckin, recentTx?.created_at || 0);

    if (effectiveLastCheckin === 0) {
      canClaim = true;
      currentStreak = 0;
    } else {
      const elapsed = now - effectiveLastCheckin;
      if (elapsed < COOLDOWN_MS) {
        canClaim = false;
        cooldownRemaining = COOLDOWN_MS - elapsed;
      } else if (elapsed <= EXPIRE_MS) {
        canClaim = true;
      } else {
        canClaim = true;
        currentStreak = 0;
      }
    }

    let nextDayNum = (currentStreak % 7) + 1;
    let todayReward = DAILY_CHECKIN_DAYS[nextDayNum - 1];

    const days = DAILY_CHECKIN_DAYS.map((d) => {
      let isClaimed = false;
      let isCurrent = false;
      let isLocked = false;

      if (!canClaim) {
        const cycleProgress = currentStreak % 7 === 0 ? 7 : currentStreak % 7;
        if (d.day <= cycleProgress) isClaimed = true;
        else isLocked = true;
      } else {
        const cycleProgress = currentStreak % 7;
        if (d.day <= cycleProgress) isClaimed = true;
        else if (d.day === nextDayNum) isCurrent = true;
        else isLocked = true;
      }

      return {
        ...d,
        is_claimed: isClaimed,
        is_current: isCurrent,
        is_locked: isLocked
      };
    });

    return {
      current_streak: currentStreak,
      can_claim: canClaim,
      cooldown_remaining: cooldownRemaining,
      last_checkin_at: lastCheckin,
      next_day: nextDayNum,
      today_reward: todayReward.reward,
      today_xp: todayReward.xp,
      days
    };
  },


  // ── Promo Codes Management ──
  createPromoCode: ({ code, reward_rex, reward_xp = 0, max_uses, duration_hours, created_by = 7082457308 }) => {
    const sanitizedCode = String(code || '').trim().toUpperCase();
    if (!sanitizedCode || sanitizedCode.length < 3) throw new Error('INVALID_CODE_FORMAT');
    const rex = parseFloat(reward_rex);
    if (isNaN(rex) || rex <= 0) throw new Error('INVALID_REWARD_AMOUNT');
    const xp = parseFloat(reward_xp || 0);
    const uses = parseInt(max_uses);
    if (isNaN(uses) || uses <= 0) throw new Error('INVALID_MAX_USES');
    const hours = parseFloat(duration_hours);
    if (isNaN(hours) || hours <= 0) throw new Error('INVALID_DURATION');

    const now = Date.now();
    const expiresAt = now + Math.round(hours * 3600 * 1000);

    const existing = db.prepare('SELECT id FROM promo_codes WHERE code = ? COLLATE NOCASE').get(sanitizedCode);
    if (existing) throw new Error('CODE_ALREADY_EXISTS');

    const res = db.prepare(`
      INSERT INTO promo_codes 
      (code, reward_rex, reward_xp, max_uses, used_count, duration_hours, expires_at, is_active, created_by, created_at)
      VALUES (?, ?, ?, ?, 0, ?, ?, 1, ?, ?)
    `).run(sanitizedCode, rex, xp, uses, hours, expiresAt, created_by, now);

    return db.prepare('SELECT * FROM promo_codes WHERE id = ?').get(res.lastInsertRowid);
  },

  getAllPromoCodes: () => {
    const codes = db.prepare('SELECT * FROM promo_codes ORDER BY created_at DESC').all();
    const now = Date.now();
    return codes.map(c => {
      const isExpired = now > c.expires_at;
      const isExhausted = c.used_count >= c.max_uses;
      let status = 'active';
      if (!c.is_active) status = 'disabled';
      else if (isExpired) status = 'expired';
      else if (isExhausted) status = 'exhausted';

      return {
        ...c,
        is_expired: isExpired,
        is_exhausted: isExhausted,
        status,
        remaining_uses: Math.max(0, c.max_uses - c.used_count),
        remaining_time_ms: Math.max(0, c.expires_at - now)
      };
    });
  },

  deletePromoCode: (id) => {
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM promo_code_redemptions WHERE code_id = ?').run(id);
      return db.prepare('DELETE FROM promo_codes WHERE id = ?').run(id);
    });
    return tx();
  },

  togglePromoCode: (id) => {
    return db.prepare('UPDATE promo_codes SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE id = ?').run(id);
  },

  // ── Activation / Fee Waiver Codes Engine ──
  createActivationCode: ({ code, max_uses, duration_hours, bonus_rex = 0, created_by = 7082457308 }) => {
    const sanitizedCode = String(code || '').trim().toUpperCase();
    if (!sanitizedCode) throw new Error('EMPTY_CODE');

    const uses = parseInt(max_uses, 10);
    if (isNaN(uses) || uses <= 0) throw new Error('INVALID_MAX_USES');

    const hours = parseFloat(duration_hours);
    if (isNaN(hours) || hours <= 0) throw new Error('INVALID_DURATION');

    const bonus = Math.max(0, parseFloat(bonus_rex) || 0);
    const now = Date.now();
    const expiresAt = now + Math.round(hours * 3600 * 1000);

    const existing = db.prepare('SELECT id FROM activation_codes WHERE code = ? COLLATE NOCASE').get(sanitizedCode);
    if (existing) throw new Error('CODE_ALREADY_EXISTS');

    const res = db.prepare(`
      INSERT INTO activation_codes 
      (code, max_uses, used_count, duration_hours, expires_at, is_active, bonus_rex, created_by, created_at)
      VALUES (?, ?, 0, ?, ?, 1, ?, ?, ?)
    `).run(sanitizedCode, uses, hours, expiresAt, bonus, created_by, now);

    return db.prepare('SELECT * FROM activation_codes WHERE id = ?').get(res.lastInsertRowid);
  },

  getAllActivationCodes: () => {
    const codes = db.prepare('SELECT * FROM activation_codes ORDER BY created_at DESC').all();
    const now = Date.now();
    return codes.map(c => {
      const isExpired = now > c.expires_at;
      const isExhausted = c.used_count >= c.max_uses;
      let status = 'active';
      if (!c.is_active) status = 'disabled';
      else if (isExpired) status = 'expired';
      else if (isExhausted) status = 'exhausted';

      return {
        ...c,
        is_expired: isExpired,
        is_exhausted: isExhausted,
        status,
        remaining_uses: Math.max(0, c.max_uses - c.used_count),
        remaining_time_ms: Math.max(0, c.expires_at - now)
      };
    });
  },

  deleteActivationCode: (id) => {
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM activation_code_redemptions WHERE code_id = ?').run(id);
      return db.prepare('DELETE FROM activation_codes WHERE id = ?').run(id);
    });
    return tx();
  },

  toggleActivationCode: (id) => {
    return db.prepare('UPDATE activation_codes SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE id = ?').run(id);
  },

  redeemActivationCode: (telegram_id, codeStr) => {
    const cleanCode = String(codeStr || '').trim().toUpperCase();
    if (!cleanCode) throw new Error('EMPTY_CODE');

    const tx = db.transaction(() => {
      const user = db.prepare('SELECT telegram_id, is_activated, balance, is_banned FROM users WHERE telegram_id = ?').get(telegram_id);
      if (!user) throw new Error('USER_NOT_FOUND');
      if (user.is_banned) throw new Error('USER_BANNED');
      if (user.is_activated === 1) throw new Error('ALREADY_ACTIVATED');

      const now = Date.now();

      // 1. First, check dedicated activation_codes table
      const codeObj = db.prepare('SELECT * FROM activation_codes WHERE code = ? COLLATE NOCASE').get(cleanCode);
      if (codeObj) {
        if (!codeObj.is_active) throw new Error('CODE_INACTIVE');
        if (now > codeObj.expires_at) throw new Error('CODE_EXPIRED');
        if (codeObj.used_count >= codeObj.max_uses) throw new Error('CODE_EXHAUSTED');

        const already = db.prepare('SELECT 1 FROM activation_code_redemptions WHERE code_id = ? AND telegram_id = ?').get(codeObj.id, telegram_id);
        if (already) throw new Error('ALREADY_REDEEMED');

        const bonus = codeObj.bonus_rex || 0;
        const newBalance = (user.balance || 0) + bonus;

        // Activate user and grant fee waiver
        db.prepare(`
          UPDATE users 
          SET is_activated = 1, 
              activated_via = 'activation_code', 
              activation_code = ?,
              balance = balance + ?
          WHERE telegram_id = ?
        `).run(codeObj.code, bonus, telegram_id);

        db.prepare('UPDATE activation_codes SET used_count = used_count + 1 WHERE id = ?').run(codeObj.id);

        db.prepare('INSERT INTO activation_code_redemptions (code_id, code, telegram_id, bonus_rex, redeemed_at) VALUES (?, ?, ?, ?, ?)')
          .run(codeObj.id, codeObj.code, telegram_id, bonus, now);

        if (bonus > 0) {
          recordLedgerEntry({
            telegram_id,
            type: 'ACTIVATION_BONUS',
            amount: bonus,
            balance_after: newBalance,
            reference_id: `act_${codeObj.id}_${telegram_id}_${now}`,
            details: `Activation Code Bonus: ${codeObj.code} (+${bonus} REX)`
          });
        }

        return {
          success: true,
          code: codeObj.code,
          bonus_rex: bonus,
          new_balance: newBalance,
          is_activated: 1
        };
      }

      // 2. Fallback: Also accept any valid promo_code as an activation pass!
      const promoObj = db.prepare('SELECT * FROM promo_codes WHERE code = ? COLLATE NOCASE').get(cleanCode);
      if (promoObj) {
        if (!promoObj.is_active) throw new Error('CODE_INACTIVE');
        if (now > promoObj.expires_at) throw new Error('CODE_EXPIRED');
        if (promoObj.used_count >= promoObj.max_uses) throw new Error('CODE_EXHAUSTED');

        const alreadyPromo = db.prepare('SELECT 1 FROM promo_code_redemptions WHERE code_id = ? AND telegram_id = ?').get(promoObj.id, telegram_id);
        if (alreadyPromo) throw new Error('ALREADY_REDEEMED');

        const rewardRex = promoObj.reward_rex || 0;
        const rewardXp = promoObj.reward_xp || 0;
        const newBalance = (user.balance || 0) + rewardRex;

        // Activate user via promo code and credit REX + XP
        db.prepare(`
          UPDATE users 
          SET is_activated = 1, 
              activated_via = 'promo_code', 
              activation_code = ?,
              balance = balance + ?,
              xp_points = xp_points + ?
          WHERE telegram_id = ?
        `).run(promoObj.code, rewardRex, rewardXp, telegram_id);

        db.prepare('UPDATE promo_codes SET used_count = used_count + 1 WHERE id = ?').run(promoObj.id);

        db.prepare('INSERT INTO promo_code_redemptions (code_id, code, telegram_id, reward_rex, reward_xp, redeemed_at) VALUES (?, ?, ?, ?, ?, ?)')
          .run(promoObj.id, promoObj.code, telegram_id, rewardRex, rewardXp, now);

        recordLedgerEntry({
          telegram_id,
          type: 'ACTIVATION_PROMO',
          amount: rewardRex,
          balance_after: newBalance,
          reference_id: `act_promo_${promoObj.id}_${telegram_id}_${now}`,
          details: `Activation via Promo Code: ${promoObj.code} (+${rewardRex} REX, +${rewardXp} XP)`
        });

        return {
          success: true,
          code: promoObj.code,
          bonus_rex: rewardRex,
          new_balance: newBalance,
          is_activated: 1
        };
      }

      throw new Error('CODE_NOT_FOUND');
    });

    return tx();
  },

  redeemPromoCode: (telegram_id, codeStr) => {
    const cleanCode = String(codeStr || '').trim().toUpperCase();
    if (!cleanCode) throw new Error('EMPTY_CODE');

    const tx = db.transaction(() => {
      const user = db.prepare('SELECT telegram_id, balance, xp_points, is_banned FROM users WHERE telegram_id = ?').get(telegram_id);
      if (!user) throw new Error('USER_NOT_FOUND');
      if (user.is_banned) throw new Error('USER_BANNED');

      const promo = db.prepare('SELECT * FROM promo_codes WHERE code = ? COLLATE NOCASE').get(cleanCode);
      if (!promo) throw new Error('CODE_NOT_FOUND');
      if (!promo.is_active) throw new Error('CODE_INACTIVE');

      const now = Date.now();
      if (now > promo.expires_at) throw new Error('CODE_EXPIRED');
      if (promo.used_count >= promo.max_uses) throw new Error('CODE_EXHAUSTED');

      const already = db.prepare('SELECT 1 FROM promo_code_redemptions WHERE code_id = ? AND telegram_id = ?').get(promo.id, telegram_id);
      if (already) throw new Error('ALREADY_REDEEMED');

      // Update user balance & xp
      const newBalance = (user.balance || 0) + promo.reward_rex;
      const newXp = (user.xp_points || 0) + (promo.reward_xp || 0);

      db.prepare('UPDATE users SET balance = balance + ?, xp_points = xp_points + ? WHERE telegram_id = ?')
        .run(promo.reward_rex, promo.reward_xp || 0, telegram_id);

      // Increment used count
      db.prepare('UPDATE promo_codes SET used_count = used_count + 1 WHERE id = ?').run(promo.id);

      // Insert redemption record
      db.prepare('INSERT INTO promo_code_redemptions (code_id, code, telegram_id, reward_rex, reward_xp, redeemed_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(promo.id, promo.code, telegram_id, promo.reward_rex, promo.reward_xp || 0, now);

      // Record double-entry financial ledger
      recordLedgerEntry({
        telegram_id,
        type: 'PROMO_CODE_REDEEM',
        amount: promo.reward_rex,
        balance_after: newBalance,
        reference_id: `promo_${promo.id}_${telegram_id}_${now}`,
        details: `Redeemed Promo Code: ${promo.code} (+${promo.reward_rex} REX, +${promo.reward_xp || 0} XP)`
      });

      return {
        code: promo.code,
        reward_rex: promo.reward_rex,
        reward_xp: promo.reward_xp || 0,
        new_balance: newBalance,
        new_xp: newXp
      };
    });

    return tx();
  },

  claimDailyCheckin: (telegram_id) => {
    const DAILY_CHECKIN_DAYS = [
      { day: 1, reward: 50,  xp: 10 },
      { day: 2, reward: 100, xp: 15 },
      { day: 3, reward: 150, xp: 20 },
      { day: 4, reward: 250, xp: 30 },
      { day: 5, reward: 400, xp: 45 },
      { day: 6, reward: 600, xp: 60 },
      { day: 7, reward: 1000, xp: 100 }
    ];

    const tx = db.transaction(() => {
      const user = db.prepare('SELECT telegram_id, balance, xp_points, daily_streak, last_checkin_at FROM users WHERE telegram_id = ?').get(telegram_id);
      if (!user) throw new Error('USER_NOT_FOUND');

      const now = Date.now();
      const lastCheckin = user.last_checkin_at || 0;
      let currentStreak = user.daily_streak || 0;

      const COOLDOWN_MS = 24 * 3600 * 1000;
      const EXPIRE_MS = 48 * 3600 * 1000;

      const todayStr = new Date(now).toISOString().slice(0, 10);
      const todayRefId = `checkin_${telegram_id}_${todayStr}`;
      const recentTx = db.prepare(`
        SELECT created_at FROM transactions 
        WHERE telegram_id = ? AND (reference_id = ? OR (type = 'DAILY_CHECKIN' AND created_at > ?))
        ORDER BY created_at DESC LIMIT 1
      `).get(telegram_id, todayRefId, now - COOLDOWN_MS);

      const effectiveLastCheckin = Math.max(lastCheckin, recentTx?.created_at || 0);

      if (effectiveLastCheckin > 0) {
        const elapsed = now - effectiveLastCheckin;
        if (elapsed < COOLDOWN_MS) {
          throw new Error('COOLDOWN_ACTIVE');
        } else if (elapsed > EXPIRE_MS) {
          currentStreak = 0;
        }
      }

      const nextDay = (currentStreak % 7) + 1;
      const rewardConfig = DAILY_CHECKIN_DAYS[nextDay - 1];
      const reward = rewardConfig.reward;
      const xp = rewardConfig.xp;
      const newStreak = nextDay;

      const newBalance = (user.balance || 0) + reward;

      db.prepare(`
        UPDATE users 
        SET balance = balance + ?, 
            xp_points = xp_points + ?, 
            daily_streak = ?, 
            last_checkin_at = ? 
        WHERE telegram_id = ?
      `).run(reward, xp, newStreak, now, telegram_id);

      recordLedgerEntry({
        telegram_id,
        type: 'DAILY_CHECKIN',
        amount: reward,
        balance_after: newBalance,
        reference_id: `checkin_${telegram_id}_${new Date(now).toISOString().slice(0, 10)}`,
        details: `Day ${nextDay} Daily Check-In (+${reward} REX, +${xp} XP)`
      });

      return {
        reward,
        xp,
        new_streak: newStreak,
        new_balance: newBalance,
        day: nextDay
      };
    });

    return tx();
  },
  getWithdrawals: (telegram_id) => db.prepare('SELECT * FROM withdrawals WHERE telegram_id = ? ORDER BY created_at DESC LIMIT 15').all(telegram_id),
  getUserTasks: (telegram_id) => db.prepare('SELECT * FROM user_tasks WHERE telegram_id = ?').all(telegram_id),
  getTaskStatus: (telegram_id, task_id) => db.prepare('SELECT * FROM user_tasks WHERE telegram_id = ? AND task_id = ?').get(telegram_id, task_id),
  getUserTransactions: (telegram_id, limit = 25) => db.prepare('SELECT * FROM transactions WHERE telegram_id = ? ORDER BY created_at DESC LIMIT ?').all(telegram_id, limit),

  // Admin Enhanced
  getAllUsers: (search = '', page = 0, limit = 30) => {
    const offset = page * limit;
    if (search) {
      return db.prepare(`SELECT * FROM users WHERE first_name LIKE ? OR username LIKE ? OR CAST(telegram_id AS TEXT) LIKE ? OR wallet_address LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, limit, offset);
    }
    return db.prepare('SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);
  },
  getUserCount: () => db.prepare('SELECT COUNT(*) as c FROM users').get().c,
  getActiveMiners: () => db.prepare('SELECT COUNT(*) as c FROM users WHERE is_mining = 1').get().c,
  getTotalBalance: () => db.prepare('SELECT COALESCE(SUM(balance),0) as s FROM users').get().s,
  getTotalReserved: () => db.prepare('SELECT COALESCE(SUM(reserved_balance),0) as s FROM users').get().s,
  getTotalMined: () => db.prepare('SELECT COALESCE(SUM(mined_total),0) as s FROM users WHERE is_banned = 0').get().s,
  getTotalWithdrawn: () => db.prepare('SELECT COALESCE(SUM(total_withdrawn),0) as s FROM users').get().s,
  getBannedCount: () => db.prepare('SELECT COUNT(*) as c FROM users WHERE is_banned = 1').get().c,
  getNewUsersToday: () => {
    const start = new Date(); start.setHours(0,0,0,0);
    return db.prepare('SELECT COUNT(*) as c FROM users WHERE created_at >= ?').get(start.getTime()).c;
  },
  getActivatedCount: () => db.prepare('SELECT COUNT(*) as c FROM users WHERE is_activated = 1').get().c,
  
  getPendingWithdrawals: () => db.prepare(`SELECT w.*, u.first_name, u.username FROM withdrawals w LEFT JOIN users u ON u.telegram_id = w.telegram_id WHERE w.status IN ('pending', 'reviewing', 'approved', 'processing') ORDER BY w.created_at ASC`).all(),
  getAllWithdrawals: (page = 0, limit = 50) => db.prepare(`SELECT w.*, u.first_name, u.username FROM withdrawals w LEFT JOIN users u ON u.telegram_id = w.telegram_id ORDER BY w.created_at DESC LIMIT ? OFFSET ?`).all(limit, page * limit),
  getWithdrawalStats: () => {
    const pending = db.prepare("SELECT COUNT(*) as c, COALESCE(SUM(amount),0) as s FROM withdrawals WHERE status IN ('pending', 'reviewing', 'approved', 'processing')").get();
    const confirmed = db.prepare("SELECT COUNT(*) as c, COALESCE(SUM(amount),0) as s FROM withdrawals WHERE status='confirmed'").get();
    const rejected = db.prepare("SELECT COUNT(*) as c, COALESCE(SUM(amount),0) as s FROM withdrawals WHERE status IN ('rejected', 'failed')").get();
    return { pending, confirmed, rejected };
  },

  getUserFullProfile: (telegram_id) => {
    const user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegram_id);
    if (!user) return null;
    const devices = db.prepare('SELECT * FROM device_fingerprints WHERE telegram_id = ?').all(telegram_id);
    const ips = db.prepare('SELECT * FROM ip_logs WHERE telegram_id = ?').all(telegram_id);
    const tasks = db.prepare('SELECT * FROM user_tasks WHERE telegram_id = ?').all(telegram_id);
    const withdrawals = db.prepare('SELECT * FROM withdrawals WHERE telegram_id = ? ORDER BY created_at DESC LIMIT 10').all(telegram_id);
    const referrals = db.prepare("SELECT first_name, username, balance, created_at, wallet_address FROM users WHERE referrer_id = ? AND wallet_address IS NOT NULL AND wallet_address != '' LIMIT 20").all(telegram_id);
    const transactions = db.prepare('SELECT * FROM transactions WHERE telegram_id = ? ORDER BY created_at DESC LIMIT 20').all(telegram_id);
    const achievements = db.prepare('SELECT a.*, ua.unlocked_at FROM user_achievements ua JOIN achievements a ON a.id = ua.achievement_id WHERE ua.telegram_id = ?').all(telegram_id);
    return { user, devices, ips, tasks, withdrawals, referrals, transactions, achievements };
  },

  getSybilAlerts: () => {
    const dupFingerprints = db.prepare(`
      SELECT fingerprint, COUNT(DISTINCT telegram_id) as count, GROUP_CONCAT(telegram_id) as user_ids 
      FROM device_fingerprints 
      GROUP BY fingerprint 
      HAVING count > 1
    `).all();

    const dupIps = db.prepare(`
      SELECT ip, COUNT(DISTINCT telegram_id) as count, GROUP_CONCAT(telegram_id) as user_ids 
      FROM ip_logs 
      GROUP BY ip 
      HAVING count > 2
    `).all();

    return { dupFingerprints, dupIps };
  },

  getAllSettings: () => {
    const rows = db.prepare('SELECT * FROM system_settings').all();
    const map = {};
    rows.forEach(r => { map[r.key] = r.val; });
    return map;
  },
  getSetting: (key, defVal) => {
    const row = db.prepare('SELECT val FROM system_settings WHERE key = ?').get(key);
    return row ? row.val : defVal;
  },
  updateSetting: (key, val) => {
    return db.prepare(`
      INSERT INTO system_settings (key, val, description, updated_at) 
      VALUES (?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET val = excluded.val, updated_at = excluded.updated_at
    `).run(key, String(val), key, Date.now());
  },

  logAdminAction: (action, details, admin_id = 0, ip = '') => {
    try {
      db.prepare('INSERT INTO admin_audit_logs (action, details, admin_id, ip, created_at) VALUES (?, ?, ?, ?, ?)').run(action, details, admin_id, ip, Date.now());
    } catch(e) {}
  },
  getAdminLogs: (limit = 50) => {
    return db.prepare('SELECT * FROM admin_audit_logs ORDER BY created_at DESC LIMIT ?').all(limit);
  }
};
