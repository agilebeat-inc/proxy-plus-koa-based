export interface DynamicRoute {
  name: string;
  route: string;
  target: string;
  rewritebase?: boolean;
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
}
