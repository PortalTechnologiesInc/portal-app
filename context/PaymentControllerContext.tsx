import React, { createContext, useContext, ReactNode, useEffect } from 'react';
import { useDatabaseContext } from './DatabaseContext';
import { useNostrService } from './NostrServiceContext';
import { useActivities } from './ActivitiesContext';

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
      const pendingPayments = await db.getPendingPayments();
      for (const element of pendingPayments) {
        let invoice = element.invoice;
        if (!invoice) {
          console.error(`Activity invoice is null!`);
          continue;
        }

        try {
          console.warn("🧾 looking up for invoice: ", invoice);
          const lookupResponse = await nwcWallet.lookupInvoice(invoice);
          if (lookupResponse.settledAt || lookupResponse.preimage) {
            await db.updateActivityStatus(element.id, 'positive', 'Payment completed');
            void import('@/utils/index').then(({ globalEvents }) => {
              globalEvents.emit('activityUpdated', { activityId: element.id });
            });
            await db.addPaymentStatusEntry(invoice, 'payment_completed');
          } else if (
            !lookupResponse.settledAt &&
            lookupResponse.expiresAt &&
            Number(lookupResponse.expiresAt) * 1000 < Date.now()
          ) {
            await db.updateActivityStatus(element.id, 'negative', 'Invoice expired');
            void import('@/utils/index').then(({ globalEvents }) => {
              globalEvents.emit('activityUpdated', { activityId: element.id });
            });
            await db.addPaymentStatusEntry(invoice, 'payment_failed');
          }
        } catch (error) {
          console.error(
            'Error while looking for invoice:',
            JSON.stringify(error, Object.getOwnPropertyNames(error))
          );
        }
      }
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
