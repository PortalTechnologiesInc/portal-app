import { NostrConnectMethod } from "portal-app-lib";

export function getMethodString(method: NostrConnectMethod): string {
    switch (method) {
        case NostrConnectMethod.Connect:
            return 'connect';
        case NostrConnectMethod.SignEvent:
            return 'sign_event';
        case NostrConnectMethod.Ping:
            return 'ping';
        case NostrConnectMethod.GetPublicKey:
            return 'get_public_key';
        case NostrConnectMethod.Nip04Encrypt:
            return 'nip04_encrypt';
        case NostrConnectMethod.Nip04Decrypt:
            return 'nip04_decrypt';
        case NostrConnectMethod.Nip44Encrypt:
            return 'nip44_encrypt';
        case NostrConnectMethod.Nip44Decrypt:
            return 'nip44_decrypt';
    }
}