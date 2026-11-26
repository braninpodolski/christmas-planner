// Phase 0 sign-in test. Throwaway: checks which sign-in methods and offline behaviour work on each device.
import { firebaseConfig, FIREBASE_SDK } from '../js/firebase-config.js';
const { initializeApp } = await import(`${FIREBASE_SDK}/firebase-app.js`);
const A = await import(`${FIREBASE_SDK}/firebase-auth.js`);
const F = await import(`${FIREBASE_SDK}/firebase-firestore.js`);

const $ = s => document.querySelector(s);
const store = { get(k, d) { try { return JSON.parse(localStorage.getItem('gt-spike-' + k)) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem('gt-spike-' + k, JSON.stringify(v)); } catch {} } };

// ---------- this device ----------
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const ua = navigator.userAgent;
const platform = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'iPad' : /Mac/.test(ua) ? 'Mac' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : 'Other';
const browser = /Edg\//.test(ua) ? 'Edge' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
const label = `${platform} · ${standalone ? 'Home Screen app' : browser}`;
let deviceId = store.get('device'); if (!deviceId) { deviceId = Math.random().toString(36).slice(2, 10); store.set('device', deviceId); }
$('#device').textContent = label;
$('#ua').textContent = ua;

// ---------- results ----------
const CHECKS = [
  ['emailUp', 'Create an account with email'],
  ['emailIn', 'Sign in with email'],
  ['popup', 'Google sign-in (popup)'],
  ['redirect', 'Google sign-in (redirect)'],
  ['persist', 'Still signed in after reopening'],
  ['cloud', 'Save to the cloud and read it back'],
  ['offlineSave', 'Save a note while offline'],
  ['offlineReopen', 'Reopen while offline and still see it'],
  ['offlineSync', 'Offline note reaches the cloud later'],
];
const results = store.get('results', {});
let user = null, db = null;
function set(key, state, detail = '') {
  results[key] = { state, detail, at: new Date().toISOString() };
  store.set('results', results); draw(); mirror();
}
function draw() {
  $('#results').innerHTML = CHECKS.map(([k, name]) => {
    const r = results[k]; const st = r?.state || 'todo';
    const mark = { ok: '✓', bad: '✗', wait: '…', todo: '–' }[st];
    return `<li class="${st}"><span class="mark">${mark}</span><span>${name}${r?.detail ? `<span class="detail">${r.detail.replace(/[<>&]/g, '')}</span>` : ''}</span></li>`;
  }).join('');
}
draw();
// copy of this device's results in the cloud, so they can be read in the Firebase console
async function mirror() {
  if (!user || !db) return;
  try { await F.setDoc(F.doc(db, 'spike', user.uid, 'devices', deviceId), { label, ua, standalone, results: JSON.parse(JSON.stringify(results)), updated: F.serverTimestamp() }); } catch {}
}
$('#copy').onclick = async () => {
  const text = [label, ua, ...CHECKS.map(([k, n]) => `${({ ok: '✓', bad: '✗', wait: '…' })[results[k]?.state] || '–'} ${n}${results[k]?.detail ? ` (${results[k].detail})` : ''}`)].join('\n');
  try { await navigator.clipboard.writeText(text); $('#copy').textContent = 'Copied'; } catch { prompt('Copy these results:', text); }
};

// ---------- Firebase ----------
const app = initializeApp(firebaseConfig);
const auth = A.initializeAuth(app, { persistence: [A.indexedDBLocalPersistence, A.browserLocalPersistence], popupRedirectResolver: A.browserPopupRedirectResolver });
db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });
const why = e => (e?.code || e?.message || String(e)).replace('auth/', '');

// redirect sign-in comes back here
const redirectPending = store.get('redirectPending', false);
A.getRedirectResult(auth).then(r => {
  if (r?.user) set('redirect', 'ok', r.user.email);
  else if (redirectPending) set('redirect', 'bad', 'came back without signing in');
}).catch(e => set('redirect', 'bad', why(e))).finally(() => store.set('redirectPending', false));

