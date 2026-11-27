import { num, uid } from './util.js';
import { CATEGORIES, COLORS, EMOJIS, EVENT_TYPES, KINDS, LEGACY_STATUS, STATUS_IDS, blank } from './constants.js';
import { daysUntil, nextOccurrence, parseYmd, today0, ymd } from './dates.js';

export const ID_RE = /^[a-z0-9]{1,40}$/i;
export const str = (v, max = 2000) => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, max);
export const cleanId = v => (typeof v === 'string' && ID_RE.test(v) ? v : uid());
export const priceOf = v => (v === '' || v == null ? '' : Math.max(0, num(v)));
export const dateOf = v => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(parseYmd(v)) ? v : '');
// a birthday may leave out the year (stored as 0000-MM-DD)
export function sanitize(raw) {
  const s = blank();
  if (!raw || typeof raw !== 'object') return s;
  s.updatedAt = Number(raw.updatedAt) || 0;
  const arr = a => (Array.isArray(a) ? a.filter(x => x && typeof x === 'object') : []);
  s.people = arr(raw.people).map(p => ({
    id: cleanId(p.id), created: Number(p.created) || 0,
    name: str(p.name, 100) || 'Unnamed', relation: str(p.relation, 100), budget: priceOf(p.budget),
    birthday: dateOf(p.birthday),
    color: COLORS.includes(p.color) ? p.color : COLORS[0],
    emoji: EMOJIS.includes(p.emoji) ? p.emoji : '',
    notes: str(p.notes), sizes: str(p.sizes),
    ...(p.pinned === true ? { pinned: true } : {}),
  }));
  const ids = new Set(s.people.map(p => p.id));
  s.occasions = arr(raw.occasions).map(o => {
    const people = (Array.isArray(o.people) ? o.people : []).filter(id => typeof id === 'string' && ids.has(id));
    const budgets = {};
    if (o.budgets && typeof o.budgets === 'object') for (const pid of people) { const b = priceOf(o.budgets[pid]); if (b) budgets[pid] = b; }
    return {
      id: cleanId(o.id), created: Number(o.created) || 0,
      type: EVENT_TYPES.includes(o.type) ? o.type : 'celebration',
      title: str(o.title, 100), date: (dateOf(o.date) && !o.date.startsWith('0000') ? o.date : '') || ymd(today0()),
      people: [...new Set(people)], budgets, repeat: !!o.repeat,
      series: typeof o.series === 'string' && ID_RE.test(o.series) && o.series.length <= 24 ? o.series : '',
    };
  });
  const oids = new Set(s.occasions.map(o => o.id));
  s.gifts = arr(raw.gifts).filter(g => ids.has(g.personId)).map(g => ({
    id: cleanId(g.id), created: Number(g.created) || 0, personId: g.personId,
    occasionId: oids.has(g.occasionId) ? g.occasionId : '',
    title: str(g.title, 200) || 'Gift', price: priceOf(g.price), buyer: ids.has(g.buyer) ? g.buyer : '',
    status: STATUS_IDS.includes(g.status) ? g.status : (LEGACY_STATUS[g.status] || 'idea'),
    kind: g.kind === 'make' ? 'make' : 'buy',
    store: str(g.store, 100), url: str(g.url, 2000), notes: str(g.notes),
    ...(Number.isFinite(g.order) ? { order: g.order } : {}),
  }));
  s.tasks = arr(raw.tasks).map(t => ({
    id: cleanId(t.id), created: Number(t.created) || 0, done: !!t.done,
    title: str(t.title, 200) || 'Task', category: CATEGORIES.includes(t.category) ? t.category : 'Other',
    due: dateOf(t.due), notes: str(t.notes),
  }));
  // per-record modification time + deletion tombstones power the sync merge
  const mods = new Map();
  KINDS.forEach(k => arr(raw[k]).forEach(r => typeof r.id === 'string' && mods.set(r.id, Number(r.mod) || 0)));
  KINDS.forEach(k => s[k].forEach(r => { r.mod = mods.get(r.id) || 0; }));
  if (raw.household && typeof raw.household === 'object') s.household = { on: !!raw.household.on, mod: Number(raw.household.mod) || 0 };
  const cutoff = Date.now() - 90 * 86400000;
  if (raw.deleted && typeof raw.deleted === 'object') {
    for (const [id, t] of Object.entries(raw.deleted)) if (ID_RE.test(id) && Number(t) > cutoff) s.deleted[id] = Number(t);
  }
  // Migration from the Christmas-only version: everything becomes one Christmas event.
  if (!Array.isArray(raw.occasions) && (s.people.length || s.gifts.length)) {
    const now = new Date();
    const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const budgets = {};
    s.people.forEach(p => { if (p.budget) budgets[p.id] = p.budget; });
    const xmas = { id: 'xmas' + y, created: 0, type: 'christmas', title: '', date: `${y}-12-25`, people: s.people.map(p => p.id), budgets, repeat: true, series: 'xmas', mod: 0 };
    s.occasions.push(xmas);
    s.gifts.forEach(g => { g.occasionId = xmas.id; });
  }
  return s;
}

