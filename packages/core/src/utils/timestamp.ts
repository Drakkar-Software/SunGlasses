/**
 * Return the current time as an ISO-8601 UTC string.
 */
export function nowISO(): string {
  return new Date().toISOString();
}
