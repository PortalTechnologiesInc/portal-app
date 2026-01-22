import { type CashuLocalStore, CashuWallet, type CashuWalletInterface } from 'portal-app-lib';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { useDatabaseContext } from '@/context/DatabaseContext';
import { registerContextReset, unregisterContextReset } from '@/services/ContextResetService';
import type { DatabaseService } from '@/services/DatabaseService';
import { getCashuSeedFromKey, hasKey } from '@/utils/keyHelpers';

// Centralized wallet key creation with unit normalization
const createWalletKey = (mintUrl: string, unit: string): string =>
  `${mintUrl}-${unit.toLowerCase()}`;

/**
 * eCash context type definition
 */
interface ECashContextType {
  // Wallet management
  wallets: { [key: string]: CashuWalletInterface };
  isLoading: boolean;

  // Wallet operations
  addWallet: (mintUrl: string, unit: string) => Promise<CashuWalletInterface>;
  removeWallet: (mintUrl: string, unit: string) => Promise<void>;

  // Utility functions
  getWallet: (mintUrl: string, unit: string) => CashuWalletInterface | null;
}

const ECashContext = createContext<ECashContextType | undefined>(undefined);

export function ECashProvider({
  children,
  mnemonic,
  nsec,
}: {
  children: ReactNode;
  mnemonic: string;
  nsec: string;
}) {
  const [wallets, setWallets] = useState<{ [key: string]: CashuWalletInterface }>({});
  const [isLoading, setIsLoading] = useState(false);
  const { executeOperation } = useDatabaseContext();

  // Reset all ECash state to initial values
  // This is called during app reset to ensure clean state
  const resetECash = useCallback(() => {
    setWallets({});
    setIsLoading(false);
  }, []);

  // Add a new wallet with simplified error handling
  const addWallet = useCallback(
    async (mintUrl: string, unit: string): Promise<CashuWalletInterface> => {
      const normalizedUnit = unit.toLowerCase();
      const walletKey = createWalletKey(mintUrl, unit);

      // Check if wallet already exists
      const existingWallet = wallets[walletKey];
      if (existingWallet) {
        return existingWallet;
      }

      // Use new keyHelpers to validate key material existence
      if (!hasKey({ mnemonic, nsec })) {
        throw new Error('Cannot create wallet: key material not available');
      }

      const seed = getCashuSeedFromKey({ mnemonic, nsec });
      const storage = await executeOperation(db => Promise.resolve(new CashuStorage(db)));

      // Create wallet with single timeout (no retry complexity)
      const wallet = await Promise.race([
        CashuWallet.create(mintUrl, normalizedUnit, seed, storage),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Wallet creation timeout')), 8000)
        ),
      ]);

      await wallet.restoreProofs().catch(_error => { });

      setWallets(prev => ({ ...prev, [walletKey]: wallet }));
      return wallet;
    },
    [wallets, mnemonic, nsec, executeOperation]
  );

  // Remove a wallet
  const removeWallet = async (mintUrl: string, unit: string) => {
    try {
      const walletKey = createWalletKey(mintUrl, unit);
      setWallets(prev => {
        const newMap = { ...prev };
        delete newMap[walletKey];
        return newMap;
      });
    } catch (_error) { }
  };

  const getWallet = (mintUrl: string, unit: string): CashuWalletInterface | null => {
    const walletKey = createWalletKey(mintUrl, unit);
    return wallets[walletKey] || null;
  };

  // Register/unregister context reset function
  useEffect(() => {
    registerContextReset(resetECash);

    return () => {
      unregisterContextReset(resetECash);
    };
  }, [resetECash]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: createWalletKey is a pure function defined outside the component, stable and doesn't need to be in dependencies
  useEffect(() => {
    const fetchWallets = async () => {
      // Skip wallet fetching if no key material is available (e.g., during onboarding)
      if (!hasKey({ mnemonic, nsec })) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        // Get wallet pairs from database
        const pairList = await executeOperation(db => db.getMintUnitPairs(), []);

        if (pairList.length === 0) {
          setIsLoading(false);
          return;
        }

        // Filter out duplicates based on normalized keys
        const uniquePairs = pairList.filter((pair, index, self) => {
          const normalizedKey = createWalletKey(pair[0], pair[1]);
          return self.findIndex(p => createWalletKey(p[0], p[1]) === normalizedKey) === index;
        });

        // Create wallets in parallel for better performance
        const results = await Promise.allSettled(
          uniquePairs.map(async ([mintUrl, unit]) => {
            const walletKey = createWalletKey(mintUrl, unit);
            if (wallets[walletKey]) return; // Skip existing
            return addWallet(mintUrl, unit);
          })
        );

        // Log only failures for debugging
        results.forEach((result, index) => {
          if (result.status === 'rejected') {
            const [_mintUrl, _unit] = uniquePairs[index];
          }
        });
      } catch (_error) { }
      setIsLoading(false);
    };

    fetchWallets();
  }, [executeOperation, mnemonic, nsec, addWallet]);

  return (
    <ECashContext.Provider
      value={{
        wallets,
        isLoading,
        addWallet,
        removeWallet,
        getWallet,
      }}
    >
      {children}
    </ECashContext.Provider>
  );
}

