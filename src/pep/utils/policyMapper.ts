import { pathToRegexp } from 'path-to-regexp';
import { DynamicRoute } from '../../types/DynamicRoute';
import { DYNAMIC_ROUTES } from '../../config/env';

function getPolicyName(protectedResource: string) {
  const matched = DYNAMIC_ROUTES.find((routeConfig: DynamicRoute) => {
    try {
      const re = pathToRegexp(routeConfig.route);
      return re.test(protectedResource);
    } catch (error) {
      console.error(`Error processing route ${routeConfig.route}:`, error);
      return false;
    }
  });
  return matched?.policyName || 'mock-always-deny';
}

export { getPolicyName };