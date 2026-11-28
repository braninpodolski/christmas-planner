/* Wish lists on the website: your own list on your page, someone else's list on its own page, claiming,
   linking a list from another household, and giving a wish back when its gift is deleted. Same flows as the app. */
import { $, $$, Icon, esc, money, num, plural, uid } from './util.js';
import { commit, firstName, isMe, me, occ, occTitle, person, possessive, sortedPeople, state, upcomingOccasions } from './store.js';
import { claimTarget, giftFromWish, storeOf, wishListID, MAX_WISHES } from './wish-core.js';
import { Wishes } from './wishes.js';
import { Cloud } from './cloud.js';
import { Nav } from './nav.js';
import { openSheet, toast, undoable, confirmDestructive } from './sheets.js';
import { Desk } from './desktop.js';

const on = () => Cloud.active() && Wishes.available;
const shareURL = lid => `${location.origin}${location.pathname.replace(/[^/]*$/, '')}wish.html?l=${lid}`;
const sub = w => [w.price !== '' ? money(num(w.price)) : '', storeOf(w.url), w.notes].filter(Boolean);
const busyMsg = () => toast('Still connecting to your household. Try again in a moment.', 'warn');

/* ---------- your own page ---------- */
export function ownWishBlock(p) {
  if (!on()) return `
    <div class="block"><div class="block-head"><h2>Your wish list</h2></div>
      <p class="note">${Cloud.user ? 'Your wish list appears here once your household has loaded.' : 'Sign in (Settings) to keep a wish list and share it with a link. Anyone can open it, no app needed.'}</p></div>`;
  const items = Wishes.wishes(me);
  return `
    <div class="block">
      <div class="block-head"><h2>Your wish list</h2>${items.length ? `<span class="meta">${items.length}</span>` : ''}</div>
      <div class="list wish-own" data-wish-list>
        ${items.map(w => `
          <div class="swipe" data-wish="${esc(w.id)}" ${Desk.on() ? 'draggable="true"' : ''}>
            <div class="swipe-actions"><button data-action="delete-wish" data-id="${esc(w.id)}">Delete</button></div>
            <div class="swipe-content">
              <div class="row tap" data-action="edit-wish" data-id="${esc(w.id)}" data-row="wish" tabindex="0" role="button" aria-label="${esc(w.name)}">
                ${Desk.on() ? '<span class="grip" aria-hidden="true">⋮⋮</span>' : ''}
                <div class="row-main"><div class="row-title">${esc(w.name)}</div>${sub(w).length ? `<div class="row-sub">${esc(sub(w).join(' · '))}</div>` : ''}</div>
              </div>
            </div>
          </div>`).join('')}
        ${items.length < MAX_WISHES ? `<div class="row add wish-add"><span class="plus-dot">${Icon.plus}</span><input class="field" id="wishAdd" placeholder="Add a wish" enterkeyhint="next" autocomplete="off" aria-label="Add a wish">${Desk.on() ? '<kbd class="dk">↩</kbd>' : ''}</div>` : ''}
      </div>
      <div class="list" style="margin-top:12px"><button class="row add" data-action="share-wish"><span class="plus-dot">${Icon.share}</span>Share wish list</button></div>
      <p class="note">${items.length ? 'Type a wish and press Return to add the next one. Click one to add a price, link or note.' : 'Add things you’d like, then share the link. Anyone can open it in a browser and mark what they’re getting.'} You never see who’s getting what.</p>
    </div>`;
}

/* ---------- someone else's page: one quiet row ---------- */
export function wishEntryRow(pid) {
  if (!on() || isMe(pid)) return '';
  const l = Wishes.list(pid);
  if (l) {
    const c = Wishes.claimsFor(pid), taken = l.items.filter(w => c[w.id]).length;
    return `<div class="block"><div class="list"><button class="row" data-action="open-wishlist" data-id="${esc(pid)}" title="Wish list (W)">
      <span class="wish-dot">${Icon.wish}</span>
      <span class="row-main"><span class="row-title">Wish list</span><span class="row-sub">${l.items.length ? plural(l.items.length, 'wish', 'wishes') : 'No wishes yet'}${taken ? ` · ${taken} taken` : ''}${Wishes.isLinked(pid) ? ' · their own list, kept here' : ''}</span></span>
      ${Desk.on() ? '<kbd class="dk">W</kbd>' : ''}${Icon.chev}</button></div></div>`;
  }
  if (Object.values(Cloud.members).includes(pid)) return ''; // a member: their list appears once they start one
  return `<div class="block"><div class="list"><button class="row add" data-action="link-wish" data-person="${esc(pid)}"><span class="plus-dot">${Icon.link}</span>Link a wish list…</button></div></div>`;
}

