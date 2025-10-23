import { KeypairInterface, PortalDb, PortalDbInterface } from 'portal-app-lib';

const MINTS_KEY = 'mints_key';

export default class NostrStoreService {
  private portalDb: PortalDbInterface;

  private constructor(portalDb: PortalDbInterface) {
    this.portalDb = portalDb;
  }

  static async create(keypair: KeypairInterface, relays: string[]): Promise<NostrStoreService> {
    const portalDb = await PortalDb.create(keypair, relays);
    return new NostrStoreService(portalDb);
  }

  async storeMints(mints: string[]): Promise<void> {
    const mintsJson = JSON.stringify(mints);
    return await this.portalDb.store(MINTS_KEY, mintsJson);
  }

  async readMints(): Promise<string[]> {
    try {
      const mintsJson = await this.portalDb.read(MINTS_KEY);
      return JSON.parse(mintsJson);
    } catch (error) {
      console.warn('Reding on nostrStore generated the following error: ', error);
      return [];
    }
  }
}
