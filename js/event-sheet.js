import { $, $$, Icon, esc, money, num, plural, uid } from './util.js';
import { EVENT_TYPES, THEMES } from './constants.js';
import { dateRel, daysUntil, nextOccurrence, ymd } from './dates.js';
import { clearBirthdayDeletion, planOccasions, priceOf } from './data.js';
import { commit, firstName, ideasFor, isMe, nextChristmasDate, occ, occTitle, occYearTitle, person, possessive, sortedPeople, state, ui } from './store.js';
import { tag } from './components.js';
import { Nav, Swipe } from './nav.js';
import { confirmDestructive, openSheet, toast, undoable } from './sheets.js';
import { dateFields, fmtTypedDate, hintDate, readDate } from './datefields.js';
import { Desk } from './desktop.js';

/* ---------- Events ---------- */
export function eventSheet(o, presetType) {
  const isNew = !o;
  const type0 = o?.type || presetType || 'birthday';
  const draft = o ? structuredClone(o) : { type: type0, title: '', date: '', people: [], budgets: {}, repeat: type0 !== 'celebration' };
  const bperson = draft.type === 'birthday' ? person(draft.people[0]) : null;
  const pplRows = sortedPeople().map(p => {
    const on = draft.people.includes(p.id) || (isNew && draft.type === 'christmas');
    return `<label class="row pick">
      <input type="checkbox" name="pp" value="${esc(p.id)}" ${on ? 'checked' : ''}>
      <span class="pick-box">${Icon.check}</span>${tag(p)}
      <span class="row-main"><span class="row-title">${esc(p.name)}</span></span>
      ${isMe(p.id) ? '<span class="you">You</span>' : `<input class="field right num budget-in" name="bud_${esc(p.id)}" inputmode="decimal" placeholder="Budget" aria-label="Budget for ${esc(p.name)}" value="${draft.budgets[p.id] ? esc(draft.budgets[p.id]) : ''}">`}
    </label>`;
  }).join('');
  const typeTiles = EVENT_TYPES.map(t => `
    <label class="type-tile th-${t}"><input type="radio" name="type" value="${t}" ${t === draft.type ? 'checked' : ''} ${isNew ? '' : 'disabled'}>
      <span class="ev-badge">${Icon[THEMES[t].icon]}</span><span>${THEMES[t].label}</span></label>`).join('');
  return openSheet({
    title: isNew ? 'New event' : 'Edit event',
    saveLabel: isNew ? 'Add' : 'Done',
    required: [],
    body: `
      <div class="ev-preview" data-preview></div>
      ${isNew ? `<div class="types" role="radiogroup" aria-label="Kind of event">${typeTiles}</div>` : ''}
      <div class="fgroup" data-for="birthday">
        <div class="row combo"><label class="lbl" for="ebp">Whose</label>
          <input type="hidden" name="bperson" value="${esc(bperson?.id || '')}">
          <input class="field right" id="ebp" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="ebp-list" autocomplete="off" autocapitalize="words" spellcheck="false"
            placeholder="${sortedPeople().length ? 'Type a name' : 'Add people first'}" value="${esc(bperson?.name || '')}" ${isNew ? '' : 'disabled'}></div>
        <div class="combo-list" id="ebp-list" role="listbox" aria-label="People" hidden></div>
        ${dateFields('eb', bperson?.birthday || '', { label: 'Birthday', yearOptional: true })}
        <div class="row" data-not-me><label class="lbl" for="ebb">Budget</label><input class="field right num" id="ebb" name="bbudget" inputmode="decimal" placeholder="$0" value="${bperson && draft.budgets[bperson.id] ? esc(draft.budgets[bperson.id]) : ''}"></div>
      </div>
      <p class="fnote" data-for="birthday">The birthday is saved to their profile and comes back every year.</p>
      <div class="fgroup" data-for="christmas anniversary celebration">
        <div class="row"><input class="field big" name="title" placeholder="Name" value="${esc(draft.title)}" autocapitalize="sentences" aria-label="Event name"></div>
        ${dateFields('ed', draft.date || '', { label: 'Date', attrs: 'data-for="anniversary celebration"' })}
        <div class="row" data-for="christmas"><span class="lbl">Date</span><span class="row-main" style="text-align:right;color:var(--text2)">December 25</span></div>
        <label class="row" data-for="anniversary celebration"><span class="row-main">Repeats every year</span><input type="checkbox" class="switch" name="repeat" ${draft.repeat ? 'checked' : ''}></label>
      </div>
      <div data-for="christmas anniversary celebration">
        <div class="flabel">Who are you buying for?</div>
        <div class="fgroup pick-people">${pplRows || '<div class="row" style="color:var(--text2)">Add people first, then choose them here.</div>'}</div>
        <p class="fnote">Set an optional budget for each person.</p>
      </div>
      ${isNew ? '' : `<div class="fgroup"><button type="button" class="row danger" data-sheet-delete style="width:100%">Delete event</button></div>`}`,
    onOpen(sh, close) {
      const form = $('form', sh), btn = $('[data-sheet=save]', sh);
      const cur = () => (isNew ? $('input[name=type]:checked', form)?.value : draft.type) || 'birthday';
      const bdate = () => hintDate(form, 'eb', true);
      // a yearly event may leave out the year; it is placed on its next date
      const edate = () => { const r = form.elements.repeat?.checked; const v = hintDate(form, 'ed', r); return v.startsWith('0000') ? ymd(nextOccurrence(v)) : v; };
      const update = () => {
        const t = cur();
        $$('[data-for]', form).forEach(el => { el.hidden = !el.dataset.for.split(' ').includes(t); });
        const title = $('[name=title]', form);
        title.placeholder = t === 'christmas' ? 'Christmas' : t === 'anniversary' ? 'Our anniversary' : 'What’s the occasion?';
        const sel = $('[name=bperson]', form), bp = person(sel.value);
        if (t === 'birthday') {
          const notMe = $('[data-not-me]', form); notMe.hidden = !bp || isMe(bp.id);
        }
        // live preview tile
        const fake = { id: 'preview', type: t, title: title.value.trim(), people: t === 'birthday' && bp ? [bp.id] : [], budgets: {},
          date: t === 'christmas' ? nextChristmasDate() : t === 'birthday' ? (bdate() ? ymd(nextOccurrence(bdate())) : '') : edate() };
        $('[data-preview]', form).innerHTML = `<div class="ev-tile th-${t}" aria-hidden="true"><span class="ribbon"></span><span class="ic">${Icon[THEMES[t].icon]}</span>
          <span class="nm">${esc(t === 'birthday' ? (bp ? `${possessive(bp.name)} birthday` : 'Birthday') : fake.title || THEMES[t].label)}</span>
          <span class="sb">${fake.date ? esc(dateRel(fake.date)) : 'Pick a date'}</span></div>`;
        // validation
        const ok = t === 'birthday' ? !!(bp && bdate()) : t === 'christmas' ? true : !!edate();
        btn.disabled = !ok;
      };
      form.addEventListener('input', update); form.addEventListener('change', update);
      // Whose: type to filter, arrows to move, Enter or Tab to pick
      const cbIn = $('#ebp', form), cbVal = form.elements.bperson, cbList = $('#ebp-list', form);
      let matches = [], hi = 0;
      const showList = open => { cbList.hidden = !open; cbIn.setAttribute('aria-expanded', open); };
      const draw = () => {
        const q = cbIn.value.trim().toLowerCase();
        const all = sortedPeople(), nm = p => p.name.toLowerCase();
        matches = !q || (person(cbVal.value) && nm(person(cbVal.value)) === q) ? all
          : [...all.filter(p => nm(p).startsWith(q)), ...all.filter(p => !nm(p).startsWith(q) && nm(p).includes(q))];
        hi = Math.max(0, matches.findIndex(p => p.id === cbVal.value));
        cbList.innerHTML = matches.length ? matches.map((p, i) => `<div class="combo-opt" role="option" id="ebp-o${i}" data-i="${i}" aria-selected="${i === hi}">${tag(p)}<span class="combo-nm">${esc(p.name)}</span>${p.id === cbVal.value ? Icon.check : ''}</div>`).join('')
          : `<div class="combo-empty">${all.length ? 'No one by that name' : 'Add people first'}</div>`;
        cbIn.setAttribute('aria-activedescendant', matches.length ? 'ebp-o' + hi : '');
        showList(true);
      };
      const move = d => {
        if (!matches.length) return;
        hi = (hi + d + matches.length) % matches.length;
        $$('.combo-opt', cbList).forEach((o, i) => o.setAttribute('aria-selected', i === hi));
        cbIn.setAttribute('aria-activedescendant', 'ebp-o' + hi);
        $(`#ebp-o${hi}`, cbList)?.scrollIntoView({ block: 'nearest' });
      };
      const pick = p => {
        cbVal.value = p.id; cbIn.value = p.name; showList(false);
        if (p.birthday) form.elements.eb.value = fmtTypedDate(p.birthday);
        update();
      };
      const nextStop = () => { const date = form.elements.eb; return !date.value.trim() ? date : !$('[data-not-me]', form).hidden ? form.elements.bbudget : btn.disabled ? date : btn; };
      cbIn.addEventListener('focus', () => { if (!cbIn.disabled) { draw(); cbIn.select(); } });
      cbIn.addEventListener('input', () => { if (person(cbVal.value)?.name !== cbIn.value) cbVal.value = ''; draw(); });
      cbIn.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (cbList.hidden) draw(); else move(e.key === 'ArrowDown' ? 1 : -1); }
        else if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !cbList.hidden && matches[hi]) { e.preventDefault(); e.stopPropagation(); pick(matches[hi]); nextStop().focus(); }
        else if (e.key === 'Tab' && !e.shiftKey && !cbList.hidden && matches[hi] && cbIn.value.trim() && !cbVal.value) pick(matches[hi]);
        else if (e.key === 'Escape' && !cbList.hidden) { e.preventDefault(); e.stopPropagation(); showList(false); }
      });
      cbIn.addEventListener('blur', () => {
        if (!cbVal.value) { const exact = sortedPeople().find(p => p.name.toLowerCase() === cbIn.value.trim().toLowerCase()); if (exact) pick(exact); }
        else if (person(cbVal.value)) cbIn.value = person(cbVal.value).name;
        showList(false);
      });
      cbList.addEventListener('pointerdown', e => e.preventDefault()); // keep focus in the field
      cbList.addEventListener('click', e => { const o = e.target.closest('.combo-opt'); if (o) { pick(matches[+o.dataset.i]); nextStop().focus(); } });
      update();
      $('[data-sheet-delete]', sh)?.addEventListener('click', async () => { if (await deleteEvent(o.id)) close(null); });
      // With a keyboard, start on the event type: arrow keys pick it, Tab or Enter moves on.
      if (Desk.on()) setTimeout(() => (isNew ? $('input[name=type]:checked', form) : $('input:not([type=hidden]):not([disabled]), select:not([disabled])', form))?.focus({ preventScroll: true }), 60);
    },
    onSave(d, form) {
      const t = isNew ? d.type : draft.type;
      const fd = new FormData(form);
      const chosen = fd.getAll('pp').filter(id => person(id));
      const budgets = {};
      chosen.forEach(id => { const b = priceOf(d['bud_' + id]); if (b) budgets[id] = b; });
      let openId = o?.id;
      if (t === 'birthday') {
        const pid = isNew ? d.bperson : draft.people[0];
        const bdate = readDate(d, 'eb', true);
        if (!person(pid) || !bdate) return false;
        const b = priceOf(d.bbudget);
        commit(s => {
          s.people.find(x => x.id === pid).birthday = bdate;
          clearBirthdayDeletion(s, pid);
          planOccasions(s);
          const ev = s.occasions.find(x => x.series === 'b' + pid && daysUntil(x.date) >= 0) || (o && s.occasions.find(x => x.id === o.id));
          if (ev) { ev.budgets = b ? { [pid]: b } : {}; openId = ev.id; }
        });
      } else if (t === 'christmas') {
        const date = isNew ? nextChristmasDate() : draft.date;
        const id = isNew ? 'xmas' + date.slice(0, 4) : o.id;
        if (isNew && occ(id)) { toast('Christmas is already in Events'); setTimeout(() => openEvent(id), 300); return; }
        const data = { type: 'christmas', title: d.title.trim().slice(0, 100), date, people: chosen, budgets, repeat: true, series: 'xmas' };
        if (isNew) commit(s => s.occasions.push({ id, created: Date.now(), ...data }));
        else commit(s => Object.assign(s.occasions.find(x => x.id === o.id), data));
        openId = id;
      } else {
        const repeat = d.repeat === 'on';
        let date = readDate(d, 'ed', repeat); if (!date) return false;
        if (date.startsWith('0000')) date = ymd(nextOccurrence(date));
        if (isNew) {
          const id = uid();
          commit(s => s.occasions.push({ id, created: Date.now(), type: t, title: d.title.trim().slice(0, 100), date, people: chosen, budgets, repeat, series: repeat ? id : '' }));
          openId = id;
        } else commit(s => Object.assign(s.occasions.find(x => x.id === o.id), {
          title: d.title.trim().slice(0, 100), date, people: chosen, budgets, repeat, series: o.series || (repeat ? o.id : ''),
        }));
      }
      if (isNew && openId) { ui.justAdded = openId; setTimeout(() => openEvent(openId), 320); }
    },
  });
}

