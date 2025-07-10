// routes/proxy.ts
import { getEnvVar } from '../utils/envHelper';
import Router from 'koa-router';
import http, { RequestOptions, IncomingMessage } from 'http';
import https from 'https';
import { URL } from 'url';
import { Context } from 'koa';

const router = new Router();

const defaultAppAUrl = 'http://10.82.1.228:3001';
const targetBase = getEnvVar('APP_A_URL', defaultAppAUrl);

router.all('(.*)', async (ctx: Context) => {
  const targetUrl = `${targetBase}${ctx.path}${ctx.search || ''}`;

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

export default router;