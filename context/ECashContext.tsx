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

  const sqliteContext = useSQLiteContext();
  const DB = new DatabaseService(sqliteContext);

  useEffect(() => {
    const fetchWallets = async () => {
      console.log('ECashContext: Starting wallet fetch...');
      setIsLoading(true);
      try {
        const pairList = await DB.getMintUnitPairs();
        console.log('ECashContext: Loading wallets from pairs:', pairList);

        if (pairList.length === 0) {
          console.log('ECashContext: No wallet pairs found in database');
        }

        // Use Promise.all to properly await all wallet additions
        await Promise.all(
          pairList.map(async ([mintUrl, unit]) => {
            try {
              await addWallet(mintUrl, unit);
              console.log(`ECashContext: Added wallet for ${mintUrl}-${unit}`);
            } catch (error) {
              console.error(`ECashContext: Error adding wallet for ${mintUrl}-${unit}:`, error);
            }
          })
        );

        console.log('ECashContext: Wallets loaded:', Object.keys(wallets));
      } catch (e) {
        console.error('ECashContext: Error fetching wallets:', e);
      }
      setIsLoading(false);
    };

    fetchWallets();
  }, []);

  // Add a new wallet
  const addWallet = async (mintUrl: string, unit: string): Promise<CashuWalletInterface> => {
    console.log(`Adding wallet for ${mintUrl}-${unit}`);

    const walletInMap = wallets[`${mintUrl}-${unit}`];
    if (walletInMap) {
      console.log(`Wallet already exists for ${mintUrl}-${unit}`);
      return walletInMap;
    }

    console.log(`Creating new wallet for ${mintUrl}-${unit}`);
    const seed = new Mnemonic(mnemonic).deriveCashu();
    const storage = new CashuStorage(DB);
    const wallet = await CashuWallet.create(mintUrl, unit, seed, storage);

    try {
      setWallets(prev => {
        const newMap = { ...prev };
        newMap[`${mintUrl}-${unit}`] = wallet;
        console.log(`Wallet added to state: ${mintUrl}-${unit}`);
        return newMap;
      });

      return wallet;
    } catch (error) {
      console.error('Error adding wallet:', error);
      throw error;
    }
  };

  // Remove a wallet
  const removeWallet = async (mintUrl: string, unit: string) => {
    try {
      setWallets(prev => {
        const newMap = { ...prev };
        delete newMap[`${mintUrl}-${unit}`];
        return newMap;
      });
    } catch (error) {
      console.error('Error removing wallet:', error);
    }
  };

  const getWallet = (mintUrl: string, unit: string): CashuWalletInterface | null => {
    return wallets[`${mintUrl}-${unit}`] || null;
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
