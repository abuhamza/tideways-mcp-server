/** The API's minute format, "YYYY-MM-DD HH:mm". */
export const API_MINUTE_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;
/** The API's date format, "YYYY-MM-DD". */
export const API_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Format a Date as the API's minute format, "YYYY-MM-DD HH:mm", in UTC. */
export function formatApiMinute(date: Date): string {
  return date.toISOString().slice(0, 16).replace('T', ' ');
}

/**
 * Parse "YYYY-MM-DD HH:mm" as UTC (the zone Tideways uses for all minute timestamps).
 * Returns undefined for malformed input or impossible dates such as 2026-02-30.
 */
export function parseApiMinute(value: string): Date | undefined {
  if (!API_MINUTE_PATTERN.test(value)) return undefined;
  const date = new Date(`${value.replace(' ', 'T')}:00Z`);
  return !Number.isNaN(date.getTime()) && formatApiMinute(date) === value ? date : undefined;
}

/** Parse "YYYY-MM-DD"; returns undefined for malformed input or impossible dates. */
export function parseApiDate(value: string): Date | undefined {
  if (!API_DATE_PATTERN.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? date
    : undefined;
}

const ZONELESS_TIMESTAMP = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;

/**
 * Normalize a timestamp to "YYYY-MM-DD HH:mm" in UTC. Accepts "YYYY-MM-DD HH:mm[:ss]" (UTC),
 * ISO 8601 with a zone and epoch seconds; other strings come back unchanged.
 */
export function toApiMinute(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && ZONELESS_TIMESTAMP.test(value)) {
    return value.slice(0, 16).replace('T', ' ');
  }
  const date = new Date(typeof value === 'number' ? value * 1000 : value);
  return Number.isNaN(date.getTime()) ? String(value) : formatApiMinute(date);
}
