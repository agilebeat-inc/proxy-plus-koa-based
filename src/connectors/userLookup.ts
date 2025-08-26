
import { loadPlugin } from './plugin-loader';
import { getEnvVar } from '../utils/envHelper';

const abacPluginName = getEnvVar('ABAC-CONNECTOR-PLUGIN-NAME', 'simple');

function getPluginName() {
  return abacPluginName;
}

async function runPluginForUserLookup(cn: string) {
  const plugin = await loadPlugin(abacPluginName);
  if (plugin) {
    return await plugin.runABACLookupFor(cn);
  }
}

async function lookupUserByCN(cn: string) {
  // Example: Replace with real HTTP/LDAP/DB call
  if (!!cn) {
    return await runPluginForUserLookup(cn);
  }
  // Simulate not found
  return undefined;
}

module.exports = { lookupUserByCN, getPluginName };