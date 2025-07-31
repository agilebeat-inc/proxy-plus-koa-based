import WebSocket from 'ws';
import logger from '../utils/logger';

export function websocketHandler(ctx: any, targetUrl: string) {
  // Use provided targetUrl or fallback to env/default
  const wsTarget = targetUrl;
  // Connect to the target WebSocket server
  const target = new WebSocket(wsTarget);

  // Forward messages from client to target
  ctx.websocket.on('message', (msg: any) => {
    logger.debug(`[client socket][message]: ${msg}`);
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
    logger.debug(`[client socket][On Open]: ${typeof ctx.websocket === 'object' ? JSON.stringify(ctx.websocket) : ctx.websocket}`);
  });

  target.on('open', () => {
    logger.debug(`[target socket][On Open]: ${typeof target === 'object' ? JSON.stringify(target) : target}`);
  });

  // Handle close events
  ctx.websocket.on('close', () => {
    logger.debug(`[client socket][On Close]: ${typeof ctx.websocket === 'object' ? JSON.stringify(ctx.websocket) : ctx.websocket}`);
    target.close();
  });

  target.on('close', () => {
    logger.debug(`[target socket][On Close]: ${typeof target === 'object' ? JSON.stringify(target) : target}`);
    ctx.websocket.close();
  });

  // Handle errors
  ctx.websocket.on('error', (err: any) => {
    logger.error(`[client socket][On Error]: ${typeof err === 'object' ? JSON.stringify(err) : err}`);
    target.terminate();
  });

  target.on('error', (err: any) => {
    logger.error(`[target socket][On Error]: ${typeof err === 'object' ? JSON.stringify(err) : err}`);
    ctx.websocket.terminate();
  });
}
