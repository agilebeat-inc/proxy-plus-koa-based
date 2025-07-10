// app.ts
import Koa from 'koa';
import proxyRouter from './routes/proxy';
import { pepMiddleware } from './middleware/pep';
import { contextMiddleware } from './middleware/context';
import { loggerMiddleware } from './middleware/logger';
import { userMiddleware } from './middleware/user';

const app = new Koa({ asyncLocalStorage: true });

app.use(userMiddleware);
// app.use(pepMiddleware);
app.use(contextMiddleware);
app.use(loggerMiddleware);

app.use(proxyRouter.routes());
app.use(proxyRouter.allowedMethods());

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});