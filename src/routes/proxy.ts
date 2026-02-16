// routes/proxy.ts
import fs from 'fs';
import http, { IncomingMessage, RequestOptions } from 'http';
import type {
  ClientRequest,
  IncomingHttpHeaders,
  OutgoingHttpHeaders,
  ServerResponse,
} from 'http';
import https from 'https';
import Router from 'koa-router';
import path from 'path';
import { URL } from 'url';
import {
  DYNAMIC_ROUTES,
  DYNAMIC_ROUTES_INVENTORY_PREFIX,
  NEO4J_BROWSER_MANIFEST,
  SERVICES_HTML,
  UPSTREAM_ERROR_MSG,
} from '../config/env';
import { runPolicy } from '../pep/policy-executor';
import type { DynamicRoute } from '../types/DynamicRoute';
import type { RegisterProxiedRouteOptions } from '../types/RegisterProxiedRoute';
import { determineAndGetUserUsingReqContextAndResource } from '../utils/requestContextHelper';
import { applyRequestHeaderRules } from '../utils/requestHeaderRules';
import {
  logButtonHiddenForNoAccess,
  logButtonPolicyDecision,
  logButtonRenderingDisabled,
  logEventStreamDownstreamError,
  logEventStreamUpstreamAborted,
  logEventStreamUpstreamError,
  logMcpPostEnd,
  logMcpPostError,
  logMcpPostStart,
  logMcpUpstreamUnavailable,
  logMissingTargetForButtonRendering,
  logNoDynamicRoutesConfigured,
  logProxyRequestErrorAfterResponseStart,
  logProxyRouteError,
  logRedirectLocationRewrite,
  logRegisteredRoute,
  logRouteMissingTarget,
  logRoutePrefix,
  logStaticFileNotFound,
} from './proxyLogging';

type RouterContext = Router.RouterContext;
type RedirectConfig = NonNullable<DynamicRoute['redirect']>;
type McpRouteOptions = Pick<RegisterProxiedRouteOptions, 'name' | 'route' | 'target'>;

const router = new Router();
const dynamicRoutes = DYNAMIC_ROUTES;

const conditionalReturnValues: Record<string, string> = {
  NEO4J_BROWSER_MANIFEST,
};

const HTTP_STATUS = {
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  NOT_FOUND: 404,
} as const;

const CONTENT_TYPE = {
  JSON: 'application/json',
  HTML: 'text/html',
  PLAIN_TEXT: 'text/plain',
  EVENT_STREAM: 'text/event-stream',
  IMAGE_X_ICON: 'image/x-icon',
  OCTET_STREAM: 'application/octet-stream',
} as const;

const UPGRADE_HEADER = 'upgrade';
const WEBSOCKET_UPGRADE_VALUE = 'websocket';
const INACTIVE_BUTTON_STYLE = 'pointer-events: none; opacity: 0.45; cursor: not-allowed;';
const BUTTON_ICON_STYLE = 'display: inline-flex; align-items: center; gap: 0.7em;';

if (dynamicRoutes.length === 0) {
  logNoDynamicRoutesConfigured();
}

function getHeaderValueAsString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  return value ?? '';
}

function headerIncludes(value: string | string[] | undefined, expectedFragment: string): boolean {
  if (Array.isArray(value)) {
    return value.some((entry) => entry.includes(expectedFragment));
  }
  return typeof value === 'string' && value.includes(expectedFragment);
}

function isHeaderCondition<T extends { condition: string; headerName?: string; includes?: string }>(
  condition: T
): condition is T & { condition: 'header'; headerName: string; includes: string } {
  return (
    condition.condition === 'header' &&
    typeof condition.headerName === 'string' &&
    condition.headerName.length > 0 &&
    typeof condition.includes === 'string' &&
    condition.includes.length > 0
  );
}

