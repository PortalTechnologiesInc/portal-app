import type React from 'react';
import {
  createContext,
  useContext,
  useState,
  useEffect, type
    ReactNode,
  useMemo,
  useCallback,
} from 'react'
import type { PendingRequest, PendingRequestType } from '../models/PendingRequest';
import { mockPendingRequests } from '../mocks/PendingRequests';
import { getNostrServiceInstance, LocalAuthChallengeListener, LocalPaymentRequestListener } from '../services/nostr/NostrService'
import { AuthChallengeEvent, CalendarWrapper, Currency, PaymentRequestEvent, PaymentRequestListener, PaymentStatusContent, RecurrenceInfo, RecurringPaymentRequest, RecurringPaymentStatusContent, SinglePaymentRequest, Timestamp } from 'portal-app-lib';

// Preload mock data to avoid loading delay when the context is used
const PRELOADED_REQUESTS = mockPendingRequests;

interface PendingRequestsContextType {
  pendingRequests: PendingRequest[];
  getByType: (type: PendingRequestType) => PendingRequest[];
  getById: (id: string) => PendingRequest | undefined;
  approve: (id: string) => void;
  deny: (id: string) => void;
  hasPending: boolean;
  isLoadingRequest: boolean;
  requestFailed: boolean;
  showSkeletonLoader: () => void;
  setRequestFailed: (failed: boolean) => void;
}

type AuthResolver = { kind: "boolean"; cb: (v: boolean) => void };
type PaymentResolver = { kind: "payment"; cb: (v: PaymentStatusContent) => void };
type RecurringResolver = { kind: "recurring"; cb: (v: RecurringPaymentStatusContent) => void };

type Resolver = AuthResolver | PaymentResolver | RecurringResolver;

const PendingRequestsContext = createContext<PendingRequestsContextType | undefined>(undefined);

export const PendingRequestsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Use preloaded data to avoid loading delay on mount
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>(PRELOADED_REQUESTS);
  const [isLoadingRequest, setIsLoadingRequest] = useState(false);
  const [requestFailed, setRequestFailed] = useState(false);
  const [timeoutId, setTimeoutId] = useState<NodeJS.Timeout | null>(null);
  const [resolvers, setResolvers] = useState<Map<string, Resolver>>(new Map());


  // Memoize hasPending to avoid recalculation on every render
  const hasPending = useMemo(() => {
    return pendingRequests.some(req => req.status === 'pending') || isLoadingRequest;
  }, [pendingRequests, isLoadingRequest]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [timeoutId]);

  // Memoize these functions to prevent recreation on every render
  const getByType = useCallback(
    (type: PendingRequestType) => {
      return pendingRequests.filter(request => request.type === type);
    },
    [pendingRequests]
  );

  const getById = useCallback(
    (id: string) => {
      return pendingRequests.find(request => request.id === id);
    },
    [pendingRequests]
  );

  getNostrServiceInstance().setAuthChallengeListener(new LocalAuthChallengeListener((event: AuthChallengeEvent) => {
    const id = crypto.randomUUID();
    return new Promise((resolve) => {
      resolvers.set(id, { kind: "boolean", cb: resolve })
      setResolvers(resolvers)
    })
  }))

  getNostrServiceInstance().setPaymentRequestListeners(new LocalPaymentRequestListener(
    (event: SinglePaymentRequest) => {
      const id = crypto.randomUUID();
      return new Promise((resolve) => {
        resolvers.set(id, { kind: "payment", cb: resolve })
        setResolvers(resolvers)
      })
    }, (event: RecurringPaymentRequest) => {
      const id = crypto.randomUUID();
      return new Promise((resolve) => {
        resolvers.set(id, { kind: "recurring", cb: resolve })
        setResolvers(resolvers)
      })
    }
  ))

  const approve = useCallback((id: string) => {
    setPendingRequests(prev =>
      prev.map(request => (request.id === id ? { ...request, status: 'approved' } : request))
    );
    const resolver = resolvers.get(id)
    if (resolver) {
      switch (resolver.kind) {
        case "boolean": resolver.cb(true); break;
        case "payment": resolver.cb(new PaymentStatusContent.Pending); break;
        case "recurring": resolver.cb(new RecurringPaymentStatusContent.Confirmed(
          {
            subscriptionId: id,
            authorizedAmount: 100n,
            authorizedCurrency: new Currency.Fiat("$"),
            authorizedRecurrence: {
              until: 0n,
              calendar: {
                inner: {
                  nextOccurrence: function (from: Timestamp): Timestamp | undefined {
                    throw new Error('Function not implemented.');
                  },
                  toCalendarString: function (): string {
                    throw new Error('Function not implemented.');
                  },
                  toHumanReadable: function (showTimezone: boolean): string {
                    throw new Error('Function not implemented.');
                  }
                }
              },
              maxPayments: 24,
              firstPaymentDue: 0n
            }
          }
        )); break;
}
resolvers.delete(id)
setResolvers(resolvers)
    }
  }, []);

const deny = useCallback((id: string) => {
  setPendingRequests(prev =>
    prev.map(request => (request.id === id ? { ...request, status: 'denied' } : request))
  );
  const resolver = resolvers.get(id)
  if (resolver) {
    switch (resolver.kind) {
      case "boolean": resolver.cb(false); break;
      case "payment": resolver.cb(new PaymentStatusContent.Rejected({ reason: "User refused to pay" })); break;
      case "recurring": resolver.cb(new RecurringPaymentStatusContent.Rejected({ reason: "User refused the recurring payment subscription" })); break;
    }
    resolvers.delete(id)
    setResolvers(resolvers)
  }
}, []);

// Show skeleton loader and set timeout for request
const showSkeletonLoader = useCallback(() => {
  // Clean up any existing timeout
  if (timeoutId) {
    clearTimeout(timeoutId);
  }

  setIsLoadingRequest(true);
  setRequestFailed(false);

  // Set new timeout for 10 seconds
  const newTimeoutId = setTimeout(() => {
    setIsLoadingRequest(false);
    setRequestFailed(true);
  }, 10000);

  setTimeoutId(newTimeoutId);
}, [timeoutId]);

// Memoize the context value to prevent recreation on every render
const contextValue = useMemo(
  () => ({
    pendingRequests,
    getByType,
    getById,
    approve,
    deny,
    hasPending,
    isLoadingRequest,
    requestFailed,
    showSkeletonLoader,
    setRequestFailed,
  }),
  [
    pendingRequests,
    getByType,
    getById,
    approve,
    deny,
    hasPending,
    isLoadingRequest,
    requestFailed,
    showSkeletonLoader,
    setRequestFailed,
  ]
);

return (
  <PendingRequestsContext.Provider value={contextValue}>
    {children}
  </PendingRequestsContext.Provider>
);
};

export const usePendingRequests = () => {
  const context = useContext(PendingRequestsContext);
  if (context === undefined) {
    throw new Error('usePendingRequests must be used within a PendingRequestsProvider');
  }
  return context;
};
