import WebSocket from 'ws';
import logger from '../utils/logger';
import { asyncLocalStorage, RequestContext } from '../localStorage';
import { getPluginName } from '../connectors/utils/connectorSettingsMapper';
import { getPolicyName } from '../pep/utils/policyMapper';
import { WS_TARGET_URL, USER_HEADER_FOR_CN } from '../config/env';

const targetWs = WS_TARGET_URL;
const userHeaderForCN = USER_HEADER_FOR_CN;
import { lookupUserByCN } from '../connectors/userLookup';
import { runPolicy } from '../pep/policy-executor';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractUserCN(ctx: any): string {
  // Extract common name from header
  const headerKey = userHeaderForCN.toLowerCase();
  const commonNameHeader = ctx.headers[headerKey];
  const commonName = Array.isArray(commonNameHeader)
    ? commonNameHeader[0]
    : commonNameHeader || 'anonymous';

  return commonName;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function constructRequestContext(ctx: any, commonName: string): Promise<RequestContext> {
  const user = await lookupUserByCN(commonName, ctx.path);
  const store = asyncLocalStorage.getStore();
  const context: RequestContext = {
    user: user
      ? {
        id: user.id,
        name: user.name,
        role: user.role,
        cn: commonName,
        authAttributes: user.authAttributes,
      }
      : commonName
        ? {
          id: undefined,
          name: undefined,
          role: undefined,
          cn: commonName,
          authAttributes: undefined,
        }
        : undefined,
    reqId: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    method: ctx.method,
    protocol: ctx.protocol,
    path: ctx.path,
    connectorName: getPluginName(ctx.path) || 'simple',
    policyName: getPolicyName(ctx.path) || store?.policyName || 'mock-always-deny',
    isAllowed: false,
    timestamp: store?.timestamp || new Date().toISOString()
  };
  return context;
}

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
export async function websocketHandler(ctx: any) {
  const context = await constructRequestContext(ctx, extractUserCN(ctx));
  context.isAllowed = await runPolicy(context?.user?.authAttributes ?? '', ctx.path) || false;

  // Block connection if not allowed
  if (!context.isAllowed) {
    if (ctx.websocket.readyState === WebSocket.OPEN) {
      ctx.websocket.close();
      logSocketEventInfo(context, `WebSocket connection denied by policy ${context.policyName}`, 'WS_CLOSE_TRIGGERED_BY_POLICY', 403);
      return;
    }
    logSocketEventInfo(context, `WebSocket connection denied by policy ${context.policyName}`, 'WS_IGNORE_TRIGGERED_BY_POLICY', 403);
    return;
  }
  const target = new WebSocket(targetWs);
  logSocketEventInfo(context, `WebSocket target has been created ${context.policyName}`, 'WS_CREATE_TARGET', target.readyState);

  // Forward messages from client to target
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx.websocket.on('message', (msg: any) => {
    if (target.readyState === WebSocket.OPEN) {
      target.send(msg);
    } else {
      target.once('open', () => target.send(msg));
      logSocketEventInfo(context, `WebSocket target has been created ${context.policyName}`, 'WS_OPEN_TARGET', target.readyState);
    }
    if (Buffer.isBuffer(msg)) {
      logSocketEventDebug(context, msg.toString('hex'), 'WS_MESSAGE_TO_TARGET', target.readyState);
    } else if (typeof msg === 'string') {
      logSocketEventDebug(context, msg, 'WS_MESSAGE_TO_TARGET', target.readyState);
    }
  });

  // Forward messages from target to client
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  target.on('message', (msg: any) => {
    if (ctx.websocket.readyState === WebSocket.OPEN) {
      ctx.websocket.send(msg);
    }
    console.log('>>> target.on message, msg: ', msg.toString('hex'));
    if (Buffer.isBuffer(msg)) {
      logSocketEventDebug(context, msg.toString('hex'), 'WS_MESSAGE_TO_CLIENT', target.readyState);
    } else if (typeof msg === 'string') {
      logSocketEventDebug(context, msg, 'WS_MESSAGE_TO_CLIENT', target.readyState);
    }
  });

  // Handle open events
  ctx.websocket.on('open', () => {
    logSocketEventInfo(context, 'Opened client WebSocket event', 'WS_OPEN_CLIENT', ctx.websocket.readyState);
  });

  target.on('open', () => {
    logSocketEventInfo(context, 'Opened target WebSocket event', 'WS_OPEN_TARGET', target.readyState);
  });

  // Handle close events
  ctx.websocket.on('close', () => {
    logSocketEventInfo(context, 'Closed client WebSocket event', 'WS_CLOSE_CLIENT', ctx.websocket.readyState);
    target.close();
  });

  target.on('close', () => {
    logSocketEventInfo(context, 'Closed target WebSocket event', 'WS_CLOSE_TARGET', target.readyState);
    ctx.websocket.close();
  });

  // Handle errors
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx.websocket.on('error', (err: any) => {
    logSocketEventError(context, err, 'WS_ERROR_CLIENT');
    target.terminate();
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  target.on('error', (err: any) => {
    logSocketEventError(context, err, 'WS_ERROR_TARGET');
    ctx.websocket.terminate();
  });
}
