import { RelayInfo } from "@/utils/types";
import { RefObject } from "react";

export class RelayStatusesProvider {
  constructor(private readonly relayStatuses: RefObject<RelayInfo[]>) { }

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