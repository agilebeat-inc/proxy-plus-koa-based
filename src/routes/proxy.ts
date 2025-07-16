// routes/proxy.ts
import { getEnvVar } from '../utils/envHelper';
import Router from 'koa-router';
import http, { RequestOptions, IncomingMessage } from 'http';
import https from 'https';
import { URL } from 'url';
// Remove the import of Context from 'koa-websocket' if present
import type { Context } from 'koa';

const router = new Router();

const defaultAppAUrl = 'http://10.82.1.228:3001';
const defaultLinkAnalysisUrl = 'http://10.82.1.228:7474';
const targetBase = getEnvVar('APP_A_URL', defaultAppAUrl);
const linkAnalysisBase = getEnvVar('LINK_ANALYSIS_URL', defaultLinkAnalysisUrl);

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
    const prefixForRoute = route.replace(/\(.*\)$/, ''); // "/analytics"
    const proxiedPath = ctx.path.replace(new RegExp(`^${prefixForRoute}`), '') || '/';
    const targetUrl = `${target}${proxiedPath}${ctx.search || ''}`;

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
        Object.entries(proxyRes.headers).forEach(([key, value]) => {
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

  router.get('/', async (ctx) => {
    ctx.type = 'html';
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
          <a class="button" href="/bioddex/">Go to Bioddex</a>
          <a class="button" href="/linkanalysis/browser/?dbms=neo4j://localhost:3000/neo4j&db=neo4j&preselectAuthMethod=NONE">Go to Linkanalysis</a>
        </div>
      </body>
    </html>
  `;
  });

  export default router;