/**
 * ROYAL ELITE X (REX) — Mainnet Deployer with Logo Included On-Chain
 */

const { TonClient, WalletContractV5R1, internal, toNano, beginCell, Cell, Dictionary } = require('@ton/ton');
const { JettonMinter } = require('./build/JettonMinter/tact_JettonMinter.js');
const { mnemonicToPrivateKey } = require('@ton/crypto');
const crypto = require('crypto');
const fs     = require('fs');
require('dotenv').config();

const REX = {
    name:        'ROYAL ELITE X',
    symbol:      'REX',
    description: 'ROYAL ELITE X - The Premium Token on TON Blockchain',
    decimals:    '9',
    totalSupply: 1_000_000n,
    image:       'https://iili.io/nsECVNn.jpg' // رابط اللوجو الرسمي
};

function sha256(str) {
    return BigInt('0x' + crypto.createHash('sha256').update(str).digest('hex'));
}

function buildOnChainMetadata({ name, symbol, description, decimals, image }) {
    const dict = Dictionary.empty(
        Dictionary.Keys.BigUint(256),
        Dictionary.Values.Cell()
    );
    const encodeStr = (val) =>
        beginCell().storeUint(0, 8).storeStringTail(val).endCell();

    dict.set(sha256('name'),        encodeStr(name));
    dict.set(sha256('symbol'),      encodeStr(symbol));
    dict.set(sha256('description'), encodeStr(description));
    dict.set(sha256('decimals'),    encodeStr(decimals));
    dict.set(sha256('image'),       encodeStr(image));

    return beginCell().storeUint(0, 8).storeDict(dict).endCell();
}

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

    if (!mnemonic) {
        console.error('❌ خطأ: MNEMONIC غير موجود');
        process.exit(1);
    }

    const endpoint = 'https://toncenter.com/api/v2/jsonRPC';

    console.log('\n╔══════════════════════════════════════════════╗');
    console.log('║   👑 REX DEPLOYMENT WITH EMBEDDED LOGO       ║');
    console.log('╚══════════════════════════════════════════════╝');
    console.log(`🌐 الشبكة  : TON Mainnet 🔴`);
    console.log(`💎 العملة   : ${REX.name} (${REX.symbol})`);
    console.log(`🖼️ اللوجو   : ${REX.image}`);
    console.log(`📦 الكمية   : ${REX.totalSupply.toLocaleString()} ${REX.symbol}\n`);

    const client = new TonClient({ endpoint, apiKey });

    console.log('🔑 جاري إعداد محفظة Mainnet...');
    const keyPair = await mnemonicToPrivateKey(mnemonic.trim().split(/\s+/));
    const wallet = WalletContractV5R1.create({ publicKey: keyPair.publicKey, workchain: 0 });
    const walletContract = client.open(wallet);

    console.log(`👤 عنوان محفظتك : ${wallet.address.toString({ bounceable: false })}`);

    const balance = await callWithRetry(() => walletContract.getBalance());
    console.log(`💰 رصيدك المتاح : ${Number(balance) / 1e9} TON`);

    const content = buildOnChainMetadata(REX);

    const minterContract = await JettonMinter.fromInit(wallet.address, content);
    const minterAddress = minterContract.address;

    console.log(`\n📋 عنوان عقد REX الجديد مع اللوجو : ${minterAddress.toString()}`);

    const existing = await callWithRetry(() => client.getContractState(minterAddress));
    const isDeployed = existing.state === 'active';

    if (isDeployed) {
        console.log('\n⚠️ العقد منشور بالفعل! ننتقل للسك...');
    } else {
        console.log('\n⏳ [1/2] جاري نشر العقد متضمناً اللوجو On-Chain...');

        const seqno = await callWithRetry(() => walletContract.getSeqno());
        console.log(`   (Seqno الحالي: ${seqno})`);

        await callWithRetry(() => walletContract.sendTransfer({
            secretKey: keyPair.secretKey,
            seqno,
            messages: [
                internal({
                    to: minterAddress,
                    value: toNano('0.15'),
                    init: minterContract.init,
                    body: beginCell().endCell(),
                    bounce: false,
                })
            ],
        }));

        console.log('   ⏳ تم إرسال المعاملة! انتظار تأكيد البلوك تشين (25 ثانية)...');
        await sleep(25000);
        console.log('✅ [1/2] تم نشر العقد باللوجو المدمج بنجاح!');
    }

    // سك 1,000,000 REX
    console.log(`\n⏳ [2/2] جاري سك 1,000,000 ${REX.symbol} لمحفظتك...`);

    const mintAmount = REX.totalSupply * 10n ** BigInt(REX.decimals);
    const mintBody = beginCell()
        .storeUint(0x642b7d07, 32)
        .storeUint(1n, 64)
        .storeCoins(mintAmount)
        .storeAddress(wallet.address)
        .endCell();

    const seqno2 = await callWithRetry(() => walletContract.getSeqno());
    console.log(`   (Seqno للسك: ${seqno2})`);

    await callWithRetry(() => walletContract.sendTransfer({
        secretKey: keyPair.secretKey,
        seqno: seqno2,
        messages: [
            internal({
                to: minterAddress,
                value: toNano('0.15'),
                body: mintBody,
                bounce: true,
            })
        ],
    }));

    console.log('   ⏳ تم إرسال أمر السك! في انتظار تأكيد البلوك تشين (25 ثانية)...');
    await sleep(25000);
    console.log(`✅ [2/2] تم سك ${REX.totalSupply.toLocaleString()} ${REX.symbol} بنجاح!`);

    console.log('\n╔══════════════════════════════════════════════╗');
    console.log('║     👑 REX WITH LOGO IS LIVE ON MAINNET! 👑  ║');
    console.log('╠══════════════════════════════════════════════╣');
    console.log(`  📋 New Master Contract:`);
    console.log(`     ${minterAddress.toString()}`);
    console.log(`\n  🔍 مستكشف Mainnet:`);
    console.log(`     https://tonviewer.com/${minterAddress.toString()}`);
    console.log('╚══════════════════════════════════════════════╝\n');

    const info = {
        token: REX,
        network: 'mainnet',
        masterContract: minterAddress.toString(),
        owner: wallet.address.toString({ bounceable: false }),
        deployedAt: new Date().toISOString(),
        explorer: `https://tonviewer.com/${minterAddress.toString()}`,
    };
    fs.writeFileSync('rex-mainnet-logo-deployed.json', JSON.stringify(info, null, 2));
    console.log('💾 تم حفظ بيانات العقد الجديد باللوجو في: rex-mainnet-logo-deployed.json\n');
}

main().catch(err => {
    console.error('\n❌ خطأ أثناء النشر:', err.message || err);
    process.exit(1);
});
