const { mnemonicToPrivateKey } = require('@ton/crypto');
const ton = require('@ton/ton');

async function main() {
    const words = 'suit photo trigger expand trouble term bird gravity garden outside high beauty series trouble symbol grace digital critic ready faint pizza giraffe fossil plug'.split(' ');
    const keyPair = await mnemonicToPrivateKey(words);

    const walletTypes = Object.keys(ton).filter(k => k.startsWith('Wallet'));
    console.log('الأنواع المتاحة:', walletTypes.join(', '));
    console.log('\n=== جميع عناوين المحفظة ===');
    console.log('محفظتك الحقيقية: UQArkwqjEJS1DRIq0XxnrC8z03GQFAZ5tILXdeodtvWQ9Pr4\n');

    for (const type of walletTypes) {
        try {
            const WalletClass = ton[type];
            if (WalletClass && WalletClass.create) {
                const w = WalletClass.create({ publicKey: keyPair.publicKey, workchain: 0 });
                const addr = w.address.toString({ bounceable: false });
                const match = addr === 'UQArkwqjEJS1DRIq0XxnrC8z03GQFAZ5tILXdeodtvWQ9Pr4';
                console.log(`${match ? '✅ مطابق!' : '  '} ${type}: ${addr}`);
            }
        } catch(e) {
            console.log(`  ${type}: خطأ - ${e.message}`);
        }
    }
}
main().catch(console.error);
