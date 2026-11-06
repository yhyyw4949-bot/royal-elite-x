/**
 * ROYAL ELITE X (REX) — Automated On-Chain Payout Engine
 * TEP-74 Jetton Transfer Broadcaster on TON Blockchain
 */

const { TonClient, WalletContractV5R1, internal, toNano, beginCell, Address } = require('@ton/ton');
const { mnemonicToPrivateKey } = require('@ton/crypto');

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

    const keyPair = await mnemonicToPrivateKey(mnemonic.trim().split(/\s+/));
    const wallet = WalletContractV5R1.create({ publicKey: keyPair.publicKey, workchain: 0 });
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
    try {
      const masterStr = process.env.REX_MASTER_CONTRACT || 'EQCSsfG6xm-7g2-PQkvQWHAlMW3OXwsOdg2_VSAVlmBgr6GH';
      const jw = await getSenderJettonWallet(client, masterStr, wallet.address.toString());
      senderJwStr = jw.toString({ bounceable: true });
      const res = await callWithRetry(() => client.runMethod(jw, 'get_wallet_data'));
      const rawBalance = res.stack.readBigNumber();
      rexBalance = Number(rawBalance / 1000000000n);
    } catch (e) {
      console.error('Error fetching REX balance:', e.message);
    }

    return {
      configured: true,
      address: wallet.address.toString({ bounceable: false }),
      address_bounceable: wallet.address.toString({ bounceable: true }),
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

  const keyPair = await mnemonicToPrivateKey(mnemonic.trim().split(/\s+/));
  const senderWallet = WalletContractV5R1.create({ publicKey: keyPair.publicKey, workchain: 0 });
  const senderContract = client.open(senderWallet);

  // 1. Check TON balance for gas
  const tonBalance = await callWithRetry(() => senderContract.getBalance());
  const minGas = toNano('0.09');
  if (tonBalance < minGas) {
    throw new Error(`رصيد TON في محفظة البوت (${(Number(tonBalance)/1e9).toFixed(3)} TON) غير كافٍ لدفع رسوم الغاز (يلزم 0.1 TON على الأقل).`);
  }

  // 2. Resolve Master Contract & Sender Jetton Wallet
  const masterContractStr = process.env.REX_MASTER_CONTRACT || 'EQCSsfG6xm-7g2-PQkvQWHAlMW3OXwsOdg2_VSAVlmBgr6GH';
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
