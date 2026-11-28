/* Live wish lists for the signed-in household, like the app's WishLists.swift.
   - households/{hid}/wishlists/{personId}: a member's own list. households/{hid}/linked/{personId}: someone
     else's list kept on a person here. Own wins over linked.
   - Each list's doc, its claims (not on your own list: the rules refuse the owner) and, for this household's
     own lists, the names typed on the share page. */
import { cleanList, listDoc, claimer as whoClaimed } from './wish-core.js';

const randomCode = (n = 24) => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
const CLAIM_KEY = 'giftTags.claimDestination';

export const Wishes = {
  own: {}, linked: {}, lists: {}, claims: {}, names: {}, members: {},
  hid: '', uid: '', me: '', available: false, subs: new Map(), session: 0, onChange: () => {},

  get pointers() { return { ...this.linked, ...this.own }; },
  list(pid) { const lid = this.pointers[pid]; return lid ? this.lists[lid] || null : null; },
  wishes(pid) { return this.list(pid)?.items || []; },
  isLinked(pid) { return !this.own[pid] && !!this.linked[pid]; },
  claimsFor(pid) { const lid = this.pointers[pid]; return (lid && this.claims[lid]) || {}; },
  claimer(c, pid) { return whoClaimed(c, { uid: this.uid, members: this.members, names: this.names[this.pointers[pid]] }); },
  get myListId() { return this.own[this.me] || ''; },

  get destination() { try { return localStorage.getItem(CLAIM_KEY) === 'saved' ? 'saved' : 'next'; } catch { return 'next'; } },
  set destination(v) { try { localStorage.setItem(CLAIM_KEY, v === 'saved' ? 'saved' : 'next'); } catch {} },

  connect({ F, db, hid, uid, me }) {
    this.stop();
    Object.assign(this, { F, db, hid, uid, me, available: true });
    const s = this.session;
    const pointers = snap => Object.fromEntries(snap.docs.map(d => [d.id, d.data().listId]).filter(([, l]) => typeof l === 'string' && l.length >= 20));
    this.subs.set('own', F.onSnapshot(F.collection(db, `households/${hid}/wishlists`), snap => {
      if (s !== this.session) return;
      this.own = pointers(snap); this.sync();
    }, () => { if (s === this.session) { this.available = false; this.onChange(); } }));
    this.subs.set('linked', F.onSnapshot(F.collection(db, `households/${hid}/linked`), snap => {
      if (s !== this.session) return;
      this.linked = pointers(snap); this.sync();
    }, () => {}));
  },
  setMe(me) { if (me && me !== this.me) { this.me = me; this.sync(); } },
  stop() {
    for (const un of this.subs.values()) un();
    this.subs.clear();
    Object.assign(this, { own: {}, linked: {}, lists: {}, claims: {}, names: {}, hid: '', uid: '', me: '', available: false });
    this.session++;
  },

  // One listener per list, plus its claims unless it's mine, plus typed names for this household's own lists
  sync() {
    const { F, db } = this, s = this.session, ptrs = this.pointers, wanted = new Set(Object.values(ptrs));
    for (const k of [...this.subs.keys()]) {
      const lid = k.split(':')[1];
      if (lid && !wanted.has(lid)) { this.subs.get(k)(); this.subs.delete(k); delete this.lists[lid]; delete this.claims[lid]; delete this.names[lid]; }
    }
    for (const [pid, lid] of Object.entries(ptrs)) {
      if (!this.subs.has('list:' + lid)) this.subs.set('list:' + lid, F.onSnapshot(F.doc(db, `wishlists/${lid}`), snap => {
        if (s !== this.session) return;
        if (snap.exists()) {
          const l = cleanList(lid, snap.data());
          if (l) this.lists[lid] = l; else delete this.lists[lid];
          if (l && l.hid === this.hid && l.personId !== this.me) this.watch('names', lid);
        } else if (!snap.metadata.fromCache) delete this.lists[lid];
        this.onChange();
      }, () => {}));
      if (pid !== this.me) this.watch('claims', lid);
    }
    this.onChange();
  },
  // A listener that fails (a list that's gone, offline too long) stops for good: drop it and try again later
  watch(kind, lid, restart = false) {
    const k = `${kind}:${lid}`;
    if (restart && this.subs.has(k)) { this.subs.get(k)(); this.subs.delete(k); }
    if (this.subs.has(k)) return;
    const { F, db } = this, s = this.session;
    this.subs.set(k, F.onSnapshot(F.collection(db, `wishlists/${lid}/${kind}`), snap => {
      if (s !== this.session) return;
      if (kind === 'claims') this.claims[lid] = Object.fromEntries(snap.docs.map(d => [d.id, { wishId: d.id, uid: String(d.data().uid || ''), gift: d.data().gift || '', at: d.data().at || 0 }]));
      else this.names[lid] = Object.fromEntries(snap.docs.map(d => [d.id, String(d.data().name || '').slice(0, 60)]));
      this.onChange();
    }, () => {
      if (s !== this.session) return;
      this.subs.get(k)?.(); this.subs.delete(k);
      setTimeout(() => { if (s === this.session && Object.values(this.pointers).includes(lid) && this.lists[lid]) this.watch(kind, lid); }, 15000);
    }));
  },
  refreshClaims(pid) {
    const lid = this.pointers[pid];
    if (!lid || pid === this.me) return;
    this.watch('claims', lid, true);
    if (this.lists[lid]?.hid === this.hid) this.watch('names', lid, true);
  },

  // ---------- your own list ----------
  async saveMine(items, name) {
    const { F, db } = this;
    const lid = this.own[this.me];
    if (lid && this.lists[lid]) {
      const l = { ...this.lists[lid], items, name, updated: Date.now() };
      this.lists[lid] = l; this.onChange();
      return F.setDoc(F.doc(db, `wishlists/${lid}`), listDoc(l));
    }
    const id = randomCode(24);
    const l = { id, owner: this.uid, hid: this.hid, personId: this.me, name, items, updated: Date.now() };
    this.own = { ...this.own, [this.me]: id }; this.lists[id] = l; this.onChange();
    const b = F.writeBatch(db);
    b.set(F.doc(db, `wishlists/${id}`), listDoc(l));
    b.set(F.doc(db, `households/${this.hid}/wishlists/${this.me}`), { listId: id, owner: this.uid });
    return b.commit();
  },
  // After deleting a wish: clear whatever it had (you can't read it, but the rules let you delete it)
  clearClaim(wishId) {
    const lid = this.myListId; if (!lid) return;
    const { F, db } = this;
    F.deleteDoc(F.doc(db, `wishlists/${lid}/claims/${wishId}`)).catch(() => {});
    F.deleteDoc(F.doc(db, `wishlists/${lid}/names/${wishId}`)).catch(() => {});
  },
  async unpointMine() { if (this.hid && this.me) await this.F.deleteDoc(this.F.doc(this.db, `households/${this.hid}/wishlists/${this.me}`)); },
  async deleteMine() {
    const lid = this.myListId; if (!lid) return;
    const { F, db } = this, b = F.writeBatch(db);
    for (const w of this.lists[lid]?.items || []) {
      b.delete(F.doc(db, `wishlists/${lid}/claims/${w.id}`));
      b.delete(F.doc(db, `wishlists/${lid}/names/${w.id}`));
    }
    b.delete(F.doc(db, `wishlists/${lid}`));
    b.delete(F.doc(db, `households/${this.hid}/wishlists/${this.me}`));
    await b.commit();
  },

  // ---------- someone else's ----------
  async fetch(lid) {
    const snap = await this.F.getDoc(this.F.doc(this.db, `wishlists/${lid}`));
    return snap.exists() ? cleanList(lid, snap.data()) : null;
  },
  link(lid, pid) {
    this.linked = { ...this.linked, [pid]: lid }; this.sync();
    return this.F.setDoc(this.F.doc(this.db, `households/${this.hid}/linked/${pid}`), { listId: lid, by: this.uid, at: Date.now() });
  },
  unlink(pid) {
    const { [pid]: _, ...rest } = this.linked; this.linked = rest; this.sync();
    return this.F.deleteDoc(this.F.doc(this.db, `households/${this.hid}/linked/${pid}`));
  },
  // Shows at once; rejects if someone else got there first
  async claim(wishId, pid, gift) {
    const lid = this.pointers[pid];
    if (!lid || pid === this.me || this.claims[lid]?.[wishId]) throw new Error('taken');
    const c = { uid: this.uid, at: Date.now(), ...(gift ? { gift } : {}) };
    this.claims[lid] = { ...this.claims[lid], [wishId]: { wishId, ...c, gift: gift || '' } }; this.onChange();
    try { await this.F.setDoc(this.F.doc(this.db, `wishlists/${lid}/claims/${wishId}`), c); }
    catch (e) { if (this.claims[lid]?.[wishId]?.uid === this.uid) { delete this.claims[lid][wishId]; this.onChange(); } throw e; }
  },
  unclaim(wishId, pid) {
    const lid = this.pointers[pid];
    if (!lid || this.claims[lid]?.[wishId]?.uid !== this.uid) return Promise.resolve();
    delete this.claims[lid][wishId]; this.onChange();
    return this.F.deleteDoc(this.F.doc(this.db, `wishlists/${lid}/claims/${wishId}`));
  },
  // My claim that planned this gift, if any
  myClaim(giftId) {
    for (const [pid, lid] of Object.entries(this.pointers)) {
      if (pid === this.me) continue;
      const c = Object.values(this.claims[lid] || {}).find(x => x.gift === giftId && x.uid === this.uid);
      if (c) return { pid, wishId: c.wishId };
    }
    return null;
  },
};

// Moves your list to another household you're now in, as your person there, and points that household at it
export async function moveList(F, db, lid, hid, personId, uid, name) {
  const b = F.writeBatch(db);
  b.update(F.doc(db, `wishlists/${lid}`), { hid, personId, name: String(name || '').slice(0, 100), updated: Date.now() });
  b.set(F.doc(db, `households/${hid}/wishlists/${personId}`), { listId: lid, owner: uid });
  await b.commit();
}
