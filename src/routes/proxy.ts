// routes/proxy.ts
import { getEnvVar } from '../utils/envHelper';
import Router from 'koa-router';
import http, { RequestOptions, IncomingMessage } from 'http';
import https from 'https';
import { URL } from 'url';
import { Context } from 'koa';

const router = new Router();

const defaultAppAUrl = 'http://10.82.1.228:3001';
const defaultLinkAnalysisUrl = 'http://10.82.1.228:7474';
const targetBase = getEnvVar('APP_A_URL', defaultAppAUrl);
const linkAnalysisBase = getEnvVar('LINK_ANALYSIS_URL', defaultLinkAnalysisUrl);

// Proxy for /bioddex
router.all('/bioddex(.*)', async (ctx: Context) => {
  const proxiedPath = ctx.path.replace(/^\/bioddex/, '') || '/';
  const targetUrl = `${targetBase}${proxiedPath}${ctx.search || ''}`;

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


// Proxy for /linkanalysis
router.all('/linkanalysis(.*)', async (ctx: Context) => {
  const proxiedPath = ctx.path.replace(/^\/linkanalysis/, '') || '/';
  const targetUrl = `${linkAnalysisBase}${proxiedPath}${ctx.search || ''}`;

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
          const locationUrl = new URL(headers.location as string, linkAnalysisBase);
          // Rewrite the location to go through the proxy
          headers.location =
            '/linkanalysis' + locationUrl.pathname + (locationUrl.search || '');
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

export default router;