/* ---------- their wish list, on its own page ---------- */
export const wishListPage = {
  title: r => `${possessive(firstName(person(r.id)))} wish list`,
  largeTitle: true,
  actions: r => Wishes.isLinked(r.id) ? `<button class="nav-btn text glass" data-action="unlink-wish" data-person="${esc(r.id)}">Unlink</button>` : '',
  render(r) {
    const p = person(r.id), l = Wishes.list(r.id);
    if (!p || !l) { setTimeout(() => Nav.top()?._route === r && Nav.pop(), 0); return ''; }
    const c = Wishes.claimsFor(r.id), first = firstName(p);
    const dest = Wishes.destination === 'saved' ? 'saved ideas' : (() => { const t = claimTarget(upcomingOccasions(), r.id, 'next'); return t ? `their next event (${occTitle(occ(t))})` : 'saved ideas, since they have no event coming up'; })();
    if (!l.items.length) return `<div class="empty"><span class="tag xl" style="--c:var(--cranberry)">${Icon.wish}</span><h3>No wishes yet</h3><p>${esc(first)} hasn’t added anything.</p></div>`;
    return `
      <p class="note" style="padding-top:0">${Wishes.isLinked(r.id) ? 'Their own list, kept here. It stays live as they change it.' : `${esc(possessive(first))} list, live.`}</p>
      <div class="list">
        ${l.items.map(w => {
          const cl = c[w.id], who = cl ? Wishes.claimer(cl, r.id) : null;
          const end = !cl ? `<button class="claim-btn" data-action="claim-wish" data-person="${esc(r.id)}" data-id="${esc(w.id)}">I’ll get it</button>`
            : who.you ? `<button class="link" data-action="unclaim-wish" data-person="${esc(r.id)}" data-id="${esc(w.id)}">Not getting it</button>`
            : who.person || who.name ? '' : '<span class="meta">Taken</span>';
          const line = !cl ? '' : who.you ? '<div class="row-sub" style="color:var(--pine)">You’re getting this</div>'
            : who.person ? `<div class="row-sub">${esc(person(who.person)?.name || 'Someone here')} is getting this</div>`
            : who.name ? `<div class="row-sub">${esc(who.name)} is getting this</div>` : '';
          const link = /^https?:\/\//i.test(w.url) ? ` · <a href="${esc(w.url)}" target="_blank" rel="noopener noreferrer">${esc(storeOf(w.url))}</a>` : '';
          const bits = [w.price !== '' ? esc(money(num(w.price))) : '', w.notes ? esc(w.notes) : ''].filter(Boolean).join(' · ');
          return `<div class="row" data-row="claim" data-id="${esc(w.id)}" tabindex="0">
            <div class="row-main"><div class="row-title">${esc(w.name)}</div>${bits || link ? `<div class="row-sub">${bits}${bits ? link : link.slice(3)}</div>` : ''}${line}</div>
            <div class="row-end">${end}</div></div>`;
        }).join('')}
      </div>
      <p class="note">${esc(first)} never sees who’s getting what. A wish you claim goes to ${esc(dest)}. <button class="link" data-action="open-settings">Change</button></p>`;
  },
};

/* ---------- actions ---------- */
function addWish(input) {
  const name = input.value.trim().slice(0, 200);
  if (!name) return;
  if (!on()) return busyMsg();
  const items = [...Wishes.wishes(me), { id: uid(), name, price: '', url: '', notes: '', created: Date.now() }];
  input.value = '';
  Wishes.saveMine(items, person(me)?.name || '').catch(e => toast(e.message || 'Couldn’t save your wish list', 'warn'));
  requestAnimationFrame(() => $('#wishAdd')?.focus({ preventScroll: true }));
}

