import { Middleware } from 'koa';
import { asyncLocalStorage, RequestContext } from '../localStorage';

// Import the JS connector
import { constructRequestContext, extractUserCN } from '../utils/requestContextHelper';

export const userMiddleware: Middleware = async (ctx, next) => {
  const commonName = extractUserCN(ctx);  
  const context: RequestContext = await constructRequestContext(ctx, commonName);

  // Run the next middleware with the context stored in asyncLocalStorage
  // This allows other middlewares to access the context
  // and use the user information if available
  return asyncLocalStorage.run(context, async () => {
    await next();
  });
};