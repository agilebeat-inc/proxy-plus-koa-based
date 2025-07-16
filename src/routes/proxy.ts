// routes/proxy.ts
import { getEnvVar } from '../utils/envHelper';
import Router from 'koa-router';
import http, { RequestOptions, IncomingMessage } from 'http';
import https from 'https';
import { URL } from 'url';
// Remove the import of Context from 'koa-websocket' if present
import type { Context } from 'koa';

const router = new Router();

const DYNAMIC_ROUTES = '[{"name": "analytics", "route": "/bioddex(.*)", "target": "http://10.82.1.228:3001"}, {"name": "linkanalysis", "route": "/linkanalysis(.*)", "target": "http://10.82.1.228:7474"}]'

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
dynamicRoutes.forEach(({ name, route, target }) => {
  router.all(route, async (ctx) => {
    const prefixForRoute = route.replace(/\(.*\)$/, ''); 
    const proxiedPath = ctx.path.replace(new RegExp(`^${prefixForRoute}`), '') || '/';
    const targetUrl = `${target}${proxiedPath}${ctx.search || ''}`;
    console.log(targetUrl)

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
          try {
            // Parse the original location
            const locationUrl = new URL(headers.location as string);
            // Rewrite the location to go through the proxy using the route prefix
            const routePrefix = prefixForRoute;
            headers.location =
              routePrefix + locationUrl.pathname + (locationUrl.search || '');
          } catch {
            // If location is not a valid URL, leave as is
          }
        }

        Object.entries(headers).forEach(([key, value]) => {
          if (value) ctx.set(key, Array.isArray(value) ? value.join(',') : value);
        });

        ctx.body = proxyRes;
        resolve();
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


  // Prevent direct access to proxied backend URLs (bypass fix)
  router.all(/^\/(http|https):\/\//, async (ctx) => {
    ctx.status = 403;
    ctx.body = 'Direct backend URL access is forbidden.';
  });

router.get('/biotech', async (ctx) => {
  ctx.type = 'html';
  // Generate a button for each dynamic route
  const buttons = dynamicRoutes.map(r => {
    // Remove (.*) from route for button href
    const href = r.route.replace(/\(\.\*\)$/, '');
    const label = r.name.charAt(0).toUpperCase() + r.name.slice(1);
    return `<a class="button" href="${href}/">Go to ${label}</a>`;
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

export default router;