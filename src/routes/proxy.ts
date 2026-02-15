// routes/proxy.ts
import Router from 'koa-router';
import http, { RequestOptions, IncomingMessage } from 'http';
import type { ClientRequest, IncomingHttpHeaders, OutgoingHttpHeaders } from 'http';
import https from 'https';
import { URL } from 'url';
import logger from '../utils/logger';
import {
  DYNAMIC_ROUTES,
  SERVICES_HTML,
  UPSTREAM_ERROR_MSG,
  DYNAMIC_ROUTES_INVENTORY_PREFIX,
  NEO4J_BROWSER_MANIFEST,
} from '../config/env';
import { runPolicy } from '../pep/policy-executor';
import { determineAndGetUserUsingReqContextAndResource, extractUserCN } from '../utils/requestContextHelper';
import fs from 'fs';
import path from 'path';
import { applyRequestHeaderRules } from '../utils/requestHeaderRules';
import type { RegisterProxiedRouteOptions } from '../types/RegisterProxiedRoute';
import { asyncLocalStorage } from '../localStorage';

const router = new Router();

const dynamicRoutes = DYNAMIC_ROUTES;
const conditionalReturnValues: Record<string, string> = {
  NEO4J_BROWSER_MANIFEST
};

if (dynamicRoutes.length === 0) {
  logger.warn('No dynamic routes configured. Please set the DYNAMIC_ROUTES environment variable.');
}

function registerRedirectRoute({
  route,
  redirect
}: {
  route: string;
  redirect:
    | string
    | {
        default: string;
        conditionalRedirects?: Array<{
          condition: string;
          headerName: string;
          includes: string;
          redirect?: string;
          return?: string;
        }>;
      };
}) {
  router.all(route, async (ctx) => {
    // Do not redirect if this is a websocket upgrade request
    const isWebSocketUpgrade =
      ctx.headers['upgrade'] &&
      ctx.headers['upgrade'].toLowerCase() === 'websocket';

    if (isWebSocketUpgrade) {
      return;
    }

    let targetRedirect: string;
    let responseBody: string | null = null;

    // Support redirect as a string or as an object with conditional redirects
    if (typeof redirect === "string") {
      targetRedirect = redirect;
    } else {
      targetRedirect = redirect.default;
      if (
        redirect.conditionalRedirects &&
        Array.isArray(redirect.conditionalRedirects)
      ) {
        for (const cond of redirect.conditionalRedirects) {
          if (
            cond.condition === "header" &&
            cond.headerName &&
            cond.includes
          ) {
            const headerValue = ctx.headers[cond.headerName.toLowerCase()];
            if (headerValue && headerValue.includes(cond.includes)) {
              if (cond.return) {
                responseBody = conditionalReturnValues[cond.return] ?? '';
              } else if (cond.redirect) {
                targetRedirect = cond.redirect;
              }
              break;
            }
          }
        }
      }
    }

    if (responseBody !== null) {
      ctx.type = 'application/json';
      ctx.body = responseBody;
      return;
    }

    ctx.redirect(`${targetRedirect}${ctx.search || ""}`);
  });
}

function conditionalReturnToJson(ctx: Router.RouterContext, returnKey: string): void {
  const responseBody = conditionalReturnValues[returnKey] ?? '';
  ctx.type = 'application/json';
  ctx.body = responseBody;
}

