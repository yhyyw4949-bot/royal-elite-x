/**
 * ROYAL ELITE X (REX) — Automated On-Chain Payout Engine
 * TEP-74 Jetton Transfer Broadcaster on TON Blockchain
 */

const nodeCrypto = require('crypto');
const { TonClient, WalletContractV4, WalletContractV5R1, internal, toNano, beginCell, Address } = require('@ton/ton');
const { mnemonicToPrivateKey, deriveEd25519Path, keyPairFromSeed } = require('@ton/crypto');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function callWithRetry(fn, retries = 3, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if ((err.message && err.message.includes('429')) || i === retries - 1) {
        if (i === retries - 1) throw err;
        await sleep(delay);
      } else {
        throw err;
      }
    }
  }
}

async function getSenderJettonWallet(client, masterAddress, senderAddress) {
  const master = Address.parse(masterAddress);
  const owner = Address.parse(senderAddress);
  const cell = beginCell().storeAddress(owner).endCell();
  const res = await callWithRetry(() => client.runMethod(master, 'get_wallet_address', [{ type: 'slice', cell }]));
  return res.stack.readAddress();
}

/**
 * Universal Key Deriver:
 * - Supports Tonkeeper 12-word BIP-39 HD path (m/44'/607'/0')
 * - Matches ADMIN_WALLET automatically if configured
 * - Falls back to TON legacy 24-word PBKDF2 derivation
 */
async function getWalletKeyPair(mnemonic) {
  const wordsArr = Array.isArray(mnemonic) ? mnemonic : mnemonic.trim().split(/\s+/);
  const adminWallet = (process.env.ADMIN_WALLET || '').trim();

  // 1. Try Tonkeeper BIP-39 path (m/44'/607'/0')
  try {
    const mnemonicStr = wordsArr.join(' ').trim();
    const seed = nodeCrypto.pbkdf2Sync(mnemonicStr, 'mnemonic', 2048, 64, 'sha512');
    const derivedKey = await deriveEd25519Path(seed, [44, 607, 0]);
    const kpBip39 = keyPairFromSeed(derivedKey);

    if (adminWallet) {
      const w5 = WalletContractV5R1.create({ publicKey: kpBip39.publicKey, workchain: 0 });
      const w4 = WalletContractV4.create({ publicKey: kpBip39.publicKey, workchain: 0 });
      if (adminWallet === w5.address.toString({ bounceable: false }) || adminWallet === w5.address.toString({ bounceable: true }) ||
          adminWallet === w4.address.toString({ bounceable: false }) || adminWallet === w4.address.toString({ bounceable: true })) {
        return kpBip39;
      }
    }

    if (wordsArr.length === 12) {
      return kpBip39;
    }
  } catch(e) {
    console.error('BIP-39 derivation check error:', e.message);
  }

  // 2. Legacy TON 24-word derivation
  return await mnemonicToPrivateKey(wordsArr);
}

/**
 * Resolves whether to use WalletContractV4 (v4R2) or WalletContractV5R1 (W5).
 * - Honors PAYOUT_WALLET_VERSION ('v4', 'v4r2', 'v5', 'w5') if configured in .env
 * - Matches ADMIN_WALLET if it corresponds to v4 or v5
 * - Auto-detects on-chain balance (prefers the one with active TON)
 * - Defaults to v4R2 (standard mobile wallet default in Tonkeeper & Telegram Wallet)
 */
