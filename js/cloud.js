/* Firebase accounts and household sync for the page. The sync itself lives in cloud-core.js;
   this file signs in, loads the Firebase SDK only when a household is set up, and hands the
   core this device's state. Phase 3 adds the screens that call signIn*, createHousehold, join and invite. */
import { firebaseConfig, FIREBASE_SDK } from './firebase-config.js';
import { createCloud } from './cloud-core.js';
import { state, setState, saveLocal, setMe } from './store.js';
import { renderAllPreserve } from './actions.js';

const KEY = 'xmas-cloud';
const randomCode = (n = 24) => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');

export const Cloud = {
  cfg: (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } })(),
  saveCfg() { try { localStorage.setItem(KEY, JSON.stringify(this.cfg)); } catch {} },
  user: null, core: null, status: 'off', error: '', members: {},

  wanted() { return !!this.cfg.hid; },          // this device belongs to a household
  active() { return !!(this.core && this.user); },
  statusText() {
    if (!this.wanted()) return 'Off';
    if (!this.user) return 'Signed out';
    return { syncing: 'Syncing…', idle: navigator.onLine === false ? 'Offline. Changes are saved on this device' : 'Up to date', error: this.error || 'Couldn’t sync' }[this.status] || 'Connecting…';
  },

  async load() {
    if (this.F) return;
    const [{ initializeApp }, A, F] = await Promise.all(['app', 'auth', 'firestore'].map(m => import(`${FIREBASE_SDK}/firebase-${m}.js`)));
    const app = initializeApp(firebaseConfig);
    this.A = A; this.F = F;
    this.auth = A.initializeAuth(app, { persistence: [A.indexedDBLocalPersistence, A.browserLocalPersistence], popupRedirectResolver: A.browserPopupRedirectResolver });
    this.db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });
    await new Promise(r => { const un = A.onAuthStateChanged(this.auth, u => { this.user = u; un(); r(); }); });
  },
  async boot() {
    if (!this.wanted()) return;
    try { await this.load(); if (this.user) this.start(); else this.setStatus('signed-out'); }
    catch (e) { this.setStatus('error', 'Couldn’t reach Firebase'); }
  },
  // Signing in on a new device: rejoin the household this account already belongs to
  async restore() {
    if (this.wanted() || !this.user) return false;
    const { F, db } = this, uid = this.user.uid;
    try {
      const hid = (await F.getDoc(F.doc(db, `users/${uid}`))).data()?.hid;
      if (!hid || !(await F.getDoc(F.doc(db, `households/${hid}/members/${uid}`))).exists()) return false;
      this.cfg = { hid }; this.saveCfg(); this.start();
      return true;
    } catch { return false; }
  },
  start() {
    this.core?.stop();
    const { F, db } = this, uid = this.user.uid;
    F.setDoc(F.doc(db, `users/${uid}`), { hid: this.cfg.hid }).catch(() => {}); // remember it on the account (also fills in older households)
    this.core = createCloud({
      F: this.F, db: this.db, hid: this.cfg.hid, uid: this.user.uid,
      getLocal: () => state,
      setLocal: s => { setState(s); saveLocal(); renderAllPreserve(); },
      onMembers: m => { this.members = m; if (m[this.user.uid]) setMe(m[this.user.uid]); renderAllPreserve(); },
      onStatus: (st, err) => this.setStatus(st, err && (err.code === 'permission-denied' ? 'Not allowed. Are you still in this household?' : err.message)),
    });
  },
  setStatus(st, err = '') {
    this.status = st; this.error = err;
    const el = document.getElementById('syncStatus'); if (el) el.textContent = this.statusText();
  },
  schedule() { clearTimeout(this.timer); this.timer = setTimeout(() => this.core?.sync(), 400); },
  syncNow() { this.core?.sync(); },

  // ---------- accounts (used by the phase 3 screens) ----------
  async signInGoogle() { await this.load(); const p = new this.A.GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' }); this.user = (await this.A.signInWithPopup(this.auth, p)).user; },
  async signInEmail(email, password, create = false) {
    await this.load();
    this.user = (await (create ? this.A.createUserWithEmailAndPassword : this.A.signInWithEmailAndPassword)(this.auth, email, password)).user;
  },
  async signOut() { this.core?.stop(); this.core = null; await this.A?.signOut(this.auth); this.user = null; this.setStatus('signed-out'); },

  // ---------- households ----------
  async createHousehold(name, personId) {
    const { F, db } = this, uid = this.user.uid, hid = randomCode(20);
    const b = F.writeBatch(db);
    b.set(F.doc(db, `households/${hid}`), { name, createdBy: uid, created: Date.now() });
    b.set(F.doc(db, `households/${hid}/members/${uid}`), { personId, joined: Date.now() });
    await b.commit();
    this.cfg = { hid }; this.saveCfg(); this.start();
  },
  // An invite is for one person on the list; whoever accepts it becomes that person.
  async invite(personId) {
    const code = randomCode(24), { F, db } = this;
    await F.setDoc(F.doc(db, `invites/${code}`), { hid: this.cfg.hid, personId, createdBy: this.user.uid, expires: F.Timestamp.fromMillis(Date.now() + 7 * 86400000) });
    return code;
  },
  async peekInvite(code) {
    const snap = await this.F.getDoc(this.F.doc(this.db, `invites/${code}`));
    const inv = snap.data();
    if (!inv || inv.expires.toMillis() < Date.now()) throw new Error('That invite has expired or was already replaced. Ask for a new one.');
    return inv;
  },
  async join(code) {
    const { F, db } = this, uid = this.user.uid;
    const inv = await this.peekInvite(code);
    // joining and using up the invite happen together (the rules require it)
    const b = F.writeBatch(db);
    b.set(F.doc(db, `households/${inv.hid}/members/${uid}`), { personId: inv.personId, invite: code, joined: Date.now() });
    b.delete(F.doc(db, `invites/${code}`));
    await b.commit();
    this.cfg = { hid: inv.hid }; this.saveCfg(); this.start();
  },
  async leave() {
    const { F, db } = this;
    const b = F.writeBatch(db);
    b.delete(F.doc(db, `households/${this.cfg.hid}/members/${this.user.uid}`));
    b.delete(F.doc(db, `users/${this.user.uid}`));
    await b.commit();
    this.core?.stop(); this.core = null; this.cfg = {}; this.saveCfg(); this.setStatus('off');
  },
};
