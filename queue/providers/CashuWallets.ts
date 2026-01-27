import type { CashuWalletInterface } from 'portal-app-lib';

export class CashuWalletMethodsProvider {
  constructor(
    private readonly addWalletCallback: (
      mintUrl: string,
      unit: string
    ) => Promise<CashuWalletInterface>,
    private readonly getWalletCallback: (
      mintUrl: string,
      unit: string
    ) => CashuWalletInterface | null,
    private readonly removeWalletCallback: (mintUrl: string, unit: string) => Promise<void>
  ) {}

  addWallet(mintUrl: string, unit: string): Promise<CashuWalletInterface> {
    return this.addWalletCallback(mintUrl, unit);
  }
  getWallet(mintUrl: string, unit: string): CashuWalletInterface | null {
    return this.getWalletCallback(mintUrl, unit);
  }
  removeWallet(mintUrl: string, unit: string): Promise<void> {
    return this.removeWalletCallback(mintUrl, unit);
  }
}
