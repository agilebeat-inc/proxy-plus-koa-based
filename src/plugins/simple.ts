
function lookUpABACUser(providedCN: string) {
  const user1 = { id: '123', name: 'Simple John Doe', role: 'admin', cn: providedCN };
  const user2 = { id: '124', name: 'Simple John Doe 2', role: 'admin', cn: providedCN };
  const user = Math.random() < 0.5 ? user1 : user2;
  return user;
}

export async function runABACLookupFor(providedCN: string) {
  return lookUpABACUser(providedCN);
}
