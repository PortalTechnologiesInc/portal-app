import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { DatabaseService } from '@/services/database';
import { PaymentMonitoringService } from '@/services/PaymentMonitoringService';
import { useSQLiteContext } from 'expo-sqlite';
import { LookupInvoiceResponse, MakeInvoiceResponse } from 'portal-app-lib';

import { useNostrService } from '@/context/NostrServiceContext';
import { useActivities } from '@/context/ActivitiesContext';

interface InboundPaymentsContextType {
  paymentMonitoringService: PaymentMonitoringService | null;
}

const InboundPaymentsContext = createContext<InboundPaymentsContextType | undefined>(undefined);

export const InboundPaymentsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [paymentMonitoringService, setPaymentMonitoringService] = useState<PaymentMonitoringService | null>(null);
  const [processedRequests, setProcessedRequests] = useState<{ [key: string]: boolean }>({});

  const sqliteContext = useSQLiteContext();
  const DB = new DatabaseService(sqliteContext);

  const { refreshData } = useActivities();
  const { lookupInvoice, invoiceRequests, makeInvoice, getServiceName } = useNostrService();

  // Initialize PaymentMonitoringService when database is ready
  // useEffect(() => {
  //   const newPaymentMonitoringService = new PaymentMonitoringService(DB, refreshData, lookupInvoice);
  //   setPaymentMonitoringService(newPaymentMonitoringService);
  //   console.log('PaymentMonitoringService initialized in InboundPaymentsContext');
  //   
  //   // Start monitoring pending payments
  //   newPaymentMonitoringService.startMonitoring().catch(error => {
  //     console.error('Error starting payment monitoring:', error);
  //   });

  //   // Cleanup function to stop monitoring when component unmounts
  //   return () => {
  //     if (paymentMonitoringService) {
  //       paymentMonitoringService.stopMonitoring();
  //       console.log('PaymentMonitoringService stopped in InboundPaymentsContext');
  //     }
  //   };
  // }, [DB, refreshData, lookupInvoice, paymentMonitoringService]);

  useEffect(() => {
    for (const { request: event, resolve } of Object.values(invoiceRequests)) {
        if (processedRequests[event.inner.requestId]) {
            continue;
        }
        setProcessedRequests(prev => {
            const newProcessedRequests = { ...prev };
            newProcessedRequests[event.inner.requestId] = true;
            return newProcessedRequests;
        });

        // TODO: we should take into account different currencies instead of assuming it's sats

        (async () => {
          if (event.inner.refundInvoice) {
            console.log('Refund invoice received', event.inner.refundInvoice);

            const activity = await DB.getActivityByInvoice(event.inner.refundInvoice);
            if (!activity) {
              throw new Error('Activity not found for refund invoice');
            }

            if (activity.refund_invoice && activity.status === 'pending') {
              throw new Error('Refund already in progress');
            }

            if (BigInt(activity.amount || 0) !== (event.inner.amount / 1000n)) {
              throw new Error('Amount mismatch for refund invoice');
            }

            const invoice = await makeInvoice(event.inner.amount, `Refund for ${activity.detail}`);

            // Make the activity pending to reflect the refund in progress
            await DB.updateActivityStatus(activity.id, 'pending');
            await DB.updateActivityRefundInvoice(activity.id, invoice.invoice);
            await DB.addPaymentStatusEntry(event.inner.refundInvoice, 'refund_started');
            refreshData();

            // TODO: monitor payment

            return MakeInvoiceResponse.create({
              invoice: invoice.invoice,
              paymentHash: invoice.paymentHash,
            });
          }

          const invoice = await makeInvoice(event.inner.amount, `Payment from ${event.mainKey.toString()}`);

          const serviceName = await getServiceName(event.mainKey.toString());
          const id = await DB.addActivity({
            type: 'spontaneous_pay',
            service_key: event.mainKey.toString(),
            service_name: serviceName || 'Unknown Service',
            detail: 'Payment from ' + serviceName || 'Unknown Service',
            date: new Date(),
            amount: Number(event.inner.amount) / 1000,
            currency: 'sats',
            request_id: event.inner.requestId,
            subscription_id: null,
            status: 'pending',
            invoice: invoice.invoice,
          });
          await DB.addPaymentStatusEntry(invoice.invoice, 'payment_started');
          refreshData();

          // TODO: monitor payment

          return MakeInvoiceResponse.create({
            invoice: invoice.invoice,
            paymentHash: invoice.paymentHash,
          });
        })()
          .catch(e => {
            console.error('Error processing invoice request', e);
          })
          .then(response => resolve(response as MakeInvoiceResponse));

    }

    console.log('Invoice requests:', invoiceRequests);
  }, [invoiceRequests]);

  const contextValue: InboundPaymentsContextType = {
    paymentMonitoringService,
  };

  return (
    <InboundPaymentsContext.Provider value={contextValue}>
      {children}
    </InboundPaymentsContext.Provider>
  );
};

export const useInboundPayments = () => {
  const context = useContext(InboundPaymentsContext);
  if (context === undefined) {
    throw new Error('useInboundPayments must be used within an InboundPaymentsProvider');
  }
  return context;
}; 