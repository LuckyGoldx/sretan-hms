import pool from '../db/pool';

interface NumberTypeDef {
  table: string;
  column: string;
  defaultPattern: string;
  defaultPrefix: string;
}

const NUMBER_TYPES: Record<string, NumberTypeDef> = {
  hospital: { table: 'patients', column: 'hospital_number', defaultPattern: '{prefix}-{year}-{seq:5}', defaultPrefix: 'SRT' },
  lab: { table: 'lab_orders', column: 'lab_number', defaultPattern: 'LAB-{year}-{seq:4}', defaultPrefix: 'LAB' },
  anc: { table: 'maternity_patients', column: 'booking_code', defaultPattern: 'ANC-{year}-{seq:5}', defaultPrefix: 'ANC' },
  radiology: { table: 'radiology_orders', column: 'imaging_number', defaultPattern: 'RAD-{seq:5}', defaultPrefix: 'RAD' },
  receipt: { table: 'payments', column: 'receipt_number', defaultPattern: 'RCP-{yy}{month}{day}-{seq:4}', defaultPrefix: 'RCP' },
  referral: { table: 'referrals', column: 'referral_number', defaultPattern: 'REF-{year}-{seq:5}', defaultPrefix: 'REF' },
  case: { table: 'insurance_cases', column: 'case_number', defaultPattern: '{provider}-{year}-{seq:5}', defaultPrefix: 'CS' },
  auth: { table: 'insurance_auth_requests', column: 'request_number', defaultPattern: 'AUTH-{year}-{seq:5}', defaultPrefix: 'AUTH' },
};

export interface RenderContext {
  prefix: string;
  provider?: string;
  year: number;
  seq: number;
}

function quoteIdent(name: string): string {
  return '"' + name.replace(/"/g, '""') + '"';
}

// Render a pattern like "SRT-{year}-{seq:5}" into a concrete number.
export function renderPattern(pattern: string, ctx: RenderContext): string {
  return pattern.replace(/\{([a-z_]+)(?::(\d+))?\}/g, (m, token: string, widthRaw?: string) => {
    const width = widthRaw ? parseInt(widthRaw, 10) : undefined;
    const pad = (s: string, w?: number) => (w && s.length < w ? s.padStart(w, '0') : s);
    switch (token) {
      case 'prefix': return String(ctx.prefix || '');
      case 'provider': return String(ctx.provider || ctx.prefix || '');
      case 'year': return String(ctx.year);
      case 'yy': return String(ctx.year).slice(2);
      case 'month': return String(new Date().getMonth() + 1).padStart(2, '0');
      case 'month_name': return ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][new Date().getMonth()];
      case 'day': return String(new Date().getDate()).padStart(2, '0');
      case 'seq': return pad(String(ctx.seq), width);
      default: return m;
    }
  });
}

function escapeRegexLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Build a regex that matches the rendered pattern and captures the sequence digits.
export function patternToSeqRegex(pattern: string): string {
  const parts = pattern.split(/(\{[a-z_]+(?::\d+)?\})/g);
  let re = '^';
  for (const part of parts) {
    if (part.startsWith('{') && part.endsWith('}')) {
      const m = part.match(/^\{([a-z_]+)(?::(\d+))?\}$/);
      if (!m) { re += escapeRegexLiteral(part); continue; }
      const token = m[1];
      if (token === 'seq') re += '(\\d+)';
      else if (token === 'year') re += '\\d{4}';
      else if (token === 'yy') re += '\\d{2}';
      else if (token === 'month') re += '\\d{2}';
      else if (token === 'month_name') re += '[A-Z]{3}';
      else if (token === 'day') re += '\\d{2}';
      else if (token === 'prefix' || token === 'provider') re += '.*?';
      else re += escapeRegexLiteral(part);
    } else {
      re += escapeRegexLiteral(part);
    }
  }
  return re + '$';
}

async function getTenantPatterns(tenantId: string): Promise<Record<string, string>> {
  const res = await pool.query(
    `SELECT number_pattern_hospital, number_pattern_lab, number_pattern_anc, number_pattern_radiology,
            number_pattern_receipt, number_pattern_referral, number_pattern_case, number_pattern_auth
     FROM tenant_configurations WHERE tenant_id = $1`,
    [tenantId]
  );
  const row = res.rows[0] || {};
  const out: Record<string, string> = {};
  for (const key of Object.keys(NUMBER_TYPES)) {
    out[key] = row['number_pattern_' + key] || NUMBER_TYPES[key].defaultPattern;
  }
  return out;
}

async function nextSeq(def: NumberTypeDef, pattern: string): Promise<number> {
  const re = patternToSeqRegex(pattern);
  const result = await pool.query(
    `SELECT COALESCE(MAX((regexp_match(${quoteIdent(def.column)}, $1))[1]::int), 0) + 1 AS n
     FROM ${quoteIdent(def.table)} WHERE ${quoteIdent(def.column)} ~ $1`,
    [re]
  );
  return result.rows[0]?.n || 1;
}

// Generate the next sequential number for a number type, scoped to the tenant.
export async function generateNumber(
  tenantId: string,
  type: string,
  opts?: { prefix?: string; provider?: string }
): Promise<string> {
  const def = NUMBER_TYPES[type];
  if (!def) throw new Error('Unknown number type: ' + type);

  const patterns = await getTenantPatterns(tenantId);
  const pattern = patterns[type] || def.defaultPattern;

  let seq: number;
  if (type === 'receipt') {
    // Receipt numbers are dated, so only count today's numbers to avoid unbounded growth.
    const re = patternToSeqRegex(pattern);
    const result = await pool.query(
      `SELECT COALESCE(MAX((regexp_match(${quoteIdent(def.column)}, $1))[1]::int), 0) + 1 AS n
       FROM ${quoteIdent(def.table)} WHERE ${quoteIdent(def.column)} ~ $1
         AND created_at >= $2`,
      [re, new Date().toISOString().slice(0, 10)]
    );
    seq = result.rows[0]?.n || 1;
  } else {
    seq = await nextSeq(def, pattern);
  }

  return renderPattern(pattern, {
    prefix: opts?.prefix || def.defaultPrefix,
    provider: opts?.provider || def.defaultPrefix,
    year: new Date().getFullYear(),
    seq,
  });
}

// Preview a pattern without touching the database.
export function previewPattern(pattern: string, seq = 12345): string {
  return renderPattern(pattern, {
    prefix: 'SRT',
    provider: 'HMO',
    year: new Date().getFullYear(),
    seq,
  });
}