export async function deleteEvent(id) {
  const o = occ(id); if (!o) return false;
  const n = state.gifts.filter(g => g.occasionId === id).length;
  const msg = [
    `Delete ${daysUntil(o.date) < 0 ? occYearTitle(o) : occTitle(o)}?`,
    n ? ` ${n === 1 ? 'Its gift moves' : `Its ${n} gifts move`} to saved ideas.` : '',
    o.type === 'birthday' ? ` It comes back next year unless you remove the birthday from ${person(o.people[0])?.name || 'their profile'}.` : '',
  ].join('');
  if (!await confirmDestructive(msg, 'Delete event')) { Swipe.closeAll(); return false; }
  undoable(`Deleted ${occTitle(o)}`, s => {
    s.occasions = s.occasions.filter(x => x.id !== id);
    // stop the series from rolling forward again
    if (o.series) s.occasions.forEach(x => { if (x.series === o.series && o.type !== 'birthday') x.repeat = false; });
    s.gifts.forEach(g => { if (g.occasionId === id) g.occasionId = ''; });
  });
  return true;
}

export function openEvent(id) {
  if (!occ(id)) return;
  if (Nav.current !== 'events') {
    const st = Nav.stacks.events;
    while (st.length > 1) st.pop().remove();
    st[0].classList.remove('under'); st[0].style.transform = '';
    Nav.switchTab('events');
  }
  const top = Nav.top()?._route;
  if (top?.name === 'event' && top.id === id) return;
  Nav.push({ name: 'event', id });
}

