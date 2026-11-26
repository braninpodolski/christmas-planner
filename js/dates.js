import { cap } from './util.js';

/* ---------- Dates ---------- */
export const pad2 = n => String(n).padStart(2, '0');
export const ymd = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const parseYmd = s => new Date(s + 'T00:00');
export const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
export const daysUntil = s => Math.round((parseYmd(s) - today0()) / 86400000);
// Month is 1-12. Feb 29 falls back to Feb 28 in years without it.
export function onDate(y, m, d) { const dt = new Date(y, m - 1, d); return dt.getMonth() === m - 1 ? dt : new Date(y, m, 0); }
// Same month and day as `dateStr`, on or after `from`.
export function nextOccurrence(dateStr, from = today0()) {
  const [, m, d] = dateStr.split('-').map(Number);
  let dt = onDate(from.getFullYear(), m, d);
  if (dt < from) dt = onDate(from.getFullYear() + 1, m, d);
  return dt;
}
export const fmtDate = (s, opts = { month: 'short', day: 'numeric' }) => parseYmd(s).toLocaleDateString(undefined, opts);
export function relDays(n) {
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n < 14) return `in ${n} days`;
  if (n < 60) return `in ${Math.round(n / 7)} weeks`;
  return `in ${Math.round(n / 30.44)} months`;
}
// "Dec 25, in 4 weeks" for upcoming dates, "Dec 25, 2025" for past ones
export function dateRel(s) {
  const n = daysUntil(s);
  if (n < 0) return fmtDate(s, { month: 'short', day: 'numeric', year: 'numeric' });
  if (n <= 1) return cap(relDays(n));
  return `${fmtDate(s)}, ${relDays(n)}`;
}

/* Normalize any data entering the app (localStorage, imported file, synced Gist)
   so ids, enums and colors can never carry markup into rendered HTML. */
