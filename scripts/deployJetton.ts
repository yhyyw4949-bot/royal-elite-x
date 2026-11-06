import { Address, Cell, toNano } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { JettonMinter, REX_CONFIG, buildOnChainMetadata } from '../wrappers/JettonMinter';
import * as fs from 'fs';
import * as path from 'path';

export async function run(provider: NetworkProvider) {
    const sender = provider.sender();
    const owner  = sender.address!;

    console.log('\n╔══════════════════════════════════════════════╗');
    console.log('║      ROYAL ELITE X (REX) - Deployment        ║');
    console.log('╚══════════════════════════════════════════════╝\n');
    console.log(`👤 Owner address : ${owner.toString()}`);
    console.log(`💎 Token Name    : ${REX_CONFIG.name}`);
    console.log(`🔤 Symbol        : ${REX_CONFIG.symbol}`);
    console.log(`📦 Total Supply  : ${REX_CONFIG.totalSupply.toLocaleString()} ${REX_CONFIG.symbol}`);
    console.log(`🔢 Decimals      : ${REX_CONFIG.decimals}\n`);

    // ---- Build On-Chain Metadata ----
    const content = buildOnChainMetadata({
        name:        REX_CONFIG.name,
        symbol:      REX_CONFIG.symbol,
        description: REX_CONFIG.description,
        decimals:    REX_CONFIG.decimals,
    });

    // ---- Load compiled contract code from build artifact ----
    const compiledPath = path.join(__dirname, '../build/JettonMinter/tact_JettonMinter.ts');
    const compiledJsonPath = path.join(__dirname, '../build/JettonMinter.compiled.json');

    let code: Cell;
    if (fs.existsSync(compiledPath)) {
        // Use the generated TypeScript bindings
        const { JettonMinter: TactMinter } = require('../build/JettonMinter/tact_JettonMinter');
        code = TactMinter.code;
    } else if (fs.existsSync(compiledJsonPath)) {
        // Fallback: load from compiled JSON
        const compiled = JSON.parse(fs.readFileSync(compiledJsonPath, 'utf-8'));
        code = Cell.fromBase64(Buffer.from(compiled.hex, 'hex').toString('base64'));
    } else {
        throw new Error('❌ Contract not compiled! Run: npm run build');
    }

    // ---- Create Minter instance ----
    const minter = provider.open(
        JettonMinter.createFromConfig({ owner, content }, code)
    );

    // ---- Step 1: Deploy Minter Contract ----
    console.log('⏳ Step 1/2: Deploying JettonMinter contract...');
    await minter.sendDeploy(sender, toNano('0.15'));
    await provider.waitForDeploy(minter.address);
    console.log(`✅ JettonMinter deployed!`);
    console.log(`   Address: ${minter.address.toString()}\n`);

    // ---- Step 2: Mint 1,000,000 REX to Owner ----
    console.log('⏳ Step 2/2: Minting 1,000,000 REX to your wallet...');
    const mintAmount = REX_CONFIG.totalSupply * 10n ** BigInt(REX_CONFIG.decimals);
    await minter.sendMint(
        sender,
        { queryId: 0n, amount: mintAmount, receiver: owner },
        toNano('0.1')
    );

    // ---- Get wallet address ----
    const walletAddr = await minter.getWalletAddress(owner);

    console.log(`✅ Minting complete!\n`);
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║           🎉 REX IS LIVE ON TON! 🎉          ║');
    console.log('╚══════════════════════════════════════════════╝');
    console.log(`  Master Contract : ${minter.address.toString()}`);
    console.log(`  Your REX Wallet : ${walletAddr.toString()}`);
    console.log(`  Total Supply    : 1,000,000 REX`);
    console.log(`\n  🔍 View: https://testnet.tonviewer.com/${minter.address.toString()}\n`);
}
