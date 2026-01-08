import { RelayStatusesProvider } from "../providers/RelayStatus";
import { Task } from "../WorkQueue";

export class WaitForRelaysConnectedTask extends Task<[], [], void> {
  constructor() {
    super([], [], async ([]) => {
      let count = 0;
      while (count < 5) {
        if (await new CheckRelayStatusTask().run()) {
          return;
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
        count++;
      }

      throw new Error('Relays did not connect in time');
    });
    this.expiry = new Date(0);
  }
}
Task.register(WaitForRelaysConnectedTask);

class CheckRelayStatusTask extends Task<[], [RelayStatusesProvider], boolean> {
  constructor() {
    super([], ['RelayStatusesProvider'], async ([relayStatusesProvider]) => {
      return relayStatusesProvider.areRelaysConnected();
    });
    this.expiry = new Date(Date.now() + 1000);
  }
}
Task.register(CheckRelayStatusTask);
