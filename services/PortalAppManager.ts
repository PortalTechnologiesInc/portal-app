import {
  KeypairInterface,
  PortalApp,
  PortalAppInterface,
  RelayStatusListener,
} from 'portal-app-lib';
export class PortalAppManager {
  private static instance: PortalAppInterface | null;
  private constructor() {}

  static async getInstance(
    keypair: KeypairInterface,
    relays: string[],
    relayStatusCallback: RelayStatusListener
  ) {
    if (!PortalAppManager.instance) {
      console.log('📚 Initializing the lib!');
      PortalAppManager.instance = await PortalApp.create(keypair, relays, relayStatusCallback);
    }

    return this.instance;
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