function isWebSocketUpgradeRequest(ctx: RouterContext): boolean {
  const upgrade = ctx.headers[UPGRADE_HEADER];
  if (Array.isArray(upgrade)) {
    return upgrade.some((value) => value.toLowerCase() === WEBSOCKET_UPGRADE_VALUE);
  }
  return typeof upgrade === 'string' && upgrade.toLowerCase() === WEBSOCKET_UPGRADE_VALUE;
}

function getConditionalReturnBody(returnKey: string): string {
  return conditionalReturnValues[returnKey] ?? '';
}

function conditionalReturnToJson(ctx: RouterContext, returnKey: string): void {
  ctx.type = CONTENT_TYPE.JSON;
  ctx.body = getConditionalReturnBody(returnKey);
}

function handleSubpathReturns(
  ctx: RouterContext,
  subpathReturns: RegisterProxiedRouteOptions['subpathReturns']
): boolean {
  if (!subpathReturns) {
    return false;
  }

  for (const subpath of subpathReturns) {
    if (ctx.path.startsWith(subpath.path)) {
      conditionalReturnToJson(ctx, subpath.return);
      return true;
    }
  }

  return false;
}

function handleHeaderConditionalReturns(
  ctx: RouterContext,
  conditionalReturns: RegisterProxiedRouteOptions['conditionalReturns']
): boolean {
  if (!conditionalReturns) {
    return false;
  }

  for (const condition of conditionalReturns) {
    if (!isHeaderCondition(condition)) {
      continue;
    }

    const headerValue = ctx.headers[condition.headerName.toLowerCase()];
    if (headerIncludes(headerValue, condition.includes)) {
      conditionalReturnToJson(ctx, condition.return);
      return true;
    }
  }

  return false;
}

function handleConfiguredReturns(
  ctx: RouterContext,
  options: Pick<RegisterProxiedRouteOptions, 'subpathReturns' | 'conditionalReturns'>
): boolean {
  return handleSubpathReturns(ctx, options.subpathReturns) || handleHeaderConditionalReturns(ctx, options.conditionalReturns);
}

function resolveRedirect(ctx: RouterContext, redirect: RedirectConfig): { targetRedirect: string; responseBody?: string } {
  if (typeof redirect === 'string') {
    return { targetRedirect: redirect };
  }

  let targetRedirect = redirect.default;
  for (const condition of redirect.conditionalRedirects ?? []) {
    if (!isHeaderCondition(condition)) {
      continue;
    }

    const headerValue = ctx.headers[condition.headerName.toLowerCase()];
    if (!headerIncludes(headerValue, condition.includes)) {
      continue;
    }

    if (condition.return) {
      return {
        targetRedirect,
        responseBody: getConditionalReturnBody(condition.return),
      };
    }

    if (condition.redirect) {
      targetRedirect = condition.redirect;
    }
    break;
  }

  return { targetRedirect };
}

function registerRedirectRoute({ route, redirect }: { route: string; redirect: RedirectConfig }) {
  router.all(route, (ctx) => {
    if (isWebSocketUpgradeRequest(ctx)) {
      return;
    }

    const { targetRedirect, responseBody } = resolveRedirect(ctx, redirect);
    if (typeof responseBody !== 'undefined') {
      ctx.type = CONTENT_TYPE.JSON;
      ctx.body = responseBody;
      return;
    }

    ctx.redirect(`${targetRedirect}${ctx.search || ''}`);
  });
}

function getRoutePrefix(route: string): string {
  return route.replace(/\(.*\)$/, '');
}

function isMcpProtocol(protocol: RegisterProxiedRouteOptions['protocol']): boolean {
  return protocol === 'mcp-streamable-http';
}

function isMcpPostRequest(ctx: RouterContext, protocol: RegisterProxiedRouteOptions['protocol']): boolean {
  return ctx.method === 'POST' && isMcpProtocol(protocol);
}

function getBufferedRequestBody(body: unknown): Buffer | undefined {
  if (typeof body === 'undefined' || body === null) {
    return undefined;
  }

  if (Buffer.isBuffer(body)) {
    return body;
  }

  if (typeof body === 'string') {
    return Buffer.from(body);
  }

  try {
    return Buffer.from(JSON.stringify(body));
  } catch {
    return Buffer.from(String(body));
  }
}

