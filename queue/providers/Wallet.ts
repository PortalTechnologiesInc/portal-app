import { Wallet } from "@/models/WalletType";
import { Construction } from "lucide-react-native";

export class ActiveWalletProvider {
    constructor(public readonly activeWalletWrapper: WalletWrapper) { }

    getWallet(): Wallet | null {
        return this.activeWalletWrapper.wallet
    }
}

export class WalletWrapper {
    constructor(public readonly wallet: Wallet | null) { }
}