import {
  IncomingPaymentRequest_Tags,
  keyToHex,
  type PortalAppInterface,
  type RecurringPaymentRequest,
  type SinglePaymentRequest,
} from 'portal-app-lib';
import { HandleCancelSubscriptionResponseTask } from '@/queue/tasks/HandleCancelSubscriptionResponse';
import { HandleCashuBurnRequestTask } from '@/queue/tasks/HandleCashuBurnRequest';
import { HandleCashuDirectContentTask } from '@/queue/tasks/HandleCashuDirectContent';
import { HandleNostrConnectRequestTask } from '@/queue/tasks/HandleNostrConnectRequest';
import { HandleRecurringPaymentRequestTask } from '@/queue/tasks/HandleRecurringPaymentRequest';
import { HandleSinglePaymentRequestTask } from '@/queue/tasks/HandleSinglePaymentRequest';
import { ProcessAuthRequestTask } from '@/queue/tasks/ProcessAuthRequest';
import { enqueueTask } from '@/queue/WorkQueue';

//cashu receive token
export async function listenForCashuDirect(app: PortalAppInterface) {
  while (true) {
    try {
      const event = await app.nextCashuDirect();
      const task = new HandleCashuDirectContentTask(event);
      console.log('[PortalAppContext] Enqueuing HandleCashuDirectContentTask.');
      enqueueTask(task);
    } catch (error) {
      console.error('[PortalAppContext] Error running task', error);
    }
  }
}

// listener to burn tokens
export async function listenForCashuRequest(app: PortalAppInterface) {
  while (true) {
    try {
      const event = await app.nextCashuRequest();
      const task = new HandleCashuBurnRequestTask(event);
      console.log('[PortalAppContext] Enqueuing HandleCashuBurnRequestTask.');
      enqueueTask(task);
    } catch (error) {
      console.error('[PortalAppContext] Error running task', error);
    }
  }
}

export async function listenForAuthChallenge(app: PortalAppInterface) {
  while (true) {
    try {
      const event = await app.nextAuthChallenge();
      const id = event.eventId;
      const task = new ProcessAuthRequestTask(event);
      console.log('[PortalAppContext] Enqueuing ProcessAuthRequestTask for request:', id);
      enqueueTask(task);
    } catch (error) {
      console.error('[PortalAppContext] Error running task', error);
    }
  }
}

export async function listenForPaymentRequest(app: PortalAppInterface) {
  while (true) {
    try {
      const event = await app.nextPaymentRequest();
      switch (event.tag) {
        case IncomingPaymentRequest_Tags.Single: {
          const singlePaymentRequest = event.inner[0] as SinglePaymentRequest;
          const task = await new HandleSinglePaymentRequestTask(singlePaymentRequest);
          console.log(
            '[PortalAppContext] Enqueuing HandleSinglePaymentRequestTask for request:',
            singlePaymentRequest.eventId
          );
          enqueueTask(task);
          break;
        }
        case IncomingPaymentRequest_Tags.Recurring: {
          const recurringPaymentRequest = event.inner[0] as RecurringPaymentRequest;
          const task = await new HandleRecurringPaymentRequestTask(recurringPaymentRequest);
          console.log(
            '[PortalAppContext] Enqueuing HandleRecurringPaymentRequestTask for request:',
            recurringPaymentRequest.eventId
          );
          enqueueTask(task);
          break;
        }
      }
      const id = event.inner[0].eventId;
    } catch (error) {
      console.error('[PortalAppContext] Error running task', error);
    }
  }
}

// Listen for closed recurring payments
export async function listenForDeletedSubscription(app: PortalAppInterface) {
  while (true) {
    try {
      const event = await app.nextClosedRecurringPayment();
      const task = new HandleCancelSubscriptionResponseTask(event);
      console.log('[PortalAppContext] Enqueuing HandleCancelSubscriptionResponseTask');
      enqueueTask(task);
    } catch (error) {
      console.error('[PortalAppContext] Error running task', error);
    }
  }
}

export async function listenForNostrConnectRequest(app: PortalAppInterface, portalAppNpub: string) {
  while (true) {
    try {
      const event = await app.nextNip46Request();
      const task = new HandleNostrConnectRequestTask(event, keyToHex(portalAppNpub));
      console.log('[PortalAppContext] Enqueuing HandleNostrConnectRequestTask');
      enqueueTask(task);
    } catch (error) {
      console.error('[PortalAppContext] Error running task', error);
    }
  }
}
