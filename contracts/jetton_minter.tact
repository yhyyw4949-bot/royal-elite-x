// ============================================================
//   ROYAL ELITE X (REX) - Jetton Minter (Master) Contract
//   TEP-74 Standard Implementation
// ============================================================

import "@stdlib/deploy";
import "./messages";
import "./jetton_wallet";

// ============================================================
//   JettonMinter Contract
// ============================================================
contract JettonMinter with Deployable {
    totalSupply: Int as coins;
    mintable:    Bool;
    owner:       Address;
    content:     Cell;

    init(owner: Address, content: Cell) {
        self.totalSupply = 0;
        self.mintable    = true;
        self.owner       = owner;
        self.content     = content;
    }

    // ----------------------------------------------------------
    // Mint new REX tokens (Owner only)
    // ----------------------------------------------------------
    receive(msg: Mint) {
        let ctx: Context = context();
        require(ctx.sender == self.owner, "REX: not owner");
        require(self.mintable, "REX: minting is disabled");
        require(msg.amount > 0, "REX: amount must be > 0");

        self.totalSupply = self.totalSupply + msg.amount;

        // Deploy receiver wallet and credit tokens
        let receiverWalletInit: StateInit = initOf JettonWallet(myAddress(), msg.receiver);
        send(SendParameters{
            to:     contractAddress(receiverWalletInit),
            value:  ton("0.05"),
            bounce: true,
            mode:   SendPayGasSeparately,
            body:   JettonInternalTransfer{
                queryId:          msg.queryId,
                amount:           msg.amount,
                from:             myAddress(),
                responseAddress:  self.owner,
                forwardTonAmount: 0,
                forwardPayload:   emptySlice()
            }.toCell(),
            code: receiverWalletInit.code,
            data: receiverWalletInit.data
        });
    }

    // ----------------------------------------------------------
    // Handle burn notification — reduce total supply
    // ----------------------------------------------------------
    receive(msg: JettonBurnNotification) {
        let ctx: Context = context();

        // Verify the sender is a valid wallet contract
        let senderWalletInit: StateInit = initOf JettonWallet(myAddress(), msg.sender);
        require(contractAddress(senderWalletInit) == ctx.sender, "REX: invalid burn notification");

        self.totalSupply = self.totalSupply - msg.amount;

        if (msg.responseDestination != null) {
            send(SendParameters{
                to:     msg.responseDestination!!,
                value:  0,
                bounce: false,
                mode:   SendRemainingValue | SendIgnoreErrors,
                body:   JettonExcesses{ queryId: msg.queryId }.toCell()
            });
        }
    }

    // ----------------------------------------------------------
    // Disable future minting (Owner only — IRREVERSIBLE)
    // ----------------------------------------------------------
    receive("Disable minting") {
        require(context().sender == self.owner, "REX: not owner");
        self.mintable = false;
    }

    // ----------------------------------------------------------
    // Getters (read-only)
    // ----------------------------------------------------------
    get fun get_jetton_data(): JettonMasterData {
        return JettonMasterData{
            totalSupply:      self.totalSupply,
            mintable:         self.mintable,
            adminAddress:     self.owner,
            jettonContent:    self.content,
            jettonWalletCode: (initOf JettonWallet(myAddress(), myAddress())).code
        };
    }

    get fun get_wallet_address(ownerAddress: Address): Address {
        return contractAddress(initOf JettonWallet(myAddress(), ownerAddress));
    }
}
