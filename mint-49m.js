/**
 * ROYAL ELITE X (REX) — Mint 49,000,000 REX
 * يسك 49 مليون عملة إضافية لتصبح المحفظة وإجمالي المعروض = 50,000,000 REX
 */

const { TonClient, WalletContractV5R1, internal, toNano, beginCell, Address } = require('@ton/ton');
const { mnemonicToPrivateKey } = require('@ton/crypto');
require('dotenv').config();

const MASTER_CONTRACT = 'EQA3JasdR7Goynco42eBBxAh2LnwK46Nmr48DvC16Xr5NWjt';
const AMOUNT_TO_MINT = 49_000_000n; // 49 مليون REX
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
    console.log('║   👑 سك 49 مليون عملة REX (المجموع = 50M)   ║');
    console.log('╚══════════════════════════════════════════════╝');

    const keyPair = await mnemonicToPrivateKey(mnemonic.trim().split(/\s+/));
    const wallet = WalletContractV5R1.create({ publicKey: keyPair.publicKey, workchain: 0 });
    const walletContract = client.open(wallet);

    const masterAddress = Address.parse(MASTER_CONTRACT);

    console.log(`👤 عنوان محفظتك       : ${wallet.address.toString({ bounceable: false })}`);
    console.log(`📋 عقد الماستر باللوجو : ${masterAddress.toString()}`);
    console.log(`📦 الكمية المسكوكة    : ${AMOUNT_TO_MINT.toLocaleString()} REX\n`);

    // Op: 0x642b7d07 (Mint)
    const mintAmount = AMOUNT_TO_MINT * (10n ** DECIMALS);
    const mintBody = beginCell()
        .storeUint(0x642b7d07, 32)
        .storeUint(2n, 64)
        .storeCoins(mintAmount)
        .storeAddress(wallet.address)
        .endCell();

    console.log('⏳ جاري إرسال معاملة السك على TON Mainnet...');
    const seqno = await callWithRetry(() => walletContract.getSeqno());
    console.log(`   (Seqno الحالي: ${seqno})`);

    await callWithRetry(() => walletContract.sendTransfer({
        secretKey: keyPair.secretKey,
        seqno,
        messages: [
            internal({
                to: masterAddress,
                value: toNano('0.15'),
                body: mintBody,
                bounce: true,
            })
        ],
    }));

    console.log('   ⏳ تم إرسال المعاملة للبلوك تشين! انتظار التأكيد (25 ثانية)...');
    await sleep(25000);

    console.log('\n✅ تم سك 49,000,000 REX بنجاح! الإجمالي أصبح 50,000,000 REX 👑');
}

main().catch(err => {
    console.error('❌ خطأ أثناء السك:', err.message || err);
    process.exit(1);
});