function wishSheet(w) {
  openSheet({
    title: 'Edit wish', saveLabel: 'Done', required: ['name'],
    body: `
      <div class="fgroup">
        <div class="row"><input class="field big" name="name" value="${esc(w.name)}" aria-label="Wish"></div>
        <div class="row"><label class="lbl" for="wpr">Price</label><input class="field right num" id="wpr" name="price" inputmode="decimal" placeholder="$0" value="${w.price !== '' ? esc(w.price) : ''}"></div>
        <div class="row"><input class="field" name="url" type="url" inputmode="url" placeholder="Link" value="${esc(w.url)}" autocapitalize="off" aria-label="Link"></div>
      </div>
      <div class="fgroup"><div class="row"><textarea class="field" name="notes" placeholder="Note, like size or color" aria-label="Note">${esc(w.notes)}</textarea></div></div>
      <div class="fgroup"><button type="button" class="row danger" data-sheet-delete style="width:100%">Delete wish</button></div>`,
    onOpen(sh, close) { $('[data-sheet-delete]', sh).onclick = () => { close(null); deleteWish(w.id); }; },
    onSave(d) {
      const items = Wishes.wishes(me).map(x => x.id !== w.id ? x : { ...x, name: d.name.trim().slice(0, 200), price: d.price.trim() ? Math.max(0, num(d.price)) : '', url: d.url.trim().slice(0, 2000), notes: d.notes.trim().slice(0, 1000) });
      Wishes.saveMine(items, person(me)?.name || '').catch(e => toast(e.message || 'Couldn’t save', 'warn'));
    },
  });
}

function deleteWish(id) {
  const items = Wishes.wishes(me), w = items.find(x => x.id === id);
  if (!w) return;
  const name = person(me)?.name || '';
  Wishes.saveMine(items.filter(x => x.id !== id), name).then(() => Wishes.clearClaim(id)).catch(e => toast(e.message || 'Couldn’t delete', 'warn'));
  toast(`Deleted “${w.name}”`, 'undo', { label: 'Undo', run: () => Wishes.saveMine(items, name) });
}

