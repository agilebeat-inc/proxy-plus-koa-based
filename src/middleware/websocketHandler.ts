
import WebSocket from 'ws';
import type { Context } from 'koa';
import { getEnvVar } from '../utils/envHelper';

export function websocketHandler(ctx: any, targetUrl: string) {
  // Use provided targetUrl or fallback to env/default
  const wsTarget = targetUrl
  // Connect to the target WebSocket server
  const target = new WebSocket(wsTarget);

  // Forward messages from client to target
  ctx.websocket.on('message', (msg: any) => {
    if (target.readyState === WebSocket.OPEN) {
      target.send(msg);
    } else {
      target.once('open', () => target.send(msg));
    }
  });

  // Forward messages from target to client
  target.on('message', (msg: any) => {
    if (ctx.websocket.readyState === WebSocket.OPEN) {
      ctx.websocket.send(msg);
    }
  });

  // Handle open events
  ctx.websocket.on('open', () => {
    // Optionally log or handle open event
  });

  // Handle close events
  ctx.websocket.on('close', () => {
    target.close();
  });
  target.on('close', () => {
    ctx.websocket.close();
  });

  // Handle errors
  ctx.websocket.on('error', (err: any) => {
    target.terminate();
  });
  target.on('error', (err: any) => {
    ctx.websocket.terminate();
  });
}