function handleSubpathReturns(
  ctx: Router.RouterContext,
  subpathReturns: RegisterProxiedRouteOptions['subpathReturns']
): boolean {
  if (!subpathReturns || !Array.isArray(subpathReturns)) {
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
  ctx: Router.RouterContext,
  conditionalReturns: RegisterProxiedRouteOptions['conditionalReturns']
): boolean {
  if (!conditionalReturns || !Array.isArray(conditionalReturns)) {
    return false;
  }

  for (const cond of conditionalReturns) {
    if (cond.condition !== 'header' || !cond.headerName || !cond.includes) {
      continue;
    }

    const headerValue = ctx.headers[cond.headerName.toLowerCase()];
    if (headerValue && headerValue.includes(cond.includes)) {
      conditionalReturnToJson(ctx, cond.return);
      return true;
    }
  }

  return false;
}

function getRoutePrefix(route: string): string {
  // Strips off any trailing parenthesized chunk at the end of the string. 
  // The pattern /\(.*\)$/ matches the last opening parenthesis through all following 
  // characters up to the string end; 
  return route.replace(/\(.*\)$/, '');
}

function isMcpRouteRequest(ctx: Router.RouterContext, route: string): boolean {
  const routePrefix = getRoutePrefix(route);
  return routePrefix === '/mcp' && ctx.path.startsWith(routePrefix);
}

function isMcpPostRequest(ctx: Router.RouterContext, route: string): boolean {
  return ctx.method === 'POST' && isMcpRouteRequest(ctx, route);
}

function logMcpPostEvent(
  ctx: Router.RouterContext,
  options: Pick<RegisterProxiedRouteOptions, 'name' | 'route' | 'target'>,
  event: 'MCP_POST_START' | 'MCP_POST_END' | 'MCP_POST_ERROR',
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

async function captureMcpPostRequestBody(ctx: Router.RouterContext): Promise<Buffer | undefined> {
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

function getHeaderValueAsString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  return value ?? '';
}

function getNormalizedProxiedPath(ctx: Router.RouterContext, routePrefix: string): string {
  if (routePrefix ===  ctx.path) {
    return '';
  }
  const proxiedPath = ctx.path.replace(new RegExp(`^${routePrefix}`), '') || '/';
  return proxiedPath.startsWith('/') ? proxiedPath : '/' + proxiedPath;
}

function buildTargetUrl(ctx: Router.RouterContext, target: string, routePrefix: string): URL {
  // TODO: Refactor this method to reflect clean rules of construction target request
  // Right now when rote prefix is equal context request it will be pass as it is
  // with no chnages
  const normalizedTarget = target.replace(/\/$/, '');
  const normalizedProxiedPath = getNormalizedProxiedPath(ctx, routePrefix);
  const targetUrl = `${normalizedTarget}${normalizedProxiedPath}${ctx.search || ''}`;
  return new URL(targetUrl);
}

function buildProxyRequestHeaders(
  ctx: Router.RouterContext,
  hostname: string,
  requestHeaderRules: RegisterProxiedRouteOptions['requestHeaderRules']
): OutgoingHttpHeaders {
  return applyRequestHeaderRules({ ...ctx.headers, host: hostname }, requestHeaderRules);
}

function buildProxyRequestOptions(
  ctx: Router.RouterContext,
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

function isWebSocketUpgradeRequest(ctx: Router.RouterContext): boolean {
  const upgrade = ctx.headers['upgrade'];
  return typeof upgrade === 'string' && upgrade.toLowerCase() === 'websocket';
}

function rewriteLocationHeaderForRedirect(
  headers: IncomingHttpHeaders,
  statusCode: number | undefined,
  routePrefix: string
): void {
  if (!statusCode || statusCode < 300 || statusCode >= 400 || !headers.location) {
    return;
  }

  const originalLocation = Array.isArray(headers.location)
    ? headers.location[0]
    : headers.location;
  let rewrittenLocation = '';

  try {
    const locationUrl = new URL(originalLocation);
    rewrittenLocation = routePrefix + locationUrl.pathname + (locationUrl.search || '');
    headers.location = rewrittenLocation;
  } catch {
    logger.debug(
      `Rewriting Location header for redirect: original='${originalLocation}' rewritten='${rewrittenLocation}'`
    );
  }
}

function injectBaseHref(body: string, routePrefix: string): string {
  let updated = body.replace(/<base[^>]*>/gi, '');
  updated = updated.replace(/<head([^>]*)>/i, `<head$1><base href="${routePrefix}/">`);
  return updated;
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

  if (Array.isArray(csp)) {
    headers['content-security-policy'] = csp.map((entry) =>
      /base-uri\s/.test(entry)
        ? entry.replace(/base-uri [^;]+/, `base-uri 'self' ${baseUri}`)
        : `${entry}; base-uri 'self' ${baseUri}`
    );
  }
}

function applyProxyResponseHeaders(
  ctx: Router.RouterContext,
  headers: IncomingHttpHeaders,
  options?: { excludeContentLength?: boolean }
): void {
  Object.entries(headers).forEach(([key, value]) => {
    if (!value) {
      return;
    }
    if (options?.excludeContentLength && key.toLowerCase() === 'content-length') {
      return;
    }
    ctx.set(key, Array.isArray(value) ? value.join(',') : value);
  });
}

function applyProxyResponseHeadersToRawResponse(
  res: http.ServerResponse,
  headers: IncomingHttpHeaders
): void {
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
  ctx: Router.RouterContext,
  message: string,
  details?: string,
  requestBodyOverride?: Buffer
): void {
  if (ctx.method === 'POST') {
    ctx.status = 503;
    ctx.type = 'application/json';
    ctx.body = {
      jsonrpc: '2.0',
      id: getJsonRpcIdFromPayload(requestBodyOverride),
      error: {
        code: -32001,
        message,
        data: details
      }
    };
    return;
  }

  if (ctx.method === 'GET') {
    ctx.status = 503;
    ctx.type = 'text/plain';
    ctx.body = details ? `${message}: ${details}` : message;
    return;
  }

  ctx.status = 503;
  ctx.type = 'application/json';
  ctx.body = {
    message,
    details
  };
}

function streamEventStreamResponse(
  ctx: Router.RouterContext,
  proxyRes: IncomingMessage,
  headers: IncomingHttpHeaders
): void {
  ctx.respond = false;
  const res = ctx.res;

  res.statusCode = proxyRes.statusCode || 500;
  applyProxyResponseHeadersToRawResponse(res, headers);

  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  proxyRes.on('error', (error) => {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`Upstream event-stream error for ${ctx.path}: ${message}`);

    if (!res.headersSent) {
      res.statusCode = 502;
      res.end();
      return;
    }

    // End the downstream stream gracefully to avoid surfacing a hard
    // socket reset on MCP clients.
    if (!res.writableEnded && !res.destroyed) {
      res.end();
    }
  });

  proxyRes.on('aborted', () => {
    logger.warn(`Upstream event-stream aborted for ${ctx.path}`);
    if (!res.writableEnded && !res.destroyed) {
      res.end();
    }
  });

  res.on('error', (error) => {
    logger.warn(`Downstream event-stream error for ${ctx.path}: ${error instanceof Error ? error.message : String(error)}`);
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

function forwardRequestBodyToProxy(
  ctx: Router.RouterContext,
  proxyReq: ClientRequest,
  requestBodyOverride?: Buffer
): void {
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
  ctx: Router.RouterContext,
  proxyRes: IncomingMessage,
  headers: IncomingHttpHeaders,
  options: { routePrefix: string; rewritebase?: boolean }
): Promise<void> {
  const contentType = getHeaderValueAsString(proxyRes.headers['content-type']);
  const isEventStream = contentType.includes('text/event-stream');
  const shouldRewriteHtml = Boolean(options.rewritebase) && contentType.includes('text/html');

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

function handleProxyForTarget(
  ctx: Router.RouterContext,
  options: RegisterProxiedRouteOptions,
  requestBodyOverride?: Buffer
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const routePrefix = getRoutePrefix(options.route);
    const isMcpRoute = routePrefix === '/mcp';
    logger.info(`routePrefix: ${routePrefix}`)
    const url = buildTargetUrl(ctx, options.target, routePrefix);
    const isHttps = url.protocol === 'https:';
    const proxyReqHeaders = buildProxyRequestHeaders(ctx, url.hostname, options.requestHeaderRules);
    const requestOptions = buildProxyRequestOptions(ctx, url, isHttps, proxyReqHeaders);

    if (isWebSocketUpgradeRequest(ctx)) {
      return resolve(); // WebSocket requests are handled in websocketHandler.ts
    }

    const proxyReq = (isHttps ? https : http).request(requestOptions, (proxyRes: IncomingMessage) => {
      ctx.status = proxyRes.statusCode || 500;

      const headers = { ...proxyRes.headers };
      rewriteLocationHeaderForRedirect(headers, proxyRes.statusCode, routePrefix);

      handleProxyResponse(ctx, proxyRes, headers, { routePrefix, rewritebase: options.rewritebase })
        .then(resolve)
        .catch(reject);
    });

    proxyReq.on('error', (err) => {
      // For already-started responses (e.g. event-stream), do not attempt
      // to rewrite response state; just log and return.
      if (ctx.respond === false || ctx.res.headersSent) {
        logger.warn(`Proxy request error after response start for ${ctx.path}: ${err.message}`);
        return;
      }

      if (isMcpRoute) {
        logger.warn(`MCP upstream unavailable for ${ctx.method} ${ctx.path}: ${err.message}`);
        setGentleMcpErrorResponse(ctx, 'MCP upstream unavailable', err.message, requestBodyOverride);
        resolve();
        return;
      }

      ctx.status = 500;
      ctx.body = { message: 'Proxy error', error: err.message };
      reject(err);
    });

    ctx.req.on('aborted', () => {
      if (!proxyReq.destroyed) {
        proxyReq.destroy();
      }
    });

    ctx.res.on('close', () => {
      if (!proxyReq.destroyed) {
        proxyReq.destroy();
      }
    });

    forwardRequestBodyToProxy(ctx, proxyReq, requestBodyOverride);
  });
}

function registerProxiedRoute({
  name,
  route,
  target,
  rewritebase,
  conditionalReturns,
  subpathReturns,
  requestHeaderRules
}: RegisterProxiedRouteOptions) {
  router.all(route, async (ctx) => {
    const isMcpRoute = isMcpRouteRequest(ctx, route);
    const shouldLogMcpPost = isMcpPostRequest(ctx, route);
    let mcpPayload: string | undefined;
    let mcpRequestBody: Buffer | undefined;

    if (shouldLogMcpPost) {
      try {
        mcpRequestBody = await captureMcpPostRequestBody(ctx);
        mcpPayload = mcpRequestBody?.toString('utf8');
      } catch (error) {
        mcpPayload = `[unable-to-read-payload: ${error instanceof Error ? error.message : String(error)}]`;
      }

      logMcpPostEvent(ctx, { name, route, target }, 'MCP_POST_START', undefined, undefined, mcpPayload);
    }

    try {
      if (handleSubpathReturns(ctx, subpathReturns)) {
        if (shouldLogMcpPost) {
          logMcpPostEvent(ctx, { name, route, target }, 'MCP_POST_END', ctx.status, undefined, mcpPayload);
        }
        return;
      }

      if (handleHeaderConditionalReturns(ctx, conditionalReturns)) {
        if (shouldLogMcpPost) {
          logMcpPostEvent(ctx, { name, route, target }, 'MCP_POST_END', ctx.status, undefined, mcpPayload);
        }
        return;
      }

      await handleProxyForTarget(
        ctx,
        { name, route, target, rewritebase, conditionalReturns, subpathReturns, requestHeaderRules },
        mcpRequestBody
      );

      if (shouldLogMcpPost) {
        logMcpPostEvent(ctx, { name, route, target }, 'MCP_POST_END', ctx.status, undefined, mcpPayload);
      }
    } catch (err) {
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

      if (shouldLogMcpPost) {
        logMcpPostEvent(
          ctx,
          { name, route, target },
          'MCP_POST_ERROR',
          ctx.status || 502,
          err instanceof Error ? err.message : String(err),
          mcpPayload
        );
      }

      if (isMcpRoute) {
        setGentleMcpErrorResponse(
          ctx,
          'MCP request failed',
          err instanceof Error ? err.message : String(err),
          mcpRequestBody
        );
        return;
      }

      ctx.status = 502;
      ctx.type = 'html';
      ctx.body = UPSTREAM_ERROR_MSG;
    }
  });
}

function registerSplashPageRoute({ name, route }: { name: string; route: string }) {
  router.get(DYNAMIC_ROUTES_INVENTORY_PREFIX, async (ctx) => {
    ctx.type = 'html';
    // Generate a button for each dynamic route, attaching params if present
    const buttons = (
      await Promise.all(dynamicRoutes.map(async r => {
        if (!r.target) {
          logger.debug(`Ignoring route '${r.name}' for the purpose of button rendering because it is missing a target (value: ${r.target})`);
          return '';
        }
        // Default behavior: render the button unless explicitly disabled in config.
        if (r?.doNotRenderButton === true) {
          logger.debug(`Ignoring route '${r.name}' for the purpose of button rendering because doNotRenderButton = true.`);
          return '';
        }
        const href = r.route.replace(/\(\.\*\)$/, '');
        const label = r.name.charAt(0).toUpperCase() + r.name.slice(1);
        let fullHref = href;
        if (r.params) {
          fullHref += r.params.includes('?') ? r.params : `?${r.params}`;
        }

        const user = await determineAndGetUserUsingReqContextAndResource(ctx, r.route)
        const isAllowed = await runPolicy(user?.authAttributes ?? '', r.route) || false;
        logger.debug(`While rendering button, for a given route: ${r.route} following user was determined ${JSON.stringify(user)}. The decsion isAllowed: ${isAllowed}`);

        if (!isAllowed) {
          if (r?.hideIfNoAccess) {
            logger.debug(`Ignoring route '${r.name}' for the purpose of button rendering because hideIfNoAccess = ${r.hideIfNoAccess}.`);
            return '';
          }
          if (r.icon) {
            return `<span class="button" style="pointer-events: none; opacity: 0.45; cursor: not-allowed;">${r.icon}<span class="service-text">${label}</span></span>`;
          }
          return `<span class="button" style="pointer-events: none; opacity: 0.45; cursor: not-allowed;"><span class="service-text">${label}</span></span>`;
        }

        // Allowed: render as normal clickable button
        if (r.icon) {
          return `<a class="button" href="${fullHref}"><span class="button-icon" style="display: inline-flex; align-items: center; gap: 0.7em;">${r.icon}</span><span class="service-text">${label}</span></a>`;
        }
        return `<a class="button" href="${fullHref}"><span class="service-text">${label}</span></a>`;
      }))
    ).join('\n');
    ctx.body = SERVICES_HTML.replace('<!--SERVICES_BUTTONS-->', buttons);
  });
}

function registerStaticFileRoute({ route, relativeFilePath }: { route: string; relativeFilePath: string }) {
  router.get(route, async (ctx) => {
    const absolutePath = path.join(process.cwd(), relativeFilePath);
    try {
      // Ensure the path is always relative to the project root
      const fileContent = await fs.promises.readFile(absolutePath, 'utf8');
      // Set content type based on file extension
      if (relativeFilePath.endsWith('.json')) {
        ctx.type = 'application/json';
      } else if (relativeFilePath.endsWith('.ico')) {
        ctx.type = 'image/x-icon';
      } else {
        ctx.type = 'application/octet-stream';
      }
      ctx.body = fileContent;
    } catch (err) {
      ctx.status = 404;
      ctx.body = { error: 'File not found' };
      logger.error(`File not found for static route '${route}': ${relativeFilePath} (absolute path ${absolutePath}). Error details: ${err instanceof Error ? err.message : String(err)}`);
    }
  });
}

dynamicRoutes.forEach(({ name, route, target, rewritebase, redirect, splashPage, relativeFilePath, conditionalReturns, subpathReturns, requestHeaderRules }) => {
  if (redirect) {
    registerRedirectRoute({ route, redirect });
    return;
  } else if (splashPage) {
    registerSplashPageRoute({ name, route });
  } else if (relativeFilePath) {
    registerStaticFileRoute({ route, relativeFilePath });
    return;
  } else if (target) {
    registerProxiedRoute({ name, route, target, rewritebase, conditionalReturns, subpathReturns, requestHeaderRules });
    return;
  } else {
    logger.debug(`Ignoring route '${name}' in setting up dynamic routes because it is missing a target.`);
    return;
  }
});

router.stack.forEach((route) => {
  if (route.path) {
    logger.debug(`[Registered Route][Methods: ${route.methods.join(', ')}] [Path: ${route.path}]`);
  }
});

export default router;