async function shareWish() {
  if (!on()) return busyMsg();
  if (!Wishes.myListId) await Wishes.saveMine([], person(me)?.name || '');
  const url = shareURL(Wishes.myListId);
  const text = 'Here’s my wish list. Tap “I’ll get it” on anything you’re getting, so nobody doubles up.';
  if (!Desk.on() && navigator.share) { try { await navigator.share({ title: 'My wish list', text, url }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(url); toast('Link copied. Paste it into a message or email.'); }
  catch { prompt('Copy your wish list link:', url); }
}

function claimWish(pid, wishId) {
  if (!on()) return busyMsg();
  const w = Wishes.wishes(pid).find(x => x.id === wishId); if (!w) return;
  const target = claimTarget(upcomingOccasions(), pid, Wishes.destination);
  const g = giftFromWish(w, pid, me, target, uid());
  const drop = () => commit(s => { s.gifts = s.gifts.filter(x => x.id !== g.id); });
  commit(s => { s.gifts.push(g); });
  Wishes.claim(wishId, pid, g.id).catch(() => { drop(); toast(`Someone else just claimed ${w.name}.`, 'warn'); });
  toast(`Added to ${target ? occTitle(occ(target)) : 'saved ideas'}`, 'ok', { label: 'Undo', run: () => { Wishes.unclaim(wishId, pid); drop(); } });
}

// Its planned gift goes too while it's still an idea; once ordered or made, it stays on your board
function unclaimWish(pid, wishId) {
  const w = Wishes.wishes(pid).find(x => x.id === wishId);
  const c = Wishes.claimsFor(pid)[wishId];
  Wishes.unclaim(wishId, pid);
  const g = c?.gift && state.gifts.find(x => x.id === c.gift);
  if (g && g.status === 'idea') { commit(s => { s.gifts = s.gifts.filter(x => x.id !== g.id); }); toast(`You’re not getting ${w?.name || 'it'}`); }
  else toast(g ? `You’re not getting ${w?.name || 'it'}. The gift stays on your board.` : `You’re not getting ${w?.name || 'it'}`);
}

/* Deleting a gift that came from claiming a wish gives the wish back, so someone else can get it.
   Undo brings back both; "Keep claim" keeps the wish yours without the gift. */
export function deleteGift(g) {
  const c = on() ? Wishes.myClaim(g.id) : null;
  if (!c) return undoable(`Deleted “${g.title}”`, s => { s.gifts = s.gifts.filter(x => x.id !== g.id); });
  Wishes.unclaim(c.wishId, c.pid);
  undoable(`Deleted “${g.title}”. ${possessive(firstName(person(c.pid)))} wish is open again.`, s => { s.gifts = s.gifts.filter(x => x.id !== g.id); }, {
    onUndo: () => Wishes.claim(c.wishId, c.pid, g.id).catch(() => {}),
    secondary: { label: 'Keep claim', run: () => Wishes.claim(c.wishId, c.pid, '').then(() => toast(`You’re still getting ${g.title}`)).catch(() => toast(`Someone else just claimed ${g.title}.`, 'warn')) },
  });
}

/* ---------- linking someone's list ---------- */
export function linkSheet({ pid = '', text = '' } = {}) {
  if (!on()) return busyMsg();
  let found = null, sheet;
  const taken = new Set(Object.values(Cloud.members));
  const eligible = () => sortedPeople().filter(p => !isMe(p.id) && !taken.has(p.id) && !Wishes.own[p.id]);
  const out = () => $('[data-out]', sheet), err = t => { $('[data-err]', sheet).textContent = t; };
  const choose = () => {
    if (!found) { out().innerHTML = ''; return; }
    const key = n => n.trim().toLowerCase();
    const match = eligible().find(p => key(p.name) === key(found.name))?.id;
    const pick = pid || match || 'new';
    out().innerHTML = `
      <p class="fnote" style="margin-top:0">${esc(found.name ? possessive(firstName({ name: found.name })) : 'Their')} wish list · ${plural(found.items.length, 'wish', 'wishes')}. Keep it on:</p>
      <div class="fgroup">
        ${eligible().map(p => `<label class="row"><input type="radio" name="pid" value="${esc(p.id)}" ${p.id === pick ? 'checked' : ''}><span class="row-main">${esc(p.name)}</span>${p.id === match ? '<span class="meta">Matches</span>' : ''}</label>`).join('')}
        <label class="row"><input type="radio" name="pid" value="new" ${pick === 'new' ? 'checked' : ''}><span class="row-main">New person: ${esc(found.name || 'Unnamed')}</span></label>
      </div>
      <p class="fnote">It stays live: when they change it, it changes here. You can claim wishes, and nobody outside your household sees who.</p>`;
  };
  const load = async v => {
    found = null; err(''); choose();
    const lid = wishListID(v); if (!lid) { if (v.trim()) err('That doesn’t look like a wish list link.'); return; }
    if (Object.values(Wishes.pointers).includes(lid)) { err('That wish list is already in your household.'); return; }
    try { found = await Wishes.fetch(lid); } catch { found = null; }
    if (!found) { err('Couldn’t find that wish list. Ask for the link again.'); return; }
    if (found.owner === Wishes.uid) { found = null; err('That’s your own wish list.'); return; }
    choose();
  };
  openSheet({
    title: 'Link a wish list', saveLabel: 'Link', required: ['link'],
    body: `
      <div class="fgroup"><div class="row"><input class="field" name="link" placeholder="Paste their wish list link" autocapitalize="off" autocorrect="off" spellcheck="false" value="${esc(text)}" aria-label="Wish list link"></div></div>
      <p class="fnote">Open their wish list link and copy it, or have them send it to you.</p>
      <div data-out></div>
      <p class="fnote" data-err role="alert" style="color:var(--cranberry);min-height:1.2em"></p>`,
    onOpen(sh) {
      sheet = sh;
      const input = $('[name=link]', sh);
      let t; input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => load(input.value), 250); });
      if (text) load(text); else setTimeout(() => input.focus(), 300);
    },
    onSave(d) {
      if (!found) return false;
      let target = d.pid;
      if (!target || target === 'new') {
        const p = Cloud.newPerson(found.name || 'Unnamed');
        commit(s => { s.people.push(p); });
        target = p.id;
      }
      Wishes.link(found.id, target).catch(e => toast(e.message || 'Couldn’t link it', 'warn'));
      toast(`Linked ${possessive(firstName(person(target)))} wish list`);
    },
  });
}

