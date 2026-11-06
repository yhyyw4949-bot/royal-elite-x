# ROYAL ELITE X (REX) — Official Sovereign Whitepaper 2026
**Ecosystem Architecture, Jetton Tokenomics & Proof-of-Engagement Protocol**
*Native Token on TON (The Open Network) Blockchain*

---

## 1. Executive Summary & Vision

**ROYAL ELITE X (REX)** is a next-generation decentralized Web3 cloud-mining ecosystem built natively on the **TON Blockchain** and deeply integrated into Telegram. Designed with a luxury sovereign aesthetic, REX merges social Web3 gaming with real on-chain decentralized finance (DeFi), automated market-making (AMM) liquidity on **STON.fi DEX**, and an ACID-compliant double-entry financial ledger.

The project addresses the fatal flaws of prior tap-to-earn tokens: hyperinflation, sybil bot abuse, liquidity draining, and lack of holding utility. By introducing a mandatory **On-Chain 5,000 REX 3-Day Holding Verification**, **Platform Anti-Sybil Defense Fee (0.1 TON)**, and an immutable 50,000,000 max supply, REX creates permanent organic demand, continuous liquidity expansion, and verifiable scarcity.

---

## 2. On-Chain Smart Contract Specifications

| Specification | Technical Detail |
| :--- | :--- |
| **Token Name** | ROYAL ELITE X |
| **Symbol** | **REX** |
| **Blockchain** | TON (The Open Network) Mainnet |
| **Standard** | TEP-74 Jetton Fungible Token Standard |
| **Total Fixed Supply** | **50,000,000 REX** (Immutable, Non-Mintable) |
| **Jetton Master Contract** | `EQCSsfG6xm-7g2-PQkvQWHAlMW3OXwsOdg2_VSAVlmBgr6GH` |
| **Official DEX Pair** | **REX / GRAM (STON.fi DEX v2)** |
| **STON.fi Pool Address** | `EQAkNyk6B1PgiEcBWkXG5d7C137Epx_iAQnB6ZCIVU7E4INR` |
| **Live Chart & Audit** | [DexScreener Live Candlestick Pair](https://dexscreener.com/ton/eqaknyk6b1pgiecbwkxg5d7c137epx_iaqnb6zcivu7e4inr) |
| **Primary Blockchain Explorer** | [Tonviewer REX Jetton Explorer](https://tonviewer.com/EQCSsfG6xm-7g2-PQkvQWHAlMW3OXwsOdg2_VSAVlmBgr6GH) |

---

## 3. Token Allocation & Sustainable Tokenomics

REX features a fixed, deflationary token model capped permanently at **50,000,000 REX**:

```
50,000,000 REX (100%)
├── 20,000,000 REX (40%) : Community Cloud Mining Reserve (Gradual Distribution)
├── 15,000,000 REX (30%) : Platform Treasury, Future CEX Listings & Liquidity Provision
├──  7,500,000 REX (15%) : Sovereign Staking Vaults & Guild Tournaments
├──  5,000,000 REX (10%) : Ambassador Knights & Ecosystem Referrals
└──  2,500,000 REX ( 5%) : Core Development, Security Audits & Infrastructure
```

### Emission & Deflation Controls:
- **Maximum Daily Emission Cap:** 50,000 REX across the entire global user base.
- **Dynamic Emission Halving:** Mining yields adjust algorithmically according to user rank level and global network participation.

---

## 4. The Sovereign Royal Gate (Anti-Sybil Defense)

To ensure that 100% of platform participants are genuine human Web3 users and to permanently eradicate multi-account automated sybil farming:
1. **Mandatory Non-Custodial TON Wallet Connection:** Users must link an official external TON wallet (Tonkeeper, MyTonWallet, OpenMask, or Telegram Wallet).
2. **0.1 TON Verification Fee:** A nominal anti-sybil entry fee sent directly on-chain. This nominal barrier completely deters bot farms from spawning thousands of fake accounts.
3. **Hardware & Fingerprint Radar:** Multi-account detection using client-side cryptographic device fingerprinting.

---

## 5. Sovereign Holding Tiers & The STON.fi Flywheel (نظام مستويات الحيازة ومضاعف التعدين)

Unlike inflationary projects where users dump mined tokens instantly, ROYAL ELITE X aligns token holding with accelerated mining power, creating an unstoppable buy-and-hold flywheel:

### 5.1 The 6 Sovereign Holding Boost Tiers (جدول المستويات الملكية)

| Tier Level | Sovereign Rank (الرتبة) | Required On-Chain REX | Multiplier | Daily Reward | Hourly Reward | Key Ecosystem Benefit |
| :---: | :--- | :---: | :---: | :---: | :---: | :--- |
| **Tier 1** | 🥉 **المستكشف البرونزي (Bronze Explorer)** | $0 - 499\text{ REX}$ | **1.0x** | $100\text{ REX}$ | $4.16\text{ REX}$ | Standard base mining rate (Zero barrier) |
| **Tier 2** | 🥈 **الحارس الفضي (Silver Guardian)** | $500 - 1,999\text{ REX}$ | **2.0x** | $200\text{ REX}$ | $8.33\text{ REX}$ | Double daily output |
| **Tier 3** | 🥇 **الفارس الذهبي (Gold Knight)** | $2,000 - 4,999\text{ REX}$ | **4.0x** | $400\text{ REX}$ | $16.66\text{ REX}$ | $4\times$ mining output boost |
| **Tier 4** | 💠 **البارون البلاتيني (Platinum Baron)** | $5,000 - 14,999\text{ REX}$ | **7.0x** | $700\text{ REX}$ | $29.16\text{ REX}$ | **Unlocks 72h withdrawal eligibility** |
| **Tier 5** | 💎 **الدوق الماسي VIP (Diamond Duke)** | $15,000 - 49,999\text{ REX}$ | **15.0x** | $1,500\text{ REX}$ | $62.50\text{ REX}$ | Elite VIP mining status |
| **Tier 6** | 👑 **الإمبراطور الملكي (Crown Sovereign)** | $50,000+\text{ REX}$ | **25.0x** | $2,500\text{ REX}$ | $104.16\text{ REX}$ | **Maximum apex multiplier in ecosystem** |

### 5.2 The 5,000 REX 3-Day Holding Rule (شرط فك قفل السحب)
1. **Holding Threshold:** The user must hold at least **5,000 REX** (Tier 4) in their connected external TON wallet.
2. **Time Duration:** The tokens must be held for **3 consecutive days (72 continuous hours)** without selling or transferring.
3. **Live Ticking Countdown:** A real-time countdown timer and progress bar (0% to 100%) ticks live inside the Telegram Mini App withdrawal terminal.
4. **Instant Reset on Sell:** The backend server continuously inspects the user's on-chain Jetton wallet balance. If the user sells or drops below 5,000 REX, the timer **immediately resets to zero (0%)**, requiring a fresh 3-day holding period.
5. **Economic Flywheel:** Because thousands of miners purchase and hold REX tokens on STON.fi DEX to increase their mining multiplier and unlock withdrawals, persistent buy pressure is channeled directly into the liquidity pool, driving prices upwards and rewarding long-term holders.

---

## 6. Multi-Stage Withdrawal Workflow & 24h Settlement Guarantee

To protect platform solvency and conduct security screening:
1. **Atomic Ledger Balance Reservation:** When a user submits a withdrawal, the amount is reserved instantly in an ACID double-entry ledger, preventing double-spending.
2. **Multi-Stage Workflow:** `pending` $\rightarrow$ `reviewing` $\rightarrow$ `approved` $\rightarrow$ `processing` $\rightarrow$ `confirmed`.
3. **Manual Sovereign Approval:** Platform administrators manually inspect transactions in the Enterprise Command Center (`/admin/`).
4. **24-Hour Settlement Notification:** Upon administrative approval, the user receives an instant Telegram Bot notification confirming delivery within 24 hours.
5. **Public Proof of Rewards:** Confirmed transactions are recorded on the public TON blockchain and broadcast live in the platform feed with direct clickable links to **Tonviewer**.

---

## 7. Platform Core Modules

### ⛏️ 24h Royal Cloud Mining
A 24-hour cycle where users accrue REX second-by-second. The cycle requires user re-activation every 24 hours (Proof-of-Engagement), preventing dead accounts from accruing rewards.

### 📜 Repeatable Royal Quests
Five recurring Web3 missions:
- Daily Sovereign Check-in (+50 REX / 24h)
- Mystery Royal Chest (+20-60 REX / 4h)
- Cloud Energy Turbo (+35 REX / 6h)
- Sovereign Social Share (+75 REX / 12h)
- Royal Elite Community Engagement (+30 REX / 8h)

### 🏛️ Royal Vaults (Staking)
Time-locked staking vaults (30, 90, 180, and 365 days) offering high-yield multipliers from 1.25x up to 3.0x on base daily rewards.

### 🛡️ Royal Guilds
Community syndicates where knights pool mining power, unlock collective bonuses, and wage weekly yield tournaments.

### 🎓 REX Academy
Interactive Web3 educational lessons covering TON architecture, Jettons (TEP-74), seed phrase security, blockchain explorers, and DeFi tokenomics, with instant rewarded quizzes.

### 👥 Knights Ambassador Program
A two-tier viral referral architecture:
- **Instant Bounty:** 50 REX credited on friend activation.
- **Lifetime Sovereign Commission:** 5% of all friend mining claims for life.

---

## 8. Security Architecture & Enterprise Ledger

- **HMAC-SHA256 InitData Authentication:** Server-verified cryptographic signatures for all Telegram WebApp communication.
- **Double-Entry Financial Ledger:** Every reward, claim, reserve, and payout is logged as balanced credit/debit entries with unique idempotency keys.
- **Anti-Sybil IP & Device Correlation:** Automatic flags for duplicate fingerprints or clustered IP ranges.
- **Zero-Custody Guarantee:** ROYAL ELITE X never requests, receives, or stores private keys or 24-word recovery seed phrases.

---

## 9. Official Links & Community Verification

- **Telegram Bot:** [@Royalelitexbot](https://t.me/Royalelitexbot)
- **STON.fi Swap Pair:** [Trade REX on STON.fi](https://app.ston.fi/swap?chartVisible=true&ft=EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c&tt=EQCSsfG6xm-7g2-PQkvQWHAlMW3OXwsOdg2_VSAVlmBgr6GH)
- **DexScreener Chart:** [Live Candlestick & Volume](https://dexscreener.com/ton/eqaknyk6b1pgiecbwkxg5d7c137epx_iaqnb6zcivu7e4inr)
- **Tonviewer Smart Contract:** [EQCSsfG6xm-7g2-PQkvQWHAlMW3OXwsOdg2_VSAVlmBgr6GH](https://tonviewer.com/EQCSsfG6xm-7g2-PQkvQWHAlMW3OXwsOdg2_VSAVlmBgr6GH)

---
*© 2026 ROYAL ELITE X Foundation. All rights reserved. Sovereign Web3 Infrastructure on TON Blockchain.*