const wasSignedIn = store.get('signedIn', false);
let firstAuth = true;
A.onAuthStateChanged(auth, async u => {
  user = u;
  $('#who').textContent = u ? (u.email || u.uid) : 'nobody yet';
  $('#signin').hidden = !!u; $('#signedIn').hidden = !u;
  if (firstAuth) { firstAuth = false; if (wasSignedIn) set('persist', u ? 'ok' : 'bad', u ? '' : 'had to sign in again'); }
  store.set('signedIn', !!u);
  if (!u) return;
  mirror();
  watchNote();
  if (!results.cloud || results.cloud.state !== 'ok') cloudCheck();
  if (!navigator.onLine) offlineReopenCheck();
});

async function cloudCheck() {
  try {
    const ref = F.doc(db, 'spike', user.uid, 'checks', deviceId);
    const stamp = Date.now();
    await F.setDoc(ref, { stamp, label });
    const back = await F.getDocFromServer(ref);
    set('cloud', back.data()?.stamp === stamp ? 'ok' : 'bad', back.data()?.stamp === stamp ? '' : 'read back something else');
  } catch (e) { set('cloud', navigator.onLine ? 'bad' : 'wait', navigator.onLine ? why(e) : 'offline; try again online'); }
}

// ---------- offline note ----------
const noteRef = () => F.doc(db, 'spike', user.uid, 'notes', deviceId);
let unwatch = null;
function watchNote() {
  unwatch?.();
  unwatch = F.onSnapshot(noteRef(), { includeMetadataChanges: true }, snap => {
    if (!snap.exists()) return;
    const d = snap.data();
    if (d.offline && !snap.metadata.hasPendingWrites && !snap.metadata.fromCache) set('offlineSync', 'ok', `note from ${new Date(d.savedAt).toLocaleTimeString()}`);
  });
}
async function offlineReopenCheck() {
  try {
    const snap = await F.getDocFromCache(noteRef());
    set('offlineReopen', snap.exists() ? 'ok' : 'bad', snap.exists() ? 'read from this device’s cache' : 'no note found offline');
  } catch (e) { set('offlineReopen', 'bad', why(e)); }
}
$('#offlineWrite').onclick = () => {
  const offline = !navigator.onLine;
  // don't await: offline, a write only resolves once it reaches the server
  F.setDoc(noteRef(), { savedAt: Date.now(), offline, label }).catch(e => set('offlineSave', 'bad', why(e)));
  if (offline) { set('offlineSave', 'ok', 'saved on this device'); set('offlineSync', 'wait', 'waiting for a connection'); }
  else set('offlineSave', 'wait', 'you’re online: turn on Airplane Mode and tap again');
};

// ---------- sign-in buttons ----------
const creds = () => [$('#email').value.trim(), $('#password').value];
$('#signUpEmail').onclick = async () => { try { await A.createUserWithEmailAndPassword(auth, ...creds()); set('emailUp', 'ok'); } catch (e) { set('emailUp', 'bad', why(e)); } };
$('#signInEmail').onclick = async () => { try { await A.signInWithEmailAndPassword(auth, ...creds()); set('emailIn', 'ok'); } catch (e) { set('emailIn', 'bad', why(e)); } };
const google = () => { const p = new A.GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' }); return p; };
$('#googlePopup').onclick = async () => { try { const r = await A.signInWithPopup(auth, google()); set('popup', 'ok', r.user.email); } catch (e) { set('popup', 'bad', why(e)); } };
$('#googleRedirect').onclick = async () => { store.set('redirectPending', true); try { await A.signInWithRedirect(auth, google()); } catch (e) { store.set('redirectPending', false); set('redirect', 'bad', why(e)); } };
$('#signOut').onclick = () => { unwatch?.(); A.signOut(auth); };
