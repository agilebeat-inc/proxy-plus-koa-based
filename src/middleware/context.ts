import { Middleware } from 'koa';
import { asyncLocalStorage, RequestContext } from '../localStorage';

export const contextMiddleware: Middleware = async (ctx, next) => {
  const store = asyncLocalStorage.getStore();
  const user = ctx.state.user;

  const context: RequestContext = {
    reqId: store?.reqId || `${Date.now()}-${Math.random().toString(36).substring(2, 18)}`,
    method: store?.method || ctx.method,
    path: store?.path || ctx.path,
    timestamp: store?.timestamp || new Date().toISOString(),
    user: store?.user
      ? {
          id: store?.user?.id || user?.id,
          name: store?.user?.name || user?.name,
          role: store?.user?.role || user?.role,
          cn: store?.user?.cn || user?.cn,
        }
      : undefined,
  };

  return asyncLocalStorage.run(context, async () => {
    await next();
  });
};