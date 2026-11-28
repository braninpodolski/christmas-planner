// The shared wish list page (wish.html?l=<listId>): anyone with the link sees the list and can claim a wish.
// Visitors sign in anonymously; someone already signed in to Gift Tags on this browser stays themselves.
// Taken wishes show only "Taken", never who: a claim holds just an account id, and the name typed here is
// kept apart where only the list owner's household can read it (never the owner). The rules also refuse
// the owner the claims, though an owner opening their own link signed out would get a fresh account.
import { firebaseConfig, FIREBASE_SDK } from './firebase-config.js';

const $ = id => document.getElementById(id);
const listId = new URLSearchParams(location.search).get('l') || '';
const local = ['localhost', '127.0.0.1'].includes(location.hostname);
const useEmulator = local && new URLSearchParams(location.search).has('emulator');
const NAME_KEY = 'giftTags.wishName';

let F, db, uid = '', list = null, claims = new Map(), asking = '', busy = '';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const money = n => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
const safeURL = u => { try { const x = new URL(u); return ['http:', 'https:'].includes(x.protocol) ? x : null; } catch { return null; } };
const storeName = url => url.hostname.replace(/^www\./, '');
const savedName = () => { try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; } };
const saveName = n => { try { localStorage.setItem(NAME_KEY, n); } catch {} };
const showError = t => { $('err').textContent = t; };

function stop(text) {
  $('lede').textContent = text;
  $('list').replaceChildren();
  $('note').hidden = true;
  $('app').hidden = true;
}

async function boot() {
  if (!/^[a-z0-9]{20,64}$/.test(listId)) return stop('This link doesn’t point to a wish list. Ask for the link again.');
  try {
    const [{ initializeApp }, A, Fs] = await Promise.all(['app', 'auth', 'firestore'].map(m => import(`${FIREBASE_SDK}/firebase-${m}.js`)));
    F = Fs;
    const app = initializeApp(useEmulator ? { ...firebaseConfig, projectId: 'demo-gift-tags' } : firebaseConfig);
    const auth = A.initializeAuth(app, { persistence: [A.indexedDBLocalPersistence, A.browserLocalPersistence] });
    db = F.getFirestore(app);
    if (useEmulator) { A.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true }); F.connectFirestoreEmulator(db, '127.0.0.1', 8181); }
    await new Promise(r => { const un = A.onAuthStateChanged(auth, u => { un(); r(u); }); });
    // A remembered sign-in can go stale (revoked, or a reset test server): drop it and start fresh
    if (auth.currentUser) { try { await auth.currentUser.getIdToken(true); } catch { await A.signOut(auth); } }
    if (!auth.currentUser) await A.signInAnonymously(auth);
    uid = auth.currentUser.uid;
  } catch (e) {
    return stop('Couldn’t reach Gift Tags. Check your connection and reload.');
  }
  F.onSnapshot(F.doc(db, `wishlists/${listId}`), snap => {
    if (!snap.exists()) {
      if (snap.metadata.fromCache) return; // offline: wait for the server rather than call it gone
      list = null; return stop('This wish list isn’t available any more.');
    }
    list = snap.data();
    render();
    if (list.owner !== uid) watchClaims();
  }, () => stop('This wish list isn’t available.'));
}

let watching = false;
function watchClaims() {
  if (watching) return;
  watching = true;
  F.onSnapshot(F.collection(db, `wishlists/${listId}/claims`), snap => {
    claims = new Map(snap.docs.map(d => [d.id, d.data()]));
    render();
  }, () => { watching = false; });
}

