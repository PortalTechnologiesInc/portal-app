import { RelayInfo } from "@/utils/types";

export class RelayStatusesProvider {
  constructor(public readonly relayStatuses: RelayInfo[]) { }

  areRelaysConnected(): boolean {
    return this.relayStatuses.some(r => r.connected);
  }
}