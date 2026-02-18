import type { RefObject } from 'react';
import type { RelayInfo } from '@/utils/types';

export class RelayStatusesProvider {
  constructor(private readonly relayStatuses: RefObject<RelayInfo[]>) {}

  areRelaysConnected(): boolean {
    return this.relayStatuses.current.some(r => r.connected);
  }
  waitForRelaysConnected(timeoutMs = 30_000): Promise<void> {
    return new Promise((resolve, reject) => {
      let interval: ReturnType<typeof setInterval>;
      let timeout: ReturnType<typeof setTimeout>;

      interval = setInterval(() => {
        if (this.areRelaysConnected()) {
          clearInterval(interval);
          clearTimeout(timeout);
          resolve();
        }
      }, 500);

      timeout = setTimeout(() => {
        clearInterval(interval);
        reject(new Error('Timed out waiting for relay connection'));
      }, timeoutMs);
    });
  }
}
