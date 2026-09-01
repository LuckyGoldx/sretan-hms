import { Request, Response, NextFunction } from 'express';

export const SUPERADMIN_TOKEN = 'sretan-emr-superadmin-token-2026';

export function superadminAuth(req: Request, res: Response, next: NextFunction): void {
  const headerToken = req.headers['x-superadmin-token'] as string | undefined;
  const authHeader = req.headers['authorization'] as string | undefined;

  let token: string | undefined;

  if (headerToken) {
    token = headerToken;
  } else if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  }

  if (!token || token !== SUPERADMIN_TOKEN) {
    res.status(401).json({ error: true, message: 'Unauthorized' });
    return;
  }

  next();
}
