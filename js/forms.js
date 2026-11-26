import { $, $$, Icon, esc, num, uid } from './util.js';
import { CATEGORIES, COLORS, EMOJIS, KIND_STEPS, STATUSES, STATUS_IDS } from './constants.js';
import { daysUntil, fmtDate } from './dates.js';
import { clearBirthdayDeletion, dateOf } from './data.js';
import { commit, isMe, me, nextFor, occ, occTitle, occYearTitle, person, sharing, shoppablePeople, state, statusIndex, ui, upcomingOccasions } from './store.js';
import { tag } from './components.js';
import { Nav } from './nav.js';
import { openSheet, toast, undoable } from './sheets.js';
import { dateFields, hintDate, readDate } from './datefields.js';
import { deletePerson } from './actions.js';

/* ---------- Forms ---------- */
export function stepper(value, kind) {
  const i = statusIndex(value);
  const labels = KIND_STEPS[kind === 'make' ? 'make' : 'buy'];
  return `
    <div class="stepper" data-stepper style="--i:${i};--sc:var(--s-${STATUS_IDS[i]})">
      ${STATUSES.map((s, j) => `<label class="${j <= i ? 'reached' : ''} ${j === i ? 'current' : ''}">
        <input type="radio" name="status" value="${s.id}" ${j === i ? 'checked' : ''}><span class="node"></span><span class="st-l">${labels[j]}</span></label>`).join('')}
    </div>`;
}
export function initStepper(root) {
  const st = $('[data-stepper]', root); if (!st) return;
  st.addEventListener('change', () => {
    const inputs = $$('input', st), i = inputs.findIndex(x => x.checked);
    st.style.setProperty('--i', i); st.style.setProperty('--sc', `var(--s-${STATUS_IDS[i]})`);
    $$('label', st).forEach((l, j) => { l.classList.toggle('reached', j <= i); l.classList.toggle('current', j === i); });
  });
}

export function personSheet(p, opts = {}) {
  const isNew = !p;
  p = p || { name: '', birthday: '', emoji: '', color: COLORS[state.people.length % COLORS.length], relation: '', notes: '', sizes: '' };
  return openSheet({
    title: isNew ? 'New person' : 'Edit person',
    saveLabel: isNew ? 'Add' : 'Done',
    required: ['name'],
    body: `
      <div class="tag-preview">${tag(p.name ? p : { ...p, name: '?' }, 'lg')}</div>
      <div class="fgroup">
        <div class="row"><input class="field big" name="name" placeholder="Name" value="${esc(p.name)}" enterkeyhint="done" autocapitalize="words" aria-label="Name"></div>
        <div class="row"><input class="field" name="relation" placeholder="Relationship, like sister or coworker" value="${esc(p.relation)}" autocapitalize="sentences" aria-label="Relationship"></div>
      </div>
      <div class="fgroup">
        ${dateFields('pb', p.birthday || '', { label: `${Icon.cake}Birthday`, yearOptional: true })}
      </div>
      <p class="fnote">Optional, and the year is optional too. Their birthday shows up in Events every year, so you can plan ahead.</p>
      <div class="flabel">Tag</div>
      <div class="fgroup">
        <div class="swatches">${COLORS.map(c => `<label aria-label="Color"><input type="radio" name="color" value="${c}" ${c === p.color ? 'checked' : ''}><span style="--c:${c}"></span></label>`).join('')}</div>
        <div class="emoji-grid">${EMOJIS.map(e => `<label aria-label="${e ? 'Emoji ' + e : 'Use first initial'}"><input type="radio" name="emoji" value="${e}" ${e === (p.emoji || '') ? 'checked' : ''}><span class="${e ? '' : 'txt'}">${e || 'Aa'}</span></label>`).join('')}</div>
      </div>
      <div class="flabel">Sizes and favorites</div>
      <div class="fgroup"><div class="row"><textarea class="field" name="sizes" rows="2" style="min-height:56px" placeholder="Medium shirt, size 9 shoe, loves dark chocolate">${esc(p.sizes)}</textarea></div></div>
      <div class="flabel">Notes</div>
      <div class="fgroup"><div class="row"><textarea class="field" name="notes" placeholder="Anything else to remember">${esc(p.notes)}</textarea></div></div>
      ${isNew ? '' : `<div class="fgroup"><button type="button" class="row danger" data-sheet-delete style="width:100%">Delete person</button></div>`}`,
    onOpen(sh, close) {
      const form = $('form', sh), prev = $('.tag-preview', sh);
      hintDate(form, 'pb', true);
      form.addEventListener('input', () => {
        hintDate(form, 'pb', true);
        const d = Object.fromEntries(new FormData(form).entries());
        prev.innerHTML = tag({ name: d.name.trim() || '?', color: COLORS.includes(d.color) ? d.color : COLORS[0], emoji: EMOJIS.includes(d.emoji) ? d.emoji : '' }, 'lg');
      });
      if (isNew) setTimeout(() => $('[name=name]', sh).focus({ preventScroll: true }), 460);
      $('[data-sheet-delete]', sh)?.addEventListener('click', async () => { if (await deletePerson(p.id)) close(null); });
    },
    onSave(d) {
      const data = { name: d.name.trim().slice(0, 100), relation: d.relation.trim(), birthday: readDate(d, 'pb', true), color: COLORS.includes(d.color) ? d.color : COLORS[0], emoji: EMOJIS.includes(d.emoji) ? d.emoji : '', notes: d.notes.trim(), sizes: d.sizes.trim() };
      if (isNew) {
        const np = { id: uid(), created: Date.now(), ...data };
        ui.justAdded = np.id;
        commit(s => s.people.push(np));
        opts.onCreated?.(np);
        toast(`Added ${np.name}`);
      } else commit(s => { if (data.birthday && data.birthday !== p.birthday) clearBirthdayDeletion(s, p.id); Object.assign(s.people.find(x => x.id === p.id), data); });
    },
  });
}

