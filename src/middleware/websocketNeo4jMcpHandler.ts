import WebSocket from 'ws';
import logger from '../utils/logger';
import { RequestContext } from '../localStorage';
import { MCP_WS_AUTH_HEADER, MCP_WS_TARGET_URL } from '../config/env';
import { constructRequestContext, extractUserCN } from '../utils/requestContextHelper';
import { runPolicy } from '../pep/policy-executor';
import { Next } from 'koa';

function logSocketEventInfo(context: RequestContext, message: string, event: string, status?: number) {
  logger.info({
    timestamp: new Date().toISOString(),
    reqId: context.reqId,
    status: status,
    event: event,
    path: context.path,
    user: context.user,
    policyName: context.policyName,
    message: message
  });
}

function logSocketEventDebug(context: RequestContext, message: string, event: string, status?: number) {
  logger.debug({
    timestamp: new Date().toISOString(),
    reqId: context.reqId,
    status: status,
    event: event,
    path: context.path,
    user: context.user,
    policyName: context.policyName,
    message: message
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function logSocketEventError(context: RequestContext, error: any, event: string, status?: number) {
  logger.error({
    timestamp: new Date().toISOString(),
    reqId: context.reqId,
    status: status,
    event: event,
    path: context.path,
    user: context.user,
    policyName: context.policyName,
    message: error?.message || error,
    stack: error?.stack
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function websocketNeo4jMcpHandler(ctx: any, _next: Next | undefined) {
  const userCN = extractUserCN(ctx);
  let context: RequestContext | null = null;
  let isContextResolved = false;
  const contextPromise = (async () => {
    context = await constructRequestContext(ctx, userCN);
    context.isAllowed = (await runPolicy(context?.user?.authAttributes ?? '', ctx.path ?? '')) || false;
    isContextResolved = true;
    return context.isAllowed;
  })();

  const getContext = async (): Promise<RequestContext | null> => {
    if (isContextResolved) {
      return context;
    }
    await contextPromise;
    return context;
  };

  const getIsAllowed = async (): Promise<boolean> => {
    if (!isContextResolved) {
      await getContext();
    }
    return context?.isAllowed ?? false;
  };

  const wsOptions = MCP_WS_AUTH_HEADER ? { headers: { Authorization: MCP_WS_AUTH_HEADER } } : undefined;
  const target = new WebSocket(MCP_WS_TARGET_URL, wsOptions);

  contextPromise
    .then(isAllowed => {
      if (!isAllowed) {
        if (ctx.websocket.readyState === WebSocket.OPEN && context) {
          ctx.websocket.close();
          logSocketEventInfo(
            context,
            `WebSocket connection denied by policy ${context.policyName}`,
            'WS_CLOSE_TRIGGERED_BY_POLICY',
            403
          );
        }
        if (target.readyState === WebSocket.OPEN || target.readyState === WebSocket.CONNECTING) {
          target.terminate();
        }
      }
    })
    .catch(err => {
      logger.error('Error in context resolution:', err);
    });

  // Forward messages from client to target
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx.websocket.on('message', async (msg: any) => {
    const isAllowed = await getIsAllowed();
    if (!isAllowed) {
      if (context) {
        logSocketEventInfo(context, 'Message blocked - not authorized', 'WS_MESSAGE_BLOCKED', target.readyState);
      }
      if (ctx.websocket.readyState === WebSocket.OPEN) {
        ctx.websocket.close();
      }
      target.terminate();
      return;
    }

    if (target.readyState === WebSocket.OPEN) {
      target.send(msg);
    } else {
      target.once('open', () => target.send(msg));
      if (context) {
        logSocketEventInfo(
          context,
          'WebSocket target created for MCP forwarding',
          'WS_OPEN_TARGET',
          target.readyState
        );
      }
    }

    if (context) {
      if (Buffer.isBuffer(msg)) {
        logSocketEventDebug(context, msg.toString('hex'), 'WS_MESSAGE_TO_TARGET', target.readyState);
      } else if (typeof msg === 'string') {
        logSocketEventDebug(context, msg, 'WS_MESSAGE_TO_TARGET', target.readyState);
      }
    }
  });

  // Forward messages from target to client
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  target.on('message', async (msg: any) => {
    await getContext();
    if (ctx.websocket.readyState === WebSocket.OPEN) {
      ctx.websocket.send(msg);
    }
    if (context) {
      if (Buffer.isBuffer(msg)) {
        logSocketEventDebug(context, msg.toString('hex'), 'WS_MESSAGE_TO_CLIENT', target.readyState);
      } else if (typeof msg === 'string') {
        logSocketEventDebug(context, msg, 'WS_MESSAGE_TO_CLIENT', target.readyState);
      }
    }
  });

  // Handle open events
  target.on('open', async () => {
    await getContext();
    if (context) {
      logSocketEventInfo(context, 'Opened target WebSocket event (MCP)', 'WS_OPEN_TARGET', target.readyState);
    }
  });

  ctx.websocket.on('open', async () => {
    await getContext();
    if (context) {
      logSocketEventInfo(context, 'Opened client WebSocket event', 'WS_OPEN_CLIENT', ctx.websocket.readyState);
    }
  });

  // Handle close events
  ctx.websocket.on('close', async () => {
    await getContext();
    if (context) {
      logSocketEventInfo(context, 'Closed client WebSocket event', 'WS_CLOSE_CLIENT', ctx.websocket.readyState);
    }
    target.close();
  });

  target.on('close', async () => {
    await getContext();
    if (context) {
      logSocketEventInfo(context, 'Closed target WebSocket event', 'WS_CLOSE_TARGET', target.readyState);
    }
    ctx.websocket.close();
  });

  // Handle errors
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx.websocket.on('error', async (err: any) => {
    await getContext();
    if (context) {
      logSocketEventError(context, err, 'WS_ERROR_CLIENT');
    }
    target.terminate();
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  target.on('error', async (err: any) => {
    await getContext();
    if (context) {
      logSocketEventError(context, err, 'WS_ERROR_TARGET');
    }
    ctx.websocket.terminate();
  });
}
