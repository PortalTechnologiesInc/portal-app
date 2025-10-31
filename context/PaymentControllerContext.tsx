import React, { createContext, useContext, ReactNode, useEffect } from 'react';
import { useDatabaseContext } from './DatabaseContext';
import { useNostrService } from './NostrServiceContext';

interface PaymentControllerContextType {
  // Empty for now, can be expanded later
}

const PaymentControllerContext = createContext<PaymentControllerContextType | undefined>(undefined);

export function PaymentControllerProvider({ children }: { children: ReactNode }) {
  let { executeOperation } = useDatabaseContext();
  let { nwcWallet } = useNostrService();

  useEffect(() => {
    if (!nwcWallet) return;
    executeOperation(async (db) => {
      (await db.getPendingPayments()).forEach(element => {
        console.warn(`🦮 activity id: ${element.id}`)
        nwcWallet.lookupInvoice(element.invoice).then((lookupResponse) => {
          console.warn(`🦮 invoice lookup: ${lookupResponse.settledAt}`)
          if (lookupResponse.settledAt && lookupResponse.preimage) {
            db.updateActivityStatus(element.id, 'positive', 'Payment completed');
            void import('@/utils/index').then(({ globalEvents }) => {
              globalEvents.emit('activityUpdated', { activityId: element.id });
            });
          } else if (lookupResponse.expiresAt && (Number(lookupResponse.expiresAt) * 1000) < Date.now()) {
            console.warn(`🦮 invoice expired!!!!`)
            db.updateActivityStatus(element.id, 'negative', 'Invoice expired');
            void import('@/utils/index').then(({ globalEvents }) => {
              globalEvents.emit('activityUpdated', { activityId: element.id });
            });
          }
        }).catch((error) => {
          console.warn(`🦮 invoice error!!!: ${error}`)
          db.updateActivityStatus(element.id, 'negative', 'Payment failed');
          void import('@/utils/index').then(({ globalEvents }) => {
            globalEvents.emit('activityUpdated', { activityId: element.id });
          });
        });
      });
    });
  }, [nwcWallet]);

  return (
    <PaymentControllerContext.Provider value={{}}>
      {children}
    </PaymentControllerContext.Provider>
  );
}

export function usePaymentController() {
  const context = useContext(PaymentControllerContext);
  if (context === undefined) {
    throw new Error('usePaymentController must be used within a PaymentControllerProvider');
  }
  return context;
}
