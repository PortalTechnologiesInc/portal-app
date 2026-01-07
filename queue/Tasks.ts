import { Task } from "./WorkQueue";
import { PortalAppInterface } from "portal-app-lib";
import { RelayStatusesProvider } from "./Providers";
import { Profile } from "portal-app-lib";

export class FetchServiceProfileTask extends Task<[string], ['PortalApp', 'RelayStatusesProvider'], Profile | undefined> {
  constructor(key: string) {
    super(['PortalApp', 'RelayStatusesProvider'], key);
  }

  async taskLogic({ PortalApp, RelayStatusesProvider }: { 'PortalApp': PortalAppInterface, 'RelayStatusesProvider': RelayStatusesProvider }, key: string): Promise<Profile | undefined> {
    this.expiry = new Date(Date.now() + 1000 * 60 * 60 * 24);

    await RelayStatusesProvider.waitForRelaysConnected();
    return await PortalApp.fetchProfile(key);
  }
}
Task.register(FetchServiceProfileTask);

