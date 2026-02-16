import type Router from 'koa-router';
import logger from '../utils/logger';
import { asyncLocalStorage } from '../types/localStorage';
import type { RegisterProxiedRouteOptions } from '../types/RegisterProxiedRoute';

type McpPostEvent = 'MCP_POST_START' | 'MCP_POST_END' | 'MCP_POST_ERROR';
type McpRouteOptions = Pick<RegisterProxiedRouteOptions, 'name' | 'route' | 'target'>;

function getHeaderValueAsString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  return value ?? '';
}

function logMcpPostEvent(
  ctx: Router.RouterContext,
  options: McpRouteOptions,
  event: McpPostEvent,
  status?: number,
  error?: string,
  payload?: string
): void {
  const requestContext = asyncLocalStorage.getStore();

  logger.info({
    timestamp: new Date().toISOString(),
    reqId: requestContext?.reqId || ctx.state?.reqId || null,
    event,
    method: ctx.method,
    path: ctx.path,
    queryParams: ctx.querystring || null,
    route: options.route,
    routeName: options.name,
    target: options.target,
    status,
    contentType: getHeaderValueAsString(ctx.headers['content-type']),
    payload,
    error,
  });
}

export function logNoDynamicRoutesConfigured(): void {
  logger.warn('No dynamic routes configured. Please set the DYNAMIC_ROUTES environment variable.');
}

export function logMcpPostStart(
  ctx: Router.RouterContext,
  options: McpRouteOptions,
  payload?: string
): void {
  logMcpPostEvent(ctx, options, 'MCP_POST_START', undefined, undefined, payload);
}

export function logMcpPostEnd(
  ctx: Router.RouterContext,
  options: McpRouteOptions,
  status?: number,
  payload?: string
): void {
  logMcpPostEvent(ctx, options, 'MCP_POST_END', status, undefined, payload);
}

export function logMcpPostError(
  ctx: Router.RouterContext,
  options: McpRouteOptions,
  status: number,
  error: string,
  payload?: string
): void {
  logMcpPostEvent(ctx, options, 'MCP_POST_ERROR', status, error, payload);
}

export function logRedirectLocationRewrite(originalLocation: string, rewrittenLocation: string): void {
  logger.debug(
    `Rewriting Location header for redirect: original='${originalLocation}' rewritten='${rewrittenLocation}'`
  );
}

export function logEventStreamUpstreamError(path: string, message: string): void {
  logger.warn(`Upstream event-stream error for ${path}: ${message}`);
}

export function logEventStreamUpstreamAborted(path: string): void {
  logger.warn(`Upstream event-stream aborted for ${path}`);
}

export function logEventStreamDownstreamError(path: string, message: string): void {
  logger.warn(`Downstream event-stream error for ${path}: ${message}`);
}

export function logRoutePrefix(routePrefix: string): void {
  logger.info(`routePrefix: ${routePrefix}`);
}

export function logProxyRequestErrorAfterResponseStart(path: string, message: string): void {
  logger.warn(`Proxy request error after response start for ${path}: ${message}`);
}

export function logMcpUpstreamUnavailable(method: string, path: string, message: string): void {
  logger.warn(`MCP upstream unavailable for ${method} ${path}: ${message}`);
}

export function logProxyRouteError(
  ctx: Router.RouterContext,
  target: string,
  route: string,
  err: unknown
): void {
  const logError = {
    reqId: ctx.state?.reqId || null,
    event: 'ERROR',
    durationMs: ctx.state?.start ? Date.now() - ctx.state.start : undefined,
    error: err instanceof Error ? err.message : String(err),
    target,
    route,
    path: ctx.path,
  };

  logger.error(JSON.stringify(logError));
}

export function logMissingTargetForButtonRendering(name: string, target: string | undefined): void {
  logger.debug(
    `Ignoring route '${name}' for the purpose of button rendering because it is missing a target (value: ${target})`
  );
}

export function logButtonRenderingDisabled(name: string): void {
  logger.debug(
    `Ignoring route '${name}' for the purpose of button rendering because doNotRenderButton = true.`
  );
}

export function logButtonPolicyDecision(route: string, user: unknown, isAllowed: boolean): void {
  logger.debug(
    `While rendering button, for a given route: ${route} following user was determined ${JSON.stringify(user)}. The decsion isAllowed: ${isAllowed}`
  );
}

export function logButtonHiddenForNoAccess(name: string, hideIfNoAccess: boolean | undefined): void {
  logger.debug(
    `Ignoring route '${name}' for the purpose of button rendering because hideIfNoAccess = ${hideIfNoAccess}.`
  );
}

export function logStaticFileNotFound(
  route: string,
  relativeFilePath: string,
  absolutePath: string,
  err: unknown
): void {
  logger.error(
    `File not found for static route '${route}': ${relativeFilePath} (absolute path ${absolutePath}). Error details: ${err instanceof Error ? err.message : String(err)}`
  );
}

export function logRouteMissingTarget(name: string): void {
  logger.debug(`Ignoring route '${name}' in setting up dynamic routes because it is missing a target.`);
}

export function logRegisteredRoute(methods: string[], routePath: string): void {
  logger.debug(`[Registered Route][Methods: ${methods.join(', ')}] [Path: ${routePath}]`);
}