async function captureMcpPostRequestBody(ctx: RouterContext): Promise<Buffer | undefined> {
  const bodyFromContext = getBufferedRequestBody(ctx.request.body);
  if (bodyFromContext) {
    return bodyFromContext;
  }

  if (!ctx.req.readable) {
    return undefined;
  }

  return new Promise<Buffer | undefined>((resolve, reject) => {
    const bodyChunks: Buffer[] = [];
    ctx.req.on('data', (chunk) => bodyChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    ctx.req.on('end', () => {
      if (bodyChunks.length === 0) {
        resolve(undefined);
        return;
      }
      resolve(Buffer.concat(bodyChunks));
    });
    ctx.req.on('error', reject);
    ctx.req.on('aborted', () => reject(new Error('Client aborted while reading MCP payload')));
  });
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getNormalizedProxiedPath(ctx: RouterContext, routePrefix: string): string {
  if (routePrefix === ctx.path) {
    return '';
  }

  const prefixExpression = new RegExp(`^${escapeRegex(routePrefix)}`);
  const proxiedPath = ctx.path.replace(prefixExpression, '') || '/';
  return proxiedPath.startsWith('/') ? proxiedPath : `/${proxiedPath}`;
}

function buildTargetUrl(ctx: RouterContext, target: string, routePrefix: string): URL {
  const normalizedTarget = target.replace(/\/$/, '');
  const proxiedPath = getNormalizedProxiedPath(ctx, routePrefix);
  return new URL(`${normalizedTarget}${proxiedPath}${ctx.search || ''}`);
}

function buildProxyRequestHeaders(
  ctx: RouterContext,
  hostname: string,
  requestHeaderRules: RegisterProxiedRouteOptions['requestHeaderRules']
): OutgoingHttpHeaders {
  return applyRequestHeaderRules({ ...ctx.headers, host: hostname }, requestHeaderRules);
}

function buildProxyRequestOptions(
  ctx: RouterContext,
  url: URL,
  isHttps: boolean,
  headers: OutgoingHttpHeaders
): RequestOptions {
  return {
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: url.pathname + url.search,
    method: ctx.method,
    headers,
  };
}

function rewriteLocationHeaderForRedirect(
  headers: IncomingHttpHeaders,
  statusCode: number | undefined,
  routePrefix: string
): void {
  if (!statusCode || statusCode < 300 || statusCode >= 400 || !headers.location) {
    return;
  }

  const originalLocation = Array.isArray(headers.location) ? headers.location[0] : headers.location;
  let rewrittenLocation = '';

  try {
    const locationUrl = new URL(originalLocation);
    rewrittenLocation = `${routePrefix}${locationUrl.pathname}${locationUrl.search || ''}`;
    headers.location = rewrittenLocation;
  } catch {
    logRedirectLocationRewrite(originalLocation, rewrittenLocation);
  }
}

function injectBaseHref(body: string, routePrefix: string): string {
  const withoutExistingBase = body.replace(/<base[^>]*>/gi, '');
  return withoutExistingBase.replace(/<head([^>]*)>/i, `<head$1><base href="${routePrefix}/">`);
}

function patchContentSecurityPolicyForBaseUri(headers: IncomingHttpHeaders, baseUri: string): void {
  const csp = headers['content-security-policy'];

  if (!csp) {
    headers['content-security-policy'] = `base-uri 'self' ${baseUri}`;
    return;
  }

  if (typeof csp === 'string') {
    if (/base-uri\s/.test(csp)) {
      headers['content-security-policy'] = csp.replace(/base-uri [^;]+/, `base-uri 'self' ${baseUri}`);
      return;
    }
    headers['content-security-policy'] = `${csp}; base-uri 'self' ${baseUri}`;
    return;
  }

  headers['content-security-policy'] = csp.map((entry) =>
    /base-uri\s/.test(entry)
      ? entry.replace(/base-uri [^;]+/, `base-uri 'self' ${baseUri}`)
      : `${entry}; base-uri 'self' ${baseUri}`
  );
}

function applyProxyResponseHeaders(
  ctx: RouterContext,
  headers: IncomingHttpHeaders,
  options?: { excludeContentLength?: boolean }
): void {
  Object.entries(headers).forEach(([key, value]) => {
    if (typeof value === 'undefined') {
      return;
    }
    if (options?.excludeContentLength && key.toLowerCase() === 'content-length') {
      return;
    }
    ctx.set(key, Array.isArray(value) ? value.join(',') : value);
  });
}

function applyProxyResponseHeadersToRawResponse(res: ServerResponse, headers: IncomingHttpHeaders): void {
  Object.entries(headers).forEach(([key, value]) => {
    if (typeof value === 'undefined') {
      return;
    }
    res.setHeader(key, value);
  });
}

function getJsonRpcIdFromPayload(payload?: Buffer): string | number | null {
  if (!payload) {
    return null;
  }

  try {
    const parsed = JSON.parse(payload.toString('utf8'));
    if (typeof parsed?.id === 'string' || typeof parsed?.id === 'number') {
      return parsed.id;
    }
  } catch {
    return null;
  }

  return null;
}

function setGentleMcpErrorResponse(
  ctx: RouterContext,
  message: string,
  details?: string,
  requestBodyOverride?: Buffer
): void {
  ctx.status = HTTP_STATUS.SERVICE_UNAVAILABLE;

  if (ctx.method === 'POST') {
    ctx.type = CONTENT_TYPE.JSON;
    ctx.body = {
      jsonrpc: '2.0',
      id: getJsonRpcIdFromPayload(requestBodyOverride),
      error: {
        code: -32001,
        message,
        data: details,
      },
    };
    return;
  }

  if (ctx.method === 'GET') {
    ctx.type = CONTENT_TYPE.PLAIN_TEXT;
    ctx.body = details ? `${message}: ${details}` : message;
    return;
  }

  ctx.type = CONTENT_TYPE.JSON;
  ctx.body = {
    message,
    details,
  };
}

function endResponseIfOpen(res: ServerResponse): void {
  if (!res.writableEnded && !res.destroyed) {
    res.end();
  }
}

function streamEventStreamResponse(ctx: RouterContext, proxyRes: IncomingMessage, headers: IncomingHttpHeaders): void {
  ctx.respond = false;
  const res = ctx.res;

  res.statusCode = proxyRes.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
  applyProxyResponseHeadersToRawResponse(res, headers);

  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  proxyRes.on('error', (error) => {
    const message = error instanceof Error ? error.message : String(error);
    logEventStreamUpstreamError(ctx.path, message);

    if (!res.headersSent) {
      res.statusCode = HTTP_STATUS.BAD_GATEWAY;
      res.end();
      return;
    }

    // End downstream gracefully to avoid surfacing hard socket resets to clients.
    endResponseIfOpen(res);
  });

  proxyRes.on('aborted', () => {
    logEventStreamUpstreamAborted(ctx.path);
    endResponseIfOpen(res);
  });

  res.on('error', (error) => {
    const message = error instanceof Error ? error.message : String(error);
    logEventStreamDownstreamError(ctx.path, message);
  });

  res.on('close', () => {
    if (!proxyRes.destroyed) {
      proxyRes.destroy();
    }
  });

  proxyRes.pipe(res);
}

function readResponseBody(proxyRes: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const bodyChunks: Buffer[] = [];
    proxyRes.on('data', (chunk) => bodyChunks.push(chunk));
    proxyRes.on('end', () => resolve(Buffer.concat(bodyChunks)));
    proxyRes.on('error', reject);
  });
}

