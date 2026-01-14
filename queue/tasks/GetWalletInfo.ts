import { WalletInfo } from "@/utils/types";
import { Task } from "../WorkQueue";
import { ActiveWalletProvider } from "../providers/ActiveWallet";
import { RelayStatusesProvider } from "../providers/RelayStatus";

export class GetWalletInfoTask extends Task<[], [ActiveWalletProvider, RelayStatusesProvider], WalletInfo | null> {
  constructor() {
    console.log('[GetWalletInfoTask] getting ActiveWalletProvider');
    super([], ['ActiveWalletProvider', 'RelayStatusesProvider'], async ([activeWalletProvider, relayStatusesProvider]) => {
      await relayStatusesProvider.waitForRelaysConnected();
      const wallet = activeWalletProvider.getWallet();
      return wallet ? await wallet.getWalletInfo() : null;
    });
    this.expiry = new Date(Date.now() + 1000 * 60 * 60 * 24);
  }
}
Task.register(GetWalletInfoTask);