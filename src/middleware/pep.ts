// middleware/auth.ts
import { Middleware } from 'koa';
import { asyncLocalStorage } from '../types/localStorage';
import { ACCESS_DENY_ERROR_MSG, DYNAMIC_ROUTES_INVENTORY_PREFIX } from '../config/env';



export const pepMiddleware: Middleware = async (ctx, next) => {
  const store = asyncLocalStorage.getStore();
  if (!store?.isAllowed) {
    ctx.status = 403;
    ctx.type = 'html';
    ctx.body = ACCESS_DENY_ERROR_MSG.replace('__SERVICES_PREFIX__', DYNAMIC_ROUTES_INVENTORY_PREFIX);
    return; // Deny access
  }

  await next(); // Allow access
};
