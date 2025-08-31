// app.ts
import Koa from 'koa';
import websockify from 'koa-websocket';
import { websocketHandler } from './middleware/websocketHandler';

import proxyRouter from './routes/proxy';
import { policyRendererMiddleware } from './middleware/policyRenderer';
import { pepMiddleware } from './middleware/pep';
import { loggerMiddleware } from './middleware/logger';
import { userMiddleware } from './middleware/user';
import { WS_TARGET_URL, USER_HEADER_FOR_CN } from './config/env';
import logger from './utils/logger';
import { asyncLocalStorage, RequestContext } from './localStorage';
import { getPluginName } from './connectors/utils/connectorSettingsMapper';


const app = websockify(new Koa({ asyncLocalStorage: true }));

// Order do matters
app.use(userMiddleware);
app.use(policyRendererMiddleware);
app.use(loggerMiddleware);  //logger captures statements
app.use(pepMiddleware);     //pep denies or accepts based on state in localStorage

app.use(proxyRouter.routes()); // routing starts here
app.use(proxyRouter.allowedMethods());

const targetWs = WS_TARGET_URL;
const userHeaderForCN = USER_HEADER_FOR_CN;
const { lookupUserByCN } = require('./connectors/userLookup');
const { runPolicy } = require('./pep/policy-executor');

app.ws.use(async (ctx) => {
  const store = asyncLocalStorage.getStore();
  // Extract common name from header
  const headerKey = userHeaderForCN.toLowerCase();
  const commonNameHeader = ctx.headers[headerKey];
  const commonName = Array.isArray(commonNameHeader)
    ? commonNameHeader[0]
    : commonNameHeader || 'anonymous';

  const user = await lookupUserByCN(commonName, ctx.path);

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
    policyName: store?.policyName || 'mock-always-deny',
    isAllowed: false,
    timestamp: store?.timestamp || new Date().toISOString()
  };

  context.isAllowed = await runPolicy(user?.authAttributes, ctx.path) || false;



  const start = Date.now();
  const logStart = {
    timestamp: context?.timestamp,
    reqId: context?.reqId,
    method: context?.method,
    protocol: context?.protocol,
    path: context?.path,
    event: 'WS_START',
    user: context?.user,
    connectorName: context?.connectorName,
    policyName: context.policyName,
  };
  logger.info(logStart);

  if (!context.isAllowed) {
    // Close websocket and don't allow any further communication
    ctx.websocket.close();
    logger.info({
      timestamp: new Date().toISOString(),
      reqId: context.reqId,
      status: 403,
      event: 'WS_DENY',
      path: context.path,
      user: context.user,
      policyName: context.policyName,
      message: 'WebSocket has been closed due to policy'
    });
    return;
  }

  ctx.websocket.on('message', (data) => {
    if (Buffer.isBuffer(data)) {
      logger.debug('WS(hex):', data.toString('hex'));
    } else {
      logger.debug('WS(text):', data);
    }
  });

  if (!context.isAllowed) {
    websocketHandler(ctx, targetWs);
  }
});

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});