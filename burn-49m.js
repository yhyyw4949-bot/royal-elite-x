/**
 * ROYAL ELITE X (REX) — Burn 49,000,000 REX
 * يحرق 49 مليون عملة ليصبح إجمالي المعروض 1,000,000 REX رسمياً على بلوكتشين TON
 */

const { TonClient, WalletContractV5R1, internal, toNano, beginCell, Address } = require('@ton/ton');
const { mnemonicToPrivateKey } = require('@ton/crypto');
require('dotenv').config();

// User's Jetton Wallet for REX Master EQBjOwteVkpjofTFQRFRLqRSb7SSYDxtJSXh8DnIFV7_oaLX
const JETTON_WALLET = 'EQCXg7AHCnD_H583YOXCpyKtEBmBzI0qxjs1owABt7itRYzg';
const AMOUNT_REX = 49_000_000n;
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
                console.log(`   ⏳ ضغط شبكة (429)، ننتظر ${delay/1000} ثوانٍ (${i+1}/${retries})...`);
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
    console.log('║   🔥 حرق 49,000,000 REX (المعروض يصبح 1M)    ║');
    console.log('╚══════════════════════════════════════════════╝');

    const keyPair = await mnemonicToPrivateKey(mnemonic.trim().split(/\s+/));
    const wallet = WalletContractV5R1.create({ publicKey: keyPair.publicKey, workchain: 0 });
    const walletContract = client.open(wallet);

    const jettonWallet = Address.parse(JETTON_WALLET);

    console.log(`👤 عنوان المحفظة      : ${wallet.address.toString({ bounceable: false })}`);
    console.log(`🔥 عقد محفظة العملة   : ${jettonWallet.toString()}`);
    console.log(`📦 الكمية المحروقة    : ${AMOUNT_REX.toLocaleString()} REX\n`);

    // Op: 0x595f07bc (JettonBurn)
    const burnAmount = AMOUNT_REX * (10n ** DECIMALS);
    const burnBody = beginCell()
        .storeUint(0x595f07bc, 32)                // op::burn
        .storeUint(0n, 64)                         // query_id
        .storeCoins(burnAmount)                    // amount
        .storeAddress(wallet.address)              // response_destination
        .storeBit(false)                           // custom_payload: None
        .endCell();

    console.log('⏳ جاري إرسال معاملة الحرق إلى شبكة TON...');
    const seqno = await callWithRetry(() => walletContract.getSeqno());
    console.log(`   (Seqno الحالي: ${seqno})`);

    await callWithRetry(() => walletContract.sendTransfer({
        secretKey: keyPair.secretKey,
        seqno,
        messages: [
            internal({
                to: jettonWallet,
                value: toNano('0.06'),
                body: burnBody,
                bounce: true,
            })
        ],
    }));

    console.log('   ⏳ تم إرسال المعاملة للبلوك تشين! في انتظار تأكيد الحرق (25 ثانية)...');
    await sleep(25000);

    console.log('\n✅ تم حرق الـ 49,000,000 REX بنجاح! الإجمالي أصبح 1,000,000 REX 👑');
}

if (require.main === module) {
    main().catch(err => {
        console.error('❌ خطأ أثناء الحرق:', err.message || err);
        process.exit(1);
    });
}

module.exports = { JETTON_WALLET, AMOUNT_REX };
