// routes/proxy.ts
import Router from 'koa-router';
import http, { RequestOptions, IncomingMessage } from 'http';
import https from 'https';
import { URL } from 'url';
import logger from '../utils/logger';
import { DYNAMIC_ROUTES, SERVICES_HTML, UPSTREAM_ERROR_MSG, DYNAMIC_ROUTES_INVENTORY_PREFIX, USER_HEADER_FOR_CN, NEO4J_BROWSER_MANIFEST } from '../config/env' 
import { runPolicy } from '../pep/policy-executor';
import { determineAndGetUserUsingReqContextAndResource, extractUserCN } from '../utils/requestContextHelper';
import fs from 'fs';
import path from 'path';
import { applyRequestHeaderRules } from '../utils/requestHeaderRules';
import type { RegisterProxiedRouteOptions } from '../types/RegisterProxiedRoute';

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
      try {
        if (subpathReturns && Array.isArray(subpathReturns)) {
          for (const subpath of subpathReturns) {
            if (ctx.path.startsWith(subpath.path)) {
              const responseBody = conditionalReturnValues[subpath.return] ?? '';
              ctx.type = 'application/json';
              ctx.body = responseBody;
              return;
            }
          }
        }
        if (conditionalReturns && Array.isArray(conditionalReturns)) {
          for (const cond of conditionalReturns) {
            if (cond.condition === 'header' && cond.headerName && cond.includes) {
              const headerValue = ctx.headers[cond.headerName.toLowerCase()];
              if (headerValue && headerValue.includes(cond.includes)) {
                const responseBody = conditionalReturnValues[cond.return] ?? '';
                ctx.type = 'application/json';
                ctx.body = responseBody;
                return;
              }
            }
          }
        }
        await new Promise<void>((resolve, reject) => {
          const prefixForRoute = route.replace(/\(.*\)$/, '');
          const proxiedPath = ctx.path.replace(new RegExp(`^${prefixForRoute}`), '') || '/';
          const normalizedTarget = target.replace(/\/$/, '');
          const normalizedProxiedPath = proxiedPath.startsWith('/') ? proxiedPath : '/' + proxiedPath;
          const targetUrl = `${normalizedTarget}${normalizedProxiedPath}${ctx.search || ''}`;
          const url = new URL(targetUrl);
          const isHttps = url.protocol === 'https:';
          const proxyReqHeaders = applyRequestHeaderRules(
            { ...ctx.headers, host: url.hostname },
            requestHeaderRules
          );
          const requestOptions: RequestOptions = {
            protocol: url.protocol,
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: url.pathname + url.search,
            method: ctx.method,
            headers: proxyReqHeaders,
          };

          const isWebSocketUpgrade =
            ctx.headers['upgrade'] &&
            ctx.headers['upgrade'].toLowerCase() === 'websocket';
          
          if (isWebSocketUpgrade) {
            return resolve(); // WebSocket requests are handled in websocketHandler.ts
          }

          const proxyReq = (isHttps ? https : http).request(requestOptions, (proxyRes: IncomingMessage) => {
            ctx.status = proxyRes.statusCode || 500;

            // Handle and rewrite Location header for redirects (3xx)
            const headers = { ...proxyRes.headers };
            if (
              proxyRes.statusCode &&
              proxyRes.statusCode >= 300 &&
              proxyRes.statusCode < 400 &&
              headers.location
            ) {
              const originalLocation = headers.location as string;
              let rewrittenLocation: string = "";
              try {
                const locationUrl = new URL(originalLocation);
                const routePrefix = prefixForRoute;
                rewrittenLocation = routePrefix + locationUrl.pathname + (locationUrl.search || '');
                headers.location = rewrittenLocation;
              } catch {
                logger.debug(`Rewriting Location header for redirect: original='${originalLocation}' rewritten='${rewrittenLocation}'`);
              }
            }

            // Intercept HTML responses and inject <base href="..."> if rewritebase is true
            const bodyChunks: Buffer[] = [];
            const contentType = proxyRes.headers['content-type'] || '';
            const shouldRewriteHtml = contentType.includes('text/html') && rewritebase;

            if (shouldRewriteHtml) {
              proxyRes.on('data', (chunk) => bodyChunks.push(chunk));
              proxyRes.on('end', () => {
                let body = Buffer.concat(bodyChunks).toString('utf8');
                if (rewritebase) {
                  // Remove any existing <base ...> tag
                  body = body.replace(/<base[^>]*>/gi, '');
                  // Inject <base href="..."> right after <head>
                  body = body.replace(
                    /<head([^>]*)>/i,
                    `<head$1><base href="${prefixForRoute}/">`
                  );
                  // --- Add or patch Content-Security-Policy for base-uri ---
                  const baseUri = `${ctx.protocol}://${ctx.host}${prefixForRoute}/`;
                  if (headers['content-security-policy']) {
                    if (typeof headers['content-security-policy'] === 'string') {
                      if (/base-uri\s/.test(headers['content-security-policy'])) {
                        headers['content-security-policy'] = headers['content-security-policy'].replace(
                          /base-uri [^;]+/,
                          `base-uri 'self' ${baseUri}`
                        );
                      } else {
                        headers['content-security-policy'] += `; base-uri 'self' ${baseUri}`;
                      }
                    } else if (Array.isArray(headers['content-security-policy'])) {
                      headers['content-security-policy'] = headers['content-security-policy'].map((csp) =>
                        /base-uri\s/.test(csp)
                          ? csp.replace(/base-uri [^;]+/, `base-uri 'self' ${baseUri}`)
                          : `${csp}; base-uri 'self' ${baseUri}`
                      );
                    }
                  } else {
                    headers['content-security-policy'] = `base-uri 'self' ${baseUri}`;
                  }
                }
                ctx.set('content-type', contentType);
                Object.entries(headers).forEach(([key, value]) => {
                  if (key.toLowerCase() !== 'content-length' && value) ctx.set(key, Array.isArray(value) ? value.join(',') : value);
                });
                ctx.body = body;
                resolve();
              });
              proxyRes.on('error', reject);
            } else {
              Object.entries(headers).forEach(([key, value]) => {
                if (value) ctx.set(key, Array.isArray(value) ? value.join(',') : value);
              });
              ctx.body = proxyRes;
              resolve();
            }
          });

          proxyReq.on('error', (err) => {
            ctx.status = 500;
            ctx.body = { message: 'Proxy error', error: err.message };
            reject(err);
          });

          if (ctx.req.readable) {
            ctx.req.pipe(proxyReq);
          } else if (ctx.request.body) {
            proxyReq.write(typeof ctx.request.body === 'string' ? ctx.request.body : JSON.stringify(ctx.request.body));
            proxyReq.end();
          } else {
            proxyReq.end();
          }
        });
      } catch (err) {
        // ctx is available here!
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
