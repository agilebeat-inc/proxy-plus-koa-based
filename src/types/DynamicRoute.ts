import type { RequestHeaderRule } from './RequestHeaderRule';

export type DynamicRouteWebSocketHandler = 'neo4j-bolt' | 'proxy';

export interface DynamicRouteWebSocketConfig {
  handler: DynamicRouteWebSocketHandler;
  target: string;
  authHeader?: string;
  preserveQueryString?: boolean;
}

export interface DynamicRoute {
  doNotRenderButton: boolean | undefined;
  name: string;
  route: string;
  target: string;
  rewritebase?: boolean;
  requestHeaderRules?: RequestHeaderRule[];
  redirect?: string | {
    default: string;
    conditionalRedirects?: Array<{
      condition: string;
      headerName: string;
      includes: string;
      redirect?: string;
      return?: string;
    }>;
  };
  conditionalReturns?: Array<{
    condition: string;
    headerName: string;
    includes: string;
    return: string;
  }>;
  subpathReturns?: Array<{
    path: string;
    return: string;
  }>;
  splashPage?: boolean;
  relativeFilePath?: string;
  params?: string;
  policyName?: string;
  connectorName?: string;
  icon?: string;
  hideIfNoAccess?: boolean;
  websocket?: DynamicRouteWebSocketConfig;
}
