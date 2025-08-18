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

const DEFAULT_DYNAMIC_ROUTES = '[{"name": "Data Browser", "route": "/analytics/(.*)", "target": "http://10.182.1.86:3001"}, {"name": "Link Analytics", "route": "/graph(.*)", "target": "http://10.182.1.86:7474"}]'
const DYNAMIC_ROUTES = getEnvVar('DYNAMIC_ROUTES', DEFAULT_DYNAMIC_ROUTES);

function getDynamicRoutes(drString: string): Array<{ name: string; route: string; target: string }> {
  let dynamicRoutes: Array<{ name: string; route: string; target: string }> = [];
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

dynamicRoutes.forEach(({ name, route, target }) => {
  router.all(route, async (ctx) => {
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

    await new Promise<void>((resolve, reject) => {
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
            logger.info(`Rewriting Location header for redirect: original='${originalLocation}' rewritten='${rewrittenLocation}'`);
          }
        }

        // Intercept HTML responses and inject <base href="...">
        let bodyChunks: Buffer[] = [];
        const contentType = proxyRes.headers['content-type'] || '';
        const shouldRewriteHtml = contentType.includes('text/html');

        if (shouldRewriteHtml) {
          proxyRes.on('data', (chunk) => bodyChunks.push(chunk));
          proxyRes.on('end', () => {
            let body = Buffer.concat(bodyChunks).toString('utf8');
            // Remove any existing <base ...> tag
            body = body.replace(/<base[^>]*>/gi, '');
            // Inject <base href="..."> right after <head>
            body = body.replace(
              /<head([^>]*)>/i,
              `<head$1><base href="${prefixForRoute}/">`
            );
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
  });
});

const dynamicRoutesServicesPrefix = getEnvVar('DYNAMIC_ROUTES_INVENTORY_PREFIX', '/services');

router.get(dynamicRoutesServicesPrefix, async (ctx) => {
  ctx.type = 'html';
  // Generate a button for each dynamic route
  const buttons = dynamicRoutes.map(r => {
    // Remove (.*) from route for button href
    const href = r.route.replace(/\(\.\*\)$/, '');
    const label = r.name.charAt(0).toUpperCase() + r.name.slice(1);
    return `<a class="button" href="${href}">${label}</a>`;
  }).join('\n');
  ctx.body = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Service Selector</title>
        <style>
          body { font-family: sans-serif; margin: 2em; }
          .container { max-width: 400px; margin: auto; }
          h1 { text-align: center; }
          a.button {
            display: block;
            margin: 1em 0;
            padding: 1em;
            background: #0078d4;
            color: #fff;
            text-decoration: none;
            text-align: center;
            border-radius: 5px;
            font-size: 1.2em;
            transition: background 0.2s;
          }
          a.button:hover { background: #005fa3; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Select Service</h1>
          ${buttons}
        </div>
      </body>
    </html>
  `;
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