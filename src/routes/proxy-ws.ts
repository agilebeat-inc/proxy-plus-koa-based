import Koa from 'koa';
import websockify from 'koa-websocket';
import { pathToRegexp } from 'path-to-regexp';
import { websocketNeo4jHandler } from '../middleware/websocketNeo4jHandler';
import { websocketAttuHandler } from '../middleware/websocketAttuHandler';
import { DYNAMIC_ROUTES } from '../config/env';
import type {
  DynamicRoute,
  DynamicRouteWebSocketConfig,
  DynamicRouteWebSocketHandler
} from '../types/DynamicRoute';
import logger from '../utils/logger';

const NO_HANDLER_CLOSE_CODE = 1008;
const NO_HANDLER_CLOSE_REASON = 'No WebSocket handler configured for this path';
const SUPPORTED_WEBSOCKET_HANDLERS: readonly DynamicRouteWebSocketHandler[] = ['neo4j-bolt', 'attu'];
type WebSocketMiddleware = Parameters<ReturnType<typeof websockify>['ws']['use']>[0];
type WebSocketContext = Parameters<WebSocketMiddleware>[0];
type WebSocketNext = Parameters<WebSocketMiddleware>[1];
type WebSocketRouteHandler = (
  ctx: WebSocketContext,
  next: WebSocketNext,
  websocketConfig: DynamicRouteWebSocketConfig
) => Promise<void>;

type RegisteredWebSocketRoute = {
  name: string;
  route: string;
  matcher: RegExp;
  websocket: DynamicRouteWebSocketConfig;
};

const websocketHandlerByType: Record<DynamicRouteWebSocketHandler, WebSocketRouteHandler> = {
  'neo4j-bolt': async (ctx, next, websocketConfig) =>
    websocketNeo4jHandler(ctx, next, {
      target: websocketConfig.target
    }),
  attu: async (ctx, next, websocketConfig) =>
    websocketAttuHandler(ctx, next, {
      target: websocketConfig.target,
      authHeader: websocketConfig.authHeader,
      preserveQueryString: websocketConfig.preserveQueryString
    })
};

function isSupportedWebSocketHandler(handler: unknown): handler is DynamicRouteWebSocketHandler {
  return (
    typeof handler === 'string' &&
    SUPPORTED_WEBSOCKET_HANDLERS.includes(handler as DynamicRouteWebSocketHandler)
  );
}

function createRouteMatcher(route: string): RegExp | null {
  try {
    return pathToRegexp(route);
  } catch (error) {
    logger.error(
      `Invalid websocket route regex: ${route}. Error: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}

function toRegisteredWebSocketRoute(routeConfig: DynamicRoute): RegisteredWebSocketRoute | null {
  const websocketConfig = routeConfig.websocket;
  if (!websocketConfig?.target || !websocketConfig.handler) {
    return null;
  }

  if (!isSupportedWebSocketHandler(websocketConfig.handler)) {
    logger.error(
      `Unsupported websocket handler '${websocketConfig.handler}' for route ${routeConfig.route}`
    );
    return null;
  }

  const matcher = createRouteMatcher(routeConfig.route);
  if (!matcher) {
    return null;
  }

  return {
    name: routeConfig.name,
    route: routeConfig.route,
    matcher,
    websocket: websocketConfig
  };
}

function registerWebSocketRoutes(routes: DynamicRoute[]): RegisteredWebSocketRoute[] {
  const registeredRoutes: RegisteredWebSocketRoute[] = [];
  for (const routeConfig of routes) {
    const registeredRoute = toRegisteredWebSocketRoute(routeConfig);
    if (registeredRoute) {
      registeredRoutes.push(registeredRoute);
    }
  }
  return registeredRoutes;
}

function logRegisteredWebSocketRoutes(routes: RegisteredWebSocketRoute[]): void {
  routes.forEach(({ name, route, websocket }) => {
    logger.debug(
      `[Registered WebSocket Route][Handler: ${websocket.handler}] [Name: ${name}] [Path: ${route}] [Target: ${websocket.target}]`
    );
  });
}

function findMatchingWebSocketRoute(
  path: string,
  routes: RegisteredWebSocketRoute[]
): RegisteredWebSocketRoute | undefined {
  return routes.find((routeConfig) => routeConfig.matcher.test(path));
}

async function routeWebSocketRequest(
  ctx: WebSocketContext,
  next: WebSocketNext,
  matchedRoute: RegisteredWebSocketRoute
): Promise<void> {
  const { websocket } = matchedRoute;
  const routeHandler = websocketHandlerByType[websocket.handler];
  await routeHandler(ctx, next, websocket);
}

const registeredWebSocketRoutes = registerWebSocketRoutes(DYNAMIC_ROUTES);
logRegisteredWebSocketRoutes(registeredWebSocketRoutes);

const websocketRouter: WebSocketMiddleware = async (ctx, next): Promise<void> => {
  const matchedRoute = findMatchingWebSocketRoute(ctx.path, registeredWebSocketRoutes);
  if (!matchedRoute) {
    ctx.websocket.close(NO_HANDLER_CLOSE_CODE, NO_HANDLER_CLOSE_REASON);
    return;
  }

  await routeWebSocketRequest(ctx, next, matchedRoute);
};

export function createWebsocketEnabledApp() {
  const app = websockify(new Koa({ asyncLocalStorage: true }));
  app.ws.use(websocketRouter);
  return app;
}
