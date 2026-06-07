import { Router, Request, Response } from 'express';

const router = Router();

router.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    clockTampered: global.clockTampered === true,
  });
});

export default router;
