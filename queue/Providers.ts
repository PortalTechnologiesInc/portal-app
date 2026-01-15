import { RefObject } from "react";
import { PortalApp, PortalAppInterface } from "portal-app-lib";

import { PendingRequest, RelayInfo } from "@/utils/types";
import { DatabaseService } from "@/services/DatabaseService";
import { RelayStatusesProvider } from "./providers/RelayStatus";
import { ActiveWalletProvider } from "./providers/ActiveWallet";
import { PromptUserProvider } from "./providers/PromptUser";
import { NotificationProvider } from "./providers/Notification";

export type GlobalProviders = 
  { name: 'DatabaseService', type: DatabaseService; } |
  { name: 'PortalAppInterface', type: PortalAppInterface } |
  { name: 'ActiveWalletProvider', type: ActiveWalletProvider } |
  { name: 'PromptUserProvider', type: PromptUserProvider } |
  { name: 'RelayStatusesProvider', type: RelayStatusesProvider } |
  { name: 'NotificationProvider', type: NotificationProvider }