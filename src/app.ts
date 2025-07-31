// app.ts
import Koa from 'koa';
import websockify from 'koa-websocket';
import WebSocket from 'ws';
import { websocketHandler } from './middleware/websocketHandler';

import proxyRouter from './routes/proxy';
import { pepMiddleware } from './middleware/pep';
import { contextMiddleware } from './middleware/context';
import { loggerMiddleware } from './middleware/logger';
import { userMiddleware } from './middleware/user';
import { getEnvVar } from './utils/envHelper';

const app = websockify(new Koa({ asyncLocalStorage: true }));

app.use(userMiddleware);
// app.use(pepMiddleware);
app.use(contextMiddleware);
app.use(loggerMiddleware);

app.use(proxyRouter.routes());
app.use(proxyRouter.allowedMethods());

type AuthPayload = {
  user_agent?: string;
  scheme?: string;
  principal?: string;
  credentials?: string;
};

const targetWs = getEnvVar('WS_TARGET_URL', 'ws://10.82.1.228:7687/');

app.ws.use((ctx) => {
  // You can make the target URL configurable if needed
  websocketHandler(ctx, targetWs);
});

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});