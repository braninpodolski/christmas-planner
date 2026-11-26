import { $, $$, Icon, cap, esc, sleep, words } from './util.js';
import { daysUntil, fmtDate } from './dates.js';
import { firstName, ideasFor, isMe, occTitle, person, sortedPeople, state, upcomingOccasions, visibleGifts } from './store.js';
import { evBadge, tag } from './components.js';
import { TABS } from './pages.js';
import { Nav } from './nav.js';
import { lastUndo, openSheet } from './sheets.js';
import { giftSheet, personSheet } from './forms.js';
import { eventSheet } from './event-sheet.js';
import { moveGiftPicker } from './gift-drag.js';
import { Actions } from './actions.js';
import { Sync } from './sync.js';

/* =========================================================
   Boot
   ========================================================= */
/* =========================================================
   Desktop: sidebar + keyboard shortcuts
   ========================================================= */
export const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const MOD = IS_MAC ? '⌘' : 'Ctrl';
export const Desk = {
  mq: matchMedia('(hover: hover) and (pointer: fine) and (min-width: 720px)'),
  on() { return this.mq.matches; },
  apply() { document.documentElement.classList.toggle('desk', this.on()); this.render(); },
  render() {
    if (!this.on()) return;
    const el = $('#sidebar'); if (!el) return;
    const r = Nav.top()?._route || {};
    const vg = visibleGifts();
    const up = upcomingOccasions();
    const next = up[0];
    const n = next ? daysUntil(next.date) : null;
    const counts = { home: '', events: up.length || '', people: state.people.length || '', gifts: vg.length || '' };
    const syncC = !Sync.enabled() ? 'var(--s-idea)' : Sync.state === 'error' ? 'var(--cranberry)' : 'var(--pine)';
    const nameOf = o => esc(o.type === 'birthday' ? firstName(person(o.people[0])) : occTitle(o));
    el.innerHTML = `
      <div class="sb-head">${next
        ? `<button class="sb-count th-${next.type}" data-action="open-event" data-id="${esc(next.id)}">${n === 0 ? 'Today' : n > 99 ? `${n} days` : `${cap(words(n))} ${n === 1 ? 'day' : 'days'}`}<small>${n === 0 ? esc(occTitle(next)) : `until ${esc(occTitle(next))}`}</small></button>`
        : `<div class="sb-count">Gift Tags<small>Every gift, all year</small></div>`}</div>
      <button class="sb-new" data-action="key-new-gift" title="New gift (N)">${Icon.plus}New gift<kbd>N</kbd></button>
      <nav class="sb-nav">
        ${TABS.map((t, i) => `<button class="sb-item ${Nav.current === t.id && r.name !== 'settings' ? 'on' : ''}" data-action="tab" data-tab="${t.id}" title="${t.label} (${i + 1})">${Icon[t.icon]}${t.label}<span class="ct">${counts[t.id]}</span><kbd>${i + 1}</kbd></button>`).join('')}
      </nav>
      <div class="sb-people">
        <div class="sb-label"><span>Coming up</span><button data-action="add-event" title="New event (E)" aria-label="New event">${Icon.plus}</button></div>
        ${up.slice(0, 6).map(o => `<button class="sb-item sb-person ${r.name === 'event' && r.id === o.id ? 'on' : ''}" data-action="open-event" data-id="${esc(o.id)}">${evBadge(o, 'xs')}<span class="sb-name">${nameOf(o)}</span><span class="ct" style="display:inline">${esc(daysUntil(o.date) === 0 ? 'Today' : fmtDate(o.date))}</span></button>`).join('')
          || '<p class="note" style="padding:4px 10px">Press E to add an event.</p>'}
        <div class="sb-label"><span>People</span><button data-action="add-person" title="New person (P)" aria-label="New person">${Icon.plus}</button></div>
        ${sortedPeople().map(p => {
          const on = r.name === 'person' && r.id === p.id;
          const ideas = isMe(p.id) ? 0 : ideasFor(p.id).length;
          return `<button class="sb-item sb-person ${on ? 'on' : ''}" data-action="open-person" data-id="${esc(p.id)}">${tag(p)}<span class="sb-name">${esc(p.name)}</span>${ideas ? `<span class="ct" style="display:inline" title="Saved ideas">${ideas}</span>` : ''}</button>`;
        }).join('') || '<p class="note" style="padding:4px 10px">Press P to add someone.</p>'}
      </div>
      <div class="sb-foot">
        <button class="sb-item ${r.name === 'settings' ? 'on' : ''}" data-action="open-settings" title="Settings (,)"><span class="dot" style="--c:${syncC}"></span>Settings</button>
        <button class="sb-item" data-action="key-help" title="Keyboard shortcuts (?)" style="flex:none;width:auto" aria-label="Keyboard shortcuts"><kbd style="display:inline-flex">?</kbd></button>
      </div>`;
  },
  rows() { return $$('[data-row]', Nav.top()).filter(r => r.offsetParent); },
  move(dir) {
    const rows = this.rows(); if (!rows.length) return;
    const i = rows.indexOf(document.activeElement);
    const next = rows[i < 0 ? (dir > 0 ? 0 : rows.length - 1) : Math.max(0, Math.min(rows.length - 1, i + dir))];
    next.focus({ preventScroll: true });
    next.scrollIntoView({ block: 'nearest' });
  },
  rowAction(el, kind) {
    const type = el.dataset.row;
    if (kind === 'delete') {
      const map = { gift: 'delete-gift', task: 'delete-task', person: 'delete-person', event: 'delete-event' };
      const rows = this.rows(), i = rows.indexOf(el);
      Actions[map[type]]?.(el);
      // keep keyboard focus in the list after the row disappears
      setTimeout(() => { const rs = this.rows(); rs[Math.min(i, rs.length - 1)]?.focus({ preventScroll: true }); }, 30);
    } else if (kind === 'space') {
      if (type === 'gift') $('[data-action=cycle]', el)?.click();
      else if (type === 'task') $('[data-action=toggle-task]', el)?.click();
      else el.click();
    }
  },
  async goSearch() {
    if (Nav.current !== 'gifts') Nav.switchTab('gifts');
    else if (Nav.stacks.gifts.length > 1) Nav.popToRoot();
    await sleep(30);
    $('#giftSearch')?.focus();
  },
  help() {
    const row = (label, ...keys) => `<span>${label}</span><span class="k">${keys.map(k => `<kbd>${k}</kbd>`).join('')}</span>`;
    openSheet({
      title: 'Keyboard shortcuts', saveLabel: 'Done', required: [],
      body: `<div class="fgroup"><div class="keys">
        ${row('New gift', 'N')}${row('New saved idea', 'I')}${row('New event', 'E')}${row('New person', 'P')}
        ${row('Search gifts', '/')}${row('Home, Events, People, Gifts', '1', '2', '3', '4')}${row('Settings', ',')}
      </div></div>
      <div class="fgroup"><div class="keys">
        ${row('Move between rows', '↑', '↓')}${row('Open the selected row', '↩')}
        ${row('Next status for the selected gift', 'Space')}${row('Move the selected gift to another event', 'M')}${row('Delete the selected row', '⌫')}
        ${row('Undo delete', MOD, 'Z')}${row('Go back', 'Esc')}
      </div></div>
      <div class="fgroup"><div class="keys">${row('Save a form', MOD, '↩')}${row('Close a form', 'Esc')}</div></div>`,
      onSave() {},
    });
  },
};
// Switching between phone and desktop layouts must not animate open dialogs or pages
// from one layout's position to the other's, so transitions pause for the swap.
Desk.mq.addEventListener('change', () => {
  const root = document.documentElement;
  root.classList.add('no-anim');
  Desk.apply();
  void root.offsetWidth;
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('no-anim')));
});