function forwardRequestBodyToProxy(ctx: RouterContext, proxyReq: ClientRequest, requestBodyOverride?: Buffer): void {
  if (requestBodyOverride) {
    proxyReq.write(requestBodyOverride);
    proxyReq.end();
    return;
  }

  if (ctx.req.readable) {
    ctx.req.pipe(proxyReq);
    return;
  }

  if (ctx.request.body) {
    const body = getBufferedRequestBody(ctx.request.body);
    if (body) {
      proxyReq.write(body);
    }
    proxyReq.end();
    return;
  }

  proxyReq.end();
}

async function handleProxyResponse(
  ctx: RouterContext,
  proxyRes: IncomingMessage,
  headers: IncomingHttpHeaders,
  options: { routePrefix: string; rewritebase?: boolean }
): Promise<void> {
  const contentType = getHeaderValueAsString(proxyRes.headers['content-type']);
  const isEventStream = contentType.includes(CONTENT_TYPE.EVENT_STREAM);
  const shouldRewriteHtml = Boolean(options.rewritebase) && contentType.includes(CONTENT_TYPE.HTML);

  if (isEventStream) {
    streamEventStreamResponse(ctx, proxyRes, headers);
    return;
  }

  if (!shouldRewriteHtml) {
    applyProxyResponseHeaders(ctx, headers);
    ctx.body = proxyRes;
    return;
  }

  const bodyBuffer = await readResponseBody(proxyRes);
  const baseUri = `${ctx.protocol}://${ctx.host}${options.routePrefix}/`;
  const updatedBody = injectBaseHref(bodyBuffer.toString('utf8'), options.routePrefix);
  patchContentSecurityPolicyForBaseUri(headers, baseUri);

  ctx.set('content-type', contentType);
  applyProxyResponseHeaders(ctx, headers, { excludeContentLength: true });
  ctx.body = updatedBody;
}

