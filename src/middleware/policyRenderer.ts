import { Middleware } from 'koa';
import { asyncLocalStorage, RequestContext } from '../localStorage';
import { getPolicyName} from '../pep/utils/policyMapper';

// Import the JS connector
const { runPolicy } = require('../pep/policy-executor');

export const policyRendererMiddleware: Middleware = async (ctx, next) => {
  const store = asyncLocalStorage.getStore();    
  const user = ctx.state.user || store?.user || undefined;
  const isAllowed = await runPolicy(user?.authAttributes, ctx.path) || false;

  const context: RequestContext = {
    user: user, // Ensure user info is included in context
    reqId: store?.reqId || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    method: store?.method || ctx.method,
    protocol: store?.protocol || ctx.protocol,
    path: store?.path || ctx.path,
    timestamp: store?.timestamp || new Date().toISOString(),
    connectorName: store?.connectorName || 'simple',
    policyName: getPolicyName(ctx.path) || store?.policyName || 'mock-always-deny',
    isAllowed: isAllowed,
    policyDecision: { Access: isAllowed ? 'granted' : 'denied', Policy: getPolicyName(ctx.path), Route: ctx.path }
  };

  return asyncLocalStorage.run(context, async () => {
    await next();
  });
};