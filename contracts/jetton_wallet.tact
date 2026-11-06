// ============================================================
//   ROYAL ELITE X (REX) - Jetton Wallet Contract
//   TEP-74 Standard Implementation
// ============================================================

import "./messages";

// ===== Gas Constants =====
const MinStorageTon:  Int = ton("0.019");
const GasConsumption: Int = ton("0.013");

// ============================================================
//   JettonWallet Contract
// ============================================================
contract JettonWallet {
    balance: Int as coins;
    owner:   Address;
    master:  Address;

    init(master: Address, owner: Address) {
        self.balance = 0;
        self.owner   = owner;
        self.master  = master;
    }

    // ----------------------------------------------------------
    // Receive tokens from minter or another wallet
    // ----------------------------------------------------------
    receive(msg: JettonInternalTransfer) {
        let ctx: Context = context();

        // Verify sender is the master minter or a valid sibling wallet
        if (ctx.sender != self.master) {
            let siblingInit: StateInit = initOf JettonWallet(self.master, msg.from);
            require(ctx.sender == contractAddress(siblingInit), "JW: invalid sender");
        }

        self.balance += msg.amount;
        require(self.balance >= 0, "JW: negative balance");

        // Calculate gas after storage fee deduction
        let msgValue: Int   = ctx.value;
        let tonBefore: Int  = myBalance() - msgValue;
        let storageFee: Int = MinStorageTon - min(tonBefore, MinStorageTon);
        msgValue = msgValue - storageFee - GasConsumption;

        // Forward notification to the new owner if requested
        if (msg.forwardTonAmount > 0) {
            msgValue = msgValue - msg.forwardTonAmount - GasConsumption;
            send(SendParameters{
                to:    self.owner,
                value: msg.forwardTonAmount,
                bounce: false,
                mode:  SendPayGasSeparately,
                body:  JettonTransferNotification{
                    queryId:        msg.queryId,
                    amount:         msg.amount,
                    sender:         msg.from,
                    forwardPayload: msg.forwardPayload
                }.toCell()
            });
        }

        // Return excess gas
        if (msg.responseAddress != null && msgValue > 0) {
            send(SendParameters{
                to:    msg.responseAddress!!,
                value: msgValue,
                bounce: false,
                mode:  SendPayGasSeparately,
                body:  JettonExcesses{ queryId: msg.queryId }.toCell()
            });
        }
    }

    // ----------------------------------------------------------
    // Transfer tokens to another address
    // ----------------------------------------------------------
    receive(msg: JettonTransfer) {
        let ctx: Context = context();
        require(ctx.sender == self.owner, "JW: not owner");

        let fwdFee: Int = ctx.readForwardFee();
        require(ctx.value > fwdFee + 2 * GasConsumption + msg.forwardTonAmount,
                "JW: insufficient gas");

        self.balance = self.balance - msg.amount;
        require(self.balance >= 0, "JW: insufficient balance");

        let destInit: StateInit = initOf JettonWallet(self.master, msg.destination);
        send(SendParameters{
            to:     contractAddress(destInit),
            value:  0,
            bounce: true,
            mode:   SendRemainingValue,
            body:   JettonInternalTransfer{
                queryId:          msg.queryId,
                amount:           msg.amount,
                from:             self.owner,
                responseAddress:  msg.responseDestination,
                forwardTonAmount: msg.forwardTonAmount,
                forwardPayload:   msg.forwardPayload
            }.toCell(),
            code: destInit.code,
            data: destInit.data
        });
    }

    // ----------------------------------------------------------
    // Burn tokens (reduces total supply via minter)
    // ----------------------------------------------------------
    receive(msg: JettonBurn) {
        let ctx: Context = context();
        require(ctx.sender == self.owner, "JW: not owner");

        self.balance = self.balance - msg.amount;
        require(self.balance >= 0, "JW: insufficient balance to burn");

        send(SendParameters{
            to:     self.master,
            value:  0,
            bounce: true,
            mode:   SendRemainingValue,
            body:   JettonBurnNotification{
                queryId:             msg.queryId,
                amount:              msg.amount,
                sender:              self.owner,
                responseDestination: msg.responseDestination
            }.toCell()
        });
    }

    // ----------------------------------------------------------
    // Getters
    // ----------------------------------------------------------
    get fun get_wallet_data(): JettonWalletData {
        return JettonWalletData{
            balance:    self.balance,
            owner:      self.owner,
            master:     self.master,
            walletCode: (initOf JettonWallet(self.master, self.owner)).code
        };
    }
}