async function resolveWalletContract(client, keyPair, requestedVersion = null) {
  const req = (requestedVersion || process.env.PAYOUT_WALLET_VERSION || '').toLowerCase().trim();
  const w4 = WalletContractV4.create({ publicKey: keyPair.publicKey, workchain: 0 });
  const w5 = WalletContractV5R1.create({ publicKey: keyPair.publicKey, workchain: 0 });

  if (req === 'v4' || req === 'v4r2' || req === 'v4_r2') {
    return { wallet: w4, version: 'v4R2', w4, w5 };
  }
  if (req === 'v5' || req === 'v5r1' || req === 'w5') {
    return { wallet: w5, version: 'W5', w4, w5 };
  }

  // 1. Check if ADMIN_WALLET matches v4 or v5
  const adminWallet = (process.env.ADMIN_WALLET || '').trim();
  if (adminWallet) {
    if (adminWallet === w4.address.toString({ bounceable: false }) || adminWallet === w4.address.toString({ bounceable: true })) {
      return { wallet: w4, version: 'v4R2', w4, w5 };
    }
    if (adminWallet === w5.address.toString({ bounceable: false }) || adminWallet === w5.address.toString({ bounceable: true })) {
      return { wallet: w5, version: 'W5', w4, w5 };
    }
  }

  // 2. On-chain balance detection (check which wallet is funded)
  if (client) {
    try {
      const c4 = client.open(w4);
      const b4 = await callWithRetry(() => c4.getBalance(), 2, 800);
      if (Number(b4) > 0) {
        return { wallet: w4, version: 'v4R2', w4, w5 };
      }
    } catch (_) {}

    try {
      const c5 = client.open(w5);
      const b5 = await callWithRetry(() => c5.getBalance(), 2, 800);
      if (Number(b5) > 0) {
        return { wallet: w5, version: 'W5', w4, w5 };
      }
    } catch (_) {}
  }

  // 3. Mobile standard default (Tonkeeper / MyTonWallet / @wallet) is v4R2
  return { wallet: w4, version: 'v4R2', w4, w5 };
}

async function getBotWalletInfo() {
  const mnemonic = process.env.PAYOUT_MNEMONIC || process.env.MNEMONIC;
  if (!mnemonic || !mnemonic.trim()) {
    return {
      configured: false,
      error: 'لم يتم العثور على الكلمات المفتاحية (MNEMONIC) لمحفظة البوت في ملف البيئة (.env)'
    };
  }

  try {
    const endpoint = process.env.TONCENTER_ENDPOINT || 'https://toncenter.com/api/v2/jsonRPC';
    const apiKey = process.env.TON_API_KEY || undefined;
    const client = new TonClient({ endpoint, apiKey });

    const keyPair = await getWalletKeyPair(mnemonic);
    const { wallet, version, w4, w5 } = await resolveWalletContract(client, keyPair);
    const walletContract = client.open(wallet);

    let tonBalance = 0;
    try {
      const b = await callWithRetry(() => walletContract.getBalance());
      tonBalance = Number(b) / 1e9;
    } catch (e) {
      console.error('Error fetching TON balance:', e.message);
    }

    let rexBalance = 0;
    let senderJwStr = null;
    let masterStr = process.env.REX_MASTER_CONTRACT;
    if (!masterStr || masterStr.includes('EQCSsfG6xm') || masterStr.length < 20) {
      masterStr = 'EQBSYVo_WE0fAlAWUSec1o42x1LiYKNFOCoaxb8Dz_vsU_53';
    }

    try {
      const jw = await getSenderJettonWallet(client, masterStr, wallet.address.toString());
      senderJwStr = jw.toString({ bounceable: true });
      const res = await callWithRetry(() => client.runMethod(jw, 'get_wallet_data'));
      const rawBalance = res.stack.readBigNumber();
      rexBalance = Number(rawBalance / 1000000000n);
    } catch (e) {
      console.error('Error fetching REX balance via Toncenter:', e.message);
      // Fallback via TonAPI
      try {
        const https = require('https');
        const apiRes = await new Promise((resolve) => {
          https.get(`https://tonapi.io/v2/accounts/${wallet.address.toString()}/jettons`, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
              try { resolve(JSON.parse(data)); } catch (_) { resolve(null); }
            });
          }).on('error', () => resolve(null));
        });
        if (apiRes && apiRes.balances) {
          const target = Address.parse(masterStr).toRawString();
          const found = apiRes.balances.find(b => {
            try {
              return Address.parse(b.jetton.address).toRawString() === target;
            } catch (_) { return false; }
          });
          if (found) {
            rexBalance = Number(BigInt(found.balance) / 1000000000n);
            if (found.wallet_address) {
              senderJwStr = found.wallet_address.address;
            }
          }
        }
      } catch (err2) {
        console.error('Error in TonAPI fallback:', err2.message);
      }
    }

    return {
      configured: true,
      version,
      address: wallet.address.toString({ bounceable: false }),
      address_bounceable: wallet.address.toString({ bounceable: true }),
      address_v4: w4.address.toString({ bounceable: false }),
      address_v5: w5.address.toString({ bounceable: false }),
      jetton_wallet: senderJwStr,
      ton_balance: tonBalance,
      rex_balance: rexBalance,
      has_gas: tonBalance >= 0.1
    };
  } catch (err) {
    return {
      configured: false,
      error: err.message
    };
  }
}

