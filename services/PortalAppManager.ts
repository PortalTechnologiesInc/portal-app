import {
  initLogger,
  KeypairInterface,
  LogCallback,
  LogEntry,
  LogLevel,
  PortalApp,
  PortalAppInterface,
  RelayStatusListener,
} from 'portal-app-lib';
export class PortalAppManager {
  private static instance: PortalAppInterface | null;
  private constructor() { }

  static async getInstance(
    keypair: KeypairInterface,
    relays: string[],
    relayStatusCallback: RelayStatusListener,
    logRust: boolean = false,
  ): Promise<PortalAppInterface> {
    if (!this.instance) {
      console.log('📚 Initializing the lib!');
      PortalAppManager.instance = await PortalApp.create(keypair, relays, relayStatusCallback);
    }

    if (logRust) {
      try {
        initLogger(new Logger(), LogLevel.Error);
        console.log('Logger initialized');
      } catch (error) {
        console.error('Error initializing logger:', error);
      }
    }

    return this.instance!;
  }

  static tryGetInstance() {
    if (!this.instance) {
      throw new Error('PortalAppManager not initialized');
    }

    return this.instance;
  }

  static clearInstance() {
    this.instance = null;
  }
}

class Logger implements LogCallback {
  log(entry: LogEntry) {
    const message = `[${entry.target}] ${entry.message}`;
    switch (entry.level) {
      case LogLevel.Trace:
        console.trace(message);
        break;
      case LogLevel.Debug:
        console.debug(message);
        break;
      case LogLevel.Info:
        console.info(message);
        break;
      case LogLevel.Warn:
        console.warn(message);
        break;
      case LogLevel.Error:
        console.error(message);
        break;
    }
  }
}