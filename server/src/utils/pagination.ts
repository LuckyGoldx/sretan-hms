// Shared pagination helper for list endpoints.
//
// A high default cap keeps response time and memory bounded as data grows
// without truncating any realistic single-screen list. Callers may pass
// ?limit=&offset= to page explicitly; limit is clamped to a safe maximum.

export interface Pagination {
  limit: number;
  offset: number;
}

export function parsePagination(
  query: any,
  defaultLimit = 5000,
  maxLimit = 10000
): Pagination {
  const rawLimit = parseInt(String(query?.limit ?? ''), 10);
  const rawOffset = parseInt(String(query?.offset ?? ''), 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, maxLimit) : defaultLimit;
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? rawOffset : 0;
  return { limit, offset };
}
