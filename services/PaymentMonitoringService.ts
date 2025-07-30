import { LookupInvoiceResponse } from 'portal-app-lib';
import { DatabaseService } from './database';
import { ActivityType } from '@/utils';

export class PaymentMonitoringService {
  private db: DatabaseService;
  private refreshData: () => void;
  private lookupInvoice: (invoice: string) => Promise<LookupInvoiceResponse>;
  private monitoringIntervals: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private isMonitoring = false;

  constructor(db: DatabaseService, refreshData: () => void, lookupInvoice: (invoice: string) => Promise<LookupInvoiceResponse>) {
    this.db = db;
    this.refreshData = refreshData;
    this.lookupInvoice = lookupInvoice;
  }

  /**
   * Start monitoring pending payments at app startup
   */
  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      console.log('Payment monitoring already active');
      return;
    }

    console.log('Starting payment monitoring service...');
    this.isMonitoring = true;

    try {
      // Get all pending payment activities
      const pendingPayments = await this.db.getActivities({
        type: ActivityType.Pay,
        limit: 100, // Reasonable limit
      });

      const pendingPaymentActivities = pendingPayments.filter(
        activity => activity.status === 'pending' && (activity.invoice || activity.refund_invoice)
      );

      console.log(`Found ${pendingPaymentActivities.length} pending payments to monitor`);

      // Start monitoring each pending payment
      for (const activity of pendingPaymentActivities) {
        if (activity.refund_invoice) {
          // Refund payment
          await this.startMonitoringPayment(activity.id, activity.refund_invoice, 'refund');
        } else if (activity.invoice) {
          // Regular payment
          await this.startMonitoringPayment(activity.id, activity.invoice, 'payment');
        }
      }
    } catch (error) {
      console.error('Error starting payment monitoring:', error);
    }
  }

  /**
   * Start monitoring a specific payment
   */
  private async startMonitoringPayment(activityId: string, invoice: string, type: 'payment' | 'refund'): Promise<void> {
    console.log(`Starting monitoring for ${type} ${activityId} with invoice ${invoice}`);

    // Check if this payment is already being monitored
    if (this.monitoringIntervals.has(activityId)) {
      console.log(`Payment ${activityId} is already being monitored`);
      return;
    }

    // Get the payment status entries to determine how long it's been pending
    const paymentStatusEntries = await this.db.getPaymentStatusEntries(invoice);
    
    if (paymentStatusEntries.length === 0) {
      console.log(`No payment status entries found for invoice ${invoice}, skipping monitoring`);
      return;
    }

    // Find the most recent started entry based on type
    const startedEntry = paymentStatusEntries
      .filter(entry => entry.action_type === (type === 'payment' ? 'payment_started' : 'refund_started'))
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())[0];

    if (!startedEntry) {
      console.log(`No ${type}_started entry found for invoice ${invoice}, skipping monitoring`);
      return;
    }

    const timeSinceStarted = Date.now() - startedEntry.created_at.getTime();
    const fiveMinutesInMs = 5 * 60 * 1000;

    // If it's already been more than 5 minutes, mark as failed immediately
    if (timeSinceStarted > fiveMinutesInMs) {
      console.log(`Payment ${activityId} has been pending for more than 5 minutes, marking as failed`);
      await this.markPaymentAsFailed(activityId, invoice, type);
      return;
    }

    // Calculate remaining time to monitor
    const remainingTime = fiveMinutesInMs - timeSinceStarted;
    
    // Poll every 30 seconds instead of using a single timeout
    const pollInterval = 30 * 1000; // 30 seconds
    const maxPolls = Math.ceil(remainingTime / pollInterval);
    let pollCount = 0;
    
    console.log(`Starting polling for payment ${activityId} - will check ${maxPolls} times over ${Math.round(remainingTime / 1000)} seconds`);

    const pollPayment = async () => {
      pollCount++;
      console.log(`Polling payment ${activityId} (${pollCount}/${maxPolls})...`);
      
      try {
        const status = await this.lookupInvoice(invoice);
        if (status.settledAt) {
          console.log(`${type} ${activityId} was completed during monitoring`);
          await this.markPaymentAsCompleted(activityId, invoice, type);
          return;
        }

        // Check if we've reached the timeout
        const currentTimeSinceStarted = Date.now() - startedEntry.created_at.getTime();
        if (currentTimeSinceStarted >= fiveMinutesInMs) {
          console.log(`Payment ${activityId} still pending after 5 minutes, marking as failed`);
          await this.markPaymentAsFailed(activityId, invoice, type);
          this.monitoringIntervals.delete(activityId);
          return;
        }

        // Schedule next poll if we haven't reached max polls
        if (pollCount < maxPolls) {
          const nextPoll = setTimeout(pollPayment, pollInterval);
          this.monitoringIntervals.set(activityId, nextPoll);
        } else {
          console.log(`Payment ${activityId} reached max polls, marking as failed`);
          await this.markPaymentAsFailed(activityId, invoice, type);
          this.monitoringIntervals.delete(activityId);
        }
      } catch (error) {
        console.error(`Error polling payment ${activityId}:`, error);
        // On error, try one more time after a short delay
        if (pollCount < maxPolls) {
          const retryPoll = setTimeout(pollPayment, 5000); // 5 second retry
          this.monitoringIntervals.set(activityId, retryPoll);
        } else {
          console.log(`Payment ${activityId} failed after max retries, marking as failed`);
          await this.markPaymentAsFailed(activityId, invoice, type);
          this.monitoringIntervals.delete(activityId);
        }
      }
    };

    // Start the first poll
    const firstPoll = setTimeout(pollPayment, pollInterval);
    this.monitoringIntervals.set(activityId, firstPoll);
  }

  /**
   * Mark a payment as failed
   */
  private async markPaymentAsFailed(activityId: string, invoice: string, type: 'payment' | 'refund'): Promise<void> {
    try {
      const failedActionType = type === 'payment' ? 'payment_failed' : 'refund_failed';
      await this.db.addPaymentStatusEntry(invoice, failedActionType);
      await this.db.updateActivityStatus(activityId, 'negative');
      this.refreshData();
      
      console.log(`Successfully marked ${type} payment ${activityId} as failed`);
    } catch (error) {
      console.error(`Error marking ${type} payment ${activityId} as failed:`, error);
    }
  }

  /**
   * Mark a payment as completed
   */
  private async markPaymentAsCompleted(activityId: string, invoice: string, type: 'payment' | 'refund'): Promise<void> {
    try {
      const completedActionType = type === 'payment' ? 'payment_completed' : 'refund_completed';
      await this.db.addPaymentStatusEntry(invoice, completedActionType);
      await this.db.updateActivityStatus(activityId, 'positive');
      this.refreshData();

      console.log(`Successfully marked ${type} payment ${activityId} as completed`);
    } catch (error) {
      console.error(`Error marking ${type} payment ${activityId} as completed:`, error);
    }
  }

  /**
   * Stop monitoring all payments
   */
  stopMonitoring(): void {
    console.log('Stopping payment monitoring service...');
    this.isMonitoring = false;

    // Clear all monitoring intervals
    for (const [activityId, interval] of this.monitoringIntervals) {
      clearTimeout(interval);
      console.log(`Stopped monitoring payment ${activityId}`);
    }
    this.monitoringIntervals.clear();
  }

  /**
   * Stop monitoring a specific payment
   */
  stopMonitoringPayment(activityId: string): void {
    const interval = this.monitoringIntervals.get(activityId);
    if (interval) {
      clearTimeout(interval);
      this.monitoringIntervals.delete(activityId);
      console.log(`Stopped monitoring payment ${activityId}`);
    }
  }

  /**
   * Get the number of payments currently being monitored
   */
  getMonitoringCount(): number {
    return this.monitoringIntervals.size;
  }

  /**
   * Check if the service is currently monitoring
   */
  isCurrentlyMonitoring(): boolean {
    return this.isMonitoring;
  }
} 