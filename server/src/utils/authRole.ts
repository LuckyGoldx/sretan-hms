import { Request } from 'express';

/** Admin (or an unauthenticated/internal call, as elsewhere in the app). */
export function isAdminRequest(req: Request): boolean {
  const role = String(req.headers['x-user-role'] || '');
  return role === '' || role === 'Admin';
}

/** Acting staff id if the client sent one (for audit logs). */
export function actingUserId(req: Request): string | null {
  const id = req.headers['x-user-id'];
  return typeof id === 'string' && id ? id : null;
}
