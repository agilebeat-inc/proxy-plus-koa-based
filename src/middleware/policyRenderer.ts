import { Middleware } from 'koa';
import { asyncLocalStorage, RequestContext } from '../localStorage';

// Import the JS connector
const { runPolicy, getPolicyName } = require('../pep/policy-executor');

export const policyRendererMiddleware: Middleware = async (ctx, next) => {
  const store = asyncLocalStorage.getStore();    
  const user = ctx.state.user || store?.user || undefined;
  const isAllowed = await runPolicy(user?.authAttributes, ctx.path) || false;

  const context: RequestContext = {
    user: user, // Ensure user info is included in context
    reqId: store?.reqId || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    method: store?.method || ctx.method,
    path: store?.path || ctx.path,
    timestamp: store?.timestamp || new Date().toISOString(),
    policyName: getPolicyName(),
    isAllowed: isAllowed,
    policyDecision: { Access: isAllowed ? 'granted' : 'denied', Policy: getPolicyName() }
  };

  return asyncLocalStorage.run(context, async () => {
    await next();
  });
};