import { Icon, cap, esc, money, words } from './util.js';
import { STATUSES, STATUS_IDS, THEMES, stepLabel } from './constants.js';
import { dateRel, daysUntil, fmtDate } from './dates.js';
import { firstName, isMe, isReady, nextChristmasDate, occBudget, occGifts, occPeople, occTitle, person, possessive, statusIndex, sumSpent } from './store.js';

export const evBadge = (o, cls = '') => `<span class="ev-badge th-${o.type} ${cls}" aria-hidden="true">${Icon[THEMES[o.type].icon]}</span>`;

export function christmas() {
  const d = nextChristmasDate();
  return { days: daysUntil(d), year: +d.slice(0, 4) };
}

/* The countdown sentence for an event: "Twelve days until Sam’s birthday." */
export function eventHeadline(o) {
  const n = daysUntil(o.date);
  const p = person(o.people[0]);
  if (n === 0) {
    if (o.type === 'christmas') return 'Merry Christmas.';
    if (o.type === 'birthday') return isMe(p?.id) ? 'Happy birthday.' : `It’s ${possessive(firstName(p))} birthday.`;
    if (o.type === 'anniversary') return 'Happy anniversary.';
    return `${occTitle(o)} is today.`;
  }
  if (n < 0) return `${occTitle(o)} was ${fmtDate(o.date, { month: 'long', day: 'numeric', year: 'numeric' })}.`;
  const what = o.type === 'christmas' ? 'Christmas'
    : o.type === 'birthday' ? (isMe(p?.id) ? 'your birthday' : `${possessive(firstName(p))} birthday`)
    : o.type === 'anniversary' ? (o.title || 'your anniversary')
    : (o.title || 'the celebration');
  return `${cap(words(n))} ${n === 1 ? 'day' : 'days'} until ${what}.`;
}
export function eventSummary(o) {
  const gs = occGifts(o), budget = occBudget(o), spent = sumSpent(gs);
  const people = occPeople(o).filter(p => !isMe(p.id));
  if (!people.length) return o.type === 'birthday' ? 'This one’s for you, so any gifts for you stay hidden.' : 'Choose who you’re buying for to start planning.';
  const sp = budget ? `You’ve spent <b>${money(spent)}</b> of your <b>${money(budget)}</b> budget.` : spent ? `You’ve spent <b>${money(spent)}</b> so far.` : '';
  const ready = gs.filter(isReady).length;
  const gf = gs.length ? ` <b>${ready}</b> of <b>${gs.length}</b> ${gs.length === 1 ? 'gift is' : 'gifts are'} wrapped.` : ' No gifts picked yet.';
  const waiting = gs.filter(g => g.status === 'started' && g.kind === 'buy').length;
  const making = gs.filter(g => g.status === 'started' && g.kind === 'make').length;
  const extra = [waiting ? `<b>${waiting}</b> ${waiting === 1 ? 'order hasn’t' : 'orders haven’t'} arrived` : '', making ? `<b>${making}</b> handmade ${making === 1 ? 'gift is' : 'gifts are'} in progress` : ''].filter(Boolean);
  return (sp + gf + (extra.length ? ' ' + cap(extra.join(', and ')) + '.' : '')).trim();
}

export let bowSeq = 0;
// Bow colors come from the event theme; each bow needs its own gradient id.
export function bow(cls = 'bow') {
  const id = 'bw' + (++bowSeq);
  return `<svg class="${cls}" viewBox="0 0 72 50" aria-hidden="true">
  <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--t-rb1)"/><stop offset="1" style="stop-color:var(--t-rb3)"/></linearGradient></defs>
  <path d="M36 26 C24 6 6 4 8 18 C9 28 24 30 36 26Z" fill="url(#${id})"/>
  <path d="M36 26 C48 6 66 4 64 18 C63 28 48 30 36 26Z" fill="url(#${id})"/>
  <path d="M33 27 L24 48 L30 45 L33 49 L36 29Z M39 27 L48 48 L42 45 L39 49 L36 29Z" style="fill:var(--t-rb2)"/>
  <path d="M15 14 C20 12 27 16 31 22" stroke="rgba(255,255,255,.3)" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path d="M57 14 C52 12 45 16 41 22" stroke="rgba(0,0,0,.18)" stroke-width="2" fill="none" stroke-linecap="round"/>
  <ellipse cx="36" cy="26" rx="6.5" ry="6" style="fill:var(--t-rb2)"/><ellipse cx="34.5" cy="24.5" rx="2.5" ry="2" fill="rgba(255,255,255,.3)"/>
</svg>`;
}