export const WishActions = {
  'edit-wish': el => { const w = Wishes.wishes(me).find(x => x.id === el.dataset.id); if (w) wishSheet(w); },
  'delete-wish': el => deleteWish(el.dataset.id),
  'share-wish': () => shareWish(),
  'open-wishlist': el => { Wishes.refreshClaims(el.dataset.id); Nav.push({ name: 'wishlist', id: el.dataset.id }); },
  'claim-wish': el => claimWish(el.dataset.person, el.dataset.id),
  'unclaim-wish': el => unclaimWish(el.dataset.person, el.dataset.id),
  'link-wish': el => linkSheet({ pid: el.dataset.person }),
  'unlink-wish': async el => {
    const p = person(el.dataset.person);
    if (!await confirmDestructive(`Unlink ${possessive(firstName(p))} wish list? It stays theirs; your household just stops keeping it here. Gifts you planned from it stay.`, 'Unlink')) return;
    Wishes.unlink(el.dataset.person).catch(() => {});
    if (Nav.top()?._route.name === 'wishlist') Nav.pop();
  },
  'delete-account': () => import('./account.js').then(m => m.deleteAccountSheet()),
};

/* W on someone's page opens their wish list */
export function wishKey() {
  const r = Nav.top()?._route;
  if (r?.name !== 'person' || isMe(r.id) || !on()) return false;
  if (Wishes.list(r.id)) WishActions['open-wishlist']({ dataset: { id: r.id } });
  else if (!Object.values(Cloud.members).includes(r.id)) linkSheet({ pid: r.id });
  return true;
}

/* ---------- typing, pasting and dragging ---------- */
document.addEventListener('keydown', e => {
  if (e.target.id === 'wishAdd' && e.key === 'Enter' && !e.isComposing) { e.preventDefault(); addWish(e.target); }
});
document.addEventListener('change', e => {
  if (e.target.id === 'claimDest') { Wishes.destination = e.target.value; toast(e.target.value === 'saved' ? 'Claimed wishes go to saved ideas' : 'Claimed wishes go to their next event'); }
});
// Paste a wish list link anywhere (not in a text box) to link it
document.addEventListener('paste', e => {
  if (e.target.closest?.('input, textarea, [contenteditable="true"]') || $$('.sheet').some(s => !s._closing)) return;
  const text = e.clipboardData?.getData('text') || '';
  if (!/wish\.html\?l=|gifttags:\/\/wish/.test(text) || !wishListID(text)) return;
  e.preventDefault();
  const r = Nav.top()?._route;
  linkSheet({ text, pid: r?.name === 'person' && !isMe(r.id) ? r.id : '' });
});
// Drag to reorder your own list (desktop)
let dragId = '';
document.addEventListener('dragstart', e => {
  const row = e.target.closest?.('[data-wish]'); if (!row) return;
  dragId = row.dataset.wish; row.classList.add('wish-dragging');
  e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId);
});
document.addEventListener('dragover', e => {
  const row = e.target.closest?.('[data-wish]'); if (!dragId || !row) return;
  e.preventDefault();
  const r = row.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2;
  $$('.wish-drop-before, .wish-drop-after').forEach(x => x.classList.remove('wish-drop-before', 'wish-drop-after'));
  row.classList.add(after ? 'wish-drop-after' : 'wish-drop-before');
});
document.addEventListener('drop', e => {
  const row = e.target.closest?.('[data-wish]'); if (!dragId || !row) return;
  e.preventDefault();
  const after = row.classList.contains('wish-drop-after');
  const items = Wishes.wishes(me), from = items.findIndex(w => w.id === dragId);
  if (from < 0) return;
  const [moved] = items.splice(from, 1);
  let to = items.findIndex(w => w.id === row.dataset.wish);
  if (to < 0) to = items.length; else if (after) to++;
  items.splice(to, 0, moved);
  Wishes.saveMine(items, person(me)?.name || '').catch(() => {});
});
document.addEventListener('dragend', () => {
  dragId = '';
  $$('.wish-dragging, .wish-drop-before, .wish-drop-after').forEach(x => x.classList.remove('wish-dragging', 'wish-drop-before', 'wish-drop-after'));
});
