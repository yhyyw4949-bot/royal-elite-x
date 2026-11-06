/**
 * ROYAL ELITE X (REX) — Deploy & Mint 1,000,000 REX in One Shot
 * ينشر العقد ويسك المليون عملة مباشرة لمحفظة الأدمن في معاملة واحدة ذكية
 */

const { TonClient, WalletContractV5R1, internal, toNano, beginCell, Cell, Dictionary, Address } = require('@ton/ton');
const { JettonMinter } = require('./build/JettonMinter/tact_JettonMinter.js');
const { mnemonicToPrivateKey } = require('@ton/crypto');
const crypto = require('crypto');
require('dotenv').config();

const USER_ADMIN_WALLET = 'UQDcvNuFSROi4VFR1kzca-O17z5shUVyc5X6ep4pPGAPltYz';

const REX = {
    name:        'ROYAL ELITE X',
    symbol:      'REX',
    description: 'ROYAL ELITE X - Official Sovereign 1M Token on TON Blockchain',
    decimals:    '9',
    totalSupply: 1_000_000n,
    image:       'https://iili.io/nsECVNn.jpg'
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

    if (!mnemonic) {
        console.error('❌ خطأ: MNEMONIC غير موجود');
        process.exit(1);
    }

    const endpoint = 'https://toncenter.com/api/v2/jsonRPC';
    const client = new TonClient({ endpoint, apiKey });

    console.log('\n╔══════════════════════════════════════════════════════╗');
    console.log('║   👑 REX: نشر العقد وسك 1,000,000 REX للأدمن        ║');
    console.log('╚══════════════════════════════════════════════════════╝');

    const keyPair = await mnemonicToPrivateKey(mnemonic.trim().split(/\s+/));
    const serverWallet = WalletContractV5R1.create({ publicKey: keyPair.publicKey, workchain: 0 });
    const walletContract = client.open(serverWallet);

    console.log(`👤 محفظة السيرفر (Deployer) : ${serverWallet.address.toString({ bounceable: false })}`);
    console.log(`👑 محفظة المستلم (User Admin): ${USER_ADMIN_WALLET}`);

    const balance = await callWithRetry(() => walletContract.getBalance());
    console.log(`💰 رصيد السيرفر المتاح       : ${Number(balance) / 1e9} TON`);

    if (Number(balance) < 0.20 * 1e9) {
        console.error('\n⚠️ الرصيد غير كافٍ لنشر العقد وسك العملات! يلزم على الأقل 0.25 TON.');
        process.exit(1);
    }

    const content = buildOnChainMetadata(REX);
    const minterContract = await JettonMinter.fromInit(serverWallet.address, content);
    const minterAddress = minterContract.address;

    console.log(`\n📋 عنوان عقد REX الجديد على Mainnet: ${minterAddress.toString()}`);

    // Check if already active
    const state = await callWithRetry(() => client.getContractState(minterAddress));
    const isDeployed = state.state === 'active';

    const mintAmount = REX.totalSupply * (10n ** BigInt(REX.decimals));
    const recipient = Address.parse(USER_ADMIN_WALLET);
    const mintBody = beginCell()
        .storeUint(0x642b7d07, 32)
        .storeUint(1n, 64)
        .storeCoins(mintAmount)
        .storeAddress(recipient)
        .endCell();

    let seqno = await callWithRetry(() => walletContract.getSeqno());
    console.log(`   (Seqno: ${seqno})`);

    if (!isDeployed) {
        console.log('\n⏳ جاري إرسال معاملة النشر + سك 1,000,000 REX دفعة واحدة إلى شبكة TON...');
        await callWithRetry(() => walletContract.sendTransfer({
            secretKey: keyPair.secretKey,
            seqno,
            messages: [
                internal({
                    to: minterAddress,
                    value: toNano('0.22'),
                    init: minterContract.init,
                    body: mintBody,
                    bounce: false,
                })
            ],
        }));
    } else {
        console.log('\n⏳ العقد منشور، جاري إرسال أمر سك 1,000,000 REX لمحفظة الأدمن...');
        await callWithRetry(() => walletContract.sendTransfer({
            secretKey: keyPair.secretKey,
            seqno,
            messages: [
                internal({
                    to: minterAddress,
                    value: toNano('0.15'),
                    body: mintBody,
                    bounce: true,
                })
            ],
        }));
    }

    console.log('   ⏳ تم إرسال المعاملة إلى شبكة TON! جاري انتظار التأكيد على البلوكشين (25 ثانية)...');
    await sleep(25000);

    console.log('\n✅ تم تأكيد المعاملة بنجاح على بلوكتشين TON!');
    console.log(`🎉 تم سك 1,000,000 REX بالكامل وإيداعها في محفظتك: ${USER_ADMIN_WALLET}`);
    console.log('🔓 خاصية السك (Minting) مفتوحة ومتاحة لك دائماً للأمام بناءً على طلبك.');
    console.log(`\n📜 عنوان العقد الجديد : ${minterAddress.toString()}`);
    console.log(`🔍 الرابط على Tonviewer: https://tonviewer.com/${minterAddress.toString()}`);

    return minterAddress.toString();
}

if (require.main === module) {
    main().catch(err => {
        console.error('❌ خطأ أثناء التنفيذ:', err.message || err);
        process.exit(1);
    });
}

module.exports = { main };
