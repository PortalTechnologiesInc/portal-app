import { type GetInfoResponse, Nwc, type RelayStatusListener } from 'portal-app-lib';
import {
  WALLET_CONNECTION_STATUS,
  type Wallet,
  type WalletConnectionStatus,
} from '@/models/WalletType';
import { mapNumericStatusToString } from '@/utils/nostrHelper';
import type { RelayConnectionStatus, WalletInfo } from '@/utils/types';

export class NwcService implements Wallet {
  private client!: Nwc;
  private lastReconnectAttempt = 0;
  private relayStatuses: Map<string, RelayConnectionStatus> = new Map();
  private onStatusChange: ((status: WalletConnectionStatus) => void) | null = null;

  private constructor() {}

  static async create(
    walletUrl: string,
    onStatusChange?: (status: WalletConnectionStatus) => void
  ): Promise<NwcService> {
    console.log('Creating NWC Service');
    const instance = new NwcService();
    instance.onStatusChange = onStatusChange || null;
    await instance.init(walletUrl);
    return instance;
  }

  private async init(walletUrl: string) {
    try {
      this.client = new Nwc(walletUrl, this.createRelayStatusListener());
      await this.getWalletInfo();
    } catch (error) {
      console.error('Error initializing NWC wallet:', error);
      throw new Error(
        `Failed to initialize wallet: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private createRelayStatusListener(): RelayStatusListener {
    return {
      onRelayStatusChange: async (relay_url: string, status: number): Promise<void> => {
        const statusString = mapNumericStatusToString(status);
        this.relayStatuses.set(relay_url, statusString);
        // Reset reconnection attempts on successful connection
        if (status === 3) {
          this.lastReconnectAttempt = 0;
        }

        // Auto-reconnect logic for terminated/disconnected relays
        if (status === 5 || status === 4) {
          const now = Date.now();
          const timeSinceLastAttempt = now - this.lastReconnectAttempt;

          // Only attempt auto-reconnection if more than 10 seconds have passed
          if (timeSinceLastAttempt > 10000) {
            this.lastReconnectAttempt = now;

            setTimeout(async () => {
              try {
                if (this.client && typeof this.client.reconnectRelay === 'function') {
                  await this.client.reconnectRelay(relay_url);
                }
              } catch (_error) {}
            }, 2000);
          }
        }
        if (this.onStatusChange) {
          const statuses = Array.from(this.relayStatuses.values());
          let overallStatus: WalletConnectionStatus = WALLET_CONNECTION_STATUS.DISCONNECTED;
          if (statuses.includes('Connected')) {
            overallStatus = WALLET_CONNECTION_STATUS.CONNECTED;
          } else if (statuses.includes('Connecting')) {
            overallStatus = WALLET_CONNECTION_STATUS.CONNECTING;
          }
          this.onStatusChange(overallStatus);
        }
      },
    };
  }

  async getWalletInfo(): Promise<WalletInfo> {
    if (!this.client) {
      throw new Error('NWC client not initialized');
    }
    const info: GetInfoResponse = await this.client.getInfo();
    const balance = await this.client.getBalance();

    return {
      alias: info.alias,
      balanceInSats: balance,
    };
  }

  async sendPayment(paymentRequest: string, _amountSats: bigint): Promise<string> {
    if (!this.client) {
      throw new Error('NWC client not initialized');
    }

    try {
      const preimage = await this.client.payInvoice(paymentRequest);

      return preimage;
    } catch (_error) {
      throw new Error('Failed to send payment');
    }
  }

  async receivePayment(amountSats: bigint, description?: string): Promise<string> {
    if (!this.client) {
      throw new Error('NWC client not initialized');
    }

    try {
      const invoice = await this.client.makeInvoice({
        amount: amountSats,
        description: description || 'Payment',
        descriptionHash: undefined,
        expiry: undefined,
      });

      return invoice.invoice;
    } catch (_error) {
      throw new Error('Failed to create invoice');
    }
  }

  async prepareSendPayment(paymentRequest: string, _amountSats: bigint): Promise<string> {
    if (!this.client) {
      throw new Error('NWC client not initialized');
    }

    const response = await this.client.lookupInvoice(paymentRequest);

    if (response) {
      return response.paymentHash;
    }

    return '';
  }

  async lookupInvoice(paymentRequest: string) {
    if (!this.client) {
      throw new Error('NWC client not initialized');
    }

    return await this.client.lookupInvoice(paymentRequest);
  }
}