export function ideasSheet(pid, oid) {
  const p = person(pid), o = occ(oid);
  if (!p || !o) return;
  const ideas = ideasFor(pid);
  return openSheet({
    title: 'Use saved ideas',
    saveLabel: 'Add to event',
    required: [],
    body: `
      <p class="fnote" style="margin:0 0 18px;font-size:15px;color:var(--text)">Choose ideas for ${esc(firstName(p))} to plan for ${esc(occTitle(o))}.</p>
      <div class="fgroup pick-people">
        ${ideas.map(g => `<label class="row pick">
          <input type="checkbox" name="g" value="${esc(g.id)}"><span class="pick-box">${Icon.check}</span>
          <span class="row-main"><span class="row-title">${esc(g.title)}</span>${g.store ? `<span class="row-sub">${esc(g.store)}</span>` : ''}</span>
          ${g.price !== '' ? `<span class="money">${money(num(g.price))}</span>` : ''}
        </label>`).join('')}
      </div>`,
    onOpen(sh) {
      const btn = $('[data-sheet=save]', sh), form = $('form', sh);
      const upd = () => { btn.disabled = !$$('input[name=g]:checked', form).length; };
      form.addEventListener('change', upd); upd();
    },
    onSave(d, form) {
      const ids = new FormData(form).getAll('g');
      if (!ids.length) return false;
      commit(s => s.gifts.forEach(g => { if (ids.includes(g.id)) g.occasionId = oid; }));
      toast(`Added ${plural(ids.length, 'idea')} to ${occTitle(o)}`);
    },
  });
}
