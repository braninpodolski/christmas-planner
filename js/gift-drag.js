import { $, $$ } from './util.js';
import { fmtDate } from './dates.js';
import { commit, occ, occTitle, person, state, statusIndex } from './store.js';
import { Nav, Swipe } from './nav.js';
import { actionSheet, toast, undoable } from './sheets.js';

/* =========================================================
   Moving gifts between events (and back to saved ideas)
   ========================================================= */
// A gift can go to any event except someone else's birthday.
export const giftKey = g => (Number.isFinite(g.order) ? g.order : statusIndex(g.status) * 1e13 + (g.created || 0));
export const byGiftOrder = (a, b) => giftKey(a) - giftKey(b);
export const byPersonThenOrder = (a, b) => (person(a.personId)?.name || '').localeCompare(person(b.personId)?.name || '') || byGiftOrder(a, b);
export function canDrop(g, occId) {
  if (!occId) return true;
  const o = occ(occId);
  if (!o) return false;
  return o.type !== 'birthday' || o.people[0] === g.personId;
}
export function moveGift(id, toOcc, order) {
  const g = state.gifts.find(x => x.id === id);
  const same = (g?.occasionId || '') === toOcc;
  if (!g || (same && order === undefined) || !canDrop(g, toOcc)) return;
  const o = toOcc ? occ(toOcc) : null;
  const apply = s => {
    const gg = s.gifts.find(x => x.id === id);
    gg.occasionId = toOcc;
    if (order !== undefined) gg.order = order;
    const oo = toOcc && s.occasions.find(x => x.id === toOcc);
    if (oo && !oo.people.includes(gg.personId)) oo.people.push(gg.personId); // planning for someone adds them
  };
  if (same) commit(apply); // a reorder is easy to redo by hand, so no toast
  else undoable(`Moved to ${o ? occTitle(o) : 'saved ideas'}`, apply);
}
export async function moveGiftPicker(id) {
  const g = state.gifts.find(x => x.id === id); if (!g) return;
  const opts = [{ id: '', label: 'Saved ideas' }, ...upcomingOccasions().map(o => ({ id: o.id, label: `${occTitle(o)}, ${fmtDate(o.date)}` }))]
    .filter(o => o.id !== (g.occasionId || '') && canDrop(g, o.id)).slice(0, 8);
  if (!opts.length) { toast('There’s nowhere else to move this gift', 'warn'); return; }
  const i = await actionSheet({ message: `Move “${g.title}” to`, actions: opts.map(o => ({ label: o.label })) });
  if (i >= 0) moveGift(id, opts[i].id);
}

