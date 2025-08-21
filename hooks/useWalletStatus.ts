import { useMnemonic } from '@/context/MnemonicContext';
import { useECash } from '@/context/ECashContext';
import { useNostrService } from '@/context/NostrServiceContext';

/**
 * Unified hook to check wallet configuration status across all wallet types
 */
export const useWalletStatus = () => {
  const { mnemonic, isWalletConnected } = useMnemonic();
  const { wallets, isLoading: eCashLoading } = useECash();
  const { nwcConnectionStatus } = useNostrService();

  // Basic wallet components
  const hasSeed = Boolean(mnemonic);
  const hasECashWallets = Object.keys(wallets).length > 0;
  const hasLightningWallet = isWalletConnected;
  const isLightningConnected = nwcConnectionStatus === true;

  // Wallet configuration levels
  const hasBasicSetup = hasSeed; // Has seed phrase
  const hasAnyWallet = hasECashWallets || hasLightningWallet;
  const isFullyConfigured = hasSeed && hasAnyWallet;
  const isActivelyConnected = hasSeed && (hasECashWallets || isLightningConnected);

  // Loading states
  const isLoading = eCashLoading;

  return {
    // Basic components
    hasSeed,
    hasECashWallets,
    hasLightningWallet,
    isLightningConnected,

    // Configuration levels
    hasBasicSetup,
    hasAnyWallet,
    isFullyConfigured,
    isActivelyConnected,

    // Loading state
    isLoading,

    // Detailed info
    eCashWalletCount: Object.keys(wallets).length,
    nwcStatus: nwcConnectionStatus,
  };
};
