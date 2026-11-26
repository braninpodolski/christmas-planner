import { $, $$, plural, uid } from './util.js';
import { KINDS, STATUSES, stepLabel } from './constants.js';
import { sanitize } from './data.js';
import { autoPlan, commit, giftsFor, isMe, needsIdentity, occ, person, state, statusIndex, ui } from './store.js';
import { christmas } from './components.js';
import { giftChips, giftResults } from './pages.js';
import { Nav, Swipe, renderAll, updatePage } from './nav.js';
import { confirmDestructive, toast, undoable } from './sheets.js';
import { giftSheet, personSheet, taskSheet } from './forms.js';
import { deleteEvent, eventSheet, ideasSheet, openEvent } from './event-sheet.js';
import { CalImport, exportIcs } from './calendar.js';
import { Sync } from './sync.js';
import { joinSheet, passphraseSheet } from './passjoin.js';
import { Identity, shareSheet } from './identity.js';
import { Desk } from './desktop.js';

export async function deletePerson(id) {
  const p = person(id); if (!p) return false;
  if (isMe(id)) { Swipe.closeAll(); toast('This device belongs to you. Change that in Settings first.', 'warn'); return false; }
  const n = giftsFor(id).length;
  if (!await confirmDestructive(`Delete ${p.name}${n ? ` and ${n === 1 ? 'their gift' : `their ${n} gifts`}` : ''}?`, 'Delete person')) { Swipe.closeAll(); return false; }
  undoable(`Deleted ${p.name}`, s => { s.people = s.people.filter(x => x.id !== id); s.gifts = s.gifts.filter(g => g.personId !== id); });
  return true;
}

