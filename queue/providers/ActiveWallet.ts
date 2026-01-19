import { Wallet, WALLET_TYPE, WalletConnectionStatus, WalletType } from "@/models/WalletType";

export class ActiveWalletProvider {
  constructor(private readonly activeWalletWrapper: WalletWrapper) { }

  getWallet(): Wallet | null {
    return this.activeWalletWrapper.wallet
  }
}

export class WalletWrapper {
  constructor(public readonly wallet: Wallet | null) { }
}