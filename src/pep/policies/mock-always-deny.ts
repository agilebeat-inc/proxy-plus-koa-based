function executePolicyAgainstAuthAttributes(providedAuthAttributes: string, protectedResource?: string) {
  return false;
}

export async function executePolicy(providedAuthAttributes: string, protectedResource?: string) {
  return executePolicyAgainstAuthAttributes(providedAuthAttributes, protectedResource);
}