/* Record-level merge: newest edit of each item wins; deletions win over older edits. */
export function merge(a, b) {
  const out = blank();
  out.updatedAt = Math.max(a.updatedAt || 0, b.updatedAt || 0);
  out.deleted = { ...a.deleted };
  out.household = (b.household?.mod || 0) > (a.household?.mod || 0) ? { ...b.household } : { ...a.household };
  for (const [id, t] of Object.entries(b.deleted || {})) out.deleted[id] = Math.max(out.deleted[id] || 0, t);
  KINDS.forEach(k => {
    const m = new Map(a[k].map(r => [r.id, r]));
    b[k].forEach(r => { const x = m.get(r.id); if (!x || (r.mod || 0) > (x.mod || 0)) m.set(r.id, r); });
    out[k] = [...m.values()].filter(r => !((out.deleted[r.id] || 0) >= (r.mod || 0) && out.deleted[r.id]));
  });
  const pids = new Set(out.people.map(p => p.id));
  out.gifts = out.gifts.filter(g => pids.has(g.personId));
  const oids = new Set(out.occasions.map(o => o.id));
  out.gifts.forEach(g => { if (g.occasionId && !oids.has(g.occasionId)) g.occasionId = ''; });
  return out;
}
export const canon = s => JSON.stringify([s.household, KINDS.map(k => [...s[k]].sort((x, y) => x.id < y.id ? -1 : 1)), Object.keys(s.deleted).sort().map(k => [k, s.deleted[k]])]);

/* Keep the calendar rolling: each person's next birthday, and next year's copy of any
   repeating event once this year's has passed. IDs are deterministic (series + year),
   so two devices creating the same event at the same time merge into one. */
export function planOccasions(s) {
  const t = today0();
  const pids = new Set(s.people.map(p => p.id));
  s.occasions.forEach(o => {
    if (o.people.some(id => !pids.has(id))) {
      o.people = o.people.filter(id => pids.has(id));
      for (const k of Object.keys(o.budgets)) if (!pids.has(k)) delete o.budgets[k];
    }
  });
  s.occasions = s.occasions.filter(o => o.type !== 'birthday' || o.people.length);
  for (const p of s.people) {
    const series = 'b' + p.id;
    const mine = s.occasions.filter(o => o.series === series);
    const upcoming = mine.find(o => daysUntil(o.date) >= 0);
    if (!p.birthday) {
      // birthday removed: drop the upcoming automatic event unless something was planned for it
      if (upcoming && !s.gifts.some(g => g.occasionId === upcoming.id)) s.occasions = s.occasions.filter(o => o !== upcoming);
      continue;
    }
    const due = ymd(nextOccurrence(p.birthday, t));
    if (upcoming) { if (upcoming.date !== due) upcoming.date = due; continue; }
    const id = `${series}y${due.slice(0, 4)}`;
    if (s.deleted[id] || s.occasions.some(o => o.id === id)) continue;
    const prev = [...mine].sort((a, b) => b.date.localeCompare(a.date))[0];
    s.occasions.push({ id, created: 0, type: 'birthday', title: '', date: due, people: [p.id], budgets: prev ? { ...prev.budgets } : {}, repeat: true, series, mod: 0 });
  }
  const bySeries = {};
  s.occasions.forEach(o => { if (o.series && o.type !== 'birthday') (bySeries[o.series] ||= []).push(o); });
  for (const [series, list] of Object.entries(bySeries)) {
    const latest = [...list].sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!latest.repeat || daysUntil(latest.date) >= 0) continue;
    const due = ymd(nextOccurrence(latest.date, t));
    const id = series === 'xmas' ? 'xmas' + due.slice(0, 4) : `${series}y${due.slice(0, 4)}`;
    if (s.deleted[id] || s.occasions.some(o => o.id === id)) continue;
    s.occasions.push({ ...latest, id, created: 0, date: due, people: [...latest.people], budgets: { ...latest.budgets }, mod: 0 });
  }
  const oids = new Set(s.occasions.map(o => o.id));
  s.gifts.forEach(g => { if (g.occasionId && !oids.has(g.occasionId)) g.occasionId = ''; });
}
// Setting a birthday on purpose overrides an earlier "delete this year's birthday event".
export function clearBirthdayDeletion(s, pid) {
  for (const k of Object.keys(s.deleted)) if (k.startsWith(`b${pid}y`)) delete s.deleted[k];
}
