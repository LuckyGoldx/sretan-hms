import { Request, Response, NextFunction } from 'express';

const MASTER_TOKEN = 'sretan-emr-master-token-2026';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const headerToken = req.headers['x-master-token'] as string | undefined;
  const authHeader = req.headers['authorization'] as string | undefined;

  let token: string | undefined;

  if (headerToken) {
    token = headerToken;
  } else if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  }

  if (!token || token !== MASTER_TOKEN) {
    res.status(401).json({ error: true, message: 'Unauthorized' });
    return;
  }

  next();
}
