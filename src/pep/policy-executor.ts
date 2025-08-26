import { loadPolicy } from './policy-loader';
import { getEnvVar } from '../utils/envHelper';

const policyName = getEnvVar('PEP-POLICY-NAME', 'simple-role-admin');

function getPolicyName() {
  return policyName;
}

async function runPluginForUserLookup(authAttributes: string) {
  const policyExecutor = await loadPolicy(policyName);
  if (policyExecutor) {
    return await policyExecutor.executePolicy(authAttributes);
  }
}

async function runPolicy(authAttributes: string) {
    return await runPluginForUserLookup(authAttributes);
}

export { runPolicy, getPolicyName };