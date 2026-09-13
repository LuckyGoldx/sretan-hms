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

// Identifiers are interpolated into SQL, so they must be strictly validated.
const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export async function clockGuard(pool: Pool, tableName: string): Promise<void> {
  if (!IDENTIFIER_RE.test(tableName)) {
    throw new ClockGuardError('Invalid table name supplied to the clock guard');
  }

  try {
    // Uses two index-backed scalar subqueries (idx_cg_* in migration 075) so the
    // MAX lookups are single backward index reads instead of full table scans.
    const result = await pool.query(
      `SELECT GREATEST(
         (SELECT MAX(created_at) FROM "${tableName}"),
         (SELECT MAX(updated_at) FROM "${tableName}")
       ) as max_ts`
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
    console.warn(`clockGuard check skipped for "${tableName}":`, (err as Error).message);
  }
}

export async function checkClockTampered(): Promise<boolean> {
  return global.clockTampered === true;
}

export function resetClockGuard(): void {
  global.clockTampered = false;
}
