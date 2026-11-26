import { $, Icon, esc, sleep } from './util.js';
import { commit, isMe, me, needsIdentity, person, setMe, sortedPeople } from './store.js';
import { renderAll } from './nav.js';
import { openSheet, toast } from './sheets.js';
import { personSheet } from './forms.js';
import { Sync } from './sync.js';

/* =========================================================
   Household identity: who is using this device
   ========================================================= */
export const Identity = {
  el: null,
  check() { if (needsIdentity()) this.show(false); else if (this.el && !this.el._manual) this.hide(); },
  show(manual) {
    if (this.el) return;
    const el = document.createElement('div');
    el.className = 'whoami'; el._manual = manual;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'whoami-h');
    const people = sortedPeople();
    el.innerHTML = `
      <div class="whoami-inner">
        <h1 id="whoami-h">Who’s using this device?</h1>
        <p>Gifts that other people are buying for you will stay hidden here.</p>
        <div class="whoami-tags ${people.length > 3 ? 'grid' : ''}">
          ${people.map((p, i) => `<button class="shelf-tag" data-me="${esc(p.id)}" style="animation-delay:${.08 + i * .05}s">
            <span class="tag" style="--c:${p.color}"><span class="nm">${esc(p.name)}</span>${(() => { const sub = isMe(p.id) ? 'This device' : esc(p.relation); const em = p.emoji ? `<span class="em">${esc(p.emoji)}</span>` : ''; return sub || em ? `<span class="sb">${em}${sub}</span>` : ''; })()}</span>
          </button>`).join('')}
        </div>
        ${people.length ? '' : '<p>Add yourself as a person first.</p>'}
        <button class="btn quiet" data-me-add>I’m not on the list</button>
        ${manual ? '<button class="btn quiet" data-me-cancel>Cancel</button>' : ''}
      </div>`;
    document.body.appendChild(el);
    $('#app').setAttribute('inert', ''); $('#dock').setAttribute('inert', '');
    this.el = el;
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-me]');
      if (b) { setMe(b.dataset.me); this.hide(); renderAll(); toast(`Welcome, ${person(me).name}`); return; }
      if (e.target.closest('[data-me-cancel]')) { this.hide(); return; }
      if (e.target.closest('[data-me-add]')) {
        this.hide(true);
        personSheet(null, { onCreated: np => { setMe(np.id); renderAll(); } }).then(() => this.check());
      }
    });
    if (manual) requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
    else el.classList.add('show'); // first launch: cover the app immediately
  },
  async hide(keepGate) {
    const el = this.el; if (!el) return;
    this.el = null;
    el.classList.remove('show');
    $('#app').removeAttribute('inert'); $('#dock').removeAttribute('inert');
    await sleep(420); el.remove();
  },
};

export function shareSheet() {
  return openSheet({
    title: 'Share your list',
    saveLabel: 'Share',
    required: ['me'],
    body: `
      <p class="fnote" style="margin:0 0 20px;font-size:15px;color:var(--text)">Use one list with your household. Each of you sees everything except the gifts the other is buying for you.</p>
      <div class="flabel">Who are you?</div>
      <div class="fgroup">
        <div class="row"><label class="lbl" for="sm">This device</label>
          <select class="field" id="sm" name="me">
            <option value="" selected disabled>Choose</option>
            ${sortedPeople().map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}
          </select>${Icon.chev}</div>
      </div>
      <p class="fnote">Not on the list? Cancel and add yourself as a person first.</p>
      <div class="flabel">Then, on the other phone</div>
      <p class="fnote" style="margin-top:0">
        1. Make sure everyone sharing is on your People list.<br>
        2. Open this app on their phone and go to Settings, then Set up sync.<br>
        3. Paste the same GitHub token you used here. The app asks who they are before it shows anything.<br><br>
        Hiding keeps surprises off each other’s screens. It isn’t encryption, so anyone with the token could still read the raw data on GitHub.
        ${Sync.enabled() ? '' : '<br><br>Sync isn’t on yet. Set it up after this so the other phone can get the list.'}
      </p>`,
    onSave(d) {
      if (!person(d.me)) return false;
      setMe(d.me);
      commit(s => s.household.on = true);
      toast('Sharing is on');
    },
  });
}
