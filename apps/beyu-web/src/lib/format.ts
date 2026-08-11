/**
 * Display formatting.
 *
 * No money formatting lives here yet, deliberately. The API returns money as
 * integer minor units and ratios as basis points; a helper that turned those
 * into floats for display would be the first step toward one being used in a
 * calculation. When currency display is needed it will be added with the
 * screen that needs it, working in minor units throughout.
 */

type Tone = 'neutral' | 'accent' | 'positive' | 'caution' | 'critical';

export function osStatusTone(status: string): Tone {
  switch (status) {
    case 'ACTIVE':
      return 'positive';
    case 'SUSPENDED':
      return 'critical';
    case 'SECURITY_VALIDATION':
    case 'CONFIGURING':
      return 'caution';
    case 'RETIRED':
      return 'neutral';
    default:
      return 'neutral';
  }
}

/**
 * Words that stay upper-case when a SCREAMING_SNAKE enum is humanised.
 * Without this, FOUNDATION_OS reads as "Foundation Os" and SECTOR_LLC as
 * "Sector Llc", which looks like a bug to anyone who knows the structure.
 */
const ACRONYMS = new Set(['OS', 'LLC']);

export function nodeTypeLabel(nodeType: string): string {
  return nodeType
    .split('_')
    .map((part) =>
      ACRONYMS.has(part) ? part : part.charAt(0) + part.slice(1).toLowerCase(),
    )
    .join(' ');
}

const UNITS: [limit: number, divisor: number, name: Intl.RelativeTimeFormatUnit][] = [
  [60, 1, 'second'],
  [3600, 60, 'minute'],
  [86400, 3600, 'hour'],
  [604800, 86400, 'day'],
  [2629800, 604800, 'week'],
  [31557600, 2629800, 'month'],
  [Infinity, 31557600, 'year'],
];

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';

  const seconds = (then - Date.now()) / 1000;
  const magnitude = Math.abs(seconds);
  if (magnitude < 45) return 'just now';

  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  for (const [limit, divisor, unit] of UNITS) {
    if (magnitude < limit) {
      return formatter.format(Math.trunc(seconds / divisor), unit);
    }
  }
  return '—';
}

export function absoluteTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toISOString().replace('T', ' ').slice(0, 19) + 'Z';
}
