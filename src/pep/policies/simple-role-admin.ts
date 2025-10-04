// eslint-disable-next-line @typescript-eslint/no-unused-vars
function executePolicyAgainstAuthAttributes(providedAuthAttributes: string, protectedResource?: string) {
  if (providedAuthAttributes === 'Admin') {
    return true;
  }
  return false;
}

export async function executePolicy(providedAuthAttributes: string, protectedResource?: string) {
  return executePolicyAgainstAuthAttributes(providedAuthAttributes, protectedResource);
}