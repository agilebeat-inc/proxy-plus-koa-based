import { DynamicRoute } from '../types/DynamicRoute';
import { getEnvVar } from '../utils/envHelper';
import logger from '../utils/logger';
import { DEFAULT_SERVICES_HTML, DEFAULT_UPSTREAM_ERROR_MSG, DEFAULT_DYNAMIC_ROUTES, DEFAULT_DYNAMIC_ROUTES_INVENTORY_PREFIX, DEFAULT_IGNORE_URLS_FOR_LOGGING_BY_PREFIX } from './defaultEnv';
// Centralized environment variable initialization
export const POLICY_NAME = getEnvVar('POLICY_NAME', 'mock-always-allow');
export const CONNECTOR_PLUGIN_NAME = getEnvVar('CONNECTOR_PLUGIN_NAME', 'simple');
export const USER_HEADER_FOR_CN = getEnvVar('USER_HEADER_FOR_CN', 'x-user-common-name');
export const WS_TARGET_URL = getEnvVar('WS_TARGET_URL', 'ws://10.182.1.86:7687/');
export const DYNAMIC_ROUTES_SERVICES_HTML = getEnvVar('DYNAMIC_ROUTES_SERVICES_HTML', DEFAULT_SERVICES_HTML);
export const UPSTREAM_ERROR_MSG = getEnvVar('UPSTREAM_ERROR_MSG', DEFAULT_UPSTREAM_ERROR_MSG);
export const SERVICES_HTML = getEnvVar('DYNAMIC_ROUTES_SERVICES_HTML', DEFAULT_SERVICES_HTML);
export const IGNORE_URLS_FOR_LOGGING_BY_PREFIX = getEnvVar('IGNORE_URLS_FOR_LOGGING_BY_PREFIX', DEFAULT_IGNORE_URLS_FOR_LOGGING_BY_PREFIX);
export const DYNAMIC_ROUTES_INVENTORY_PREFIX = getEnvVar('DYNAMIC_ROUTES_INVENTORY_PREFIX', DEFAULT_DYNAMIC_ROUTES_INVENTORY_PREFIX);

function getDynamicRoutes(drString: string): DynamicRoute[] {
  let dynamicRoutes: DynamicRoute[] = [];
  try {
    dynamicRoutes = JSON.parse(drString || '[]');
    dynamicRoutes = dynamicRoutes.map(route => {
      if (route.route.includes('{DEFAULT_DYNAMIC_ROUTES_INVENTORY_PREFIX}')) {
        return { ...route, route: route.route.replace('{DEFAULT_DYNAMIC_ROUTES_INVENTORY_PREFIX}', DYNAMIC_ROUTES_INVENTORY_PREFIX) };
      } else {
        return route;
      }
    });
  } catch {
    dynamicRoutes = [];
  }
  logger.debug(`[Environment][DYNAMIC_ROUTES]: ${JSON.stringify(dynamicRoutes)}`);
  return dynamicRoutes;
}
export const DYNAMIC_ROUTES = getDynamicRoutes(getEnvVar('DYNAMIC_ROUTES', DEFAULT_DYNAMIC_ROUTES));