export function useECash() {
  const context = useContext(ECashContext);
  if (context === undefined) {
    throw new Error('useECash must be used within an ECashProvider');
  }
  return context;
}

class CashuStorage implements CashuLocalStore {
  constructor(private db: DatabaseService) { }

  async getProofs(
    mintUrl: string | undefined,
    unit: string | undefined,
    state: string | undefined,
    spendingCondition: string | undefined
  ): Promise<Array<string>> {
    try {
      const proofs = await this.db.getCashuProofs(mintUrl, unit, state, spendingCondition);
      return proofs;
    } catch (_error) {
      return [];
    }
  }

  async updateProofs(added: Array<string>, removedYs: Array<string>): Promise<void> {
    await this.db.updateCashuProofs(added, removedYs);
  }

  async updateProofsState(ys: Array<string>, state: string): Promise<void> {
    await this.db.updateCashuProofsState(ys, state);
  }

  async addTransaction(transaction: string): Promise<void> {
    await this.db.addCashuTransaction(transaction);
  }

  async getTransaction(transactionId: string): Promise<string | undefined> {
    try {
      return await this.db.getCashuTransaction(transactionId);
    } catch (_error) {
      return undefined;
    }
  }

  async listTransactions(
    mintUrl: string | undefined,
    direction: string | undefined,
    unit: string | undefined
  ): Promise<Array<string>> {
    try {
      return await this.db.listCashuTransactions(mintUrl, direction, unit);
    } catch (_error) {
      return [];
    }
  }

  async removeTransaction(transactionId: string): Promise<void> {
    await this.db.removeCashuTransaction(transactionId);
  }

  async addMint(mintUrl: string, mintInfo: string | undefined): Promise<void> {
    await this.db.addCashuMint(mintUrl, mintInfo);
  }

  async removeMint(mintUrl: string): Promise<void> {
    await this.db.removeCashuMint(mintUrl);
  }

  async getMint(mintUrl: string): Promise<string | undefined> {
    try {
      return await this.db.getCashuMint(mintUrl);
    } catch (_error) {
      return undefined;
    }
  }

  async getMints(): Promise<Array<string>> {
    try {
      return await this.db.getCashuMints();
    } catch (_error) {
      return [];
    }
  }

  async updateMintUrl(oldMintUrl: string, newMintUrl: string): Promise<void> {
    await this.db.updateCashuMintUrl(oldMintUrl, newMintUrl);
  }

  async addMintKeysets(mintUrl: string, keysets: Array<string>): Promise<void> {
    await this.db.addCashuMintKeysets(mintUrl, keysets);
  }

  async getMintKeysets(mintUrl: string): Promise<Array<string> | undefined> {
    try {
      return await this.db.getCashuMintKeysets(mintUrl);
    } catch (_error) {
      return undefined;
    }
  }

  async getKeysetById(keysetId: string): Promise<string | undefined> {
    try {
      return await this.db.getCashuKeysetById(keysetId);
    } catch (_error) {
      return undefined;
    }
  }

  async addKeys(keyset: string): Promise<void> {
    await this.db.addCashuKeys(keyset);
  }

  async getKeys(id: string): Promise<string | undefined> {
    try {
      return await this.db.getCashuKeys(id);
    } catch (_error) {
      return undefined;
    }
  }

  async removeKeys(id: string): Promise<void> {
    await this.db.removeCashuKeys(id);
  }

  async incrementKeysetCounter(keysetId: string, count: number): Promise<void> {
    await this.db.incrementCashuKeysetCounter(keysetId, count);
  }

  async getKeysetCounter(keysetId: string): Promise<number | undefined> {
    try {
      return await this.db.getCashuKeysetCounter(keysetId);
    } catch (_error) {
      return undefined;
    }
  }
}
