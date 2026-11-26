import { num } from './util.js';
import { KEY, KINDS, STATUS_IDS, THEMES, blank } from './constants.js';
import { daysUntil, nextOccurrence, ymd } from './dates.js';
import { canon, planOccasions, sanitize } from './data.js';
import { renderAll } from './nav.js';
import { Sync } from './sync.js';

export function needsPlan() { const c = structuredClone(state); planOccasions(c); return canon(c) !== canon(state); }
export function autoPlan() { if (needsPlan()) commit(() => {}); }

export function load() {
  try {
    const text = localStorage.getItem(KEY);
    const raw = JSON.parse(text);
    // Before converting a Christmas-only list to events, keep an untouched copy on this device.
    if (raw && !Array.isArray(raw.occasions) && Array.isArray(raw.people) && raw.people.length && !localStorage.getItem(KEY + '-backup-v2')) {
      localStorage.setItem(KEY + '-backup-v2', text);
    }
    return sanitize(raw);
  } catch { return blank(); }
}
export const KEY_BACKUP_ACCOUNTS = KEY + '-backup-before-accounts';
export let state = load();
export function setState(next) { state = next; }
export function saveLocal() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} }

export const ui = { giftFilter: 'all', giftQuery: '', justAdded: null, introPlayed: false, showPast: false };

export function commit(fn, { render = true } = {}) {
  const key = (k, r) => k + ':' + r.id;
  const sig = r => JSON.stringify({ ...r, mod: 0 });
  const before = new Map();
  KINDS.forEach(k => state[k].forEach(r => before.set(key(k, r), sig(r))));
  const hh = state.household.on;
  fn(state);
  planOccasions(state); // birthdays and repeating events stay current with every change
  if (state.household.on !== hh) state.household.mod = Date.now();
  const now = Date.now(), seen = new Set();
  KINDS.forEach(k => state[k].forEach(r => {
    const kk = key(k, r); seen.add(kk);
    if (before.get(kk) !== sig(r)) r.mod = now;
  }));
  for (const kk of before.keys()) if (!seen.has(kk)) state.deleted[kk.split(':')[1]] = now;
  state.updatedAt = now;
  saveLocal();
  Sync.schedule();
  if (render) renderAll();
}

export let me = (() => { try { return localStorage.getItem('xmas-me') || ''; } catch { return ''; } })();
export function setMe(id) { me = id || ''; try { id ? localStorage.setItem('xmas-me', id) : localStorage.removeItem('xmas-me'); } catch {} }
export const person = id => state.people.find(p => p.id === id);
export const sharing = () => state.household.on;
export const isMe = id => sharing() && !!me && id === me;
export const needsIdentity = () => sharing() && !person(me);
/* Gifts someone else is buying for the person using this device are never shown here. */
export const visibleGifts = () => needsIdentity() ? [] : state.gifts.filter(g => !(isMe(g.personId) && g.buyer !== me));
export const giftsFor = id => visibleGifts().filter(g => g.personId === id);
export const isSpent = g => g.status !== 'idea';
export const isReady = g => g.status === 'wrapped';
export const sumSpent = gs => gs.filter(isSpent).reduce((a, g) => a + num(g.price), 0);
export const spentFor = id => sumSpent(giftsFor(id));
export const sortedPeople = () => [...state.people].sort((a, b) => a.name.localeCompare(b.name));
export const shoppablePeople = () => sortedPeople().filter(p => !isMe(p.id));
export const statusIndex = id => Math.max(0, STATUS_IDS.indexOf(id));

/* ---------- Events ---------- */
export const occ = id => state.occasions.find(o => o.id === id);
export const possessive = n => n + (/s$/i.test(n) ? '’' : '’s');
export const firstName = p => (p?.name || '').trim().split(/\s+/)[0] || 'them';
export function occTitle(o) {
  if (o.type === 'birthday') return `${possessive(person(o.people[0])?.name || 'Someone')} birthday`;
  return o.title || THEMES[o.type].label;
}
// Adds the year where a title would otherwise repeat in history ("Christmas 2026")
export const occYearTitle = o => `${occTitle(o)} ${o.date.slice(0, 4)}`;
export const byDate = (a, b) => a.date.localeCompare(b.date) || occTitle(a).localeCompare(occTitle(b));
export const upcomingOccasions = () => state.occasions.filter(o => daysUntil(o.date) >= 0).sort(byDate);
export const pastOccasions = () => state.occasions.filter(o => daysUntil(o.date) < 0).sort((a, b) => b.date.localeCompare(a.date));
export const occGifts = o => visibleGifts().filter(g => g.occasionId === o.id);
export const occPeople = o => o.people.map(person).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
export const occBudget = o => occPeople(o).filter(p => !isMe(p.id)).reduce((a, p) => a + num(o.budgets[p.id]), 0);
export const occSpent = (o, pid) => sumSpent(occGifts(o).filter(g => !pid || g.personId === pid));
export const ideasFor = pid => giftsFor(pid).filter(g => !g.occasionId);
export const nextFor = pid => upcomingOccasions().find(o => o.people.includes(pid));
export const nextChristmasDate = () => ymd(nextOccurrence('2000-12-25'));
