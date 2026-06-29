/**
 * Reject SQL that could mutate state or expose server internals.
 * Ported from server/server.ts — same logic, same rules.
 */
export function isReadOnlySql(sql: string): boolean {
  const s = sql.trim();
  if (s.includes(';')) return false;
  if (!/^(SELECT|WITH)\b/i.test(s)) return false;
  if (/\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|COPY|ATTACH|DETACH|INSTALL|LOAD|EXPORT|IMPORT|SET|PRAGMA|CALL|EXECUTE)\b/i.test(s)) return false;
  return true;
}
