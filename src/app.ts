// app.ts
import Koa from 'koa';
import websockify from 'koa-websocket';
import { websocketHandler } from './middleware/websocketHandler';

import proxyRouter from './routes/proxy';
import { policyRendererMiddleware } from './middleware/policyRenderer';
import { pepMiddleware } from './middleware/pep';
import { loggerMiddleware } from './middleware/logger';
import { userMiddleware } from './middleware/user';
import logger from './utils/logger';


const app = websockify(new Koa({ asyncLocalStorage: true }));

// Order do matters
app.use(userMiddleware);
app.use(policyRendererMiddleware);
app.use(loggerMiddleware);  //logger captures statements
app.use(pepMiddleware);     //pep denies or accepts based on state in localStorage

app.use(proxyRouter.routes()); // routing starts here
app.use(proxyRouter.allowedMethods());

app.ws.use(async (ctx) => {
    await websocketHandler(ctx);
});

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});