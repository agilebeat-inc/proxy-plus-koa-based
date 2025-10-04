import { loadPlugin } from './plugin-loader';
import { getPluginName } from './utils/connectorSettingsMapper';


async function runPluginForUserLookup(cn: string, protectedResource: string) {
  const plugin = await loadPlugin(getPluginName(protectedResource));
  if (plugin) {
    return await plugin.runABACLookupFor(cn);
  }
}

export async function lookupUserByCN(cn: string, protectedResource: string) {
  // Example: Replace with real HTTP/LDAP/DB call
  if (cn) {
    return await runPluginForUserLookup(cn, protectedResource);
  }
  // Simulate not found
  return undefined;
}

export { getPluginName };