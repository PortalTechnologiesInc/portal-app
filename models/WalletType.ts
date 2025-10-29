import { WalletInfo } from '@/utils';

export const WALLET_TYPE = {
  BREEZ: 'BREEZ',
  NWC: 'NWC',
} as const;

export default WALLET_TYPE;

export type WalletType = (typeof WALLET_TYPE)[keyof typeof WALLET_TYPE];

export type Wallet = {
  getWalletInfo: () => Promise<WalletInfo>;
  sendPayment: (paymentRequest: string, amountSats: bigint) => Promise<string>;
  receivePayment: (amountSats: bigint) => Promise<string>;
};
