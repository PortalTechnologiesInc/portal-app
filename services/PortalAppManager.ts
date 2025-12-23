import {
  initLogger,
  type KeypairInterface,
  type LogCallback,
  type LogEntry,
  LogLevel,
  PortalApp,
  type PortalAppInterface,
  type RelayStatusListener,
} from 'portal-app-lib';
export class PortalAppManager {
  private static instance: PortalAppInterface | null;
  private constructor() {}

  static async getInstance(
    keypair: KeypairInterface,
    relays: string[],
    relayStatusCallback: RelayStatusListener,
    logRust = false
  ): Promise<PortalAppInterface> {
    if (!PortalAppManager.instance) {
      PortalAppManager.instance = await PortalApp.create(keypair, relays, relayStatusCallback);
    }

    if (logRust) {
      try {
        initLogger(new Logger(), LogLevel.Error);
      } catch (_error) {}
    }

    return PortalAppManager.instance!;
  }

  static tryGetInstance() {
    if (!PortalAppManager.instance) {
      throw new Error('PortalAppManager not initialized');
    }

    return PortalAppManager.instance;
  }

  static clearInstance() {
    PortalAppManager.instance = null;
  }
}

class Logger implements LogCallback {
  log(entry: LogEntry) {
    const _message = `[${entry.target}] ${entry.message}`;
    switch (entry.level) {
      case LogLevel.Trace:
        break;
      case LogLevel.Debug:
        break;
      case LogLevel.Info:
        break;
      case LogLevel.Warn:
        break;
      case LogLevel.Error:
        break;
    }
  }
}
