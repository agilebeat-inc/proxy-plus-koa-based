import { loadPolicy } from './policy-loader';
import { getPolicyName} from './utils/policyMapper';


async function runPolicyForAttrAndResource(authAttributes: string, protectedResource: string) {
  const policyName:string = getPolicyName(protectedResource)
  const policyExecutor = await loadPolicy(policyName);
  if (policyExecutor) {
    return await policyExecutor.executePolicy(authAttributes, protectedResource);
  }
}

async function runPolicy(authAttributes: string, protectedResource: string) {
  return await runPolicyForAttrAndResource(authAttributes, protectedResource);
}

export { runPolicy };