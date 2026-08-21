// Placeholder until the master plan's Task 10 wires NextAuth's Azure AD
// session. Kept as its own module so requireAdmin and every admin route
// can be tested against a mock now, without waiting on the Azure AD
// network gate (spec §10).
export async function getCurrentUser(): Promise<{ id: string; role: string } | null> {
  throw new Error("getCurrentUser is not wired yet — implemented in the master plan's Task 10");
}
