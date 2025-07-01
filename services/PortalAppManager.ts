import { KeypairInterface, PortalApp, PortalAppInterface } from "portal-app-lib";

export class PortalAppManager {
    static instance: PortalAppInterface;

    private constructor() {}

    static async getInstance(keypair: KeypairInterface, relays: string[]) {
        if (!PortalAppManager.instance) {
            console.warn("Initializing the lib!");
            PortalAppManager.instance = await PortalApp.create(keypair, relays);
        }

        return this.instance;
    }
}