document.addEventListener('keydown', e => {
  const t = e.target;
  const typing = t.closest?.('input, textarea, select, [contenteditable="true"]');
  const mod = e.metaKey || e.ctrlKey;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  // any dialog that is open or opening (not one that is animating closed)
  const sheet = $$('.sheet').find(s => !s._closing), menu = $$('.action-sheet').find(m => !m._closing);

  if (menu) { // confirmation menus: Esc cancels, Enter confirms
    if (key === 'Escape') { e.preventDefault(); $('.cancel', menu)?.click(); }
    else if (key === 'Enter') { e.preventDefault(); $('button.destructive', menu)?.click(); }
    return;
  }
  if (sheet) {
    if (key === 'Enter' && mod) { e.preventDefault(); $('[data-sheet=save]', sheet)?.click(); }
    else if (key === 'Escape') { e.preventDefault(); sheet._close?.(null); } // works wherever focus is
    return;
  }
  if ($('.whoami')) return;

  if (key === 'Escape') {
    if (typing) { t.blur(); return; }
    if (Nav.stacks[Nav.current].length > 1) { e.preventDefault(); Nav.pop(); }
    return;
  }
  if (mod && key === 'z' && !typing && !e.shiftKey && lastUndo && Date.now() < lastUndo.until) { e.preventDefault(); lastUndo.run(); return; }
  if (mod && key === 'k') { e.preventDefault(); Desk.goSearch(); return; }
  if (typing || mod || e.altKey) return;

  const row = t.closest?.('[data-row]');
  switch (key) {
    case 'n': e.preventDefault(); giftSheet(); break;
    case 'p': e.preventDefault(); personSheet(); break;
    case 'e': e.preventDefault(); eventSheet(); break;
    case 'i': { e.preventDefault(); const r = Nav.top()?._route; giftSheet(null, r?.name === 'person' ? r.id : '', ''); break; }
    case '/': e.preventDefault(); Desk.goSearch(); break;
    case ',': e.preventDefault(); if (Nav.top()?._route.name !== 'settings') Nav.push({ name: 'settings' }); break;
    case '?': e.preventDefault(); Desk.help(); break;
    case '1': case '2': case '3': case '4': e.preventDefault(); Nav.switchTab(TABS[+key - 1].id); break;
    case 'ArrowDown': case 'j': e.preventDefault(); Desk.move(1); break;
    case 'ArrowUp': case 'k': e.preventDefault(); Desk.move(-1); break;
    case 'Backspace': case 'Delete': if (row) { e.preventDefault(); Desk.rowAction(row, 'delete'); } break;
    case ' ': if (row) { e.preventDefault(); Desk.rowAction(row, 'space'); } break;
    case 'm': if (row?.dataset.row === 'gift') { e.preventDefault(); moveGiftPicker(row.dataset.id); } break;
    case 'x': if (row?.dataset.row === 'task') { e.preventDefault(); Desk.rowAction(row, 'space'); } break;
    case 'Enter': if (row && row.tagName !== 'BUTTON') { e.preventDefault(); row.click(); } break;
  }
});
