import { $, $$, Icon, esc, nextFrame, sleep } from './util.js';
import { isMe, ui } from './store.js';
import { Pages, TABS } from './pages.js';
import { GiftDrag } from './gift-drag.js';
import { Identity } from './identity.js';
import { Desk } from './desktop.js';

/* =========================================================
   Navigation
   ========================================================= */
export const Nav = {
  current: 'home',
  stacks: {},
  init() {
    const tabsEl = $('#tabs');
    TABS.forEach(t => {
      const el = document.createElement('section');
      el.className = 'tab'; el.dataset.tab = t.id;
      tabsEl.appendChild(el);
      this.stacks[t.id] = [];
      this.mount(t.id, { name: t.root });
    });
    $('#capsule').insertAdjacentHTML('beforeend', TABS.map(t => `<button data-action="tab" data-tab="${t.id}" aria-label="${t.label}">${Icon[t.icon]}<span>${t.label}</span></button>`).join(''));
    $('#fab').innerHTML = Icon.plus;
    let saved = null; try { saved = sessionStorage.getItem('xmas-tab'); } catch {}
    this.switchTab(TABS.some(t => t.id === saved) ? saved : 'home', true);
  },
  tabEl(id) { return $(`.tab[data-tab="${id}"]`); },
  top() { const s = this.stacks[this.current]; return s[s.length - 1]; },
  mount(tabId, route) {
    const el = createPage(route, this.stacks[tabId]);
    this.tabEl(tabId).appendChild(el);
    this.stacks[tabId].push(el);
    return el;
  },
  switchTab(id, instant) {
    if (id === this.current && !instant) {
      if (this.stacks[id].length > 1) this.popToRoot();
      else $('.scroll', this.top())?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    this.current = id;
    try { sessionStorage.setItem('xmas-tab', id); } catch {}
    // Freshen the incoming screen before it shows (only if data changed while it was hidden)
    const top = this.top();
    if (top._dirty) updatePage(top);
    clearTimeout(this._parkT);
    $$('.tab').forEach(t => {
      const on = t.dataset.tab === id;
      t.classList.toggle('active', on);
      if (on) t.classList.remove('parked');
    });
    // Once the cross-fade ends, stop the browser from styling/laying out hidden tabs
    this._parkT = setTimeout(() => $$('.tab:not(.active)').forEach(t => t.classList.add('parked')), 220);
    const idx = TABS.findIndex(t => t.id === id);
    $('#capsule').style.setProperty('--i', idx);
    $$('#capsule button').forEach(b => { const on = b.dataset.tab === id; b.classList.toggle('active', on); on ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'); });
    updateFab();
  },
  async push(route) {
    const stack = this.stacks[this.current];
    const prev = stack[stack.length - 1];
    const el = this.mount(this.current, route);
    updateFab();
    el.classList.add('offright');
    await nextFrame();
    el.classList.add('anim', 'edge-shadow'); prev.classList.add('anim');
    el.classList.remove('offright');
    prev.classList.add('under');
    await sleep(500);
    el.classList.remove('anim', 'edge-shadow'); prev.classList.remove('anim');
  },
  async pop() {
    const stack = this.stacks[this.current];
    if (stack.length < 2) return;
    const el = stack.pop();
    const prev = stack[stack.length - 1];
    if (prev._dirty) updatePage(prev);
    updateFab();
    el.classList.add('anim', 'edge-shadow'); prev.classList.add('anim');
    el.style.transform = ''; prev.style.transform = '';
    await nextFrame();
    el.classList.add('offright');
    prev.classList.remove('under');
    await sleep(500);
    el.remove(); prev.classList.remove('anim');
  },
  popToRoot() {
    const stack = this.stacks[this.current];
    while (stack.length > 2) stack.splice(1, 1)[0].remove();
    this.pop();
  },
};

export function updateFab() {
  const r = Nav.top()?._route;
  $('#fab').classList.toggle('hidden', !r || r.name === 'settings' || (r.name === 'person' && isMe(r.id)));
  if (typeof Desk !== 'undefined') Desk.render();
}

export function createPage(route, stack) {
  const el = document.createElement('div');
  el.className = 'page';
  el._route = route;
  el._depth = stack.length;
  el._stack = stack;
  el.innerHTML = `
    <header class="navbar"><div class="nav-left"></div><div class="nav-title"></div><div class="nav-right"></div></header>
    <div class="scroll"><div class="content"></div></div>`;
  const scroll = $('.scroll', el), bar = $('.navbar', el);
  const def = Pages[route.name];
  // Read scroll position at most once per frame and touch the DOM only when a state flips,
  // so scrolling never triggers style work on frames where nothing changes.
  let ticking = false, wasScrolled = false, wasCollapsed = false;
  const collapseAt = def.collapseAt || 40;
  scroll.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const y = scroll.scrollTop;
      const sc = y > 2, co = y > collapseAt;
      if (sc !== wasScrolled) { wasScrolled = sc; bar.classList.toggle('scrolled', sc); }
      if (co !== wasCollapsed) { wasCollapsed = co; bar.classList.toggle('collapsed', co); }
    });
  }, { passive: true });
  updatePage(el);
  return el;
}

