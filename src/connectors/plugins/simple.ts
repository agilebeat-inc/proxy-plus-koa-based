
type User = { id: string; name: string; role: string; cn: string; authAttributes?: string };

function enrichWithAuthAttributes(user: User) {
  user.authAttributes = user?.role ? [user.role].toString() : [].toString();
  return user;
}

function lookUpABACUser(providedCN: string) {
  const user1 = { id: '123', name: 'Simple John Doe', role: 'Admin', cn: providedCN };
  const user2 = { id: '124', name: 'Simple John Doe Admin', role: 'Admin', cn: providedCN };
  const user = Math.random() < 0.5 ? user1 : user2;
  return enrichWithAuthAttributes(user);
}

export async function runABACLookupFor(providedCN: string) {
  return lookUpABACUser(providedCN);
}
