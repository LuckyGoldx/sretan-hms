import { Pool } from 'pg';

export class ClockGuardError extends Error {
  constructor(message?: string) {
    super(message || 'System Clock Manipulation Detected');
    this.name = 'ClockGuardError';
  }
}

declare global {
  var clockTampered: boolean | undefined;
}

global.clockTampered = false;

export async function clockGuard(pool: Pool, tableName: string): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT GREATEST(MAX(created_at), MAX(updated_at)) as max_ts FROM ${tableName}`
    );
    const maxTs = result.rows[0]?.max_ts;

    if (maxTs && new Date() < new Date(maxTs)) {
      global.clockTampered = true;
      throw new ClockGuardError('CRITICAL SECURITY EXCEPTION: System Clock Manipulation Detected. Terminal Locked.');
    }
  } catch (err) {
    if (err instanceof ClockGuardError) {
      throw err;
    }
  }
}

export async function checkClockTampered(): Promise<boolean> {
  return global.clockTampered === true;
}

export function resetClockGuard(): void {
  global.clockTampered = false;
}
