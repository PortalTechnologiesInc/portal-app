import { WalletInfo } from "@/utils/types";
import { Task } from "../WorkQueue";
import { Wallet } from "@/models/WalletType";
import { WaitForRelaysConnectedTask } from "./WaitForRelaysConnected";

export class GetWalletInfoTask extends Task<[], [Wallet], WalletInfo> {
  constructor() {
    console.log('[GetWalletInfoTask] getting Wallet');
    super([], ['Wallet'], async ([wallet]) => {
      await new WaitForRelaysConnectedTask().run();
      return await wallet.getWalletInfo();
    });
    this.expiry = new Date(Date.now() + 1000 * 60 * 60 * 24);
  }
}
Task.register(GetWalletInfoTask);