export function updatePage(el) {
  if (!el) return;
  const r = el._route, def = Pages[r.name];
  const title = def.title(r);
  const stack = el._stack || [];
  const depth = el._depth;
  const prev = depth > 0 ? stack[depth - 1] : null;
  const prevTitle = prev ? Pages[prev._route.name].title(prev._route) : '';
  $('.nav-title', el).textContent = title;
  $('.nav-left', el).innerHTML = depth > 0 ? `<button class="nav-btn back glass" data-action="back" aria-label="Back to ${esc(prevTitle)}">${Icon.back}</button>` : '';
  $('.nav-right', el).innerHTML = def.actions ? def.actions(r) : '';
  // Keep keyboard selection across re-renders (the row is rebuilt, so refocus its replacement)
  const f = document.activeElement?.closest?.('[data-row]');
  const fKey = f && el.contains(f) ? `[data-row="${f.dataset.row}"][data-id="${CSS.escape(f.dataset.id || '')}"]` : null;
  $('.content', el).innerHTML = (def.largeTitle === false ? '' : `<h1 class="large-title">${esc(title)}</h1>`) + def.render(r);
  if (fKey) $(fKey, el)?.focus({ preventScroll: true });
  el._dirty = false;
}

/* Re-render only what's on screen: the top page of the current tab. Everything else is
   marked stale and refreshed just before it becomes visible (tab switch, back, edge swipe). */
export function renderAll() {
  Identity.check();
  const visible = Nav.top();
  Object.values(Nav.stacks).flat().forEach(p => { if (p === visible) updatePage(p); else p._dirty = true; });
  ui.justAdded = null;
  Desk.render();
}

/* Edge swipe to go back */
(() => {
  let s = null;
  document.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' || e.clientX > 24) return;
    const stack = Nav.stacks[Nav.current];
    if (stack.length < 2 || document.body.classList.contains('sheet-open')) return;
    s = { x: e.clientX, y: e.clientY, el: stack[stack.length - 1], prev: stack[stack.length - 2], active: false, t: performance.now() };
    if (s.prev._dirty) updatePage(s.prev); // the page underneath is revealed by the swipe
  });
  document.addEventListener('pointermove', e => {
    if (!s) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (!s.active) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { s = null; return; }
      if (dx < 8) return;
      s.active = true; s.el.classList.add('edge-shadow');
    }
    const x = Math.max(0, dx);
    s.el.style.transform = `translateX(${x}px)`;
    s.prev.style.transform = `translateX(${-28 + (x / innerWidth) * 28}%)`;
  });
  const end = async e => {
    if (!s) return;
    const st = s; s = null;
    if (!st.active) return;
    const dx = e.clientX - st.x;
    const v = dx / Math.max(1, performance.now() - st.t);
    if (dx > innerWidth * .4 || v > .5) Nav.pop();
    else {
      st.el.classList.add('anim'); st.prev.classList.add('anim');
      st.el.style.transform = ''; st.prev.style.transform = '';
      await sleep(500);
      st.el.classList.remove('anim', 'edge-shadow'); st.prev.classList.remove('anim');
    }
  };
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);
})();

/* Swipe-to-delete rows */
export const Swipe = (() => {
  let s = null, open = null, suppressClick = false;
  const width = c => c.parentElement.querySelector('.swipe-actions')?.scrollWidth || 88; // one or more buttons
  const close = (c = open) => {
    if (!c) return; c.classList.add('snap'); c.style.transform = ''; if (c === open) open = null;
    // hide the delete button again once the row has slid shut
    setTimeout(() => { if (c !== open && !c.style.transform) c.parentElement?.classList.remove('swiping'); }, 450);
  };
  document.addEventListener('pointerdown', e => {
    const c = e.target.closest('.swipe-content');
    if (open && c !== open && !e.target.closest('.swipe-actions')) { close(); suppressClick = true; }
    if (!c || e.clientX < 24 || (e.pointerType === 'mouse' && Desk.on())) return; // desktop layout has a hover delete button
    const W = width(c);
    s = { c, W, x: e.clientX, y: e.clientY, base: c === open ? -W : 0, active: false };
  });
  document.addEventListener('pointermove', e => {
    if (!s) return;
    if (GiftDrag.active()) { s = null; return; }
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (!s.active) {
      if (Math.abs(dy) > 8) { s = null; return; }
      if (Math.abs(dx) < 10) return;
      s.active = true; s.c.classList.remove('snap'); s.c.parentElement.classList.add('swiping');
    }
    let x = Math.min(0, s.base + dx);
    if (x < -s.W) x = -s.W - (Math.abs(x) - s.W) * .3;
    s.c.style.transform = `translateX(${x}px)`;
    s.x2 = x;
  });
  const end = () => {
    if (!s) return;
    const st = s; s = null;
    if (!st.active) return;
    suppressClick = true;
    st.c.classList.add('snap');
    if (st.x2 < -st.W / 2) { st.c.style.transform = `translateX(${-st.W}px)`; open = st.c; }
    else close(st.c);
  };
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);
  document.addEventListener('click', e => {
    if (suppressClick) { suppressClick = false; if (!e.target.closest('.swipe-actions')) { e.stopPropagation(); e.preventDefault(); } }
  }, true);
  return { closeAll: () => close() };
})();
