import defaultRelayList from '../../assets/DefaultRelays.json';
import type { DatabaseService } from '../../services/DatabaseService';
import { Task } from '../WorkQueue';

export class GetRelaysTask extends Task<[], ['DatabaseService'], string[]> {
  constructor() {
    super(['DatabaseService']);
    this.expiry = new Date(Date.now());
  }

  async taskLogic({ DatabaseService }: { DatabaseService: DatabaseService }): Promise<string[]> {
    let relays = (await DatabaseService.getRelays()).map(relay => relay.ws_uri);

    if (relays.length === 0) {
      relays = defaultRelayList;
    }

    return relays;
  }
}
