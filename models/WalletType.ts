import { BreezService } from '@/services/BreezService';
import { NwcService } from '@/services/NwcService';
import { WalletInfo } from '@/utils/types';

export const WALLET_TYPE = {
  BREEZ: 'BREEZ',
  NWC: 'NWC',
} as const;

export type WalletType = (typeof WALLET_TYPE)[keyof typeof WALLET_TYPE];

export type WalletTypeMap = {
  [WALLET_TYPE.BREEZ]: BreezService;
  [WALLET_TYPE.NWC]: NwcService;
};

export type Wallet = {
  getWalletInfo: () => Promise<WalletInfo>;
  receivePayment: (amountSats: bigint, description?: string) => Promise<string>;
  prepareSendPayment: (paymentRequest: string, amountSats: bigint) => Promise<unknown>;
  sendPayment: (paymentRequest: string, amountSats: bigint) => Promise<string>;
};

export const WALLET_CONNECTION_STATUS = {
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  DISCONNECTED: 'DISCONNECTED',
  CONNECTING: 'CONNECTING',
  CONNECTED: 'CONNECTED',
} as const;

export type WalletConnectionStatus =
  (typeof WALLET_CONNECTION_STATUS)[keyof typeof WALLET_CONNECTION_STATUS];
