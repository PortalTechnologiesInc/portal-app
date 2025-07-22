import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { CashuWallet, CashuLocalStore, ProofInfo, CashuWalletInterface, Mnemonic } from 'portal-app-lib';
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

export function ECashProvider({ children, mnemonic }: { children: ReactNode, mnemonic: string }) {
  const [wallets, setWallets] = useState<{ [key: string]: CashuWalletInterface }>({});
  const [isLoading, setIsLoading] = useState(false);

  const sqliteContext = useSQLiteContext();
  const DB = new DatabaseService(sqliteContext);

  useEffect(() => {
    const fetchWallets = async () => {
      setIsLoading(true);
      try {
        const pairList = await DB.getMintUnitPairs();
        pairList.forEach(
          ([mintUrl, unit]) => {
            addWallet(mintUrl, unit);
          }
        )
      } catch (e) {
        console.error(e);
      }
      setIsLoading(false);
    }

    fetchWallets();
  }, []);

  // Add a new wallet
  const addWallet = async (mintUrl: string, unit: string): Promise<CashuWalletInterface> => {
    const walletInMap = wallets[`${mintUrl}-${unit}`];
    if (walletInMap) {
      return walletInMap;
    }

    const seed = new Mnemonic(mnemonic).deriveCashu();
    const storage = new CashuStorage(DB);
    const wallet = await CashuWallet.create(mintUrl, unit, seed, storage);

    try {
      setWallets(prev => {
        const newMap = { ...prev };
        newMap[`${mintUrl}-${unit}`] = wallet;
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

    async getProofs(mintUrl: string | undefined, unit: string | undefined, state: string | undefined, spendingCondition: string | undefined): Promise<Array<string>> {
        console.log('[CashuStorage] getProofs() called');
        try {
            const proofs = await this.db.getCashuProofs(mintUrl, unit, state, spendingCondition);
            return proofs;
        } catch (error) {
            console.error('[CashuStorage] Error getting proofs:', error);
            return [];
        }
    }
    
    async updateProofs(added: Array<string>, removedYs: Array<string>): Promise<void> {
        console.log('[CashuStorage] updateProofs() called', { added, removedYs });
        try {
            await this.db.updateCashuProofs(added, removedYs);
        } catch (error) {
            console.error('[CashuStorage] Error updating proofs:', error);
            throw error;
        }
    }
    
    async updateProofsState(ys: Array<string>, state: string): Promise<void> {
        console.log('[CashuStorage] updateProofsState() called', { ys, state });
        try {
            await this.db.updateCashuProofsState(ys, state);
        } catch (error) {
            console.error('[CashuStorage] Error updating proof states:', error);
            throw error;
        }
    }
    
    async addTransaction(transaction: string): Promise<void> {
        console.log('[CashuStorage] addTransaction() called', { transaction });
        try {
            await this.db.addCashuTransaction(transaction);
        } catch (error) {
            console.error('[CashuStorage] Error adding transaction:', error);
            throw error;
        }
    }
    
    async getTransaction(transactionId: string): Promise<string | undefined> {
        console.log('[CashuStorage] getTransaction() called', { transactionId });
        try {
            return await this.db.getCashuTransaction(transactionId);
        } catch (error) {
            console.error('[CashuStorage] Error getting transaction:', error);
            return undefined;
        }
    }
    
    async listTransactions(mintUrl: string | undefined, direction: string | undefined, unit: string | undefined): Promise<Array<string>> {
        console.log('[CashuStorage] listTransactions() called', { mintUrl, direction, unit });
        try {
            return await this.db.listCashuTransactions(mintUrl, direction, unit);
        } catch (error) {
            console.error('[CashuStorage] Error listing transactions:', error);
            return [];
        }
    }
    
    async removeTransaction(transactionId: string): Promise<void> {
        console.log('[CashuStorage] removeTransaction() called', { transactionId });
        try {
            await this.db.removeCashuTransaction(transactionId);
        } catch (error) {
            console.error('[CashuStorage] Error removing transaction:', error);
            throw error;
        }
    }
    
    async addMint(mintUrl: string, mintInfo: string | undefined): Promise<void> {
        console.log('[CashuStorage] addMint() called', { mintUrl, mintInfo });
        try {
            await this.db.addCashuMint(mintUrl, mintInfo);
        } catch (error) {
            console.error('[CashuStorage] Error adding mint:', error);
            throw error;
        }
    }
    
    async removeMint(mintUrl: string): Promise<void> {
        console.log('[CashuStorage] removeMint() called', { mintUrl });
        try {
            await this.db.removeCashuMint(mintUrl);
        } catch (error) {
            console.error('[CashuStorage] Error removing mint:', error);
            throw error;
        }
    }
    
    async getMint(mintUrl: string): Promise<string | undefined> {
        console.log('[CashuStorage] getMint() called', { mintUrl });
        try {
            return await this.db.getCashuMint(mintUrl);
        } catch (error) {
            console.error('[CashuStorage] Error getting mint:', error);
            return undefined;
        }
    }
    
    async getMints(): Promise<Array<string>> {
        console.log('[CashuStorage] getMints() called');
        try {
            return await this.db.getCashuMints();
        } catch (error) {
            console.error('[CashuStorage] Error getting mints:', error);
            return [];
        }
    }
    
    async updateMintUrl(oldMintUrl: string, newMintUrl: string): Promise<void> {
        console.log('[CashuStorage] updateMintUrl() called', { oldMintUrl, newMintUrl });
        try {
            await this.db.updateCashuMintUrl(oldMintUrl, newMintUrl);
        } catch (error) {
            console.error('[CashuStorage] Error updating mint URL:', error);
            throw error;
        }
    }
    
    async addMintKeysets(mintUrl: string, keysets: Array<string>): Promise<void> {
        console.log('[CashuStorage] addMintKeysets() called', { mintUrl, keysets });
        try {
            await this.db.addCashuMintKeysets(mintUrl, keysets);
        } catch (error) {
            console.error('[CashuStorage] Error adding mint keysets:', error);
            throw error;
        }
    }
    
    async getMintKeysets(mintUrl: string): Promise<Array<string> | undefined> {
        console.log('[CashuStorage] getMintKeysets() called', { mintUrl });
        try {
            return await this.db.getCashuMintKeysets(mintUrl);
        } catch (error) {
            console.error('[CashuStorage] Error getting mint keysets:', error);
            return undefined;
        }
    }
    
    async getKeysetById(keysetId: string): Promise<string | undefined> {
        console.log('[CashuStorage] getKeysetById() called', { keysetId });
        try {
            return await this.db.getCashuKeysetById(keysetId);
        } catch (error) {
            console.error('[CashuStorage] Error getting keyset by ID:', error);
            return undefined;
        }
    }
    
    async addKeys(keyset: string): Promise<void> {
        console.log('[CashuStorage] addKeys() called', { keyset });
        try {
            await this.db.addCashuKeys(keyset);
        } catch (error) {
            console.error('[CashuStorage] Error adding keys:', error);
            throw error;
        }
    }
    
    async getKeys(id: string): Promise<string | undefined> {
        console.log('[CashuStorage] getKeys() called', { id });
        try {
            return await this.db.getCashuKeys(id);
        } catch (error) {
            console.error('[CashuStorage] Error getting keys:', error);
            return undefined;
        }
    }
    
    async removeKeys(id: string): Promise<void> {
        console.log('[CashuStorage] removeKeys() called', { id });
        try {
            await this.db.removeCashuKeys(id);
        } catch (error) {
            console.error('[CashuStorage] Error removing keys:', error);
            throw error;
        }
    }
    
    async incrementKeysetCounter(keysetId: string, count: number): Promise<void> {
        console.log('[CashuStorage] incrementKeysetCounter() called', { keysetId, count });
        try {
            await this.db.incrementCashuKeysetCounter(keysetId, count);
        } catch (error) {
            console.error('[CashuStorage] Error incrementing keyset counter:', error);
            throw error;
        }
    }
    
    async getKeysetCounter(keysetId: string): Promise<number | undefined> {
        console.log('[CashuStorage] getKeysetCounter() called', { keysetId });
        try {
            return await this.db.getCashuKeysetCounter(keysetId);
        } catch (error) {
            console.error('[CashuStorage] Error getting keyset counter:', error);
            return undefined;
        }
    }
}