/* The wrapped-present card, themed for the event. */
export function presentCard(o, { intro = false, link = true } = {}) {
  const gs = occGifts(o);
  const counts = Object.fromEntries(STATUSES.map(s => [s.id, gs.filter(g => g.status === s.id).length]));
  const heroVars = { idea: 'var(--h-idea)', started: 'var(--h-started)', have: 'var(--h-have)', wrapped: 'var(--h-wrapped)' };
  const longDate = fmtDate(o.date, { weekday: 'long', month: 'long', day: 'numeric', ...(daysUntil(o.date) < 0 || daysUntil(o.date) > 300 ? { year: 'numeric' } : {}) });
  return `
    <section class="present hero-colors th-${o.type} ${intro ? 'intro' : ''} ${link ? 'linked' : ''}" ${link ? `data-action="open-event" data-id="${esc(o.id)}" role="link" tabindex="0"` : ''} aria-label="${esc(occTitle(o))}">
      <span class="ribbon"></span>${bow()}
      <div class="when">${Icon[THEMES[o.type].icon]}${esc(longDate)}</div>
      <h1 class="${eventHeadline(o).length > 34 ? 'long' : ''}">${esc(eventHeadline(o))}</h1>
      <p>${eventSummary(o)}</p>
      ${gs.length ? `
        <div class="spool" role="img" aria-label="${STATUSES.map(s => `${counts[s.id]} ${s.label.toLowerCase()}`).join(', ')}">
          ${STATUSES.map(s => `<i style="flex-grow:${counts[s.id]};background:${heroVars[s.id]}"></i>`).join('')}
        </div>
        <div class="key">${STATUSES.map(s => `<span><i style="--c:${heroVars[s.id]}"></i>${s.label} <b>${counts[s.id]}</b></span>`).join('')}</div>` : ''}
    </section>`;
}

/* Small themed card for the "Coming up" shelf. */
export function eventTile(o) {
  const gs = occGifts(o);
  return `<button class="ev-tile th-${o.type}" data-action="open-event" data-id="${esc(o.id)}" aria-label="${esc(occTitle(o))}, ${esc(dateRel(o.date))}">
    <span class="ribbon"></span>
    <span class="ic">${Icon[THEMES[o.type].icon]}</span>
    <span class="nm">${esc(occTitle(o))}</span>
    ${gs.length ? `<span class="prog">${gs.filter(isReady).length} of ${gs.length} wrapped</span>` : ''}
    <span class="sb">${esc(dateRel(o.date))}</span>
  </button>`;
}

export function tag(p, cls = '') {
  if (!p) return `<span class="tag ${cls}" style="--c:var(--s-idea)">?</span>`;
  const initial = (p.name.trim()[0] || '?').toUpperCase();
  return p.emoji
    ? `<span class="tag emoji ${cls}" style="--c:${p.color}" aria-hidden="true">${esc(p.emoji)}</span>`
    : `<span class="tag ${cls}" style="--c:${p.color}" aria-hidden="true">${esc(initial)}</span>`;
}
export function statusChip(g, tappable = true) {
  const id = STATUS_IDS[statusIndex(g.status)];
  const label = stepLabel(g.kind, id);
  const inner = `<span class="pips"><i></i><i></i><i></i><i></i></span><span class="st-l">${label}</span>`;
  const hint = id === 'wrapped' ? 'Ready to give' : 'Tap to move to the next step';
  return tappable
    ? `<button class="status s-${id}" data-action="cycle" data-id="${esc(g.id)}" aria-label="${label}. ${hint}">${inner}</button>`
    : `<span class="status s-${id}">${inner}</span>`;
}
export function leftLabel(spent, budget) {
  if (!budget) return `<span class="left none">No budget</span>`;
  const d = budget - spent;
  return d >= 0 ? `<span class="left">${money(d)} left</span>` : `<span class="left over">${money(-d)} over</span>`;
}
