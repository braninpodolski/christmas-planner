/* Cloud sync core: keeps this device's state and a Firestore household in step.
   No page code here, so it runs in Node against the emulator (tests/rules/cloud.test.js).

   - Each record is one document. Gifts for a member that someone else is buying go to
     surprises/{thatMember}/gifts, which the security rules never let that member read.
   - Merging reuses data.merge(): the newest edit of each record wins, and deletions
     travel as tombstones/{id}, exactly like the Gist sync.
   - Firestore's local cache makes it work offline; writes made offline are sent later. */
import { sanitize, merge, canon } from './data.js';

const SYNCED = ['people', 'occasions', 'gifts']; // tasks stay on the device (they're no longer shown)

// The person a gift is a surprise for: anyone other than the buyer ('' when it's their own wish-list item)
export const surpriseFor = g => (g.buyer !== g.personId ? g.personId : '');
export function pathFor(kind, r) {
  if (kind !== 'gifts') return `${kind}/${r.id}`;
  const pid = surpriseFor(r);
  return pid ? `surprises/${pid}/gifts/${r.id}` : `gifts/${r.id}`;
}
const clean = r => JSON.parse(JSON.stringify(r));
// The documents this device wants the household to hold, by path (relative to the household)
export function cloudDocs(state, myPerson) {
  const out = new Map();
  for (const k of SYNCED) for (const r of state[k]) {
    const p = pathFor(k, r);
    if (p.startsWith(`surprises/${myPerson}/`)) continue; // a surprise for me: I may not write it (and shouldn't have it)
    out.set(p, clean(r));
  }
  for (const [id, at] of Object.entries(state.deleted || {})) out.set(`tombstones/${id}`, { at });
  return out;
}
// Turn the household's documents back into a state (sanitized like any incoming data)
export function stateFromDocs(docs) {
  const raw = { occasions: [], people: [], gifts: [], tasks: [], deleted: {} };
  for (const [p, d] of docs) {
    const [coll] = p.split('/');
    if (coll === 'tombstones') raw.deleted[p.split('/')[1]] = d.at;
    else if (coll === 'surprises') raw.gifts.push(d);
    else if (raw[coll]) raw[coll].push(d);
  }
  return sanitize(raw);
}
const stable = v => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));
export function diffDocs(want, have) {
  const sets = [], deletes = [];
  for (const [p, d] of want) if (!have.has(p) || stable(have.get(p)) !== stable(d)) sets.push([p, d]);
  for (const p of have.keys()) if (!want.has(p)) deletes.push(p);
  return { sets, deletes };
}

/* F: the Firestore functions (doc, collection, onSnapshot, writeBatch), so the browser can pass the
   CDN build and tests the npm one. getLocal/setLocal read and replace this device's state. */
export function createCloud({ F, db, hid, uid, getLocal, setLocal, onMembers = () => {}, onStatus = () => {} }) {
  const base = `households/${hid}`;
  const remote = new Map();         // path -> data, as last seen from the household
  const subs = new Map(), ready = new Set();
  let members = {}, writing = Promise.resolve(), stopped = false;
  const seen = new Map(); // record id -> mod, as last seen on the server

  const listen = (key, prefix, query) => {
    subs.set(key, F.onSnapshot(query, snap => {
      for (const p of [...remote.keys()]) if (p.startsWith(prefix) && p.split('/').length === prefix.split('/').length) remote.delete(p);
      snap.docs.forEach(d => remote.set(prefix + d.id, d.data()));
      ready.add(key); sync();
    }, err => onStatus('error', err)));
  };
  const unlisten = key => { subs.get(key)?.(); subs.delete(key); ready.delete(key); };

  // the shared lists, plus the surprises for everyone on the list except me
  for (const c of [...SYNCED, 'tombstones']) listen(c, `${c}/`, F.collection(db, `${base}/${c}`));
  let me = '';
  const watchSurprises = () => {
    if (!me) return;
    const pids = new Set([...remote.keys()].filter(p => p.startsWith('people/')).map(p => p.split('/')[1]));
    getLocal().people.forEach(p => pids.add(p.id));
    pids.delete(me);
    for (const k of [...subs.keys()]) if (k.startsWith('s:') && !pids.has(k.slice(2))) {
      unlisten(k); for (const p of [...remote.keys()]) if (p.startsWith(`surprises/${k.slice(2)}/`)) remote.delete(p);
    }
    for (const pid of pids) if (!subs.has('s:' + pid)) listen('s:' + pid, `surprises/${pid}/gifts/`, F.collection(db, `${base}/surprises/${pid}/gifts`));
  };
  subs.set('members', F.onSnapshot(F.collection(db, `${base}/members`), snap => {
    members = Object.fromEntries(snap.docs.map(d => [d.id, d.data().personId || '']));
    me = members[uid] || '';
    ready.add('members'); onMembers(members); watchSurprises(); sync();
  }, err => onStatus('error', err)));

  const allReady = () => ready.has('members') && [...subs.keys()].every(k => ready.has(k));

  function sync() {
    if (stopped || !me) return;
    watchSurprises(); // someone new on the list: start listening for their surprises
    if (!allReady()) return; // never merge against a half-loaded household
    const local = getLocal(), theirs = stateFromDocs(remote);
    // A record I'd seen that has vanished from my view, with no tombstone and no newer edit here,
    // was moved out of my reach (it became a surprise for me): drop it rather than send it back.
    const here = new Set(SYNCED.flatMap(k => theirs[k].map(r => r.id)));
    const gone = r => seen.has(r.id) && !here.has(r.id) && !theirs.deleted[r.id] && (r.mod || 0) <= seen.get(r.id);
    const mine = { ...local };
    for (const k of SYNCED) mine[k] = local[k].filter(r => !gone(r));
    for (const id of [...seen.keys()]) if (!here.has(id)) seen.delete(id);
    for (const k of SYNCED) for (const r of theirs[k]) seen.set(r.id, r.mod || 0);
    const merged = merge(mine, theirs);
    merged.tasks = local.tasks; merged.household = { on: true, mod: local.household?.mod || 0 };
    if (canon(merged) !== canon(local)) setLocal(merged);
    const { sets, deletes } = diffDocs(cloudDocs(merged, me), remote);
    if (!sets.length && !deletes.length) { onStatus('idle'); return; }
    onStatus('syncing');
    const ops = [...sets.map(([p, d]) => b => b.set(F.doc(db, `${base}/${p}`), d)), ...deletes.map(p => b => b.delete(F.doc(db, `${base}/${p}`)))];
    for (let i = 0; i < ops.length; i += 450) { // a batch holds at most 500 writes
      const b = F.writeBatch(db);
      ops.slice(i, i + 450).forEach(op => op(b));
      // offline, commit() only resolves once the server has it; the local cache updates right away
      writing = b.commit().then(() => onStatus('idle')).catch(err => onStatus('error', err));
    }
  }

  return {
    sync, members: () => members, ready: allReady,
    paths: () => [...remote.keys()], // what this device can see of the household, relative to it
    flush: () => writing,
    stop() { stopped = true; for (const k of [...subs.keys()]) subs.get(k)(); subs.clear(); },
  };
}
