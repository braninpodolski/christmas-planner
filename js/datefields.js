import { esc } from './util.js';
import { daysUntil, fmtDate, nextOccurrence, pad2, relDays, ymd } from './dates.js';

/* ---------- Date fields: Month, Day and a Year that can be optional ----------
   Used instead of <input type=date>, which forces a year and tabs oddly through
   its own segments in some browsers. A birthday without a year is stored as 0000-MM-DD. */
export const MONTHS = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString(undefined, { month: 'long' }));
export function dateFields(prefix, value, { label = 'Date', yearOptional = false, attrs = '' } = {}) {
  const name = label.replace(/<[^>]+>/g, '').trim();
  return `<div class="row datef" data-datef="${prefix}" data-yopt="${yearOptional ? 1 : ''}" ${attrs}>
    <label class="lbl" for="${prefix}-in">${label}</label>
    <div class="datef-in">
      <input class="field df-text" id="${prefix}-in" name="${prefix}" value="${esc(value ? fmtTypedDate(value) : '')}" autocomplete="off" autocapitalize="words" spellcheck="false" enterkeyhint="next"
        placeholder="${yearOptional ? 'e.g. March 12' : 'e.g. June 14, 2027'}" aria-label="${name}" aria-describedby="${prefix}-hint">
      <span class="df-hint" id="${prefix}-hint" aria-live="polite"></span>
    </div>
  </div>`;
}
// How a stored date is written back into the field
export function fmtTypedDate(v) {
  return fmtDate(v, { month: 'long', day: 'numeric', ...(v.startsWith('0000') ? {} : { year: 'numeric' }) });
}
/* Understands "March 12", "Mar 12 1990", "12 March", "3/12", "3/12/90", "1990-03-12".
   Returns YYYY-MM-DD, 0000-MM-DD when the year is left out (if allowed), or '' if it can't tell. */
export function parseTypedDate(text, yearOptional) {
  const s = String(text || '').trim().toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, '$1').replace(/,/g, ' ').replace(/\s+/g, ' ');
  if (!s) return '';
  const mi = w => { const i = MONTHS.findIndex(n => n.toLowerCase().startsWith(w.slice(0, 3))); return w.length >= 3 && i >= 0 ? i + 1 : 0; };
  const yr = y => { if (!y) return 0; y = +y; return y < 100 ? (y > (new Date().getFullYear() % 100) ? 1900 + y : 2000 + y) : y; };
  let m = 0, d = 0, y = 0, x;
  if ((x = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) [y, m, d] = [+x[1], +x[2], +x[3]];
  else if ((x = s.match(/^([a-z]+)\.? (\d{1,2})(?: (\d{2,4}))?$/))) [m, d, y] = [mi(x[1]), +x[2], yr(x[3])];
  else if ((x = s.match(/^(\d{1,2}) ([a-z]+)\.?(?: (\d{2,4}))?$/))) [d, m, y] = [+x[1], mi(x[2]), yr(x[3])];
  else if ((x = s.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/))) {
    const dmy = !/^en-(US|PH)$/i.test(navigator.language || 'en-US');
    [m, d] = dmy ? [+x[2], +x[1]] : [+x[1], +x[2]]; y = yr(x[3]);
  } else return '';
  if (!m || m > 12 || !d) return '';
  if (!y && !yearOptional) return '';
  if (d > new Date(y || 2000, m, 0).getDate()) return ''; // 2000 is a leap year, so Feb 29 is fine without a year
  return `${y ? String(y).padStart(4, '0') : '0000'}-${pad2(m)}-${pad2(d)}`;
}
export function readDate(d, prefix, yearOptional) { return parseTypedDate(d[prefix], yearOptional); }
// Live feedback under a date field: what it understood, or how to write it
export function hintDate(form, prefix, yearOptional) {
  const input = form.elements[prefix]; const hint = form.querySelector(`#${prefix}-hint`);
  if (!input || !hint) return '';
  const v = parseTypedDate(input.value, yearOptional);
  input.placeholder = yearOptional ? 'e.g. March 12' : 'e.g. June 14, 2027';
  if (!input.value.trim()) hint.textContent = '';
  else if (!v) hint.textContent = yearOptional ? 'Try “March 12” or “3/12/1990”' : 'Try “June 14, 2027”';
  else { const next = ymd(nextOccurrence(v)); hint.textContent = v.startsWith('0000') || yearOptional ? `${fmtDate(next, { weekday: 'short', month: 'short', day: 'numeric' })}, ${relDays(daysUntil(next))}` : fmtDate(v, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }); }
  hint.classList.toggle('bad', !!input.value.trim() && !v);
  return v;
}
export const formData = form => Object.fromEntries(new FormData(form).entries());
export const fmtBirthday = b => fmtDate(b, { month: 'long', day: 'numeric', ...(b.startsWith('0000') ? {} : { year: 'numeric' }) });