async function sendOnChainRexPayout({ recipientAddress, amountRex, memo = 'REX Withdrawal Payout 👑' }) {
  const mnemonic = process.env.PAYOUT_MNEMONIC || process.env.MNEMONIC;
  if (!mnemonic || !mnemonic.trim()) {
    throw new Error('لم يتم العثور على الكلمات المفتاحية (MNEMONIC) لمحفظة البوت في إعدادات السيرفر.');
  }

  const endpoint = process.env.TONCENTER_ENDPOINT || 'https://toncenter.com/api/v2/jsonRPC';
  const apiKey = process.env.TON_API_KEY || undefined;
  const client = new TonClient({ endpoint, apiKey });

  const keyPair = await getWalletKeyPair(mnemonic);
  const { wallet: senderWallet, version } = await resolveWalletContract(client, keyPair);
  const senderContract = client.open(senderWallet);

  // 1. Check TON balance for gas
  const tonBalance = await callWithRetry(() => senderContract.getBalance());
  const minGas = toNano('0.09');
  if (tonBalance < minGas) {
    throw new Error(`رصيد TON في محفظة البوت (${(Number(tonBalance)/1e9).toFixed(3)} TON) غير كافٍ لدفع رسوم الغاز (يلزم 0.1 TON على الأقل).`);
  }

  // 2. Resolve Master Contract & Sender Jetton Wallet
  let masterContractStr = process.env.REX_MASTER_CONTRACT;
  if (!masterContractStr || masterContractStr.includes('EQCSsfG6xm') || masterContractStr.length < 20) {
    masterContractStr = 'EQBSYVo_WE0fAlAWUSec1o42x1LiYKNFOCoaxb8Dz_vsU_53';
  }
  const senderJettonWallet = await getSenderJettonWallet(client, masterContractStr, senderWallet.address.toString());

  // Check REX balance
  try {
    const jwData = await callWithRetry(() => client.runMethod(senderJettonWallet, 'get_wallet_data'));
    const currentRexRaw = jwData.stack.readBigNumber();
    const currentRex = Number(currentRexRaw / 1000000000n);
    if (currentRex < amountRex) {
      throw new Error(`رصيد REX في محفظة البوت (${currentRex.toLocaleString()} REX) غير كافٍ لصرف هذا السحب (${amountRex.toLocaleString()} REX).`);
    }
  } catch (e) {
    if (e.message.includes('غير كافٍ')) throw e;
    console.warn('Could not verify sender REX balance prior to transfer, proceeding:', e.message);
  }

  // 3. Prepare Recipient Address
  const recipient = Address.parse(recipientAddress);

  // 4. Build TEP-74 Jetton Transfer Payload
  const DECIMALS = 9n;
  const jettonAmount = BigInt(Math.floor(amountRex)) * (10n ** DECIMALS);
  const forwardPayload = beginCell().storeUint(0, 32).storeStringTail(memo).endCell();

  const transferBody = beginCell()
    .storeUint(0x0f8a7ea5, 32)                // op::transfer (TEP-74)
    .storeUint(BigInt(Date.now()), 64)         // query_id
    .storeCoins(jettonAmount)                  // amount in nano-rex
    .storeAddress(recipient)                   // destination (user's wallet)
    .storeAddress(senderWallet.address)        // response_destination
    .storeBit(false)                           // custom_payload: None
    .storeCoins(toNano('0.05'))                // forward_ton_amount (to notify receiver)
    .storeSlice(forwardPayload.asSlice())      // forward_payload
    .endCell();

  // 5. Send Transfer
  const seqno = await callWithRetry(() => senderContract.getSeqno());
  await callWithRetry(() => senderContract.sendTransfer({
    secretKey: keyPair.secretKey,
    seqno,
    messages: [
      internal({
        to: senderJettonWallet,
        value: toNano('0.08'), // gas & forward fee
        body: transferBody,
        bounce: true,
      })
    ],
  }));

  const explorerUrl = `https://tonviewer.com/${recipient.toString({ bounceable: false })}`;
  return {
    success: true,
    sender: senderWallet.address.toString({ bounceable: false }),
    recipient: recipient.toString({ bounceable: false }),
    amountRex,
    seqno,
    explorerUrl
  };
}

module.exports = {
  getBotWalletInfo,
  sendOnChainRexPayout
};
