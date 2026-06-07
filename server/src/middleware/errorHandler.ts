import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction): void {
  if (err.code === 'ECONNREFUSED') {
    res.status(503).json({
      error: true,
      message: 'Database connection refused. Is PostgreSQL running?',
      code: 'ECONNREFUSED',
    });
    return;
  }

  if (err.name === 'ClockTamperError' || err instanceof ClockTamperError) {
    res.status(403).json({
      error: true,
      message: 'CRITICAL SECURITY EXCEPTION: System Clock Manipulation Detected. Terminal Locked.',
      code: 'CLOCK_TAMPER',
    });
    return;
  }

  if (process.env.NODE_ENV !== 'production') {
    console.error('Unhandled error:', err);
  }

  const statusCode = err.status || err.statusCode || 500;
  res.status(statusCode).json({
    error: true,
    message: err.message || 'Internal Server Error',
    code: err.code || 'INTERNAL_ERROR',
  });
}

export class ClockTamperError extends Error {
  constructor(message?: string) {
    super(message || 'System Clock Manipulation Detected');
    this.name = 'ClockTamperError';
  }
}
