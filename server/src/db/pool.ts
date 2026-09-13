import { Pool, Client, types } from 'pg';

// Return DATE columns as YYYY-MM-DD strings instead of Date objects
// to avoid timezone shifting when serialized to JSON
types.setTypeParser(types.builtins.DATE, (val: string) => val);

// Shared connection settings. Exported so long-lived, non-pooled clients (e.g.
// the notification LISTEN connection) use the same database.
export const pgConfig = {
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE || 'sretan_emr',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
};

const pool = new Pool({
  ...pgConfig,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  // Server-side guard: a runaway query (e.g. a pathological pending scan) can
  // no longer hold a pool slot indefinitely. Migrations explicitly disable this
  // for their own session (they may legitimately run long on large tables).
  statement_timeout: parseInt(process.env.PG_STATEMENT_TIMEOUT_MS || '15000', 10),
});

// Dedicated (non-pooled) client for long-lived LISTEN connections. Keeping it
// out of the pool preserves all pool slots for request traffic.
export function createListenerClient(): Client {
  return new Client(pgConfig);
}

pool.on('error', (err) => {
  console.error('Unexpected error on idle database client', err);
});

// Lightweight slow-query instrumentation. The codebase calls pool.query in many
// places, so wrapping the pool method once catches them all without touching
// every call site. Set SLOW_QUERY_MS=0 to disable.
const SLOW_QUERY_MS = parseInt(process.env.SLOW_QUERY_MS || '500', 10);

function queryText(args: any[]): string {
  const first = args[0];
  if (typeof first === 'string') return first;
  if (first && typeof first === 'object' && typeof first.text === 'string') return first.text;
  return '';
}

if (SLOW_QUERY_MS > 0) {
  const originalQuery = pool.query.bind(pool) as (...args: any[]) => any;
  (pool as any).query = (...args: any[]) => {
    const startedAt = Date.now();
    const result = originalQuery(...args);
    if (result && typeof result.then === 'function') {
      return result.then((res: any) => {
        const elapsed = Date.now() - startedAt;
        if (elapsed >= SLOW_QUERY_MS) {
          const text = queryText(args).replace(/\s+/g, ' ').slice(0, 200);
          console.warn(`[slow-query] ${elapsed}ms: ${text}`);
        }
        return res;
      });
    }
    return result;
  };
}

export default pool;
