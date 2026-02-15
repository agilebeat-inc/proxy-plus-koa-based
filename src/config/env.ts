import { DynamicRoute } from '../types/DynamicRoute';
import { getEnvVar } from '../utils/envHelper';
import logger from '../utils/logger';
import { DEFAULT_INJECTED_BOLT_PRINCIPAL, DEFAULT_INJECTED_BOLT_SCHEME, DEFAULT_MCP_NEO4J_AUTH_HEADER, DEFAULT_SERVICES_HTML, DEFAULT_UPSTREAM_ERROR_MSG, DEFAULT_DYNAMIC_ROUTES, DEFAULT_DYNAMIC_ROUTES_INVENTORY_PREFIX, DEFAULT_ACCESS_DENY_ERROR_MSG, DEFAULT_IGNORE_URLS_FOR_LOGGING_BY_PREFIX, DEFAULT_NEO4J_BROWSER_MANIFEST } from './defaultEnv';
// Centralized environment variable initialization
export const POLICY_NAME = getEnvVar('POLICY_NAME', 'mock-always-allow');
export const CONNECTOR_PLUGIN_NAME = getEnvVar('CONNECTOR_PLUGIN_NAME', 'simple');
export const USER_HEADER_FOR_CN = getEnvVar('USER_HEADER_FOR_CN', 'x-user-common-name');
export const DYNAMIC_ROUTES_SERVICES_HTML = getEnvVar('DYNAMIC_ROUTES_SERVICES_HTML', DEFAULT_SERVICES_HTML);
export const UPSTREAM_ERROR_MSG = getEnvVar('UPSTREAM_ERROR_MSG', DEFAULT_UPSTREAM_ERROR_MSG);
export const SERVICES_HTML = getEnvVar('DYNAMIC_ROUTES_SERVICES_HTML', DEFAULT_SERVICES_HTML);
export const ACCESS_DENY_ERROR_MSG = getEnvVar('ACCESS_DENY_ERROR_MSG', DEFAULT_ACCESS_DENY_ERROR_MSG);
export const IGNORE_URLS_FOR_LOGGING_BY_PREFIX = getEnvVar('IGNORE_URLS_FOR_LOGGING_BY_PREFIX', DEFAULT_IGNORE_URLS_FOR_LOGGING_BY_PREFIX);
export const DYNAMIC_ROUTES_INVENTORY_PREFIX = getEnvVar('DYNAMIC_ROUTES_INVENTORY_PREFIX', DEFAULT_DYNAMIC_ROUTES_INVENTORY_PREFIX);
export const NEO4J_BROWSER_MANIFEST = getEnvVar('NEO4J_BROWSER_MANIFEST', DEFAULT_NEO4J_BROWSER_MANIFEST);
export const INJECTED_BOLT_PRINCIPAL = getEnvVar('INJECTED_BOLT_PRINCIPAL', DEFAULT_INJECTED_BOLT_PRINCIPAL);

const DEFAULT_INJECTED_BOLT_CREDENTIALS = 'my-password';
function getInjectedBoltCredentials(): string {
  const value = process.env.INJECTED_BOLT_CREDENTIALS;
  if (!value) {
    logger.warn('[Environment] Authentication injection will not work because user credential is not configured.');
    return DEFAULT_INJECTED_BOLT_CREDENTIALS;
  }
  return value;
}
export const INJECTED_BOLT_CREDENTIALS = getInjectedBoltCredentials();
export const INJECTED_BOLT_SCHEME = getEnvVar('INJECTED_BOLT_SCHEME', DEFAULT_INJECTED_BOLT_SCHEME);
export const MCP_NEO4J_AUTH_HEADER = getEnvVar('MCP_NEO4J_AUTH_HEADER', DEFAULT_MCP_NEO4J_AUTH_HEADER);

const DYNAMIC_ROUTE_PLACEHOLDER_REGEX = /\{([A-Z0-9_]+)\}/g;

function resolveDynamicRoutePlaceholder(placeholderName: string): string | undefined {
  if (placeholderName === 'DEFAULT_DYNAMIC_ROUTES_INVENTORY_PREFIX') {
    return DYNAMIC_ROUTES_INVENTORY_PREFIX;
  }
  if (placeholderName === 'MCP_NEO4J_AUTH_HEADER') {
    return MCP_NEO4J_AUTH_HEADER;
  }
  return process.env[placeholderName];
}

function replaceDynamicRoutePlaceholders(value: string): string {
  return value.replace(DYNAMIC_ROUTE_PLACEHOLDER_REGEX, (match, placeholderName: string) => {
    const resolvedValue = resolveDynamicRoutePlaceholder(placeholderName);
    if (typeof resolvedValue === 'string') {
      return resolvedValue;
    }
    logger.warn(
      `[Environment] DYNAMIC_ROUTES placeholder '${placeholderName}' is not configured; leaving token '${match}'.`
    );
    return match;
  });
}

function resolveDynamicRouteConfigValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return replaceDynamicRoutePlaceholders(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => resolveDynamicRouteConfigValue(entry));
  }

  if (value && typeof value === 'object') {
    const resolvedEntries = Object.entries(value).map(([key, nestedValue]) => [
      key,
      resolveDynamicRouteConfigValue(nestedValue)
    ]);
    return Object.fromEntries(resolvedEntries);
  }

  return value;
}

function getDynamicRoutes(drString: string): DynamicRoute[] {
  let dynamicRoutes: DynamicRoute[] = [];
  try {
    dynamicRoutes = JSON.parse(drString || '[]');
    dynamicRoutes = dynamicRoutes.map((route) => resolveDynamicRouteConfigValue(route) as DynamicRoute);
  } catch {
    dynamicRoutes = [];
  }
  logger.debug(`[Environment][DYNAMIC_ROUTES]: ${JSON.stringify(dynamicRoutes)}`);
  return dynamicRoutes;
}
export const DYNAMIC_ROUTES = getDynamicRoutes(getEnvVar('DYNAMIC_ROUTES', DEFAULT_DYNAMIC_ROUTES));
