import { $, $$, Icon, esc, sleep } from './util.js';
import { KINDS } from './constants.js';
import { sanitize } from './data.js';
import { commit, state } from './store.js';
import { Swipe } from './nav.js';
import { Desk, MOD } from './desktop.js';

/* =========================================================
   Sheets, action sheets, toasts
   ========================================================= */
export function openSheet({ title, body, saveLabel = 'Save', onSave, onOpen, required = [] }) {
  return new Promise(resolve => {
    Swipe.closeAll();
    const back = document.createElement('div'); back.className = 'backdrop';
    const sh = document.createElement('div'); sh.className = 'sheet';
    sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true'); sh.setAttribute('aria-label', title);
    sh.innerHTML = `
      <div class="sheet-head"><h3>${esc(title)}</h3></div>
      <form class="sheet-body" autocomplete="off" novalidate>${body}<button type="submit" hidden></button></form>
      <div class="sheet-bar">
        <button class="bar-btn ghost" data-sheet="cancel">Cancel<kbd class="dk">esc</kbd></button>
        <button class="bar-btn primary" data-sheet="save">${esc(saveLabel)}<kbd class="dk">${MOD}↩</kbd></button>
      </div>`;
    document.body.append(back, sh);
    const form = $('form', sh), saveBtn = $('[data-sheet=save]', sh);
    const validate = () => { saveBtn.disabled = required.some(n => !String(form.elements[n]?.value || '').trim()); };
    form.addEventListener('input', validate); form.addEventListener('change', validate); validate();

    let closed = false;
    const close = async result => {
      if (closed) return; closed = true; sh._closing = true;
      document.activeElement?.blur?.();
      back.classList.remove('show'); sh.classList.remove('show');
      document.body.classList.remove('sheet-open');
      // hand keyboard focus back to where it was (if that element still exists)
      if (Desk.on() && sh._opener?.isConnected && sh._opener !== document.body) sh._opener.focus({ preventScroll: true });
      await sleep(Desk.on() ? 220 : 480); back.remove(); sh.remove();
      resolve(result);
    };
    const save = () => {
      if (saveBtn.disabled) return;
      const data = Object.fromEntries(new FormData(form).entries());
      if (onSave(data, form) !== false) close(data);
    };
    $('[data-sheet=cancel]', sh).onclick = () => close(null);
    saveBtn.onclick = save;
    form.onsubmit = e => { e.preventDefault(); save(); };
    /* Keyboard flow: Enter moves on to the next thing that still needs filling in, and
       saves once the form is ready. Enter on a choice (type, checkbox, menu) always moves on. */
    const fields = () => $$('input, select, textarea, button.row', form).filter(el =>
      !el.disabled && el.type !== 'hidden' && el.type !== 'submit' && el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden'
      && (el.type !== 'radio' || el.checked)); // a radio group is a single stop
    form.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || e.isComposing) return;
      const t = e.target;
      if (t.tagName === 'TEXTAREA' || t.tagName === 'BUTTON') return;
      const choice = t.tagName === 'SELECT' || t.type === 'radio' || t.type === 'checkbox';
      if (!choice && !saveBtn.disabled) return; // a ready form saves, as before
      e.preventDefault();
      const list = fields(), i = list.indexOf(t);
      const rest = list.slice(i + 1).filter(el => el.tagName !== 'BUTTON');
      const next = rest.find(el => (el.tagName === 'SELECT' || el.tagName === 'INPUT') && el.type !== 'checkbox' && el.type !== 'radio' && !el.value) || rest[0];
      if (next) next.focus();
      else if (!saveBtn.disabled) saveBtn.focus();
    });
    back.onclick = () => close(null);
    sh._close = close;
    sh.addEventListener('keydown', e => { if (e.key === 'Escape') close(null); });
    onOpen?.(sh, close);

    const head = $('.sheet-head', sh);
    let d = null;
    head.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; d = { y: e.clientY, t: performance.now(), dy: 0 }; sh.classList.add('dragging'); head.setPointerCapture(e.pointerId); });
    head.addEventListener('pointermove', e => { if (!d) return; d.dy = Math.max(0, e.clientY - d.y); sh.style.transform = `translateY(${d.dy}px)`; });
    const up = () => {
      if (!d) return; const v = d.dy / (performance.now() - d.t);
      sh.classList.remove('dragging'); sh.style.transform = '';
      if (d.dy > 140 || v > .6) close(null);
      d = null;
    };
    head.addEventListener('pointerup', up); head.addEventListener('pointercancel', up);

    // Move focus into the dialog so the keyboard acts on it, not the list behind it
    const opener = document.activeElement;
    sh.tabIndex = -1;
    if (!sh.contains(document.activeElement)) sh.focus({ preventScroll: true });
    sh._opener = opener;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      back.classList.add('show'); sh.classList.add('show'); document.body.classList.add('sheet-open');
    }));
  });
}

export function actionSheet({ message, actions }) {
  return new Promise(resolve => {
    const back = document.createElement('div'); back.className = 'backdrop top';
    const el = document.createElement('div'); el.className = 'action-sheet'; el.setAttribute('role', 'alertdialog');
    el.innerHTML = `
      <div class="action-group">
        ${message ? `<div class="msg">${esc(message)}</div>` : ''}
        ${actions.map((a, i) => `<button data-i="${i}" class="${a.destructive ? 'destructive' : ''}">${esc(a.label)}</button>`).join('')}
      </div>
      <div class="action-group"><button class="cancel" data-i="-1">Cancel</button></div>`;
    document.body.append(back, el);
    document.body.classList.add('menu-open');
    const close = async v => {
      if (el._closing) return; el._closing = true;
      back.classList.remove('show'); el.classList.remove('show');
      document.body.classList.remove('menu-open');
      await sleep(420); back.remove(); el.remove(); resolve(v);
    };
    back.onclick = () => close(-1);
    el.onclick = e => { const b = e.target.closest('button'); if (b) close(+b.dataset.i); };
    requestAnimationFrame(() => requestAnimationFrame(() => { back.classList.add('show'); el.classList.add('show'); $('.cancel', el).focus({ preventScroll: true }); }));
  });
}
export const confirmDestructive = async (message, label) => (await actionSheet({ message, actions: [{ label, destructive: true }] })) === 0;

export let toastTimer;
export function toast(text, kind = 'ok', action) {
  const t = $('#toast');
  t.innerHTML = `${kind === 'warn' ? Icon.warn : kind === 'undo' ? Icon.trash : Icon.ok}<span>${esc(text)}</span>${action ? `<button class="toast-act">${esc(action.label)}</button>` : ''}`;
  if (action) $('.toast-act', t).onclick = () => { t.classList.remove('show'); action.run(); };
  t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), action ? 5000 : 2400);
}
/* Run a destructive change with an Undo toast that restores the previous data. */
export function undoable(message, fn) {
  const snap = sanitize(JSON.parse(JSON.stringify(state)));
  commit(fn);
  const restore = () => {
    lastUndo = null;
    commit(s => KINDS.forEach(k => { s[k] = snap[k].map(r => ({ ...r })); }));
    toast('Restored');
  };
  lastUndo = { run: restore, until: Date.now() + 60000 }; // also reachable with ⌘Z / Ctrl+Z
  toast(message, 'undo', { label: 'Undo', run: restore });
}
export let lastUndo = null;
