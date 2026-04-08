import { Task } from "../WorkQueue";
import {
  KeyHandshakeUrl,
  type PortalAppInterface,
} from 'portal-app-lib';
import type { RelayStatusesProvider } from '../providers/RelayStatus';

export class SendKeyHandshakeTask extends Task<[KeyHandshakeUrl], ['PortalAppInterface', 'RelayStatusesProvider'], void> {
  constructor(url: KeyHandshakeUrl) {
    super(['PortalAppInterface', 'RelayStatusesProvider'], url);
    this.expiry = new Date(Date.now());
  }

  async taskLogic(
    { PortalAppInterface, RelayStatusesProvider }: { PortalAppInterface: PortalAppInterface; RelayStatusesProvider: RelayStatusesProvider },
    url: KeyHandshakeUrl
  ): Promise<void> {
    await RelayStatusesProvider.waitForRelaysConnected();
    return await PortalAppInterface.sendKeyHandshake(url);
  }
}
Task.register(SendKeyHandshakeTask);
