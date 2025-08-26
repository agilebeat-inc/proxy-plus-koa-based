// routes/proxy.ts
import { getEnvVar } from '../utils/envHelper';
import Router from 'koa-router';
import http, { RequestOptions, IncomingMessage } from 'http';
import https from 'https';
import { URL } from 'url';
import cheerio from 'cheerio';
// Remove the import of Context from 'koa-websocket' if present
import type { Context } from 'koa';
import logger from '../utils/logger';

const router = new Router();

const DEFAULT_DYNAMIC_ROUTES = '[{"name": "Data Browser","route": "/analytics/(.*)", "target": "http://10.182.1.86:3001", "rewritebase": true}, {"name": "Link Analytics", "route": "/graph(.*)", "target": "http://10.182.1.86:7474", "rewritebase": false, "params": "/browser?dbms=neo4j://Anonymous@localhost:3000&db=neo4j"}]';
// Static HTML for the dynamic routes services page, configurable via env var
const DEFAULT_SERVICES_HTML = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>Service Selector</title>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <style>
      html, body {
        height: 100%;
        margin: 0;
        padding: 0;
        font-family: ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
        background: #f3f4f6;
        color: #1c1917;
      }
      .container {
        max-width: 28rem;
        margin: 8vh auto 0 auto;
        background: #fff;
        border-radius: 1rem;
        box-shadow: 0 2px 12px #0002;
        padding: 2.5em 2em 2em 2em;
        text-align: center;
        border: 1px solid #e5e7eb;
      }
      h1 {
        color: #2563eb; /* BioDDEx blue-600 */
        font-size: 2.25rem; /* text-4xl */
        font-weight: 700;   /* font-bold */
        margin-bottom: 1.5em;
        letter-spacing: -0.01em;
        font-family: ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
      }
      .button {
        display: block;
        margin: 1.2em 0;
        padding: 0.75em 0.5em;
        background: #f9fafb;
        color: #1c1917;
        border-radius: 0.25rem;
        border: 1px dotted #94a3b8; /* slate-400 */
        font-size: 1.1em;
        font-family: inherit;
        font-weight: 500;
        box-shadow: 0 1px 3px 0 rgb(0 0 0 / .08), 0 1px 2px -1px rgb(0 0 0 / .08);
        text-decoration: none;
        cursor: pointer;
        transition: border-color 0.2s, background 0.2s;
        user-select: none;
      }
      .button:hover {
        background: #e5e7eb;
        border-color: #0f172a;
        border-style: solid;
        color: #2563eb;
      }
      @media (max-width: 600px) {
        .container {
          margin: 2vh 1vw 0 1vw;
          padding: 1.5em 0.5em 1.5em 0.5em;
        }
        h1 {
          font-size: 1.3rem;
        }
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>Select Service</h1>
      <!--SERVICES_BUTTONS-->
    </div>
  </body>
</html>
`;
const DEFAULT_UPSTREAM_ERROR_MSG = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>Service Unavailable</title>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <style>
      html, body {
        height: 100%;
        margin: 0;
        padding: 0;
        font-family: ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", Segoe UI Symbol, "Noto Color Emoji";
        background: #f3f4f6;
        color: #1c1917;
      }
      .error-container {
        max-width: 28rem;
        margin: 8vh auto 0 auto;
        background: #fff;
        border-radius: 1rem;
        box-shadow: 0 2px 12px #0002;
        padding: 2.5em 2em 2em 2em;
        text-align: center;
        border: 1px solid #e5e7eb;
      }
      .error-title {
        color: #d32f2f;
        font-size: 2rem;
        font-weight: 700;
        margin-bottom: 0.5em;
        letter-spacing: -0.01em;
      }
      .error-message {
        font-size: 1.1em;
        color: #444;
        margin-bottom: 1.5em;
      }
      .contact {
        margin-top: 2em;
        color: #71717a;
        font-size: 0.95em;
      }
      .button {
        display: inline-block;
        margin-top: 2em;
        padding: 0.75em 2em;
        background: #f3f4f6;
        color: #1c1917;
        border: 1px dotted #a1a1aa;
        border-radius: 0.25rem;
        font-size: 1.1em;
        text-decoration: none;
        transition: border-color 0.2s, background 0.2s;
        font-weight: 500;
        cursor: pointer;
      }
      .button:hover {
        border-style: solid;
        border-color: #0f172a;
        background: #e5e7eb;
      }
      a {
        color: #71717a;
        text-decoration: underline dotted #a1a1aa 1px;
        text-underline-offset: 3px;
        transition: text-decoration-color 0.2s, text-decoration-style 0.2s;
      }
      a:hover {
        text-decoration-style: solid;
        text-decoration-color: #0f172a;
      }
      @media (max-width: 600px) {
        .error-container {
          margin: 2vh 1vw 0 1vw;
          padding: 1.5em 0.5em 1.5em 0.5em;
        }
      }
    </style>
  </head>
  <body>
    <div class="error-container">
      <h1 class="error-title">Service Unavailable</h1>
      <div class="error-message">
        Sorry, the service you are trying to access is currently unavailable.
        Please contact your system administrator for further assistance.
      </div>
      <div class="contact">
        <strong>Need help?</strong><br>
        Email: <a href="mailto:admin@example.com">admin@example.com</a>
      </div>
      <a class="button" href="/services">Back to Services</a>
    </div>
  </body>
</html>
`;
const DYNAMIC_ROUTES = getEnvVar('DYNAMIC_ROUTES', DEFAULT_DYNAMIC_ROUTES);
const UPSTREAM_ERROR_MSG = getEnvVar('UPSTREAM_ERROR_MSG', DEFAULT_UPSTREAM_ERROR_MSG);

// Allow override via environment variable
const SERVICES_HTML = getEnvVar('DYNAMIC_ROUTES_SERVICES_HTML', DEFAULT_SERVICES_HTML);

function getDynamicRoutes(drString: string): Array<{ name: string; route: string; target: string; rewritebase?: boolean; params?: string }> {
  let dynamicRoutes: Array<{ name: string; route: string; target: string; rewritebase?: boolean; params?: string }> = [];
  try {
    dynamicRoutes = JSON.parse(drString || '[]');
  } catch {
    dynamicRoutes = [];
  }
  return dynamicRoutes;
}

const dynamicRoutes = getDynamicRoutes(DYNAMIC_ROUTES);

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

const dynamicRoutesServicesPrefix = getEnvVar('DYNAMIC_ROUTES_INVENTORY_PREFIX', '/services');

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