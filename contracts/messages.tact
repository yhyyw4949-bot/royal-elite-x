// ============================================================
//   ROYAL ELITE X (REX) - Shared Message Definitions
//   TEP-74 Jetton Standard
// ============================================================

// ===== Jetton Transfer (User → Wallet) =====
message(0xf8a7ea5) JettonTransfer {
    queryId:             Int as uint64;
    amount:              Int as coins;
    destination:         Address;
    responseDestination: Address?;
    customPayload:       Cell?;
    forwardTonAmount:    Int as coins;
    forwardPayload:      Slice as remaining;
}

// ===== Internal Transfer (Wallet → Wallet) =====
message(0x178d4519) JettonInternalTransfer {
    queryId:          Int as uint64;
    amount:           Int as coins;
    from:             Address;
    responseAddress:  Address?;
    forwardTonAmount: Int as coins;
    forwardPayload:   Slice as remaining;
}

// ===== Transfer Notification (Wallet → Receiver dApp) =====
message(0x7362d09c) JettonTransferNotification {
    queryId:        Int as uint64;
    amount:         Int as coins;
    sender:         Address;
    forwardPayload: Slice as remaining;
}

// ===== Burn (User → Wallet) =====
message(0x595f07bc) JettonBurn {
    queryId:             Int as uint64;
    amount:              Int as coins;
    responseDestination: Address?;
    customPayload:       Cell?;
}

// ===== Burn Notification (Wallet → Minter) =====
message(0x7bdd97de) JettonBurnNotification {
    queryId:             Int as uint64;
    amount:              Int as coins;
    sender:              Address;
    responseDestination: Address?;
}

// ===== Excess Gas Return =====
message(0xd53276db) JettonExcesses {
    queryId: Int as uint64;
}

// ===== Mint (Owner → Minter) =====
message(0x642b7d07) Mint {
    queryId:  Int as uint64;
    amount:   Int as coins;
    receiver: Address;
}

// ===== Shared Structs =====
struct JettonWalletData {
    balance:    Int;
    owner:      Address;
    master:     Address;
    walletCode: Cell;
}

struct JettonMasterData {
    totalSupply:      Int;
    mintable:         Bool;
    adminAddress:     Address;
    jettonContent:    Cell;
    jettonWalletCode: Cell;
}
