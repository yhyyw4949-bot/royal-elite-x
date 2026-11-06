import {
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Dictionary,
    Sender,
    SendMode,
    toNano,
} from '@ton/core';
import * as crypto from 'crypto';

// ===== Token Metadata =====
export const REX_CONFIG = {
    name:        'ROYAL ELITE X',
    symbol:      'REX',
    description: 'ROYAL ELITE X - The Premium Token on TON Blockchain',
    decimals:    '9',
    totalSupply: 1_000_000n,  // 1 Million REX
};

// ===== Helper: Build On-Chain Metadata Cell =====
function sha256BigInt(str: string): bigint {
    return BigInt('0x' + crypto.createHash('sha256').update(str).digest('hex'));
}

export function buildOnChainMetadata(params: {
    name:        string;
    symbol:      string;
    description: string;
    decimals:    string;
    image?:      string;
}): Cell {
    const dict = Dictionary.empty(
        Dictionary.Keys.BigUint(256),
        Dictionary.Values.Cell()
    );

    const encodeStr = (val: string) =>
        beginCell().storeUint(0, 8).storeStringTail(val).endCell();

    dict.set(sha256BigInt('name'),        encodeStr(params.name));
    dict.set(sha256BigInt('symbol'),      encodeStr(params.symbol));
    dict.set(sha256BigInt('description'), encodeStr(params.description));
    dict.set(sha256BigInt('decimals'),    encodeStr(params.decimals));

    if (params.image) {
        dict.set(sha256BigInt('image'), encodeStr(params.image));
    }

    return beginCell()
        .storeUint(0, 8)   // on-chain metadata prefix
        .storeDict(dict)
        .endCell();
}

// ===== Minter Config =====
export type JettonMinterConfig = {
    owner:   Address;
    content: Cell;
};

export type MintParams = {
    queryId:  bigint;
    amount:   bigint;
    receiver: Address;
};

export type JettonData = {
    totalSupply:  bigint;
    mintable:     boolean;
    adminAddress: Address;
    content:      Cell;
    walletCode:   Cell;
};

// ===== JettonMinter Wrapper =====
export class JettonMinter implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell }
    ) {}

    // ---- Factory ----
    static createFromConfig(
        config: JettonMinterConfig,
        code:   Cell,
        workchain = 0
    ): JettonMinter {
        const data = beginCell()
            .storeCoins(0)             // totalSupply = 0
            .storeAddress(config.owner)
            .storeRef(config.content)
            .storeBit(true)            // mintable = true
            .endCell();

        const init = { code, data };
        return new JettonMinter(contractAddress(workchain, init), init);
    }

    static createFromAddress(address: Address): JettonMinter {
        return new JettonMinter(address);
    }

    // ---- Transactions ----

    /** Deploy the minter contract on-chain */
    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    /** Mint REX tokens to a receiver address */
    async sendMint(
        provider: ContractProvider,
        via:      Sender,
        params:   MintParams,
        value:    bigint = toNano('0.1')
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x642b7d07, 32)  // Mint op
                .storeUint(params.queryId, 64)
                .storeCoins(params.amount)
                .storeAddress(params.receiver)
                .endCell(),
        });
    }

    /** Disable future minting (IRREVERSIBLE!) */
    async sendDisableMinting(
        provider: ContractProvider,
        via:      Sender,
        value:    bigint = toNano('0.05')
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeStringTail('Disable minting').endCell(),
        });
    }

    // ---- Getters ----

    async getJettonData(provider: ContractProvider): Promise<JettonData> {
        const res = await provider.get('get_jetton_data', []);
        return {
            totalSupply:  res.stack.readBigNumber(),
            mintable:     res.stack.readBoolean(),
            adminAddress: res.stack.readAddress(),
            content:      res.stack.readCell(),
            walletCode:   res.stack.readCell(),
        };
    }

    async getWalletAddress(
        provider:     ContractProvider,
        ownerAddress: Address
    ): Promise<Address> {
        const res = await provider.get('get_wallet_address', [
            {
                type: 'slice',
                cell: beginCell().storeAddress(ownerAddress).endCell(),
            },
        ]);
        return res.stack.readAddress();
    }
}
