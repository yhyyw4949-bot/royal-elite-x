import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { toNano }                                           from '@ton/core';
import { JettonMinter, REX_CONFIG, buildOnChainMetadata }  from '../wrappers/JettonMinter';
import { JettonWallet }                                     from '../wrappers/JettonWallet';

describe('ROYAL ELITE X (REX) Jetton Tests', () => {
    let blockchain: Blockchain;
    let owner:      SandboxContract<TreasuryContract>;
    let user:       SandboxContract<TreasuryContract>;
    let minter:     SandboxContract<JettonMinter>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        owner      = await blockchain.treasury('owner');
        user       = await blockchain.treasury('user');

        const content = buildOnChainMetadata({
            name:        REX_CONFIG.name,
            symbol:      REX_CONFIG.symbol,
            description: REX_CONFIG.description,
            decimals:    REX_CONFIG.decimals,
        });

        // Load compiled code (run `npm run build` first)
        const { JettonMinter: TactCode } = require('../build/JettonMinter/tact_JettonMinter');

        minter = blockchain.openContract(
            JettonMinter.createFromConfig(
                { owner: owner.address, content },
                TactCode.code
            )
        );

        // Deploy
        const deployResult = await minter.sendDeploy(owner.getSender(), toNano('0.1'));
        expect(deployResult.transactions).toHaveTransaction({
            from:    owner.address,
            to:      minter.address,
            deploy:  true,
            success: true,
        });
    });

    it('✅ should deploy with correct initial state', async () => {
        const data = await minter.getJettonData(owner.provider(minter.address));
        expect(data.totalSupply).toBe(0n);
        expect(data.mintable).toBe(true);
        expect(data.adminAddress.toString()).toBe(owner.address.toString());
    });

    it('✅ should mint 1,000,000 REX to owner', async () => {
        const REX_DECIMALS = 9n;
        const mintAmount   = REX_CONFIG.totalSupply * 10n ** REX_DECIMALS;

        const mintResult = await minter.sendMint(
            owner.getSender(),
            { queryId: 0n, amount: mintAmount, receiver: owner.address },
            toNano('0.1')
        );

        expect(mintResult.transactions).toHaveTransaction({ success: true });

        const data = await minter.getJettonData(owner.provider(minter.address));
        expect(data.totalSupply).toBe(mintAmount);
    });

    it('✅ should compute correct wallet address', async () => {
        const walletAddr = await minter.getWalletAddress(
            owner.provider(minter.address),
            user.address
        );
        expect(walletAddr).toBeDefined();
    });

    it('✅ should block non-owner from minting', async () => {
        const REX_DECIMALS = 9n;
        const mintAmount   = 1000n * 10n ** REX_DECIMALS;

        const mintResult = await minter.sendMint(
            user.getSender(), // attacker!
            { queryId: 0n, amount: mintAmount, receiver: user.address },
            toNano('0.1')
        );

        expect(mintResult.transactions).toHaveTransaction({ success: false });
    });
});