/* presetOcc: an event id, '' for "save as an idea", or undefined to pick a sensible default */
export function giftSheet(g, presetPerson, presetOcc) {
  const isNew = !g;
  if (!state.people.length) return personSheet();
  const topRoute = Nav.top()?._route;
  let preset = presetPerson || (topRoute?.name === 'person' ? topRoute.id : '');
  if (isMe(preset)) preset = '';
  let occId = presetOcc;
  if (occId === undefined) {
    if (topRoute?.name === 'event') occId = topRoute.id;
    else if (preset) occId = nextFor(preset)?.id || '';
    else occId = upcomingOccasions()[0]?.id || '';
  }
  g = g || { title: '', personId: preset, occasionId: occId, price: '', status: 'idea', kind: 'buy', store: '', url: '', notes: '', buyer: '' };
  const addedBy = g.buyer && g.buyer !== me ? person(g.buyer) : null;
  const cur = g.occasionId ? occ(g.occasionId) : null;
  const occOptions = [...upcomingOccasions(), ...(cur && daysUntil(cur.date) < 0 ? [cur] : [])];
  return openSheet({
    title: isNew ? 'New gift' : 'Edit gift',
    saveLabel: isNew ? 'Add' : 'Done',
    required: ['title', 'personId'],
    body: `
      <div class="fgroup">
        <div class="row"><input class="field big" name="title" placeholder="What’s the gift?" value="${esc(g.title)}" enterkeyhint="done" autocapitalize="sentences" aria-label="Gift"></div>
        <div class="row"><label class="lbl" for="gp">For</label>
          <select class="field" id="gp" name="personId">
            <option value="" ${g.personId ? '' : 'selected'} disabled>Choose</option>
            ${shoppablePeople().map(p => `<option value="${esc(p.id)}" ${p.id === g.personId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
          </select>${Icon.chev}</div>
        <div class="row"><label class="lbl" for="goc">When</label>
          <select class="field" id="goc" name="occasionId">
            <option value="" ${g.occasionId ? '' : 'selected'}>Save as an idea for later</option>
            ${occOptions.map(o => `<option value="${esc(o.id)}" ${o.id === g.occasionId ? 'selected' : ''}>${esc(daysUntil(o.date) < 0 ? occYearTitle(o) : occTitle(o))}, ${esc(fmtDate(o.date))}</option>`).join('')}
          </select>${Icon.chev}</div>
        <div class="row"><label class="lbl" for="gpr" data-price-label>${g.kind === 'make' ? 'Cost' : 'Price'}</label><input class="field right num" id="gpr" name="price" data-price inputmode="decimal" placeholder="$0" value="${g.price !== '' ? esc(g.price) : ''}"></div>
      </div>
      <div class="flabel">Progress</div>
      <div class="fgroup">
        <div class="kind" data-kind style="--i:${g.kind === 'make' ? 1 : 0}">
          <span class="kind-thumb"></span>
          <label><input type="radio" name="kind" value="buy" ${g.kind !== 'make' ? 'checked' : ''}>${Icon.bag}Buying it</label>
          <label><input type="radio" name="kind" value="make" ${g.kind === 'make' ? 'checked' : ''}>${Icon.scissors}Making it</label>
        </div>
        ${stepper(g.status, g.kind)}
      </div>
      <div class="fgroup">
        <div class="row"><input class="field" name="store" data-store placeholder="${g.kind === 'make' ? 'Supplies from' : 'Store'}" value="${esc(g.store)}" autocapitalize="words" aria-label="Store"></div>
        <div class="row"><input class="field" name="url" type="url" inputmode="url" placeholder="Link" value="${esc(g.url)}" autocapitalize="off" aria-label="Link"></div>
      </div>
      ${g.url && /^https?:\/\//i.test(g.url) ? `<p class="fnote"><a href="${esc(g.url)}" target="_blank" rel="noopener">Open link</a></p>` : ''}
      <div class="fgroup"><div class="row"><textarea class="field" name="notes" placeholder="Notes, like size, color or tracking number" aria-label="Notes">${esc(g.notes)}</textarea></div></div>
      ${addedBy && sharing() ? `<p class="fnote" style="margin-top:-8px">Added by ${esc(addedBy.name)}</p>` : ''}
      ${isNew ? '' : `<div class="fgroup"><button type="button" class="row danger" data-sheet-delete style="width:100%">Delete gift</button></div>`}`,
    onOpen(sh, close) {
      initStepper(sh);
      const kindEl = $('[data-kind]', sh);
      kindEl.addEventListener('change', () => {
        const k = $('input:checked', kindEl).value;
        kindEl.style.setProperty('--i', k === 'make' ? 1 : 0);
        $$('[data-stepper] .st-l', sh).forEach((l, j) => { l.textContent = KIND_STEPS[k][j]; });
        $('[data-price-label]', sh).textContent = k === 'make' ? 'Cost' : 'Price';
        $('[data-store]', sh).placeholder = k === 'make' ? 'Supplies from' : 'Store';
      });
      if (isNew) setTimeout(() => $('[name=title]', sh).focus({ preventScroll: true }), 460);
      $('[data-sheet-delete]', sh)?.addEventListener('click', async () => {
        close(null); undoable(`Deleted “${g.title}”`, s => s.gifts = s.gifts.filter(x => x.id !== g.id));
      });
    },
    onSave(d) {
      if (!person(d.personId) || isMe(d.personId)) return false;
      const occasionId = occ(d.occasionId) ? d.occasionId : '';
      const data = { title: d.title.trim().slice(0, 200), personId: d.personId, occasionId, price: d.price ? Math.max(0, num(d.price)) : '', status: STATUS_IDS.includes(d.status) ? d.status : 'idea', kind: d.kind === 'make' ? 'make' : 'buy', store: d.store.trim(), url: d.url.trim(), notes: d.notes.trim() };
      // planning a gift for someone adds them to that event
      const join = s => { const o = s.occasions.find(x => x.id === occasionId); if (o && !o.people.includes(d.personId)) o.people.push(d.personId); };
      if (isNew) {
        const ng = { id: uid(), created: Date.now(), buyer: sharing() && person(me) ? me : '', ...data };
        ui.justAdded = ng.id;
        commit(s => { s.gifts.push(ng); join(s); });
        if (!occasionId) toast('Saved as an idea');
      } else commit(s => { Object.assign(s.gifts.find(x => x.id === g.id), data); join(s); });
    },
  });
}

export function taskSheet(t) {
  const isNew = !t;
  t = t || { title: '', category: 'Shopping', due: '', notes: '' };
  return openSheet({
    title: isNew ? 'New task' : 'Edit task',
    saveLabel: isNew ? 'Add' : 'Done',
    required: ['title'],
    body: `
      <div class="fgroup">
        <div class="row"><input class="field big" name="title" placeholder="What needs doing?" value="${esc(t.title)}" enterkeyhint="done" autocapitalize="sentences" aria-label="Task"></div>
        <div class="row"><textarea class="field" name="notes" rows="2" style="min-height:48px" placeholder="Notes" aria-label="Notes">${esc(t.notes)}</textarea></div>
      </div>
      <div class="fgroup">
        <div class="row"><label class="lbl" for="tc">List</label>
          <select class="field" id="tc" name="category">${CATEGORIES.map(c => `<option ${c === t.category ? 'selected' : ''}>${c}</option>`).join('')}</select>${Icon.chev}</div>
        <div class="row"><label class="lbl" for="td">Due</label><input class="field" id="td" type="date" name="due" value="${esc(t.due)}"></div>
      </div>
      ${isNew ? '' : `<div class="fgroup"><button type="button" class="row danger" data-sheet-delete style="width:100%">Delete task</button></div>`}`,
    onOpen(sh, close) {
      if (isNew) setTimeout(() => $('[name=title]', sh).focus({ preventScroll: true }), 460);
      $('[data-sheet-delete]', sh)?.addEventListener('click', () => { close(null); undoable('Task deleted', s => s.tasks = s.tasks.filter(x => x.id !== t.id)); });
    },
    onSave(d) {
      const data = { title: d.title.trim().slice(0, 200), category: CATEGORIES.includes(d.category) ? d.category : 'Other', due: dateOf(d.due), notes: d.notes.trim() };
      if (isNew) {
        const nt = { id: uid(), created: Date.now(), done: false, ...data };
        ui.justAdded = nt.id;
        commit(s => s.tasks.push(nt));
      } else commit(s => Object.assign(s.tasks.find(x => x.id === t.id), data));
    },
  });
}
