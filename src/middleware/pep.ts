// middleware/auth.ts
import { Middleware } from 'koa';


export const pepMiddleware: Middleware = async (ctx, next) => {

  // if (token) {
  //   try {
  //     };
  //   } catch (err) {
  //     console.warn('Invalid token');
  //   }
  // }
  await next();
};
