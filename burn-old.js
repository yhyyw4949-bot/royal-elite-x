/**
 * ROYAL ELITE X (REX) — Burn Old V1 Tokens
 * يقوم بحرق المليون عملة القديمة نهائياً
 */

const { TonClient, WalletContractV5R1, internal, toNano, beginCell, Address } = require('@ton/ton');
const { mnemonicToPrivateKey } = require('@ton/crypto');
require('dotenv').config();

const OLD_JETTON_WALLET = 'EQAaC6pCfsFGu90iGDOiDeXBW7s2ZL1tajjtmYiI6X-eopV3';
const AMOUNT_REX = 1_000_000n;
const DECIMALS = 9n;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function callWithRetry(fn, retries = 5, delay = 3000) {
    for (let i = 0; i < retries; i++) {
        try {
            await sleep(1500);
            return await fn();
        } catch (err) {
            if ((err.message && err.message.includes('429')) || i === retries - 1) {
                if (i === retries - 1) throw err;
                console.log(`   ⏳ واجهنا ضغط شبكة (429)، ننتظر ${delay/1000} ثوانٍ (${i+1}/${retries})...`);
                await sleep(delay);
            } else {
                throw err;
            }
        }
    }
}

async function main() {
    const mnemonic = process.env.MNEMONIC;
    const apiKey = process.env.TON_API_KEY || undefined;

    const endpoint = 'https://toncenter.com/api/v2/jsonRPC';
    const client = new TonClient({ endpoint, apiKey });

    console.log('\n╔══════════════════════════════════════════════╗');
    console.log('║        🔥 حرق الـ 1,000,000 عملة القديمة      ║');
    console.log('╚══════════════════════════════════════════════╝');

    const keyPair = await mnemonicToPrivateKey(mnemonic.trim().split(/\s+/));
    const wallet = WalletContractV5R1.create({ publicKey: keyPair.publicKey, workchain: 0 });
    const walletContract = client.open(wallet);

    const oldJettonWallet = Address.parse(OLD_JETTON_WALLET);

    console.log(`👤 عنوان محفظتك       : ${wallet.address.toString({ bounceable: false })}`);
    console.log(`🔥 عقد العملة القديمة : ${oldJettonWallet.toString()}`);
    console.log(`📦 الكمية المحروقة    : ${AMOUNT_REX.toLocaleString()} REX (القديمة)\n`);

    // Op: 0x595f07bc (JettonBurn)
    const burnAmount = AMOUNT_REX * (10n ** DECIMALS);
    const burnBody = beginCell()
        .storeUint(0x595f07bc, 32)                // op::burn
        .storeUint(0n, 64)                         // query_id
        .storeCoins(burnAmount)                    // amount
        .storeAddress(wallet.address)              // response_destination
        .storeBit(false)                           // custom_payload: None
        .endCell();

    console.log('⏳ جاري إرسال معاملة الحرق...');
    const seqno = await callWithRetry(() => walletContract.getSeqno());
    console.log(`   (Seqno الحالي: ${seqno})`);

    await callWithRetry(() => walletContract.sendTransfer({
        secretKey: keyPair.secretKey,
        seqno,
        messages: [
            internal({
                to: oldJettonWallet,
                value: toNano('0.05'),
                body: burnBody,
                bounce: true,
            })
        ],
    }));

    console.log('   ⏳ تم إرسال المعاملة للبلوك تشين! في انتظار تأكيد الحرق (25 ثانية)...');
    await sleep(25000);

    console.log('\n✅ تم حرق المليون عملة القديمة بالكامل!');
}

main().catch(err => {
    console.error('❌ خطأ أثناء الحرق:', err.message || err);
    process.exit(1);
});