function destroyProxyRequest(proxyReq: ClientRequest): void {
  if (!proxyReq.destroyed) {
    proxyReq.destroy();
  }
}

function handleProxyRequestError(
  ctx: RouterContext,
  error: Error,
  isMcpRoute: boolean,
  requestBodyOverride: Buffer | undefined,
  resolve: () => void,
  reject: (reason?: unknown) => void
): void {
  // For already-started responses (e.g. event-stream), do not rewrite response state.
  if (ctx.respond === false || ctx.res.headersSent) {
    logProxyRequestErrorAfterResponseStart(ctx.path, error.message);
    return;
  }

  if (isMcpRoute) {
    logMcpUpstreamUnavailable(ctx.method, ctx.path, error.message);
    setGentleMcpErrorResponse(ctx, 'MCP upstream unavailable', error.message, requestBodyOverride);
    resolve();
    return;
  }

  ctx.status = HTTP_STATUS.INTERNAL_SERVER_ERROR;
  ctx.body = { message: 'Proxy error', error: error.message };
  reject(error);
}

function handleProxyForTarget(
  ctx: RouterContext,
  options: RegisterProxiedRouteOptions,
  requestBodyOverride?: Buffer
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (isWebSocketUpgradeRequest(ctx)) {
      resolve(); // WebSocket requests are handled in proxy-ws.ts
      return;
    }

    const routePrefix = getRoutePrefix(options.route);
    logRoutePrefix(routePrefix);

    const url = buildTargetUrl(ctx, options.target, routePrefix);
    const isHttps = url.protocol === 'https:';
    const proxyReqHeaders = buildProxyRequestHeaders(ctx, url.hostname, options.requestHeaderRules);
    const requestOptions = buildProxyRequestOptions(ctx, url, isHttps, proxyReqHeaders);

    const proxyReq = (isHttps ? https : http).request(requestOptions, (proxyRes: IncomingMessage) => {
      ctx.status = proxyRes.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;

      const headers = { ...proxyRes.headers };
      rewriteLocationHeaderForRedirect(headers, proxyRes.statusCode, routePrefix);

      handleProxyResponse(ctx, proxyRes, headers, {
        routePrefix,
        rewritebase: options.rewritebase,
      })
        .then(resolve)
        .catch(reject);
    });

    const isMcpRoute = isMcpProtocol(options.protocol);
    proxyReq.on('error', (error) => {
      handleProxyRequestError(ctx, error, isMcpRoute, requestBodyOverride, resolve, reject);
    });

    ctx.req.on('aborted', () => destroyProxyRequest(proxyReq));
    ctx.res.on('close', () => destroyProxyRequest(proxyReq));

    forwardRequestBodyToProxy(ctx, proxyReq, requestBodyOverride);
  });
}

