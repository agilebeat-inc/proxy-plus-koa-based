function executePolicyAgainstAuthAttributes(providedAuthAttributes: string, protectedResource?: string) {
  return true;
}

export async function executePolicy(providedAuthAttributes: string, protectedResource?: string) {
  return executePolicyAgainstAuthAttributes(providedAuthAttributes, protectedResource);
}