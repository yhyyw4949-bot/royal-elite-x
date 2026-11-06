/**
 * سكريبت تحويل عملات ROYAL ELITE X (REX)
 * من محفظتك الحالية إلى المحفظة المستلمة الجديدة
 */

const { TonClient, WalletContractV5R1, internal, toNano, beginCell, Address } = require('@ton/ton');
const { mnemonicToPrivateKey } = require('@ton/crypto');
require('dotenv').config();

const RECIPIENT_ADDRESS = '0QA8_ydABkqt7TsCbwirntDX9j-m1ueHTT9ay9V7C68EQuVS';
const USER_JETTON_WALLET = 'EQAaC6pCfsFGu90iGDOiDeXBW7s2ZL1tajjtmYiI6X-eopV3';
const AMOUNT_REX = 1_000_000n; // 1,000,000 REX
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

    const endpoint = 'https://testnet.toncenter.com/api/v2/jsonRPC';
    const client = new TonClient({ endpoint, apiKey });

    console.log('\n╔══════════════════════════════════════════════╗');
    console.log('║        🔄 تحويل عملات ROYAL ELITE X          ║');
    console.log('╚══════════════════════════════════════════════╝');

    const keyPair = await mnemonicToPrivateKey(mnemonic.trim().split(/\s+/));
    const senderWallet = WalletContractV5R1.create({ publicKey: keyPair.publicKey, workchain: 0 });
    const senderContract = client.open(senderWallet);

    const recipient = Address.parse(RECIPIENT_ADDRESS);
    const jettonWallet = Address.parse(USER_JETTON_WALLET);

    console.log(`📤 من محفظتك       : ${senderWallet.address.toString({ bounceable: false })}`);
    console.log(`📥 إلى المحفظة      : ${recipient.toString({ bounceable: false })}`);
    console.log(`💰 كمية التحويل    : ${AMOUNT_REX.toLocaleString()} REX\n`);

    // إعداد رسالة تحويل الـ Jetton (TEP-74 Standard Transfer Message)
    // Op: 0x0f8a7ea5 (JettonTransfer)
    const jettonAmount = AMOUNT_REX * (10n ** DECIMALS);
    const forwardPayload = beginCell().storeUint(0, 32).storeStringTail('Transfer REX').endCell();

    const transferBody = beginCell()
        .storeUint(0x0f8a7ea5, 32)                // op::transfer
        .storeUint(0n, 64)                         // query_id
        .storeCoins(jettonAmount)                  // amount
        .storeAddress(recipient)                   // destination
        .storeAddress(senderWallet.address)        // response_destination
        .storeBit(false)                           // custom_payload: None
        .storeCoins(toNano('0.05'))                // forward_ton_amount (لإشعار المحفظة المستلمة)
        .storeSlice(forwardPayload.asSlice())      // forward_payload
        .endCell();

    console.log('⏳ جاري إرسال معاملة التحويل...');
    const seqno = await callWithRetry(() => senderContract.getSeqno());
    console.log(`   (Seqno الحالي: ${seqno})`);

    await callWithRetry(() => senderContract.sendTransfer({
        secretKey: keyPair.secretKey,
        seqno,
        messages: [
            internal({
                to: jettonWallet,
                value: toNano('0.1'), // رسوم الغاز والـ Forward
                body: transferBody,
                bounce: true,
            })
        ],
    }));

    console.log('   ⏳ تم إرسال المعاملة للبلوك تشين! في انتظار التأكيد (25 ثانية)...');
    await sleep(25000);

    console.log('\n✅ تم التحويل بنجاح!');
    console.log(`🔍 تتبع المعاملة على المستكشف:`);
    console.log(`   https://testnet.tonviewer.com/${recipient.toString({ bounceable: false })}\n`);
}

main().catch(err => {
    console.error('❌ خطأ أثناء التحويل:', err.message || err);
    process.exit(1);
});
