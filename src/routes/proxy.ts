// routes/proxy.ts
import { getEnvVar } from '../utils/envHelper';
import Router from 'koa-router';
import http, { RequestOptions, IncomingMessage } from 'http';
import https from 'https';
import { URL } from 'url';
import logger from '../utils/logger';
import { DYNAMIC_ROUTES, SERVICES_HTML, UPSTREAM_ERROR_MSG, DYNAMIC_ROUTES_INVENTORY_PREFIX } from '../config/env' 

const router = new Router();

const dynamicRoutes = DYNAMIC_ROUTES;

if (dynamicRoutes.length === 0) {
  logger.warn('No dynamic routes configured. Please set the DYNAMIC_ROUTES environment variable.');
}

dynamicRoutes.forEach(({ name, route, target, rewritebase }) => {
  router.all(route, async (ctx) => {
    try {
      await new Promise<void>((resolve, reject) => {
        const prefixForRoute = route.replace(/\(.*\)$/, '');
        const proxiedPath = ctx.path.replace(new RegExp(`^${prefixForRoute}`), '') || '/';
        const normalizedTarget = target.replace(/\/$/, '');
        const normalizedProxiedPath = proxiedPath.startsWith('/') ? proxiedPath : '/' + proxiedPath;
        const targetUrl = `${normalizedTarget}${normalizedProxiedPath}${ctx.search || ''}`;
        const url = new URL(targetUrl);
        const isHttps = url.protocol === 'https:';
        const requestOptions: RequestOptions = {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: url.pathname + url.search,
          method: ctx.method,
          headers: { ...ctx.headers, host: url.hostname },
        };

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
          let bodyChunks: Buffer[] = [];
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
});

const dynamicRoutesServicesPrefix = DYNAMIC_ROUTES_INVENTORY_PREFIX;

router.get(dynamicRoutesServicesPrefix, async (ctx) => {
  ctx.type = 'html';
  // Generate a button for each dynamic route, attaching params if present
  const buttons = dynamicRoutes.map(r => {
    const href = r.route.replace(/\(\.\*\)$/, '');
    const label = r.name.charAt(0).toUpperCase() + r.name.slice(1);
    let fullHref = href;
    if (r.params) {
      fullHref += r.params.includes('?') ? r.params : `?${r.params}`;
    }
    return `<a class="button" href="${fullHref}">${label}</a>`;
  }).join('\n');
  ctx.body = SERVICES_HTML.replace('<!--SERVICES_BUTTONS-->', buttons);
});

// Add default route to redirect to the first dynamic route if not already present
if (dynamicRoutes.length > 0) {
  const { route } = dynamicRoutes[0];
  // Only add if the first route is not already '/'
  if (route !== '/') {
    const redirectPath = route.replace(/\(\.\*\)$/, '');
    router.get('/', async (ctx) => {
      ctx.redirect(`${redirectPath}`);
    });
  }
}

// Special case (patch for the webapp): if path is /search, redirect to /analytics/search (preserve query string)
router.all('/search', async (ctx, next) => {
  ctx.redirect(`/analytics/search${ctx.search || ''}`);
});

// Catch-all route: redirect to inventory if no other route matched
router.all('(.*)', async (ctx) => {
  // Only redirect if not already at the services prefix

  if (ctx.path !== dynamicRoutesServicesPrefix) {
    ctx.redirect(dynamicRoutesServicesPrefix);
  }
});

router.stack.forEach((route) => {
  if (route.path) {
    logger.debug(`[Registered Route][Methods: ${route.methods.join(', ')}] [Path: ${route.path}]`);
  }
});

export default router;