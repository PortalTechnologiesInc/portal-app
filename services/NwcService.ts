import { Wallet } from '@/models/WalletType';
import { RelayConnectionStatus, WalletInfo } from '@/utils';
import { GetInfoResponse, LookupInvoiceResponse, Nwc, RelayStatusListener } from 'portal-app-lib';

function mapNumericStatusToString(numericStatus: number): RelayConnectionStatus {
  switch (numericStatus) {
    case 0:
      return 'Initialized';
    case 1:
      return 'Pending';
    case 2:
      return 'Connecting';
    case 3:
      return 'Connected';
    case 4:
      return 'Disconnected';
    case 5:
      return 'Terminated';
    case 6:
      return 'Banned';
    default:
      console.warn(`🔍 NostrService: Unknown numeric RelayStatus: ${numericStatus}`);
      return 'Unknown';
  }
}

export class NwcService implements Wallet {
  private client!: Nwc;
  private lastReconnectAttempt: number = 0;

  private constructor() {}

  static async create(walletUrl: string): Promise<NwcService> {
    const instance = new NwcService();
    await instance.init(walletUrl);
    return instance;
  }

  private async init(walletUrl: string) {
    try {
      console.log('Initializing NWC service with URL:', walletUrl);

      this.client = new Nwc(walletUrl, this.createRelayStatusListener());

      await new Promise(resolve => setTimeout(resolve, 1000));

      await this.getWalletInfo();

      console.log('NWC service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize NWC service:', error);
      throw new Error(
        `Failed to initialize wallet: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private createRelayStatusListener(): RelayStatusListener {
    return {
      onRelayStatusChange: async (relay_url: string, status: number): Promise<void> => {
        const statusString = mapNumericStatusToString(status);
        console.log(`[NWC STATUS] Relay: ${relay_url} → ${statusString} (${status})`);

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
                  console.log(`Attempting NWC relay reconnection: ${relay_url}`);
                  await this.client.reconnectRelay(relay_url);
                  console.log(`NWC relay reconnected successfully: ${relay_url}`);
                }
              } catch (error) {
                console.error(`NWC auto-reconnect failed for relay ${relay_url}:`, error);
              }
            }, 2000);
          }
        }
      },
    };
  }

  async getWalletInfo(): Promise<WalletInfo> {
    if (!this.client) {
      throw new Error('NWC client not initialized');
    }

    console.log('Fetching wallet info...');
    const info: GetInfoResponse = await this.client.getInfo();
    const balance = await this.client.getBalance();

    return {
      alias: info.alias,
      balanceInSats: balance,
    };
  }

  async sendPayment(paymentRequest: string, amountSats: bigint): Promise<string> {
    if (!this.client) {
      throw new Error('NWC client not initialized');
    }

    try {
      console.log(`Sending payment of ${amountSats} sats for invoice: ${paymentRequest}`);
      const preimage = await this.client.payInvoice(paymentRequest);

      return preimage;
    } catch (error) {
      console.error('Error sending payment:', error);
      throw new Error('Failed to send payment');
    }
  }

  async receivePayment(amountSats: bigint): Promise<string> {
    if (!this.client) {
      throw new Error('NWC client not initialized');
    }

    try {
      const invoice = await this.client.makeInvoice({
        amount: amountSats,
        description: undefined,
        descriptionHash: undefined,
        expiry: undefined,
      });

      return invoice.invoice;
    } catch (error) {
      console.error('Error receiving payment:', error);
      throw new Error('Failed to create invoice');
    }
  }

  async lookupInvoice(invoice: string): Promise<LookupInvoiceResponse> {
    if (!this.client) {
      throw new Error('NWC client not initialized');
    }

    return this.client.lookupInvoice(invoice);
  }
}
