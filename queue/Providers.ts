import type { PortalAppInterface } from 'portal-app-lib';
import type { DatabaseService } from '@/services/DatabaseService';
import type NostrStoreService from '@/services/NostrStoreService';
import type { ActiveWalletProvider } from './providers/ActiveWallet';
import type { CashuWalletMethodsProvider } from './providers/CashuWallets';
import type { NotificationProvider } from './providers/Notification';
import type { PromptUserProvider } from './providers/PromptUser';
import type { RelayStatusesProvider } from './providers/RelayStatus';

export type GlobalProviders =
  | { name: 'DatabaseService'; type: DatabaseService }
  | { name: 'NostrStoreService'; type: NostrStoreService }
  | { name: 'PortalAppInterface'; type: PortalAppInterface }
  | { name: 'ActiveWalletProvider'; type: ActiveWalletProvider }
  | { name: 'PromptUserProvider'; type: PromptUserProvider }
  | { name: 'RelayStatusesProvider'; type: RelayStatusesProvider }
  | { name: 'NotificationProvider'; type: NotificationProvider }
  | { name: 'CashuWalletMethodsProvider'; type: CashuWalletMethodsProvider };
