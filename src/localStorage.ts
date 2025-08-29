import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  reqId: string;
  method: string;
  path: string;
  timestamp: string;
  user?: {
    id: string;
    name: string;
    role: string;
    cn: string;
    authAttributes?: string;
  };
  connectorName: string;
  policyName: string;
  isAllowed: boolean;
  policyDecision?: {
    Access: string;
    Policy: string;
    Route?: string;
  };
}

export const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();