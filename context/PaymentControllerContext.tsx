import React, { createContext, type ReactNode, useContext, useEffect } from 'react';
import { globalEvents } from '@/utils/common';
import { useActivities } from './ActivitiesContext';
import { useDatabaseContext } from './DatabaseContext';
import { useNostrService } from './NostrServiceContext';

type PaymentControllerContextType = {};

const PaymentControllerContext = createContext<PaymentControllerContextType | undefined>(undefined);

export function PaymentControllerProvider({ children }: { children: ReactNode }) {
  const { executeOperation } = useDatabaseContext();
  const { nwcWallet } = useNostrService();

  useEffect(() => {
    if (!nwcWallet) return;
    executeOperation(async db => {
      const pendingPayments = await db.getPendingPayments();
      for (const element of pendingPayments) {
        const invoice = element.invoice;
        if (!invoice) {
          console.error(`Activity invoice is null!`);
          continue;
        }

        try {
          console.warn('🧾 looking up for invoice: ', invoice);
          const lookupResponse = await nwcWallet.lookupInvoice(invoice);
          if (lookupResponse.settledAt || lookupResponse.preimage) {
            await db.updateActivityStatus(element.id, 'positive', 'Payment completed');
            globalEvents.emit('activityUpdated', { activityId: element.id });
            await db.addPaymentStatusEntry(invoice, 'payment_completed');
          } else if (
            !lookupResponse.settledAt &&
            lookupResponse.expiresAt &&
            Number(lookupResponse.expiresAt) * 1000 < Date.now()
          ) {
            await db.updateActivityStatus(element.id, 'negative', 'Invoice expired');
            globalEvents.emit('activityUpdated', { activityId: element.id });
            await db.addPaymentStatusEntry(invoice, 'payment_failed');
          }
        } catch (error) {
          console.error(
            'Error while looking for invoice:',
            JSON.stringify(error, Object.getOwnPropertyNames(error))
          );
          await db.updateActivityStatus(element.id, 'negative', 'Payment failed');
          globalEvents.emit('activityUpdated', { activityId: element.id });
        }
      }
    });
  }, [nwcWallet]);

  return (
    <PaymentControllerContext.Provider value={{}}>{children}</PaymentControllerContext.Provider>
  );
}

export function usePaymentController() {
  const context = useContext(PaymentControllerContext);
  if (context === undefined) {
    throw new Error('usePaymentController must be used within a PaymentControllerProvider');
  }
  return context;
}
