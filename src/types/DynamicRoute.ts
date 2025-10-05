export interface DynamicRoute {
  name: string;
  route: string;
  target: string;
  redirect?: string;
  rewritebase?: boolean;
  params?: string;
  policyName?: string;
  connectorName?: string;
  icon?: string;
  hideIfNoAccess?: boolean;
}