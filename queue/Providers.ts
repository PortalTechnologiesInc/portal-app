import { type PortalAppInterface } from 'portal-app-lib';
import type { DatabaseService } from '@/services/DatabaseService';
import type { ActiveWalletProvider } from './providers/ActiveWallet';
import type { NotificationProvider } from './providers/Notification';
import type { PromptUserProvider } from './providers/PromptUser';
import type { RelayStatusesProvider } from './providers/RelayStatus';

export type GlobalProviders =
  | { name: 'DatabaseService'; type: DatabaseService }
  | { name: 'PortalAppInterface'; type: PortalAppInterface }
  | { name: 'ActiveWalletProvider'; type: ActiveWalletProvider }
  | { name: 'PromptUserProvider'; type: PromptUserProvider }
  | { name: 'RelayStatusesProvider'; type: RelayStatusesProvider }
  | { name: 'NotificationProvider'; type: NotificationProvider };
