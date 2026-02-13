import Koa from 'koa';
import websockify from 'koa-websocket';
import { pathToRegexp } from 'path-to-regexp';
import { websocketNeo4jHandler } from '../middleware/websocketNeo4jHandler';
import { websocketAttuHandler } from '../middleware/websocketAttuHandler';
import { DYNAMIC_ROUTES } from '../config/env';
import type { DynamicRouteWebSocketConfig } from '../types/DynamicRoute';
import logger from '../utils/logger';

type RegisteredWebSocketRoute = {
  name: string;
  route: string;
  matcher: RegExp;
  websocket: DynamicRouteWebSocketConfig;
};

function registerWebSocketRoutes(): RegisteredWebSocketRoute[] {
  const registered: RegisteredWebSocketRoute[] = [];
  for (const routeConfig of DYNAMIC_ROUTES) {
    if (!routeConfig.websocket?.target || !routeConfig.websocket.handler) {
      continue;
    }
    if (routeConfig.websocket.handler !== 'neo4j-bolt' && routeConfig.websocket.handler !== 'proxy') {
      logger.error(`Unsupported websocket handler '${routeConfig.websocket.handler}' for route ${routeConfig.route}`);
      continue;
    }
    try {
      registered.push({
        name: routeConfig.name,
        route: routeConfig.route,
        matcher: pathToRegexp(routeConfig.route),
        websocket: routeConfig.websocket
      });
    } catch (error) {
      logger.error(`Invalid websocket route regex: ${routeConfig.route}. Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return registered;
}

const registeredWebSocketRoutes = registerWebSocketRoutes();

registeredWebSocketRoutes.forEach(({ name, route, websocket }) => {
  logger.debug(`[Registered WebSocket Route][Handler: ${websocket.handler}] [Name: ${name}] [Path: ${route}] [Target: ${websocket.target}]`);
});

const websocketRouter = async (ctx: any, next: any) => {
  const matchedRoute = registeredWebSocketRoutes.find(routeConfig => routeConfig.matcher.test(ctx.path));
  if (!matchedRoute) {
    ctx.websocket.close(1008, 'No WebSocket handler configured for this path');
    return;
  }

  if (matchedRoute.websocket.handler === 'neo4j-bolt') {
    return websocketNeo4jHandler(ctx, next, {
      target: matchedRoute.websocket.target
    });
  }

  return websocketAttuHandler(ctx, next, {
    target: matchedRoute.websocket.target,
    authHeader: matchedRoute.websocket.authHeader,
    preserveQueryString: matchedRoute.websocket.preserveQueryString
  });
};

export function createWebsocketEnabledApp() {
  const app = websockify(new Koa({ asyncLocalStorage: true }));
  app.ws.use(websocketRouter);
  return app;
}

