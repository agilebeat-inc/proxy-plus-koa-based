import { loadPolicy } from './policy-loader';
import { getPolicyName} from './utils/policyMapper';


async function runPluginForUserLookup(authAttributes: string, protectedResource: string) {
  const policyExecutor = await loadPolicy(getPolicyName(protectedResource));
  if (policyExecutor) {
    return await policyExecutor.executePolicy(authAttributes, protectedResource);
  }
}

async function runPolicy(authAttributes: string, protectedResource: string) {
  return await runPluginForUserLookup(authAttributes, protectedResource);
}

export { runPolicy };