function render() {
  if (!list) return;
  const name = String(list.name || '').trim();
  const first = name.split(/\s+/)[0];
  const mine = list.owner === uid;
  document.title = `${first ? `${first}’s wish list` : 'Wish list'} · Gift Tags`;
  $('title').textContent = first ? `${first}’s wish list` : 'Wish list';
  const items = Array.isArray(list.items) ? list.items.filter(w => w && typeof w.id === 'string') : [];
  $('lede').textContent = mine
    ? 'This is your list. Who’s getting what stays hidden from you.'
    : items.length ? `${items.length === 1 ? '1 wish' : `${items.length} wishes`}` : `${first || 'They'} hasn’t added anything yet.`;
  $('note').hidden = mine || !items.length;
  // The app is iPhone and iPad only; "Add to Gift Tags" would do nothing in a computer's browser
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  $('app').hidden = mine || !ios;
  const card = el('div', 'card');
  for (const w of items) card.append(...row(w, mine));
  $('list').replaceChildren(...(items.length ? [card] : []));
}

function row(w, mine) {
  const r = el('div', 'row');
  const what = el('div', 'what');
  what.append(el('div', 'name', String(w.name || 'Wish')));
  const bits = [];
  if (typeof w.price === 'number' && w.price > 0) bits.push(document.createTextNode(money(w.price)));
  const url = safeURL(w.url);
  if (url) { const a = el('a', null, storeName(url)); a.href = url.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; bits.push(a); }
  if (w.notes) bits.push(document.createTextNode(String(w.notes)));
  if (bits.length) {
    const sub = el('div', 'sub');
    bits.forEach((b, i) => { if (i) sub.append(' · '); sub.append(b); });
    what.append(sub);
  }
  r.append(what);
  if (mine) return [r];
  const c = claims.get(w.id);
  if (c && c.uid === uid) {
    what.append(el('div', 'mine', 'You’re getting this'));
    const undo = el('button', 'undo', 'Undo');
    undo.onclick = () => unclaim(w.id);
    r.append(undo);
  } else if (c) {
    r.append(el('span', 'taken', 'Taken'));
  } else {
    const b = el('button', 'claim', busy === w.id ? 'Saving…' : 'I’ll get it');
    b.disabled = busy === w.id;
    b.onclick = () => { if (savedName()) claim(w.id, savedName()); else { asking = w.id; render(); } };
    r.append(b);
  }
  return asking === w.id && !c ? [r, askName(w.id)] : [r];
}

// Asked once, then remembered on this browser
function askName(wishId) {
  const box = el('form', 'ask');
  const id = `name-${wishId}`;
  const label = el('label', null, 'Your name, so the family knows it’s covered');
  label.htmlFor = id;
  const line = el('div', 'line');
  const input = el('input'); input.id = id; input.maxLength = 60; input.autocomplete = 'name'; input.placeholder = 'Aunt Pat';
  const go = el('button', 'go', 'Claim'); go.type = 'submit';
  line.append(input, go);
  box.append(label, line);
  box.onsubmit = e => {
    e.preventDefault();
    const n = input.value.trim();
    if (!n) { showError('Enter your name first.'); input.focus(); return; }
    showError('');
    saveName(n); asking = '';
    claim(wishId, n);
  };
  setTimeout(() => input.focus(), 0);
  return box;
}

async function claim(wishId, name) {
  busy = wishId; showError(''); render();
  try {
    const at = Date.now(), b = F.writeBatch(db);
    b.set(F.doc(db, `wishlists/${listId}/claims/${wishId}`), { uid, at });
    b.set(F.doc(db, `wishlists/${listId}/names/${wishId}`), { uid, name: name.slice(0, 60), at });
    await b.commit();
  } catch {
    showError('Someone just claimed that one.');
  } finally { busy = ''; render(); }
}

async function unclaim(wishId) {
  showError('');
  try {
    const b = F.writeBatch(db);
    b.delete(F.doc(db, `wishlists/${listId}/claims/${wishId}`));
    b.delete(F.doc(db, `wishlists/${listId}/names/${wishId}`));
    await b.commit();
  }
  catch { showError('Couldn’t undo that. Check your connection and try again.'); }
}

$('add').href = `gifttags://wish?l=${listId}`;
boot();
