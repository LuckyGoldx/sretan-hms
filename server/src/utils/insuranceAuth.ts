import { Request } from 'express';

export function isSuperAdmin(req: Request): boolean {
  // Master token is sent on ALL frontend requests. Insurance staff must never
  // be treated as super admin even if the shared token is present.
  const userType = req.headers['x-user-type'] as string;
  if (userType === 'insurance_staff') return false;
  return req.headers['x-master-token'] === 'sretan-emr-master-token-2026';
}

export function getInsuranceUser(req: Request): { role: string; providerId: string | null } | null {
  const role = req.headers['x-user-role'] as string;
  const userType = req.headers['x-user-type'] as string;
  const providerId = req.headers['x-user-provider-id'] as string | undefined;

  if (!role || userType !== 'insurance_staff') return null;
  return { role, providerId: providerId || null };
}

export function isInsuranceAdmin(req: Request): boolean {
  if (isSuperAdmin(req)) return true;
  const user = getInsuranceUser(req);
  return user?.role === 'admin';
}

export function canManageStaff(req: Request): boolean {
  if (isSuperAdmin(req)) return true;
  const user = getInsuranceUser(req);
  if (!user) return false;
  return user.role === 'admin';
}

/**
 * Returns a provider_id filter clause and param for SQL queries.
 * - If user is insurance_staff with 'own' scope, restricts to their provider_id.
 * - If user is Super Admin, clinical Admin/Finance, or insurance_staff with 'all' scope, no restriction.
 */
export function getProviderScope(
  req: Request
): { clause: string; param: any; hasRestriction: boolean } {
  const user = getInsuranceUser(req);

  // Clinical staff (Admin/Finance) or Super Admin — no restriction
  if (!user || isSuperAdmin(req)) {
    return { clause: '', param: null, hasRestriction: false };
  }

  // Insurance staff with 'own' scope — restrict to their provider
  if (user.providerId) {
    return { clause: 'AND provider_id = $', param: user.providerId, hasRestriction: true };
  }

  // Insurance staff with 'all' scope — no restriction
  return { clause: '', param: null, hasRestriction: false };
}