export function starterTasks() {
  const y = christmas().year;
  const d = (m, day) => `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const list = [
    ['Finalize gift list and budgets', 'Shopping', d(11, 20)],
    ['Black Friday and Cyber Monday shopping', 'Shopping', d(11, 30)],
    ['Order online gifts before shipping cutoffs', 'Shopping', d(12, 12)],
    ['Buy wrapping paper, tape and tags', 'Shopping', d(12, 1)],
    ['Wrap all gifts', 'Shopping', d(12, 21)],
    ['Get the tree', 'Decorating', d(12, 1)],
    ['Put up lights', 'Decorating', d(12, 5)],
    ['Decorate the tree', 'Decorating', d(12, 7)],
    ['Update the card address list', 'Cards', d(11, 28)],
    ['Take a photo for cards', 'Cards', d(12, 1)],
    ['Mail Christmas cards', 'Cards', d(12, 12)],
    ['Plan the Christmas dinner menu', 'Food', d(12, 10)],
    ['Bake cookies', 'Food', d(12, 20)],
    ['Grocery run for Christmas dinner', 'Food', d(12, 22)],
    ['Make holiday party plans', 'Events', ''],
    ['Book travel and confirm plans', 'Events', d(12, 1)],
  ];
  const now = new Date(); now.setHours(0, 0, 0, 0);
  commit(s => list.forEach(([title, category, due], i) => s.tasks.push({ id: uid(), created: Date.now() + i, done: false, title, category, due: due && new Date(due + 'T00:00') >= now ? due : '', notes: '' })));
  toast('Checklist added');
}

export function sparkle(btn) {
  const colors = ['var(--brass)', 'var(--cranberry)', 'var(--pine)'];
  for (let i = 0; i < 8; i++) {
    const s = document.createElement('i');
    s.className = 'spark';
    s.style.setProperty('--a', `${i * 45 + 22}deg`);
    s.style.setProperty('--c', colors[i % 3]);
    btn.appendChild(s);
    setTimeout(() => s.remove(), 600);
  }
}

/* =========================================================
   Actions (event delegation)
   ========================================================= */
export const Actions = {
  'key-new-gift': () => giftSheet(),
  'key-help': () => Desk.help(),
  'tab': el => Nav.switchTab(el.dataset.tab),
  'back': () => Nav.pop(),
  'fab': () => {
    const r = Nav.top()?._route;
    if (!r) return;
    if (r.name === 'people') return personSheet();
    if (r.name === 'events') return eventSheet();
    if (r.name === 'person') return giftSheet(null, r.id);
    if (r.name === 'event') return giftSheet(null, '', r.id);
    return state.people.length ? giftSheet() : personSheet();
  },
  'open-event': el => openEvent(el.dataset.id),
  'add-event': el => eventSheet(null, el.dataset.type),
  'edit-event': el => { const o = occ(el.dataset.id); if (o) eventSheet(o); },
  'delete-event': el => deleteEvent(el.dataset.id),
  'use-ideas': el => ideasSheet(el.dataset.person, el.dataset.occ),
  'toggle-past': () => { ui.showPast = !ui.showPast; updatePage(Nav.top()); },
  'show-ideas': () => {
    ui.giftFilter = 'later';
    if (Nav.current !== 'gifts') Nav.switchTab('gifts'); else if (Nav.stacks.gifts.length > 1) Nav.popToRoot();
    updatePage(Nav.stacks.gifts[0]);
  },
  'export-ics': () => exportIcs(),
  'import-ics': () => $('#icsFile').click(),
  'open-settings': () => Nav.push({ name: 'settings' }),
  'open-person': el => {
    if (Nav.current !== 'people') {
      const st = Nav.stacks.people;
      while (st.length > 1) st.pop().remove();
      st[0].classList.remove('under'); st[0].style.transform = '';
      Nav.switchTab('people');
    }
    Nav.push({ name: 'person', id: el.dataset.id });
  },
  'add-person': () => personSheet(),
  'edit-person': el => personSheet(person(el.dataset.id)),
  'delete-person': el => deletePerson(el.dataset.id),
  'add-gift': el => giftSheet(null, el.dataset.person, el.dataset.occ), // data-occ="" means save as idea
  'edit-gift': el => { const g = state.gifts.find(x => x.id === el.dataset.id); if (g) giftSheet(g); },
  'delete-gift': el => { const g = state.gifts.find(x => x.id === el.dataset.id); if (g) undoable(`Deleted “${g.title}”`, s => s.gifts = s.gifts.filter(x => x.id !== g.id)); },
  'cycle': (el, e) => {
    e.stopPropagation();
    const g = state.gifts.find(x => x.id === el.dataset.id); if (!g) return;
    if (g.status === 'wrapped') { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); return; }
    const next = STATUSES[statusIndex(g.status) + 1];
    commit(() => g.status = next.id, { render: false });
    $$(`[data-action=cycle][data-id="${g.id}"]`).forEach(p => {
      p.className = `status s-${next.id}`;
      const lbl = stepLabel(g.kind, next.id);
      $('.st-l', p).textContent = lbl;
      p.setAttribute('aria-label', `${lbl}. ${next.id === 'wrapped' ? 'Ready to give' : 'Tap to move to the next step'}`);
      void p.offsetWidth; p.classList.add('bump');
    });
    clearTimeout(Actions._cycleT);
    Actions._cycleT = setTimeout(renderAllPreserve, 1100);
  },
  'gift-filter': el => {
    ui.giftFilter = el.dataset.f;
    $('#giftChips').innerHTML = giftChips();
    $('#giftResults').innerHTML = giftResults();
  },
  'add-task': () => taskSheet(),
  'edit-task': el => { const t = state.tasks.find(x => x.id === el.dataset.id); if (t) taskSheet(t); },
  'delete-task': el => { const t = state.tasks.find(x => x.id === el.dataset.id); if (t) undoable('Task deleted', s => s.tasks = s.tasks.filter(x => x.id !== t.id)); },
  'toggle-task': (el, e) => {
    e.stopPropagation();
    const t = state.tasks.find(x => x.id === el.dataset.id); if (!t) return;
    commit(() => t.done = !t.done, { render: false });
    $$(`[data-task="${t.id}"]`).forEach(r => r.classList.toggle('done', t.done));
    if (t.done) sparkle(el);
    clearTimeout(Actions._taskT);
    Actions._taskT = setTimeout(renderAllPreserve, 900);
  },
  'clear-done': async () => {
    const n = state.tasks.filter(t => t.done).length; undoable(`Cleared ${plural(n, 'task')}`, s => s.tasks = s.tasks.filter(t => !t.done));
  },
  'starter-tasks': () => starterTasks(),
  'export': () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gift-tags-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },
  'import': () => $('#importFile').click(),
  'reset': async () => {
    if (!await confirmDestructive('This erases every person, event, gift and task, including the synced copy on your other devices.', 'Erase all data')) return;
    commit(s => KINDS.forEach(k => s[k] = []));
    toast('All data erased');
  },
  'sync-connect': () => joinSheet(),
  'passphrase': () => passphraseSheet(),
  'sharing-on': () => shareSheet(),
  'pick-me': () => Identity.show(true),
  'sharing-off': async () => {
    if (!await confirmDestructive('Stop sharing? Every device will show all gifts again, including surprises.', 'Stop sharing')) return;
    commit(s => s.household.on = false);
  },
  'sync-now': async () => { await Sync.syncNow(true); },
  'sync-disconnect': async () => {
    if (!await confirmDestructive('Turn off sync on this device? Your data stays here and in the Gist.', 'Turn off sync')) return;
    Sync.cfg = {}; Sync.saveCfg(); renderAll();
  },
};

export function renderAllPreserve() {
  if (document.activeElement?.id === 'giftSearch' && !needsIdentity()) {
    Object.values(Nav.stacks).flat().filter(p => p._route.name !== 'gifts').forEach(p => { p._dirty = true; });
    const res = $('#giftResults'); if (res) res.innerHTML = giftResults();
    const ch = $('#giftChips'); if (ch) ch.innerHTML = giftChips();
    return;
  }
  renderAll();
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = Actions[el.dataset.action];
  if (fn) { e.preventDefault(); fn(el, e); }
});
document.addEventListener('input', e => {
  if (e.target.id === 'giftSearch') { ui.giftQuery = e.target.value; $('#giftResults').innerHTML = giftResults(); }
});
$('#icsFile').addEventListener('change', async e => {
  const files = [...e.target.files]; e.target.value = '';
  const texts = await CalImport.readFiles(files);
  if (texts.length) CalImport.run(texts); else if (files.length) toast('Choose a calendar file (.ics)', 'warn');
});
$('#importFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (!data || !Array.isArray(data.people) || !Array.isArray(data.gifts)) throw new Error('This file isn’t a Christmas Planner backup');
    const clean = sanitize(data);
    if (!await confirmDestructive(`Replace everything with this backup? It has ${plural(clean.people.length, 'person', 'people')} and ${plural(clean.gifts.length, 'gift')}.`, 'Replace with backup')) return;
    commit(s => KINDS.forEach(k => s[k] = clean[k]));
    toast('Backup imported');
  } catch (err) { toast(err instanceof SyntaxError ? 'This file isn’t valid JSON' : (err.message || 'Couldn’t read the file'), 'warn'); }
});

export let lastDay = new Date().toDateString();
export function refreshIfNewDay() {
  const d = new Date().toDateString();
  if (d !== lastDay) { lastDay = d; autoPlan(); renderAllPreserve(); } // roll birthdays/events forward at midnight
}
