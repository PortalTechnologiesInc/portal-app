import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import {
  CashuWallet,
  CashuLocalStore,
  ProofInfo,
  CashuWalletInterface,
  Mnemonic,
} from 'portal-app-lib';
import { useSQLiteContext } from 'expo-sqlite';
import { DatabaseService } from '@/services/database';
import { useDatabase } from '@/context/DatabaseContextProvider';
import { registerContextReset, unregisterContextReset } from '@/services/ContextResetService';

interface WalletKey {
  mintUrl: string;
  unit: string;
}

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

export function ECashProvider({ children, mnemonic }: { children: ReactNode; mnemonic: string }) {
  const [wallets, setWallets] = useState<{ [key: string]: CashuWalletInterface }>({});
  const [isLoading, setIsLoading] = useState(false);
  const { executeOperation } = useDatabase();
  const sqliteContext = useSQLiteContext();

  // Reset all ECash state to initial values
  // This is called during app reset to ensure clean state
  const resetECash = () => {
    console.log('🔄 Resetting ECash state...');

    // Clear all wallets
    setWallets({});
    setIsLoading(false);

    console.log('✅ ECash state reset completed');
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
      console.log('ECashContext: Starting wallet fetch...');
      setIsLoading(true);
      try {
        // Get wallet pairs from database
        const pairList = await executeOperation(db => db.getMintUnitPairs(), []);
        console.log('ECashContext: Loading wallets from pairs:', pairList);

        if (pairList.length === 0) {
          console.log('ECashContext: No wallet pairs found in database');
        }

        // Create wallets sequentially to avoid database conflicts
        // Also handle existing duplicate wallets with different casing
        const processedKeys = new Set<string>();

        for (const [mintUrl, unit] of pairList) {
          try {
            const normalizedKey = `${mintUrl}-${unit.toLowerCase()}`;

            // Skip if we already processed this normalized key
            if (processedKeys.has(normalizedKey)) {
              console.log(
                `ECashContext: Skipping duplicate wallet for ${normalizedKey} (already processed)`
              );
              continue;
            }

            await addWallet(mintUrl, unit);
            processedKeys.add(normalizedKey);
            console.log(`ECashContext: Added wallet for ${mintUrl}-${unit}`);
          } catch (error) {
            console.error(`ECashContext: Error adding wallet for ${mintUrl}-${unit}:`, error);
            // Continue with next wallet instead of failing everything
          }
        }

        console.log('ECashContext: Wallets loaded:', Object.keys(wallets));
      } catch (e) {
        console.error('ECashContext: Error fetching wallets:', e);
      }
      setIsLoading(false);
    };

    fetchWallets();
  }, [executeOperation]); // Simplified dependency

  // Add a new wallet with comprehensive error handling
  const addWallet = async (mintUrl: string, unit: string): Promise<CashuWalletInterface> => {
    // Normalize unit to lowercase to prevent duplicate wallets due to casing differences
    const normalizedUnit = unit.toLowerCase();
    console.log(
      `Adding wallet for ${mintUrl}-${normalizedUnit}` +
        (unit !== normalizedUnit ? ` (normalized from ${unit})` : '')
    );

    const walletInMap = wallets[`${mintUrl}-${normalizedUnit}`];
    if (walletInMap) {
      console.log(`Wallet already exists for ${mintUrl}-${normalizedUnit}`);
      return walletInMap;
    }

    console.log(`Creating new wallet for ${mintUrl}-${normalizedUnit}`);

    try {
      const seed = new Mnemonic(mnemonic).deriveCashu();

      // Create a temporary database service for CashuStorage
      // This is needed because CashuStorage requires a DatabaseService instance
      const storage = new CashuStorage(new DatabaseService(sqliteContext));

      // Add timeout and retry logic for wallet creation
      let wallet: CashuWalletInterface | null = null;
      let retries = 3;

      while (retries > 0 && !wallet) {
        try {
          wallet = (await Promise.race([
            CashuWallet.create(mintUrl, normalizedUnit, seed, storage),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Wallet creation timeout')), 10000)
            ),
          ])) as CashuWalletInterface;
          break;
        } catch (error) {
          retries--;
          if (retries === 0) {
            console.error(`Failed to create wallet after all retries: ${error}`);
            throw error;
          }
          console.warn(`Wallet creation failed, retrying... (${retries} retries left)`);
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s before retry
        }
      }

      if (!wallet) {
        throw new Error('Failed to create wallet after all retries');
      }

      // Restore proofs with error handling
      try {
        const restoredProofs = await wallet.restoreProofs();
        console.log('Restored proofs:', restoredProofs);
      } catch (error) {
        console.warn('Error restoring proofs (continuing anyway):', error);
      }

      setWallets(prev => {
        const newMap = { ...prev };
        newMap[`${mintUrl}-${normalizedUnit}`] = wallet;
        console.log(`Wallet added to state: ${mintUrl}-${normalizedUnit}`);
        return newMap;
      });

      return wallet;
    } catch (error) {
      console.error(`Error creating wallet for ${mintUrl}-${normalizedUnit}:`, error);
      throw error;
    }
  };

  // Remove a wallet
  const removeWallet = async (mintUrl: string, unit: string) => {
    try {
      // Normalize unit to lowercase to match stored wallet keys
      const normalizedUnit = unit.toLowerCase();
      setWallets(prev => {
        const newMap = { ...prev };
        delete newMap[`${mintUrl}-${normalizedUnit}`];
        return newMap;
      });
    } catch (error) {
      console.error('Error removing wallet:', error);
    }
  };

  const getWallet = (mintUrl: string, unit: string): CashuWalletInterface | null => {
    // Normalize unit to lowercase to match stored wallet keys
    const normalizedUnit = unit.toLowerCase();
    return wallets[`${mintUrl}-${normalizedUnit}`] || null;
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
