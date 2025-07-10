import { Middleware } from 'koa';
import { asyncLocalStorage, RequestContext } from '../localStorage';
import { getEnvVar } from '../utils/envHelper';
import logger from '../utils/logger';

// Import the JS connector
const { lookupUserByCN } = require('../connectors/dummy-user');

const cnUserHeader = 'x-user-common-name';
const userHeaderForCN = getEnvVar('USER_HEADER_FOR_CN', cnUserHeader) || cnUserHeader;

export const userMiddleware: Middleware = async (ctx, next) => {
  const store = asyncLocalStorage.getStore();
  let user = ctx.state.user;

  // Extract common name from header
  const headerKey = typeof userHeaderForCN === 'string' ? userHeaderForCN.toLowerCase() : cnUserHeader.toLowerCase();
  const commonNameHeader = ctx.headers[headerKey];
  const commonName = Array.isArray(commonNameHeader)
    ? commonNameHeader[0]
    : commonNameHeader || 'anonymous';

  // If user is not set but we have a common name, try to look up user info externally
  if (!user && commonName && commonName !== 'anonymous') {
    try {
      user = await lookupUserByCN(commonName);
    } catch (err) {
      logger.warn(`[User Middleware] External user lookup failed for CN=${commonName}:`, err);
    }
  }

  const context: RequestContext = {
      user: user
          ? {
              id: user.id,
              name: user.name,
              role: user.role,
              cn: commonName,
          }
          : commonName
              ? {
                  id: undefined,
                  name: undefined,
                  role: undefined,
                  cn: commonName,
              }
              : undefined,
    reqId: store?.reqId || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    method: store?.method || ctx.method,
    path: store?.path || ctx.path,
    timestamp: store?.timestamp || new Date().toISOString()
  };

  // Run the next middleware with the context stored in asyncLocalStorage
  // This allows other middlewares to access the context
  // and use the user information if available
  return asyncLocalStorage.run(context, async () => {
    await next();
  });
};