import * as FileSystem from 'expo-file-system';
import {
  Seed,
  defaultConfig,
  Network,
  connect,
  BreezSdkInterface,
  ReceivePaymentMethod,
  SendPaymentOptions,
  EventListener,
  SendPaymentMethod,
  OnchainConfirmationSpeed,
  PrepareSendPaymentResponse,
} from '@breeztech/breez-sdk-spark-react-native';
import { Wallet, WALLET_CONNECTION_STATUS, WalletConnectionStatus } from '@/models/WalletType';
import { WalletInfo } from '@/utils';

export class BreezService implements Wallet {
  private client!: BreezSdkInterface;

  private onStatusChange: ((status: WalletConnectionStatus) => void) | null = null;

  static async create(
    mnemonic: string,
    onStatusChange?: (status: WalletConnectionStatus) => void
  ): Promise<BreezService> {
    const instance = new BreezService();
    instance.onStatusChange = onStatusChange || null;
    await instance.init(mnemonic);
    return instance;
  }

  private async init(mnemonic: string) {
    if (this.onStatusChange) {
      this.onStatusChange(WALLET_CONNECTION_STATUS.CONNECTING);
    }
    const seed = new Seed.Mnemonic({ mnemonic, passphrase: undefined });
    const config = defaultConfig(Network.Mainnet);
    config.apiKey = process.env.EXPO_PUBLIC_BREEZ_API_KEY;
    config.preferSparkOverLightning = true;

    const dirUri = FileSystem.documentDirectory + 'breez-wallet';
    const storageDir = dirUri.replace('file://', '');
    await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });

    this.client = await connect({
      config,
      seed,
      storageDir,
    });

    if (this.onStatusChange) {
      this.onStatusChange(WALLET_CONNECTION_STATUS.CONNECTED);
    }
  }

  async getWalletInfo(): Promise<WalletInfo> {
    const res = await this.client.getInfo({ ensureSynced: true });
    return {
      alias: undefined,
      balanceInSats: res.balanceSats,
    };
  }

  // for now only bolt11 invoices are supported
  async receivePayment(amountSats: bigint, description?: string): Promise<string> {
    const response = await this.client.receivePayment({
      paymentMethod: new ReceivePaymentMethod.Bolt11Invoice({
        description: description || 'Payment',
        amountSats,
      }),
    });
    return response.paymentRequest;
  }

  async sendPayment(paymentRequest: string, amountSats: bigint): Promise<string> {
    if (!this.client) {
      throw new Error('Breez SDK is not initialized');
    }
    console.log('Sending payment:', { paymentRequest, amountSats });
    try {
      const prepareResponse = await this.client.prepareSendPayment({
        amount: amountSats,
        paymentRequest,
        tokenIdentifier: undefined,
      });
      console.log('Prepare send payment response:', prepareResponse);
      let sendOptions: SendPaymentOptions | undefined;

      if (prepareResponse.paymentMethod instanceof SendPaymentMethod.Bolt11Invoice) {
        sendOptions = new SendPaymentOptions.Bolt11Invoice({
          preferSpark: true,
          completionTimeoutSecs: 60,
        });
      } else if (prepareResponse.paymentMethod instanceof SendPaymentMethod.BitcoinAddress) {
        sendOptions = new SendPaymentOptions.BitcoinAddress({
          confirmationSpeed: OnchainConfirmationSpeed.Medium,
        });
      }

      const response = await this.client.sendPayment({
        prepareResponse,
        options: sendOptions,
      });

      return response.payment.id;
    } catch (error) {
      console.error('Error sending payment:', JSON.stringify(error));
      throw error;
    }
  }

  async prepareSendPayment(
    paymentRequest: string,
    amountSats: bigint
  ): Promise<PrepareSendPaymentResponse> {
    if (!this.client) {
      throw new Error('Breez SDK is not initialized');
    }

    const prepareResponse = await this.client.prepareSendPayment({
      amount: amountSats,
      paymentRequest,
      tokenIdentifier: undefined,
    });

    return prepareResponse;
  }

  addEventListener(callback: EventListener) {
    return this.client.addEventListener(callback);
  }

  removeEventListener(listenerId: string) {
    return this.client.removeEventListener(listenerId);
  }

  async sendPaymentWithPrepareResponse(
    prepareResponse: PrepareSendPaymentResponse
  ): Promise<string> {
    let sendOptions: SendPaymentOptions | undefined;

    if (prepareResponse.paymentMethod instanceof SendPaymentMethod.Bolt11Invoice) {
      sendOptions = new SendPaymentOptions.Bolt11Invoice({
        preferSpark: true,
        completionTimeoutSecs: 60,
      });
    } else if (prepareResponse.paymentMethod instanceof SendPaymentMethod.BitcoinAddress) {
      sendOptions = new SendPaymentOptions.BitcoinAddress({
        confirmationSpeed: OnchainConfirmationSpeed.Medium,
      });
    }

    const response = await this.client.sendPayment({
      prepareResponse,
      options: sendOptions,
    });

    return response.payment.id;
  }
}
