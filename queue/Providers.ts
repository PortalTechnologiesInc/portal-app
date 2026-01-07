import { RefObject } from "react";
import { PortalAppInterface } from "portal-app-lib";

import { PendingRequest, RelayInfo } from "@/utils/types";
import { DatabaseService } from "@/services/DatabaseService";

export type GlobalProviders = 
  { name: 'DatabaseService', type: DatabaseService; } |
  { name: 'RelayStatusesProvider', type: RelayStatusesProvider; } |
  { name: 'PortalApp', type: PortalAppInterface } |
  { name: 'SetPendingRequestsProvider', type: SetPendingRequestsProvider; }

export class RelayStatusesProvider {
  constructor(public readonly relayStatuses: RefObject<RelayInfo[]>) {}

  areRelaysConnected(): boolean {
    return this.relayStatuses.current.some(r => r.connected);
  }

  waitForRelaysConnected(): Promise<void> {
    return new Promise((resolve, reject) => {
      const interval = setInterval(() => {
        if (this.areRelaysConnected()) {
          clearInterval(interval);
          resolve();
        }
      }, 500);
    });
  }
}

export interface SetPendingRequestsProvider {
  addPendingRequest(request: PendingRequest): void;
}