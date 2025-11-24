import { useKey } from '@/context/KeyContext';
import { useECash } from '@/context/ECashContext';
import { WALLET_TYPE } from '@/models/WalletType';

/**
 * Unified hook to check wallet configuration status across all wallet types
 */
export const useWalletStatus = () => {
  const defaultWallet = WALLET_TYPE.BREEZ;

  const { mnemonic, isWalletConnected } = useKey();
  const { wallets, isLoading: eCashLoading } = useECash();
  // const { nwcConnectionStatus } = useNostrService();

  // Basic wallet components
  const hasSeed = Boolean(mnemonic);
  const hasECashWallets = Object.keys(wallets).length > 0;
  const hasLightningWallet = isWalletConnected;
  // const isLightningConnected = nwcConnectionStatus === true;

  // Wallet configuration levels
  const hasBasicSetup = hasSeed; // Has seed phrase
  const hasAnyWallet = hasECashWallets || hasLightningWallet;
  const isFullyConfigured = hasSeed && hasAnyWallet;
  // const isActivelyConnected = hasSeed && (hasECashWallets || isLightningConnected);

  return {
    defaultWallet,

    // Basic components
    hasSeed,
    hasECashWallets,
    hasLightningWallet,
    // isLightningConnected,

    // Configuration levels
    hasBasicSetup,
    hasAnyWallet,
    isFullyConfigured,
    // isActivelyConnected,

    // Loading state
    eCashLoading,

    // Detailed info
    eCashWalletCount: Object.keys(wallets).length,
    // nwcStatus: nwcConnectionStatus,
  };
};
