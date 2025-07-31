import { Middleware } from 'koa';
import { asyncLocalStorage } from '../localStorage';
import { getEnvVar } from '../utils/envHelper';
import logger from '../utils/logger';

const ignore_prefixes = "['/browser', '/_app', '/health', '/metrics', '/favicon.ico', '/robots.txt', '/static', '/public']";
const prefixesToIgnoreInLogs = getEnvVar('IGNORE_URLS_FOR_LOGGING_BY_PREFIX', ignore_prefixes) || ignore_prefixes;

// Parse the prefixes string into an array (e.g., "['_app','/health']" => ['_app','/health'])
function parsePrefixes(prefixes: string): string[] {
  try {
    // Remove whitespace and parse as JSON array
    return JSON.parse(prefixes.replace(/'/g, '"'));
  } catch {
    // Fallback: split by comma and trim
    return prefixes
      .replace(/[\[\]']/g, '')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
  }
}

const ignoredPrefixes: string[] = parsePrefixes(prefixesToIgnoreInLogs);

export const loggerMiddleware: Middleware = async (ctx, next) => {
  const store = asyncLocalStorage.getStore();

  // Check if the path starts with any ignored prefix
  const shouldIgnore = ignoredPrefixes.some((prefix) =>
    ctx.path.startsWith(prefix)
  );

  if (shouldIgnore) {
    await next();
    return;
  }

  const userTag = store?.user
    ? `User: ${store.user.cn} (${store.user.id})`
    : 'User: anonymous (null)';

  const queryParams = ctx.querystring ? ctx.querystring : null;

  const start = Date.now();
  const logStart = {
    timestamp: store?.timestamp,
    reqId: store?.reqId,
    method: store?.method,
    path: store?.path,
    event: 'START',
    user: store?.user || { cn: 'anonymous', id: null },
    userTag,
    queryParams, 
  };
  logger.info(logStart);

  try {
    await next();
    const duration = Date.now() - start;
    const logEnd = {
      timestamp: new Date().toISOString(),
      reqId: store?.reqId,
      status: ctx.status,
      event: 'END',
      durationMs: duration,
    };
    logger.info(logEnd);
  } catch (err) {
    const duration = Date.now() - start;
    const logError = {
      timestamp: new Date().toISOString(),
      reqId: store?.reqId,
      event: 'ERROR',
      error: err instanceof Error ? err.message : String(err),
      durationMs: duration,
    };
    logger.error(logError);
    throw err;
  }
};