/* Calendar text parsing, kept free of the page so it can be tested on its own. */
import { ymd } from './dates.js';
import { dateOf } from './data.js';

export const CELEBRATION_RE = /graduat|wedding|shower|party|housewarming|retire|valentine|mother.?s day|father.?s day|christening|baptism|bar mitzvah|bat mitzvah|quincea|engagement|hanukkah|chanukah|diwali|\beid\b|easter|new year|recital|promotion/i;
export const BDAY_RE = /\b(birth\s?day|bday|b-day)\b/i;

// Minimal iCalendar reader: VEVENT summary, start date and yearly repeat.
export function parseIcs(text) {
  const lines = String(text).replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const out = []; let cur = null; let calName = '';
  const unesc = v => v.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').replace(/\s+/g, ' ').trim();
  const toDate = val => {
    const m = val.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/);
    if (!m) return '';
    if (m[4] && m[7]) return ymd(new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]))); // UTC time -> local day
    return dateOf(`${m[1]}-${m[2]}-${m[3]}`);
  };
  for (const line of lines) {
    if (/^BEGIN:VEVENT/i.test(line)) { cur = {}; continue; }
    if (/^END:VEVENT/i.test(line)) { if (cur?.summary && cur.date) out.push(cur); cur = null; continue; }
    const m = line.match(/^([A-Z0-9-]+)((?:;[^:]*)?):(.*)$/i);
    if (!m) continue;
    const name = m[1].toUpperCase(), val = m[3];
    if (!cur) { if (name === 'X-WR-CALNAME') calName = unesc(val); continue; }
    if (name === 'SUMMARY') cur.summary = unesc(val).slice(0, 120);
    else if (name === 'DTSTART') cur.date = toDate(val);
    else if (name === 'RRULE') cur.yearly = /FREQ=YEARLY/i.test(val);
    if (out.length > 300) break;
  }
  return { events: out, calName };
}

// "Amina’s 30th Birthday", "Birthday: Amina", "Happy birthday Amina", "Amina bday"
export function nameFrom(title) {
  const s = title.replace(/[\u{1F300}-\u{1FAFF}☀-➿️]/gu, '').replace(/\s+/g, ' ').trim();
  const pats = [
    /^(?:happy\s+)?(.+?)\s*['’‘`]\s*s?\s+(?:\d+\s*(?:st|nd|rd|th)\s+)?(?:birth\s?day|bday|b-day)\b/i,
    /^(?:happy\s+)?(?:birth\s?day|bday|b-day)\s*(?:[:\-–—]|\bof\b|\bfor\b)\s*(.+)$/i,
    /^(?:happy\s+)?(?:birth\s?day|bday|b-day)\s+(.+)$/i,
    /^(.+?)\s+(?:birth\s?day|bday|b-day)\b/i,
  ];
  for (const re of pats) {
    const m = s.match(re);
    if (!m) continue;
    const n = m[1].replace(/[()[\]"“”]/g, '').replace(/\s+\d+$/, '').trim();
    if (n && n.length <= 60 && !/^(my|our|the|your|his|her|their)$/i.test(n)) return n;
  }
  return '';
}
