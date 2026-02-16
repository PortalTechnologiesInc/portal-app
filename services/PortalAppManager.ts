import {
  type KeypairInterface,
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
    relayStatusCallback: RelayStatusListener
  ): Promise<PortalAppInterface> {
    if (!PortalAppManager.instance) {
      PortalAppManager.instance = await PortalApp.create(keypair, relays, relayStatusCallback);
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