async function captureMcpPayloadForLogging(
  ctx: RouterContext,
  shouldLogMcpPost: boolean,
  mcpRouteOptions: McpRouteOptions
): Promise<{ mcpPayload?: string; mcpRequestBody?: Buffer }> {
  if (!shouldLogMcpPost) {
    return {};
  }

  let mcpPayload: string | undefined;
  let mcpRequestBody: Buffer | undefined;

  try {
    mcpRequestBody = await captureMcpPostRequestBody(ctx);
    mcpPayload = mcpRequestBody?.toString('utf8');
  } catch (error) {
    mcpPayload = `[unable-to-read-payload: ${error instanceof Error ? error.message : String(error)}]`;
  }

  logMcpPostStart(ctx, mcpRouteOptions, mcpPayload);
  return { mcpPayload, mcpRequestBody };
}

function registerProxiedRoute({
  name,
  route,
  target,
  protocol,
  rewritebase,
  conditionalReturns,
  subpathReturns,
  requestHeaderRules,
}: RegisterProxiedRouteOptions): void {
  const mcpRouteOptions = { name, route, target };

  router.all(route, async (ctx) => {
    const isMcpRoute = isMcpProtocol(protocol);
    const shouldLogMcpPost = isMcpPostRequest(ctx, protocol);
    const { mcpPayload, mcpRequestBody } = await captureMcpPayloadForLogging(
      ctx,
      shouldLogMcpPost,
      mcpRouteOptions
    );

    const logMcpPostEndIfNeeded = () => {
      if (shouldLogMcpPost) {
        logMcpPostEnd(ctx, mcpRouteOptions, ctx.status, mcpPayload);
      }
    };

    try {
      if (handleConfiguredReturns(ctx, { subpathReturns, conditionalReturns })) {
        logMcpPostEndIfNeeded();
        return;
      }

      await handleProxyForTarget(
        ctx,
        { name, route, target, protocol, rewritebase, conditionalReturns, subpathReturns, requestHeaderRules },
        mcpRequestBody
      );

      logMcpPostEndIfNeeded();
    } catch (error) {
      logProxyRouteError(ctx, target, route, error);

      if (shouldLogMcpPost) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logMcpPostError(ctx, mcpRouteOptions, ctx.status || HTTP_STATUS.BAD_GATEWAY, errorMessage, mcpPayload);
      }

      if (isMcpRoute) {
        setGentleMcpErrorResponse(
          ctx,
          'MCP request failed',
          error instanceof Error ? error.message : String(error),
          mcpRequestBody
        );
        return;
      }

      ctx.status = HTTP_STATUS.BAD_GATEWAY;
      ctx.type = CONTENT_TYPE.HTML;
      ctx.body = UPSTREAM_ERROR_MSG;
    }
  });
}

