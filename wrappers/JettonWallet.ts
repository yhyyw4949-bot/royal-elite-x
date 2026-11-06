import {
    Address,
    beginCell,
    Cell,
    Contract,
    ContractProvider,
    Sender,
    SendMode,
    toNano,
} from '@ton/core';

export type JettonWalletData = {
    balance:    bigint;
    owner:      Address;
    master:     Address;
    walletCode: Cell;
};

export class JettonWallet implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell }
    ) {}

    static createFromAddress(address: Address): JettonWallet {
        return new JettonWallet(address);
    }

    // ---- Transfer REX to another address ----
    async sendTransfer(
        provider: ContractProvider,
        via:      Sender,
        params: {
            value:          bigint;
            toAddress:      Address;
            queryId:        bigint;
            forwardTonAmount: bigint;
            jettonAmount:   bigint;
            responseAddress?: Address;
        }
    ) {
        await provider.internal(via, {
            value:    params.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0xf8a7ea5, 32)      // JettonTransfer op
                .storeUint(params.queryId, 64)
                .storeCoins(params.jettonAmount)
                .storeAddress(params.toAddress)
                .storeAddress(params.responseAddress ?? via.address!)
                .storeBit(false)                // no custom payload
                .storeCoins(params.forwardTonAmount)
                .storeBit(false)                // no forward payload
                .endCell(),
        });
    }

    // ---- Burn REX tokens ----
    async sendBurn(
        provider: ContractProvider,
        via:      Sender,
        params: {
            value:               bigint;
            queryId:             bigint;
            jettonAmount:        bigint;
            responseDestination: Address;
        }
    ) {
        await provider.internal(via, {
            value:    params.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x595f07bc, 32)              // JettonBurn op
                .storeUint(params.queryId, 64)
                .storeCoins(params.jettonAmount)
                .storeAddress(params.responseDestination)
                .storeBit(false)                        // no custom payload
                .endCell(),
        });
    }

    // ---- Getters ----
    async getBalance(provider: ContractProvider): Promise<bigint> {
        const res = await provider.get('get_wallet_data', []);
        return res.stack.readBigNumber();
    }

    async getWalletData(provider: ContractProvider): Promise<JettonWalletData> {
        const res = await provider.get('get_wallet_data', []);
        return {
            balance:    res.stack.readBigNumber(),
            owner:      res.stack.readAddress(),
            master:     res.stack.readAddress(),
            walletCode: res.stack.readCell(),
        };
    }
}
