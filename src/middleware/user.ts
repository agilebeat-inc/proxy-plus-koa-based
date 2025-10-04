import { Middleware } from 'koa';
import { asyncLocalStorage, RequestContext } from '../localStorage';
import logger from '../utils/logger';

import { USER_HEADER_FOR_CN } from '../config/env';
import { getPluginName } from '../connectors/utils/connectorSettingsMapper';

const userHeaderForCN = USER_HEADER_FOR_CN;
// Import the JS connector
import { lookupUserByCN } from '../connectors/userLookup';

export const userMiddleware: Middleware = async (ctx, next) => {
  const store = asyncLocalStorage.getStore();
  let user = ctx.state.user;

  // Extract common name from header
  const headerKey = userHeaderForCN.toLowerCase();
  const commonNameHeader = ctx.headers[headerKey];
  const commonName = Array.isArray(commonNameHeader)
    ? commonNameHeader[0]
    : commonNameHeader || 'anonymous';

  // If user is not set but we have a common name, try to look up user info externally
  if (!user) {
    if (commonName) {
      try {
        user = await lookupUserByCN(commonName, ctx.path);
        if (user) {
          logger.debug(`User found for common name ${commonName}: ${JSON.stringify(user)}`);
        } else {
          logger.warn(`No user found for common name ${commonName}`);
        }
      } catch (error) {
        logger.error(`Error looking up user by common name ${commonName}: ${error instanceof Error ? error.stack || error.message : JSON.stringify(error)}`);
      }
    }
  }

  const context: RequestContext = {
    user: user
      ? {
        id: user.id,
        name: user.name,
        role: user.role,
        cn: commonName,
        authAttributes: user.authAttributes,
      }
      : commonName
        ? {
          id: undefined,
          name: undefined,
          role: undefined,
          cn: commonName,
          authAttributes: undefined,
        }
        : undefined,
    reqId: store?.reqId || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    method: store?.method || ctx.method,
    protocol: store?.protocol || ctx.protocol,
    path: store?.path || ctx.path,
    connectorName: getPluginName(ctx.path) || store?.connectorName || 'simple',
    policyName: store?.policyName || 'mock-always-deny',
    isAllowed: store?.isAllowed || false,
    timestamp: store?.timestamp || new Date().toISOString()
  };

  // Run the next middleware with the context stored in asyncLocalStorage
  // This allows other middlewares to access the context
  // and use the user information if available
  return asyncLocalStorage.run(context, async () => {
    await next();
  });
};