function getRouteButtonLabel(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function getRouteButtonHref(routeConfig: DynamicRoute): string {
  const baseHref = routeConfig.route.replace(/\(\.\*\)$/, '');
  if (!routeConfig.params) {
    return baseHref;
  }
  return `${baseHref}${routeConfig.params.includes('?') ? routeConfig.params : `?${routeConfig.params}`}`;
}

function renderActiveButton(label: string, href: string, icon?: string): string {
  if (icon) {
    return `<a class="button" href="${href}"><span class="button-icon" style="${BUTTON_ICON_STYLE}">${icon}</span><span class="service-text">${label}</span></a>`;
  }
  return `<a class="button" href="${href}"><span class="service-text">${label}</span></a>`;
}

function renderInactiveButton(label: string, icon?: string): string {
  if (icon) {
    return `<span class="button" style="${INACTIVE_BUTTON_STYLE}">${icon}<span class="service-text">${label}</span></span>`;
  }
  return `<span class="button" style="${INACTIVE_BUTTON_STYLE}"><span class="service-text">${label}</span></span>`;
}

async function buildServiceButton(ctx: RouterContext, routeConfig: DynamicRoute): Promise<string> {
  if (!routeConfig.target) {
    logMissingTargetForButtonRendering(routeConfig.name, routeConfig.target);
    return '';
  }

  if (routeConfig.doNotRenderButton === true) {
    logButtonRenderingDisabled(routeConfig.name);
    return '';
  }

  const href = getRouteButtonHref(routeConfig);
  const label = getRouteButtonLabel(routeConfig.name);

  const user = await determineAndGetUserUsingReqContextAndResource(ctx, routeConfig.route);
  const isAllowed = (await runPolicy(user?.authAttributes ?? '', routeConfig.route)) || false;
  logButtonPolicyDecision(routeConfig.route, user, isAllowed);

  if (!isAllowed) {
    if (routeConfig.hideIfNoAccess) {
      logButtonHiddenForNoAccess(routeConfig.name, routeConfig.hideIfNoAccess);
      return '';
    }
    return renderInactiveButton(label, routeConfig.icon);
  }

  return renderActiveButton(label, href, routeConfig.icon);
}

function registerSplashPageRoute(): void {
  router.get(DYNAMIC_ROUTES_INVENTORY_PREFIX, async (ctx) => {
    ctx.type = CONTENT_TYPE.HTML;
    const buttons = (await Promise.all(dynamicRoutes.map((routeConfig) => buildServiceButton(ctx, routeConfig)))).join(
      '\n'
    );
    ctx.body = SERVICES_HTML.replace('<!--SERVICES_BUTTONS-->', buttons);
  });
}

function getStaticFileContentType(relativeFilePath: string): string {
  if (relativeFilePath.endsWith('.json')) {
    return CONTENT_TYPE.JSON;
  }
  if (relativeFilePath.endsWith('.ico')) {
    return CONTENT_TYPE.IMAGE_X_ICON;
  }
  return CONTENT_TYPE.OCTET_STREAM;
}

function registerStaticFileRoute({ route, relativeFilePath }: { route: string; relativeFilePath: string }): void {
  router.get(route, async (ctx) => {
    const absolutePath = path.join(process.cwd(), relativeFilePath);
    try {
      const fileContent = await fs.promises.readFile(absolutePath, 'utf8');
      ctx.type = getStaticFileContentType(relativeFilePath);
      ctx.body = fileContent;
    } catch (error) {
      ctx.status = HTTP_STATUS.NOT_FOUND;
      ctx.body = { error: 'File not found' };
      logStaticFileNotFound(route, relativeFilePath, absolutePath, error);
    }
  });
}

function registerDynamicRoute(routeConfig: DynamicRoute): void {
  const {
    name,
    route,
    target,
    protocol,
    rewritebase,
    redirect,
    splashPage,
    relativeFilePath,
    conditionalReturns,
    subpathReturns,
    requestHeaderRules,
  } = routeConfig;

  if (redirect) {
    registerRedirectRoute({ route, redirect });
    return;
  }

  if (splashPage) {
    registerSplashPageRoute();
    return;
  }

  if (relativeFilePath) {
    registerStaticFileRoute({ route, relativeFilePath });
    return;
  }

  if (target) {
    registerProxiedRoute({
      name,
      route,
      target,
      protocol,
      rewritebase,
      conditionalReturns,
      subpathReturns,
      requestHeaderRules,
    });
    return;
  }

  logRouteMissingTarget(name);
}

dynamicRoutes.forEach(registerDynamicRoute);

router.stack.forEach((route) => {
  if (route.path) {
    logRegisteredRoute(route.methods, route.path);
  }
});

export default router;
