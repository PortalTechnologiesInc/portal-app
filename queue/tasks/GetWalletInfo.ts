import { WalletInfo } from "@/utils/types";
import { Task } from "../WorkQueue";
import { ActiveWalletProvider } from "../providers/ActiveWallet";
import { RelayStatusesProvider } from "../providers/RelayStatus";

export class GetWalletInfoTask extends Task<[], ['ActiveWalletProvider', 'RelayStatusesProvider'], WalletInfo | null> {
  constructor() {
    console.log('[GetWalletInfoTask] getting ActiveWalletProvider');
    super(['ActiveWalletProvider', 'RelayStatusesProvider']);
    this.expiry = new Date(Date.now() + 1000 * 60 * 60 * 24);
  }

  async taskLogic({ ActiveWalletProvider, RelayStatusesProvider }: { ActiveWalletProvider: ActiveWalletProvider, RelayStatusesProvider: RelayStatusesProvider }): Promise<WalletInfo | null> {
    await RelayStatusesProvider.waitForRelaysConnected();
    const wallet = ActiveWalletProvider.getWallet();
    return wallet ? await wallet.getWalletInfo() : null;
  }
}
Task.register(GetWalletInfoTask);