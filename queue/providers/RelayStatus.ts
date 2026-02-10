import type { RefObject } from 'react';
import type { RelayInfo } from '@/utils/types';

export class RelayStatusesProvider {
  constructor(private readonly relayStatuses: RefObject<RelayInfo[]>) {}

  areRelaysConnected(): boolean {
    return this.relayStatuses.current.some(r => r.connected);
  }
  waitForRelaysConnected(): Promise<void> {
    return new Promise(resolve => {
      const interval = setInterval(() => {
        if (this.areRelaysConnected()) {
          clearInterval(interval);
          resolve();
        }
      }, 500);
    });
  }
}
