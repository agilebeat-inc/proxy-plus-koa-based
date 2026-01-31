import type { RequestHeaderRule } from './RequestHeaderRule';

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
  rewritebase?: boolean;
  conditionalReturns?: ProxiedRouteConditionalReturn[];
  subpathReturns?: ProxiedRouteSubpathReturn[];
  requestHeaderRules?: RequestHeaderRule[];
}
