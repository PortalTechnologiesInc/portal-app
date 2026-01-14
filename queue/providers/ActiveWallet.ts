import { Wallet, WALLET_TYPE, WalletConnectionStatus, WalletType } from "@/models/WalletType";

export class ActiveWalletProvider {
  constructor(public readonly activeWalletWrapper: WalletWrapper) { }

  getWallet(): Wallet | null {
    return this.activeWalletWrapper.wallet
  }
}

export class WalletWrapper {
  constructor(public readonly wallet: Wallet | null) { }
}