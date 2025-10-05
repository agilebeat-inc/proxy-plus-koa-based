import { asyncLocalStorage, RequestContext } from '../localStorage';
import { getPluginName } from '../connectors/utils/connectorSettingsMapper';
import { getPolicyName } from '../pep/utils/policyMapper';
import { lookupUserByCN } from '../connectors/userLookup';

import { USER_HEADER_FOR_CN } from '../config/env';

export const userHeaderForCN = USER_HEADER_FOR_CN;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractUserCN(ctx: any): string {
  // Extract common name from header
  const headerKey = userHeaderForCN.toLowerCase();
  const commonNameHeader = ctx.headers[headerKey];
  const commonName = Array.isArray(commonNameHeader)
    ? commonNameHeader[0]
    : commonNameHeader || 'anonymous';

  return commonName;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function constructRequestContext(ctx: any, commonName: string): Promise<RequestContext> {
  const user = await lookupUserByCN(commonName, ctx.path);
  const store = asyncLocalStorage.getStore();
  const context: RequestContext = {
    user: user
      ? {
        id: user.id,
        name: user.name,
        role: user.role,
        cn: commonName,
        authAttributes: user.authAttributes,
      }
      : commonName
        ? {
          id: undefined,
          name: undefined,
          role: undefined,
          cn: commonName,
          authAttributes: undefined,
        }
        : undefined,
    reqId: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    method: ctx.method,
    protocol: ctx.protocol,
    path: ctx.path,
    connectorName: getPluginName(ctx.path) || 'simple',
    policyName: getPolicyName(ctx.path) || store?.policyName || 'mock-always-deny',
    isAllowed: false,
    timestamp: store?.timestamp || new Date().toISOString()
  };
  return context;
}