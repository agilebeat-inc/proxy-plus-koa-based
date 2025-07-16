/**
 * Looks up user information by common name (CN) from an external service.
 * @param {string} cn - The user's common name.
 * @returns {Promise<{ id?: string, name?: string, role?: string, cn: string }|undefined>}
 */
async function lookupUserByCN(cn: string) {
  // Example: Replace with real HTTP/LDAP/DB call
  if (cn === 'john.doe') {
    return { id: '123', name: 'John Doe', role: 'admin', cn };
  }
  // Simulate not found
  return undefined;
}

module.exports = { lookupUserByCN };