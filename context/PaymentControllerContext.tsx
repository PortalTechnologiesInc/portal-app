import { createContext, type ReactNode, useContext, useEffect } from 'react';
import { ActivityStatus, globalEvents } from '@/utils/common';
import { useDatabaseContext } from './DatabaseContext';
import { useNostrService } from './NostrServiceContext';
import { PaymentAction } from '@/utils/types';

type PaymentControllerContextType = Record<string, never>;

const PaymentControllerContext = createContext<PaymentControllerContextType | undefined>(undefined);

export function PaymentControllerProvider({ children }: { children: ReactNode }) {
  const { executeOperation } = useDatabaseContext();
  const { nwcWallet } = useNostrService(); //TODO: handle other wallets

  useEffect(() => {
    if (!nwcWallet) return;
    executeOperation(async db => {
      const pendingPayments = await db.getPendingPayments();
      for (const element of pendingPayments) {
        const invoice = element.invoice;
        if (!invoice) {
          continue;
        }
        const activityToBeRefunded = element.refunded_activity_id;
        const invoiceToBeRefunded =
          activityToBeRefunded ?
            ((await db.getActivity(activityToBeRefunded))?.invoice ?? null)
            : null;

        try {
          const lookupResponse = await nwcWallet.lookupInvoice(invoice);
          if (lookupResponse.settledAt || lookupResponse.preimage) {
            await db.updateActivityStatus(element.id, ActivityStatus.Positive, 'Payment completed');
            await db.addPaymentStatusEntry(invoice, PaymentAction.PaymentCompleted);
            globalEvents.emit('activityUpdated', { activityId: element.id });
            if (activityToBeRefunded && invoiceToBeRefunded) {
              await db.updateActivityStatus(activityToBeRefunded, ActivityStatus.Neutral, 'Payment has been refunded');
              await db.addPaymentStatusEntry(invoiceToBeRefunded, PaymentAction.RefundCompleted);
              globalEvents.emit('activityUpdated', { activityId: activityToBeRefunded });
            }
          } else if (
            !lookupResponse.settledAt &&
            lookupResponse.expiresAt &&
            Number(lookupResponse.expiresAt) * 1000 < Date.now()
          ) {
            await db.updateActivityStatus(element.id, ActivityStatus.Negative, 'Invoice expired');
            await db.addPaymentStatusEntry(invoice, PaymentAction.PaymentFailed);
            globalEvents.emit('activityUpdated', { activityId: element.id });
            if (activityToBeRefunded && invoiceToBeRefunded) {
              await db.addPaymentStatusEntry(invoiceToBeRefunded, PaymentAction.RefundFailed);
            }
          }
        } catch (_error) {
          await db.updateActivityStatus(element.id, ActivityStatus.Negative, 'Payment failed');
          await db.addPaymentStatusEntry(invoice, PaymentAction.PaymentFailed);
          globalEvents.emit('activityUpdated', { activityId: element.id });
          if (activityToBeRefunded && invoiceToBeRefunded) {
            await db.addPaymentStatusEntry(invoiceToBeRefunded, PaymentAction.RefundFailed);
          }
        }
      }
    });
  }, [nwcWallet, executeOperation]);

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
