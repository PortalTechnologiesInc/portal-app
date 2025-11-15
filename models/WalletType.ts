import { BreezService } from '@/services/BreezService';
import { NwcService } from '@/services/NwcService';
import { WalletInfo } from '@/utils';

export const WALLET_TYPE = {
  BREEZ: 'BREEZ',
  NWC: 'NWC',
} as const;

export default WALLET_TYPE;

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
