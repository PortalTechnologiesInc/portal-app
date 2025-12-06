import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { CashuWallet, CashuLocalStore, CashuWalletInterface, Mnemonic } from 'portal-app-lib';
import { DatabaseService } from '@/services/DatabaseService';
import { useDatabaseContext } from '@/context/DatabaseContext';
import { registerContextReset, unregisterContextReset } from '@/services/ContextResetService';
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
  const resetECash = () => {
    setWallets({});
    setIsLoading(false);
  };

  // Register/unregister context reset function
  useEffect(() => {
    registerContextReset(resetECash);

    return () => {
      unregisterContextReset(resetECash);
    };
  }, []);

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
            const [mintUrl, unit] = uniquePairs[index];
            console.error(`Failed to create wallet ${mintUrl}-${unit}:`, result.reason);
          }
        });
      } catch (error) {
        console.error('ECashContext: Error fetching wallets:', error);
      }
      setIsLoading(false);
    };

    fetchWallets();
  }, [executeOperation, mnemonic, nsec]);

  // Add a new wallet with simplified error handling
  const addWallet = async (mintUrl: string, unit: string): Promise<CashuWalletInterface> => {
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

    await wallet
      .restoreProofs()
      .catch(error => console.warn(`Proof restoration failed for ${walletKey}:`, error.message));

    setWallets(prev => ({ ...prev, [walletKey]: wallet }));
    return wallet;
  };

  // Remove a wallet
  const removeWallet = async (mintUrl: string, unit: string) => {
    try {
      const walletKey = createWalletKey(mintUrl, unit);
      setWallets(prev => {
        const newMap = { ...prev };
        delete newMap[walletKey];
        return newMap;
      });
    } catch (error) {
      console.error('Error removing wallet:', error);
    }
  };

  const getWallet = (mintUrl: string, unit: string): CashuWalletInterface | null => {
    const walletKey = createWalletKey(mintUrl, unit);
    return wallets[walletKey] || null;
  };

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
  constructor(private db: DatabaseService) {}

  async getProofs(
    mintUrl: string | undefined,
    unit: string | undefined,
    state: string | undefined,
    spendingCondition: string | undefined
  ): Promise<Array<string>> {
    try {
      const proofs = await this.db.getCashuProofs(mintUrl, unit, state, spendingCondition);
      return proofs;
    } catch (error) {
      console.error('[CashuStorage] Error getting proofs:', error);
      return [];
    }
  }

  async updateProofs(added: Array<string>, removedYs: Array<string>): Promise<void> {
    try {
      await this.db.updateCashuProofs(added, removedYs);
    } catch (error) {
      console.error('[CashuStorage] Error updating proofs:', error);
      throw error;
    }
  }

  async updateProofsState(ys: Array<string>, state: string): Promise<void> {
    try {
      await this.db.updateCashuProofsState(ys, state);
    } catch (error) {
      console.error('[CashuStorage] Error updating proof states:', error);
      throw error;
    }
  }

  async addTransaction(transaction: string): Promise<void> {
    try {
      await this.db.addCashuTransaction(transaction);
    } catch (error) {
      console.error('[CashuStorage] Error adding transaction:', error);
      throw error;
    }
  }

  async getTransaction(transactionId: string): Promise<string | undefined> {
    try {
      return await this.db.getCashuTransaction(transactionId);
    } catch (error) {
      console.error('[CashuStorage] Error getting transaction:', error);
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
    } catch (error) {
      console.error('[CashuStorage] Error listing transactions:', error);
      return [];
    }
  }

  async removeTransaction(transactionId: string): Promise<void> {
    try {
      await this.db.removeCashuTransaction(transactionId);
    } catch (error) {
      console.error('[CashuStorage] Error removing transaction:', error);
      throw error;
    }
  }

  async addMint(mintUrl: string, mintInfo: string | undefined): Promise<void> {
    try {
      await this.db.addCashuMint(mintUrl, mintInfo);
    } catch (error) {
      console.error('[CashuStorage] Error adding mint:', error);
      throw error;
    }
  }

  async removeMint(mintUrl: string): Promise<void> {
    try {
      await this.db.removeCashuMint(mintUrl);
    } catch (error) {
      console.error('[CashuStorage] Error removing mint:', error);
      throw error;
    }
  }

  async getMint(mintUrl: string): Promise<string | undefined> {
    try {
      return await this.db.getCashuMint(mintUrl);
    } catch (error) {
      console.error('[CashuStorage] Error getting mint:', error);
      return undefined;
    }
  }

  async getMints(): Promise<Array<string>> {
    try {
      return await this.db.getCashuMints();
    } catch (error) {
      console.error('[CashuStorage] Error getting mints:', error);
      return [];
    }
  }

  async updateMintUrl(oldMintUrl: string, newMintUrl: string): Promise<void> {
    try {
      await this.db.updateCashuMintUrl(oldMintUrl, newMintUrl);
    } catch (error) {
      console.error('[CashuStorage] Error updating mint URL:', error);
      throw error;
    }
  }

  async addMintKeysets(mintUrl: string, keysets: Array<string>): Promise<void> {
    try {
      await this.db.addCashuMintKeysets(mintUrl, keysets);
    } catch (error) {
      console.error('[CashuStorage] Error adding mint keysets:', error);
      throw error;
    }
  }

  async getMintKeysets(mintUrl: string): Promise<Array<string> | undefined> {
    try {
      return await this.db.getCashuMintKeysets(mintUrl);
    } catch (error) {
      console.error('[CashuStorage] Error getting mint keysets:', error);
      return undefined;
    }
  }

  async getKeysetById(keysetId: string): Promise<string | undefined> {
    try {
      return await this.db.getCashuKeysetById(keysetId);
    } catch (error) {
      console.error('[CashuStorage] Error getting keyset by ID:', error);
      return undefined;
    }
  }

  async addKeys(keyset: string): Promise<void> {
    try {
      await this.db.addCashuKeys(keyset);
    } catch (error) {
      console.error('[CashuStorage] Error adding keys:', error);
      throw error;
    }
  }

  async getKeys(id: string): Promise<string | undefined> {
    try {
      return await this.db.getCashuKeys(id);
    } catch (error) {
      console.error('[CashuStorage] Error getting keys:', error);
      return undefined;
    }
  }

  async removeKeys(id: string): Promise<void> {
    try {
      await this.db.removeCashuKeys(id);
    } catch (error) {
      console.error('[CashuStorage] Error removing keys:', error);
      throw error;
    }
  }

  async incrementKeysetCounter(keysetId: string, count: number): Promise<void> {
    try {
      await this.db.incrementCashuKeysetCounter(keysetId, count);
    } catch (error) {
      console.error('[CashuStorage] Error incrementing keyset counter:', error);
      throw error;
    }
  }

  async getKeysetCounter(keysetId: string): Promise<number | undefined> {
    try {
      return await this.db.getCashuKeysetCounter(keysetId);
    } catch (error) {
      console.error('[CashuStorage] Error getting keyset counter:', error);
      return undefined;
    }
  }
}
