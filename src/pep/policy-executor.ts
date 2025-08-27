import { loadPolicy } from './policy-loader';
import { getEnvVar } from '../utils/envHelper';

const policyName = getEnvVar('PEP_POLICY_NAME', 'mock-always-deny');

function getPolicyName() {
  return policyName;
}

async function runPluginForUserLookup(authAttributes: string, protectedResource?: string) {
  const policyExecutor = await loadPolicy(policyName);
  if (policyExecutor) {
    return await policyExecutor.executePolicy(authAttributes, protectedResource);
  }
}

async function runPolicy(authAttributes: string, protectedResource?: string) {
    return await runPluginForUserLookup(authAttributes, protectedResource);
}

export { runPolicy, getPolicyName };