/* Drag a gift onto another event: long-press on touch, click-and-drag with a mouse. */
export const GiftDrag = (() => {
  let s = null, suppressClick = false, raf = 0;
  const LONG_PRESS = 380, SLOP = 8;
  const page = () => Nav.top();
  const rowsOf = list => $$(':scope > .swipe', list).filter(w => w !== s.src);
  const giftOf = w => state.gifts.find(x => x.id === $('[data-row]', w)?.dataset.id);
  const begin = () => {
    s.started = true;
    const r = s.row.getBoundingClientRect();
    const ghost = s.row.cloneNode(true);
    ghost.classList.add('drag-ghost');
    ghost.removeAttribute('data-row'); ghost.removeAttribute('tabindex'); ghost.setAttribute('aria-hidden', 'true');
    ghost.style.cssText = `width:${r.width}px;left:${r.left}px;top:${r.top}px`;
    document.body.appendChild(ghost);
    s.ghost = ghost; s.r0 = r;
    s.src = s.row.closest('.swipe');
    s.h = s.src.offsetHeight;
    s.home = s.src.parentElement; s.homeIdx = $$(':scope > .swipe', s.home).indexOf(s.src);
    // the row folds away while a gap opens in its place, so it reads as being lifted out
    s.src.style.height = s.h + 'px'; s.src.classList.add('drag-src');
    requestAnimationFrame(() => { if (s?.src) s.src.style.height = '0px'; });
    document.body.classList.add('dragging-gift');
    $$('[data-drop]', page()).forEach(t => t.classList.toggle('drop-ok', canDrop(s.g, t.dataset.drop)));
    s.scroller = s.row.closest('.scroll');
    navigator.vibrate?.(10);
    Swipe.closeAll();
    hit();
    const tick = () => { if (!s?.started) return; autoscroll(); hit(); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
  };
  /* Where the gift would go in a list. Rows are measured as if no gap were open (and the dragged
     row were gone), so the answer doesn't flicker while things slide around. */
  const indexIn = list => {
    const rows = rowsOf(list);
    const phantoms = [...$$('.drop-gap', page()), s.src].map(el => [el, el.getBoundingClientRect().height]);
    const mids = rows.map(w => {
      const r = w.getBoundingClientRect();
      let shift = 0;
      for (const [el, h] of phantoms) if (el.compareDocumentPosition(w) & Node.DOCUMENT_POSITION_FOLLOWING) shift += h;
      return r.top - shift + r.height / 2;
    });
    let i = mids.filter(m => m < s.cy).length;
    if (list.dataset.sort === 'person') { // the Gifts tab keeps each person's gifts together
      const mine = rows.map((w, k) => giftOf(w)?.personId === s.g.personId ? k : -1).filter(k => k >= 0);
      if (mine.length) i = Math.min(Math.max(i, mine[0]), mine[mine.length - 1] + 1);
      else { const name = person(s.g.personId)?.name || ''; const k = rows.findIndex(w => (person(giftOf(w)?.personId)?.name || '').localeCompare(name) > 0); i = k < 0 ? rows.length : k; }
    }
    return i;
  };
  const hit = () => {
    const el = document.elementFromPoint(s.cx, s.cy)?.closest('[data-drop]');
    const ok = el && el.classList.contains('drop-ok') ? el : null;
    if (ok !== s.over) { s.over?.classList.remove('drop-over'); ok?.classList.add('drop-over'); s.over = ok; }
    const list = ok && $('.list', ok);
    const idx = list ? indexIn(list) : -1;
    if (ok !== s.gapIn || idx !== s.idx) { s.idx = idx; s.gapIn = ok; openGap(ok, list, idx); }
  };
  const closeGap = gap => {
    if (!gap) return;
    gap.style.height = '0px';
    gap.addEventListener('transitionend', () => gap.remove(), { once: true });
    setTimeout(() => gap.remove(), 400);
  };
  // The old gap folds shut while the new one opens, so the rows in between slide instead of jumping.
  const openGap = (target, list, idx) => {
    closeGap(s.gap); s.gap = null;
    if (!target) return;
    const gap = document.createElement('div'); gap.className = 'drop-gap'; gap.setAttribute('aria-hidden', 'true');
    if (list) list.insertBefore(gap, rowsOf(list)[idx] || $(':scope > .row.add', list) || null);
    else target.appendChild(gap);
    s.gap = gap;
    gap.offsetHeight; // start from 0 so it animates open
    gap.style.height = s.h + 'px';
  };
  const autoscroll = () => {
    if (!s.scroller) return;
    const r = s.scroller.getBoundingClientRect();
    const top = r.top + 90, bottom = r.bottom - 130;
    if (s.cy < top) s.scroller.scrollTop -= Math.min(14, (top - s.cy) / 4);
    else if (s.cy > bottom) s.scroller.scrollTop += Math.min(14, (s.cy - bottom) / 4);
  };
  // The order number that puts the gift between its new neighbours (only the same person's gifts count)
  const orderAt = (list, idx) => {
    if (!list) return undefined;
    const rows = rowsOf(list).map(giftOf);
    const mine = g => g && g.personId === s.g.personId;
    const prev = rows.slice(0, idx).reverse().find(mine), next = rows.slice(idx).find(mine);
    if (prev && next) return (giftKey(prev) + giftKey(next)) / 2;
    if (prev) return giftKey(prev) + 60000;
    if (next) return giftKey(next) - 60000;
    return undefined;
  };
  const end = drop => {
    if (!s) return;
    clearTimeout(s.timer); cancelAnimationFrame(raf);
    if (s.started && drop) hit(); // check the spot under the pointer at the moment of release
    const st = s;
    if (!st.started) { s = null; return; }
    const target = drop ? st.over : null;
    const list = target && $('.list', target);
    const toOcc = target?.dataset.drop;
    const unchanged = target && list === st.home && st.idx === st.homeIdx;
    const order = target && !unchanged ? orderAt(list, st.idx) : undefined;
    s = null;
    suppressClick = true; setTimeout(() => { suppressClick = false; }, 50);
    document.body.classList.remove('dragging-gift');
    $$('.drop-ok, .drop-over').forEach(t => t.classList.remove('drop-ok', 'drop-over'));
    const restoreSrc = () => {
      st.src.style.height = st.h + 'px';
      setTimeout(() => { st.src.classList.remove('drag-src'); st.src.style.height = ''; }, 260);
    };
    if (target && !unchanged && (toOcc !== (st.g.occasionId || '') || order !== undefined)) {
      // settle the gift into its gap, then save
      const g = st.gap.getBoundingClientRect();
      st.ghost.style.transition = 'transform .2s var(--ease), box-shadow .2s';
      st.ghost.style.transform = `translate(${g.left - st.r0.left}px, ${g.top - st.r0.top}px)`;
      setTimeout(() => {
        st.ghost.remove(); moveGift(st.g.id, toOcc, order);
        if (st.src.isConnected) { st.gap?.remove(); st.src.classList.remove('drag-src'); st.src.style.height = ''; } // nothing changed after all
      }, 200);
    } else if (target && st.gap) { // dropped back where it was
      const g = st.gap.getBoundingClientRect();
      st.ghost.style.transition = 'transform .2s var(--ease)';
      st.ghost.style.transform = `translate(${g.left - st.r0.left}px, ${g.top - st.r0.top}px)`;
      setTimeout(() => { st.ghost.remove(); st.gap?.remove(); st.src.style.transition = 'none'; st.src.style.height = ''; st.src.classList.remove('drag-src'); st.src.offsetHeight; st.src.style.transition = ''; }, 200);
    } else { // glide back to where it came from
      closeGap(st.gap); restoreSrc();
      st.ghost.style.transition = 'transform .25s var(--ease), opacity .25s';
      st.ghost.style.transform = 'none'; st.ghost.style.opacity = '0';
      setTimeout(() => st.ghost.remove(), 260);
    }
  };
  document.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    if (s) end(false); // a release we never saw (e.g. outside the window) must not block the next drag
    const row = e.target.closest('[data-row="gift"]');
    if (!row || e.target.closest('button, a, input, select, textarea') || !row.closest('[data-drop]')) return;
    const g = state.gifts.find(x => x.id === row.dataset.id); if (!g) return;
    s = { row, g, x: e.clientX, y: e.clientY, cx: e.clientX, cy: e.clientY, type: e.pointerType, started: false };
    if (e.pointerType !== 'mouse') s.timer = setTimeout(() => { if (s && !s.started) begin(); }, LONG_PRESS);
  });
  document.addEventListener('pointermove', e => {
    if (!s) return;
    s.cx = e.clientX; s.cy = e.clientY;
    const dist = Math.hypot(e.clientX - s.x, e.clientY - s.y);
    if (!s.started) {
      if (s.type === 'mouse') { if (dist > 6 && (e.buttons & 1)) begin(); else return; }
      else { if (dist > SLOP) { clearTimeout(s.timer); s = null; } return; } // moved before the long-press: it's a scroll or swipe
    }
    s.ghost.style.transform = `translate(${e.clientX - s.x}px, ${e.clientY - s.y}px) scale(1.03)`;
  });
  document.addEventListener('pointerup', () => end(true));
  document.addEventListener('pointercancel', () => end(false));
  document.addEventListener('touchmove', e => { if (s?.started) e.preventDefault(); }, { passive: false }); // no scrolling mid-drag
  document.addEventListener('keydown', e => { if (s?.started && e.key === 'Escape') { e.stopPropagation(); end(false); } }, true);
  document.addEventListener('click', e => { if (suppressClick) { e.stopPropagation(); e.preventDefault(); suppressClick = false; } }, true);
  document.addEventListener('contextmenu', e => { if (s) e.preventDefault(); });
  return { active: () => !!s?.started };
})();
