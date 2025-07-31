
import WebSocket from 'ws';
import logger from '../utils/logger';

export function websocketHandler(ctx: any, targetUrl: string) {
  // Use provided targetUrl or fallback to env/default
  const wsTarget = targetUrl
  // Connect to the target WebSocket server
  const target = new WebSocket(wsTarget);

  // Forward messages from client to target
  ctx.websocket.on('message', (msg: any) => {
    console.log(`******** message: ${msg}`);
    if (target.readyState === WebSocket.OPEN) {
      target.send(msg);
    } else {
      target.once('open', () => target.send(msg));
    }
  });

  // Forward messages from target to client
  target.on('message', (msg: any) => {
    // Check if the WebSocket connection is open before sending
    if (ctx.websocket.readyState === WebSocket.OPEN) {
      ctx.websocket.send(msg);
    }
  });

  // Handle open events
  ctx.websocket.on('open', () => {
    console.log(`******** WebSocket connection established: ${ctx.websocket}`);
  });

  // Handle close events
  ctx.websocket.on('close', () => {
    console.log(`******** WebSocket connection closed: ${ctx.websocket}`);
    target.close();
  });
 
  target.on('close', () => {
    console.log(`******** WebSocket target close: ${target}`);
    ctx.websocket.close();
  });

  // Handle errors
  ctx.websocket.on('error', (err: any) => {
    logger.error(`******** WebSocket error: ${err}`);
    target.terminate();
  });

  target.on('error', (err: any) => {
    logger.error(`******** WebSocket target error: ${err}`);
    ctx.websocket.terminate();
  });
}
