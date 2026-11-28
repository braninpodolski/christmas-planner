/* Firebase accounts and household sync for the page. The sync itself lives in cloud-core.js;
   this file signs in, loads the Firebase SDK only when a household is set up, and hands the
   core this device's state. Phase 3 adds the screens that call signIn*, createHousehold, join and invite. */
import { firebaseConfig, FIREBASE_SDK } from './firebase-config.js';
import { createCloud } from './cloud-core.js';
import { state, setState, saveLocal, setMe, me, person, commit, KEY_BACKUP_ACCOUNTS } from './store.js';
import { blank, COLORS } from './constants.js';
import { pathFor } from './cloud-core.js';
import { bringing } from './merge.js';
import { Wishes, moveList } from './wishes.js';
import { renderAllPreserve } from './actions.js';
import { report, flush } from './errors.js';
import { Pins } from './pins.js';
import { Sync } from './sync.js';

const KEY = 'xmas-cloud';
// Accounts made before users/{uid} existed (Nov 26, 2026) may belong to a household that isn't linked yet,
// so only newer accounts get a household of their own automatically (the app does the same).
const SOLO_SINCE = Date.UTC(2026, 10, 26);
const local = ['localhost', '127.0.0.1'].includes(location.hostname);
// ?emulator on a local server uses the Firebase emulators (remembered for the tab, since join links clear the address)
const useEmulator = local && (() => {
  try { if (new URLSearchParams(location.search).has('emulator')) sessionStorage.setItem('giftTags.emulator', '1'); return sessionStorage.getItem('giftTags.emulator') === '1'; }
  catch { return new URLSearchParams(location.search).has('emulator'); }
})();
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

  // One load, however many callers (booting and a join link can both ask at once)
  load() { return (this._loading ||= this._load().catch(e => { this._loading = null; throw e; })); },
  async _load() {
    const [{ initializeApp }, A, F] = await Promise.all(['app', 'auth', 'firestore'].map(m => import(`${FIREBASE_SDK}/firebase-${m}.js`)));
    const app = initializeApp(useEmulator ? { ...firebaseConfig, projectId: 'demo-gift-tags' } : firebaseConfig);
    this.A = A; this.F = F;
    this.auth = A.initializeAuth(app, { persistence: [A.indexedDBLocalPersistence, A.browserLocalPersistence], popupRedirectResolver: A.browserPopupRedirectResolver });
    this.db = F.initializeFirestore(app, useEmulator ? {} : { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });
    if (useEmulator) { A.connectAuthEmulator(this.auth, 'http://127.0.0.1:9099', { disableWarnings: true }); F.connectFirestoreEmulator(this.db, '127.0.0.1', 8181); }
    await new Promise(r => { const un = A.onAuthStateChanged(this.auth, u => { this.user = u; un(); r(); }); });
  },
  async boot() {
    if (!this.wanted()) return;
    try { await this.load(); if (this.user) this.start(); else this.setStatus('signed-out'); }
    catch (e) { this.setStatus('error', 'Couldn’t reach Firebase'); }
  },
  // Signing in on a new device: rejoin the household this account already belongs to
  // Returns 'rejoined', 'solo' (a household of one was made), or false (older account, or it failed).
  async restore() {
    if (this.wanted() || !this.user) return false;
    const { F, db } = this, uid = this.user.uid;
    try {
      const hid = (await F.getDoc(F.doc(db, `users/${uid}`))).data()?.hid;
      if (hid && (await F.getDoc(F.doc(db, `households/${hid}/members/${uid}`))).exists()) {
        this.cfg = { hid }; this.saveCfg(); this.start();
        return 'rejoined';
      }
      return (await this.startSolo()) ? 'solo' : false;
    } catch { return false; }
  },
  // Solo by default: an account in no household gets a household of one, holding what's on this device.
  // Not while this device syncs through a GitHub Gist (moving that list is Create a household, which backs it up first).
  canSolo() { return !!this.user && Date.parse(this.user.metadata?.creationTime || 0) >= SOLO_SINCE && !Sync.gist(); },
  async startSolo() {
    if (!this.canSolo()) return false;
    try { localStorage.setItem(KEY_BACKUP_ACCOUNTS, JSON.stringify(state)); } catch {}
    let pid = person(me) ? me : '';
    if (!pid) {
      const p = this.newPerson(this.defaultName());
      commit(s => { s.people.push(p); s.household.on = true; }, { render: false });
      pid = p.id; setMe(pid);
    }
    await this.createHousehold('Home', pid);
    return true;
  },
  newPerson(name) {
    const id = randomCode(16);
    return { id, created: Date.now(), name, relation: '', budget: '', birthday: '', color: COLORS[Math.floor(Math.random() * COLORS.length)], emoji: '', notes: '', sizes: '' };
  },
  // Your name for your own person: from Google, or the start of your email
  defaultName() {
    const n = (this.user?.displayName || '').trim();
    if (n) return n;
    const word = (this.user?.email || 'Me').split('@')[0].split(/[^\p{L}]+/u).find(Boolean) || 'Me';
    return word[0].toUpperCase() + word.slice(1);
  },
  isSolo() { return this.wanted() && Object.keys(this.members).length <= 1; },
  isOnlyMember() { const ids = Object.keys(this.members); return !!this.user && ids.every(u => u === this.user.uid); },
  start() {
    this.core?.stop();
    const { F, db } = this, uid = this.user.uid;
    // remember the household on the account (also fills in older households), and bring over this account's pins
    const ref = F.doc(db, `users/${uid}`);
    F.getDoc(ref).then(d => {
      const pins = d.data()?.pinned;
      if (Array.isArray(pins)) { Pins.replace(pins); renderAllPreserve(); }
      return F.setDoc(ref, { hid: this.cfg.hid, pinned: [...Pins.ids] });
    }).catch(() => {});
    flush(); // send any error reports saved while signed out
    this.core = createCloud({
      F: this.F, db: this.db, hid: this.cfg.hid, uid: this.user.uid,
      getLocal: () => state,
      setLocal: s => { setState(s); saveLocal(); renderAllPreserve(); },
      onMembers: m => { this.members = m; Wishes.members = m; if (m[this.user.uid]) { setMe(m[this.user.uid]); Wishes.setMe(m[this.user.uid]); } renderAllPreserve(); },
      onStatus: (st, err) => this.setStatus(st, err && (err.code === 'permission-denied' ? 'Not allowed. Are you still in this household?' : err.message)),
    });
    Wishes.onChange = () => renderAllPreserve();
    Wishes.connect({ F: this.F, db: this.db, hid: this.cfg.hid, uid, me: this.members[uid] || '' });
  },
  stop() { this.core?.stop(); this.core = null; Wishes.stop(); this.members = {}; },
  setStatus(st, err = '') {
    this.status = st; this.error = err;
    if (st === 'error' && err) report(err, 'cloud sync');
    const el = document.getElementById('syncStatus'); if (el) el.textContent = this.statusText();
  },
  savePins() {
    if (!this.active()) return;
    const { F, db } = this;
    F.setDoc(F.doc(db, `users/${this.user.uid}`), { hid: this.cfg.hid, pinned: [...Pins.ids] }).catch(e => report(e, 'save pins'));
  },
  schedule() { clearTimeout(this.timer); this.timer = setTimeout(() => this.core?.sync(), 400); },
  syncNow() { this.core?.sync(); },

  // ---------- accounts (used by the phase 3 screens) ----------
  async signInGoogle() { await this.load(); const p = new this.A.GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' }); this.user = (await this.A.signInWithPopup(this.auth, p)).user; },
  async signInEmail(email, password, create = false) {
    await this.load();
    this.user = (await (create ? this.A.createUserWithEmailAndPassword : this.A.signInWithEmailAndPassword)(this.auth, email, password)).user;
  },
  async afterSignIn() { flush(); },
  // Your list stays in your account; this browser forgets it, so whoever signs in next doesn't pick it up
  async signOut() {
    this.stop(); await this.A?.signOut(this.auth); this.user = null;
    if (this.wanted()) { this.cfg = {}; this.saveCfg(); const fresh = blank(); setState(fresh); saveLocal(); setMe(''); }
    this.setStatus('off');
  },

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
  /* Joins with an invite. Joining and using up the invite happen together (the rules require it).
     `bring` brings what's here along (merged by name); otherwise it's left behind. Either way the household of
     one you were in is emptied, and your wish list comes with you. */
  async join(code, bring = false) {
    const { F, db } = this, uid = this.user.uid;
    const inv = await this.peekInvite(code);
    if (inv.createdBy === uid) throw new Error('That’s your own invite. Send it to the person it’s for.');
    const soloHid = this.wanted() && this.isSolo() ? this.cfg.hid : '';
    const soloPaths = soloHid ? (this.core?.paths() || []) : [];
    const from = { people: state.people, occasions: state.occasions, gifts: state.gifts }, fromMe = me;
    const myList = Wishes.myListId;
    try { localStorage.setItem(KEY_BACKUP_ACCOUNTS, JSON.stringify(state)); } catch {}
    const b = F.writeBatch(db);
    b.set(F.doc(db, `households/${inv.hid}/members/${uid}`), { personId: inv.personId, invite: code, joined: Date.now() });
    b.delete(F.doc(db, `invites/${code}`));
    b.set(F.doc(db, `users/${uid}`), { hid: inv.hid, pinned: [...Pins.ids] });
    await b.commit();

    // Now a member there: bring plans and the wish list, then empty the old household (still a member of it)
    const base = `households/${inv.hid}`;
    if (bring) {
      const get = async c => (await F.getDocs(F.collection(db, `${base}/${c}`))).docs.map(d => d.data());
      const target = { people: await get('people'), occasions: await get('occasions') };
      const add = bringing(from, target, fromMe, inv.personId);
      const writes = [...add.people.map(r => [pathFor('people', r), r]),
        ...add.occasions.map(r => [pathFor('occasions', r), r]),
        ...add.gifts.map(r => [pathFor('gifts', r), r]).filter(([p]) => !p.startsWith(`surprises/${inv.personId}/`))];
      await this.batched(writes.map(([p, d]) => bb => bb.set(F.doc(db, `${base}/${p}`), JSON.parse(JSON.stringify(d)))));
    }
    if (myList) {
      const name = (await F.getDoc(F.doc(db, `${base}/people/${inv.personId}`))).data()?.name || '';
      await moveList(F, db, myList, inv.hid, inv.personId, uid, name);
    }
    if (soloHid) {
      const sb = `households/${soloHid}`;
      const linked = (await F.getDocs(F.collection(db, `${sb}/linked`))).docs.map(d => `linked/${d.id}`);
      const gone = [...soloPaths, ...linked, `wishlists/${fromMe}`];
      await this.batched(gone.map(p => bb => bb.delete(F.doc(db, `${sb}/${p}`))));
      await F.deleteDoc(F.doc(db, `${sb}/members/${uid}`));
    }
    this.stop();
    const fresh = blank(); fresh.tasks = state.tasks;
    setState(fresh); saveLocal(); setMe(inv.personId);
    this.cfg = { hid: inv.hid }; this.saveCfg(); this.start();
  },
  async batched(ops) {
    for (let i = 0; i < ops.length; i += 450) {
      const b = this.F.writeBatch(this.db);
      ops.slice(i, i + 450).forEach(op => op(b));
      await b.commit();
    }
  },
  // Leaves the household. Its list stays with everyone else; you go on in a household of your own with a copy
  // of yourself (your name, birthday, sizes), and your wish list comes with you.
  async leave() {
    const { F, db } = this, uid = this.user.uid;
    const myList = Wishes.myListId;
    const mine = person(me) ? { ...person(me), mod: Date.now() } : this.newPerson(this.defaultName());
    try { localStorage.setItem(KEY_BACKUP_ACCOUNTS, JSON.stringify(state)); } catch {}
    await Wishes.unpointMine().catch(() => {}); // while still a member
    const b = F.writeBatch(db);
    b.delete(F.doc(db, `households/${this.cfg.hid}/members/${uid}`));
    b.delete(F.doc(db, `users/${uid}`));
    await b.commit();
    this.stop();
    const fresh = blank(); fresh.tasks = state.tasks; fresh.people = [mine]; fresh.household = { on: true, mod: Date.now() };
    setState(fresh); saveLocal(); setMe(mine.id);
    this.cfg = {}; this.saveCfg();
    await this.createHousehold('Home', mine.id);
    if (myList) await moveList(F, db, myList, this.cfg.hid, mine.id, uid, mine.name);
  },

  // ---------- deleting the account ----------
  usesPassword() { return !!this.user?.providerData?.some(p => p.providerId === 'password'); },
  /* Confirms who you are first (Firebase only deletes an account that signed in recently), so nothing is deleted
     if that fails. Then your wish list, then the household's lists if nobody else is in it (the household's own
     record, just its name, can't be deleted under the rules), your membership, and the account. */
  async deleteAccount(password) {
    const { A, F, db } = this, user = this.user;
    if (this.wanted() && this.status !== 'idle' && this.status !== 'syncing') throw new Error('Your household hasn’t loaded yet. Try again once it has.');
    if (this.usesPassword()) {
      if (!password) throw new Error('Enter your password to delete your account.');
      await A.reauthenticateWithCredential(user, A.EmailAuthProvider.credential(user.email, password));
    } else {
      await A.reauthenticateWithPopup(user, new A.GoogleAuthProvider(), A.browserPopupRedirectResolver);
    }
    if (this.wanted()) {
      const base = `households/${this.cfg.hid}`;
      await Wishes.deleteMine();
      if (this.isOnlyMember()) {
        const linked = (await F.getDocs(F.collection(db, `${base}/linked`))).docs.map(d => `linked/${d.id}`);
        await this.batched([...(this.core?.paths() || []), ...linked].map(p => b => b.delete(F.doc(db, `${base}/${p}`))));
      }
      await F.deleteDoc(F.doc(db, `${base}/members/${user.uid}`)); // last: being a member allowed the deletes above
    }
    await F.deleteDoc(F.doc(db, `users/${user.uid}`)).catch(() => {});
    await user.delete();
    this.stop(); this.user = null; this.cfg = {}; this.saveCfg(); this.setStatus('off');
    setState(blank()); saveLocal(); setMe('');
  },
};
