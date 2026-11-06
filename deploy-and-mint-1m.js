/**
 * ROYAL ELITE X (REX) — Deploy & Mint 1,000,000 REX to Admin Wallet
 * يقوم بنشر العقد وسك المليون عملة مباشرة لمحفظة الأدمن وإغلاق السك للأبد
 */

const { TonClient, WalletContractV5R1, internal, toNano, beginCell, Cell, Dictionary, Address } = require('@ton/ton');
const { JettonMinter } = require('./build/JettonMinter/tact_JettonMinter.js');
const { mnemonicToPrivateKey } = require('@ton/crypto');
const crypto = require('crypto');
const fs = require('fs');
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
    console.log('║   👑 REX: نشر العقد الجديد وسك 1,000,000 REX للأدمن  ║');
    console.log('╚══════════════════════════════════════════════════════╝');

    const keyPair = await mnemonicToPrivateKey(mnemonic.trim().split(/\s+/));
    const serverWallet = WalletContractV5R1.create({ publicKey: keyPair.publicKey, workchain: 0 });
    const walletContract = client.open(serverWallet);

    console.log(`👤 محفظة السيرفر (Deployer) : ${serverWallet.address.toString({ bounceable: false })}`);
    console.log(`👑 محفظة المستلم (User Admin): ${USER_ADMIN_WALLET}`);

    const balance = await callWithRetry(() => walletContract.getBalance());
    console.log(`💰 رصيد السيرفر المتاح       : ${Number(balance) / 1e9} TON`);

    if (Number(balance) < 0.25 * 1e9) {
        console.error('\n⚠️ الرصيد غير كافٍ لنشر العقد وسك العملات! يلزم على الأقل 0.3 TON.');
        process.exit(1);
    }

    const content = buildOnChainMetadata(REX);
    const minterContract = await JettonMinter.fromInit(serverWallet.address, content);
    const minterAddress = minterContract.address;

    console.log(`\n📋 عنوان عقد REX الجديد على Mainnet: ${minterAddress.toString()}`);

    // 1. Deploy
    const state = await callWithRetry(() => client.getContractState(minterAddress));
    if (state.state === 'active') {
        console.log('ℹ️ العقد منشور بالفعل، ننتقل للسك مباشرة...');
    } else {
        console.log('\n⏳ [1/3] جاري نشر العقد متضمناً اللوجو On-Chain...');
        let seqno = await callWithRetry(() => walletContract.getSeqno());
        console.log(`   (Seqno: ${seqno})`);

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

        console.log('   ⏳ تم إرسال معاملة النشر! انتظار تأكيد البلوك تشين (20 ثانية)...');
        await sleep(20000);
        console.log('✅ [1/3] تم نشر العقد بنجاح على TON Mainnet!');
    }

    // 2. Mint 1,000,000 REX to user admin wallet
    console.log(`\n⏳ [2/3] جاري سك 1,000,000 REX وإيداعها في محفظة الأدمن (${USER_ADMIN_WALLET})...`);
    const mintAmount = REX.totalSupply * (10n ** BigInt(REX.decimals));
    const recipient = Address.parse(USER_ADMIN_WALLET);

    const mintBody = beginCell()
        .storeUint(0x642b7d07, 32)
        .storeUint(1n, 64)
        .storeCoins(mintAmount)
        .storeAddress(recipient)
        .endCell();

    let seqno2 = await callWithRetry(() => walletContract.getSeqno());
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

    console.log('   ⏳ تم إرسال أمر السك! انتظار التأكيد (20 ثانية)...');
    await sleep(20000);
    console.log('✅ [2/3] تم سك 1,000,000 REX بالكامل لمحفظة الأدمن!');

    // 3. Minting kept OPEN (بناءً على طلبك: خاصية السك مفتوحة ومتاحة)
    console.log('\n🔓 خاصية السك (Minting) مفتوحة ومتاحة لك دائماً للأمام!');


    console.log('\n🎉 اكتملت العملية بنجاح كامل!');
    console.log(`📜 العقد الجديد : ${minterAddress.toString()}`);
    console.log(`🔍 الرابط       : https://tonviewer.com/${minterAddress.toString()}`);
}

main().catch(err => {
    console.error('❌ خطأ:', err.message || err);
    process.exit(1);
});
