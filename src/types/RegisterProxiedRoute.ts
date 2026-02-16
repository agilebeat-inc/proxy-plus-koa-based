import type { RequestHeaderRule } from './RequestHeaderRule';
import type { DynamicRouteProtocol } from './DynamicRoute';

export type ProxiedRouteConditionalReturn = {
  condition: string;
  headerName: string;
  includes: string;
  return: string;
};

export type ProxiedRouteSubpathReturn = {
  path: string;
  return: string;
};

export interface RegisterProxiedRouteOptions {
  name: string;
  route: string;
  target: string;
  protocol?: DynamicRouteProtocol;
  rewritebase?: boolean;
  conditionalReturns?: ProxiedRouteConditionalReturn[];
  subpathReturns?: ProxiedRouteSubpathReturn[];
  requestHeaderRules?: RequestHeaderRule[];
}
