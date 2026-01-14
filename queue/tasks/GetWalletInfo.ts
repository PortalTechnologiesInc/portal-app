import { WalletInfo } from "@/utils/types";
import { Task } from "../WorkQueue";
import { Wallet } from "@/models/WalletType";
import { WaitForRelaysConnectedTask } from "./WaitForRelaysConnected";
import { ActiveWalletProvider } from "../providers/ActiveWallet";

export class GetWalletInfoTask extends Task<[], [ActiveWalletProvider], WalletInfo | null> {
  constructor() {
    console.log('[GetWalletInfoTask] getting ActiveWalletProvider');
    super([], ['ActiveWalletProvider'], async ([activeWalletProvider]) => {
      await new WaitForRelaysConnectedTask().run();
      const wallet = activeWalletProvider.getWallet();
      return wallet ? await wallet.getWalletInfo() : null;
    });
    this.expiry = new Date(Date.now() + 1000 * 60 * 60 * 24);
  }
}
Task.register(GetWalletInfoTask);