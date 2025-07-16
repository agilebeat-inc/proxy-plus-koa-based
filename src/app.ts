// app.ts
import Koa from 'koa';
import websockify from 'koa-websocket';
import WebSocket from 'ws';

import proxyRouter from './routes/proxy';
import { pepMiddleware } from './middleware/pep';
import { contextMiddleware } from './middleware/context';
import { loggerMiddleware } from './middleware/logger';
import { userMiddleware } from './middleware/user';

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

app.ws.use((ctx) => {
  // if (ctx.path !== '/ws') {
  //   ctx.websocket.close(1008, 'Invalid path');
  //   return;
  // }
  // // Check if the request is a WebSocket upgrade
  // if (!ctx.websocket) {
  //   // No websocket available, just return
  //   return;
  // } 

  console.log('WebSocket connection established:', ctx.path);

  // Connect to the target WebSocket server
  const target = new WebSocket('ws://10.82.1.228:7687/');

  // Forward messages from client to target
  ctx.websocket.on('message', (msg) => {
    let m = msg;
    if (target.readyState === WebSocket.OPEN) {
      target.send(msg);
    } else {
      target.once('open', () => target.send(msg));
    }
  });

  // Forward messages from target to client
  target.on('message', (msg) => {
    if (ctx.websocket.readyState === WebSocket.OPEN) {
      ctx.websocket.send(msg);
    }
  });

  // Handle open events
  ctx.websocket.on('open', () => {
    console.log('Client WebSocket connection opened');
  });

  // Handle close events
  ctx.websocket.on('close', () => {
    target.close();
  });
  target.on('close', () => {
    ctx.websocket.close();
  });

  // Handle errors
  ctx.websocket.on('error', (err) => {
    console.error('Client WebSocket error:', err);
    target.terminate();
  });
  target.on('error', (err) => {
    console.error('Target WebSocket error:', err);
    ctx.websocket.terminate();
  });
});

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});