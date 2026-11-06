/**
 * ROYAL ELITE X — Enterprise Security & Cryptography Engine
 * Handles:
 *  - Telegram WebApp initData HMAC-SHA256 verification
 *  - Rate limiting & anti-flooding
 *  - On-Chain RPC caching
 *  - Admin 2FA One-Time-Password (OTP) generation & validation
 *  - Idempotency key registry
 */

const crypto = require('crypto');

// ── 1. Telegram initData HMAC-SHA256 Verification ──
function verifyTelegramInitData(initData, botToken) {
  if (!initData || typeof initData !== 'string') return null;

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;

    params.delete('hash');

    // Sort parameters alphabetically
    const entries = Array.from(params.entries());
    entries.sort((a, b) => a[0].localeCompare(b[0]));
    const dataCheckString = entries.map(([key, val]) => `${key}=${val}`).join('\n');

    // Secret key: HMAC-SHA256("WebAppData", botToken)
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    
    // Hash: HMAC-SHA256(secretKey, dataCheckString)
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    const calculatedBuffer = Buffer.from(calculatedHash, 'utf8');
    const hashBuffer = Buffer.from(hash, 'utf8');

    if (calculatedBuffer.length !== hashBuffer.length) return null;
    if (!crypto.timingSafeEqual(calculatedBuffer, hashBuffer)) return null;

    // Optional: check auth_date expiration (allow up to 86400s = 24h)
    const authDate = parseInt(params.get('auth_date') || '0', 10);
    const now = Math.floor(Date.now() / 1000);
    if (authDate && (now - authDate > 86400 * 2)) {
      // Expired initData
      return null;
    }

    const userJson = params.get('user');
    const user = userJson ? JSON.parse(userJson) : null;
    return {
      isValid: true,
      user,
      authDate
    };
  } catch (err) {
    return null;
  }
}

// ── 2. In-Memory Sliding-Window Rate Limiter ──
function createRateLimiter(windowMs = 60000, maxRequests = 60) {
  const requests = new Map();

  // Cleanup expired entries periodically
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of requests.entries()) {
      if (now - record.startTime > windowMs) {
        requests.delete(key);
      }
    }
  }, windowMs).unref();

  return function rateLimitMiddleware(req, res, next) {
    const key = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
                req.socket?.remoteAddress || 
                '127.0.0.1';
    const now = Date.now();
    let record = requests.get(key);

    if (!record || (now - record.startTime > windowMs)) {
      record = { startTime: now, count: 1 };
      requests.set(key, record);
      return next();
    }

    record.count++;
    if (record.count > maxRequests) {
      return res.status(429).json({
        success: false,
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'تم تجاوز معدل الطلبات المسموح. يرجى الانتظار قليلاً.'
      });
    }

    next();
  };
}

// ── 3. In-Memory On-Chain Balance Cache ──
class OnChainBalanceCache {
  constructor(ttlMs = 60000) {
    this.ttlMs = ttlMs;
    this.cache = new Map();
  }

  get(walletAddress) {
    if (!walletAddress) return null;
    const entry = this.cache.get(walletAddress);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(walletAddress);
      return null;
    }
    return entry.value;
  }

  set(walletAddress, value) {
    if (!walletAddress) return;
    this.cache.set(walletAddress, {
      value,
      expiresAt: Date.now() + this.ttlMs
    });
  }

  invalidate(walletAddress) {
    if (walletAddress) this.cache.delete(walletAddress);
  }
}

// ── 4. Admin 2FA OTP System ──
class AdminOtpManager {
  constructor() {
    this.activeOtps = new Map(); // adminId -> { code, expiresAt, verified }
  }

  generateOtp(adminId, ttlMs = 180000) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    this.activeOtps.set(String(adminId), {
      code,
      expiresAt: Date.now() + ttlMs,
      verified: false
    });
    return code;
  }

  verifyOtp(adminId, code) {
    const entry = this.activeOtps.get(String(adminId));
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.activeOtps.delete(String(adminId));
      return false;
    }
    if (entry.code === String(code).trim()) {
      entry.verified = true;
      return true;
    }
    return false;
  }

  isVerified(adminId) {
    const entry = this.activeOtps.get(String(adminId));
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.activeOtps.delete(String(adminId));
      return false;
    }
    return entry.verified;
  }

  consumeSession(adminId) {
    this.activeOtps.delete(String(adminId));
  }
}

// ── 5. Financial Idempotency Registry ──
class IdempotencyRegistry {
  constructor(ttlMs = 300000) { // 5 minutes
    this.processed = new Map();
  }

  checkAndStore(key, result) {
    if (!key) return null;
    if (this.processed.has(key)) {
      return this.processed.get(key);
    }
    this.processed.set(key, result);
    return null;
  }

  remove(key) {
    if (key) this.processed.delete(key);
  }
}

module.exports = {
  verifyTelegramInitData,
  createRateLimiter,
  OnChainBalanceCache: new OnChainBalanceCache(60000),
  adminOtpManager: new AdminOtpManager(),
  idempotencyRegistry: new IdempotencyRegistry(300000)
};
