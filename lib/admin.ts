import { getCurrentUser } from "@/lib/session";

/**
 * Resolves the signed-in user and checks they're a super admin. Use in
 * every /api/admin/* route handler and the /admin layout — this is the
 * only place that grants platform-wide (cross-business) access, so it must
 * be checked server-side on every request rather than trusted from the
 * client.
 */
export async function requireSuperAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "SUPER_ADMIN") {
    return null;
  }
  return user;
}
