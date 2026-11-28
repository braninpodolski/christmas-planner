// Wish list rules. Run with: npm run test:rules (starts the local Firestore emulator).
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where, writeBatch, setLogLevel } from 'firebase/firestore';
setLogLevel('silent');

let env;
const H = 'home1';
const L = 'list-0123456789abcdefghij'; // Jordan's list (the share link's secret)
const db = uid => env.authenticatedContext(uid).firestore();
const guest = () => env.authenticatedContext('guest', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
const signedOut = () => env.unauthenticatedContext().firestore();
const list = (over = {}) => ({ owner: 'jordan', hid: H, personId: 'p1', name: 'Jordan', items: [{ id: 'w1', name: 'Hiking backpack' }], updated: 1, ...over });

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-gift-tags',
    firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8181 },
  });
});
after(() => env?.cleanup());

// Jordan (p1) and Sam (p2) share a household; Jordan has a wish list with one claim on it
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const d = ctx.firestore();
    await setDoc(doc(d, `households/${H}`), { name: 'Home', createdBy: 'jordan' });
    await setDoc(doc(d, `households/${H}/members/jordan`), { personId: 'p1' });
    await setDoc(doc(d, `households/${H}/members/sam`), { personId: 'p2' });
    await setDoc(doc(d, `households/${H}/wishlists/p1`), { listId: L, owner: 'jordan' });
    await setDoc(doc(d, `wishlists/${L}`), list());
    await setDoc(doc(d, `wishlists/${L}/claims/w1`), { uid: 'sam', at: 1, gift: 'g9' });
    await setDoc(doc(d, `wishlists/${L}/claims/w2`), { uid: 'aunt', at: 1 });
    await setDoc(doc(d, `wishlists/${L}/names/w2`), { uid: 'aunt', name: 'Aunt Pat', at: 1 });
    // Riley's own household, which keeps Jordan's list on its person p7
    await setDoc(doc(d, 'households/home2'), { name: 'Other', createdBy: 'riley' });
    await setDoc(doc(d, 'households/home2/members/riley'), { personId: 'p6' });
  });
});

test('anyone signed in (even anonymously) can open a list by its id, but nobody can list them', async () => {
  await assertSucceeds(getDoc(doc(guest(), `wishlists/${L}`)));
  await assertSucceeds(getDoc(doc(db('sam'), `wishlists/${L}`)));
  await assertFails(getDoc(doc(signedOut(), `wishlists/${L}`)));
  await assertFails(getDocs(collection(guest(), 'wishlists')));
  await assertFails(getDocs(query(collection(db('sam'), 'wishlists'), where('hid', '==', H))));
});

test('only the owner changes or deletes their list', async () => {
  await assertSucceeds(updateDoc(doc(db('jordan'), `wishlists/${L}`), { items: [], updated: 2 }));
  await assertFails(updateDoc(doc(db('sam'), `wishlists/${L}`), { items: [] }));
  await assertFails(updateDoc(doc(guest(), `wishlists/${L}`), { items: [] }));
  await assertFails(deleteDoc(doc(db('sam'), `wishlists/${L}`)));
  await assertFails(updateDoc(doc(db('jordan'), `wishlists/${L}`), { owner: 'sam' }));
  await assertFails(updateDoc(doc(db('jordan'), `wishlists/${L}`), { personId: 'p2' }));
  await assertFails(updateDoc(doc(db('jordan'), `wishlists/${L}`), { extra: true }));
  await assertSucceeds(deleteDoc(doc(db('jordan'), `wishlists/${L}`)));
});

test('a new list must be yours, for your own person, in your household, with a long id', async () => {
  const S = 'list-sam-0123456789abcdef';
  await assertSucceeds(setDoc(doc(db('sam'), `wishlists/${S}`), list({ owner: 'sam', personId: 'p2' })));
  await assertFails(setDoc(doc(db('sam'), 'wishlists/short'), list({ owner: 'sam', personId: 'p2' })));
  await assertFails(setDoc(doc(db('sam'), `wishlists/${S}x`), list({ owner: 'sam', personId: 'p1' })));
  await assertFails(setDoc(doc(db('sam'), `wishlists/${S}y`), list({ owner: 'jordan' })));
  await assertFails(setDoc(doc(db('outsider'), `wishlists/${S}z`), list({ owner: 'outsider', personId: 'p9' })));
  await assertFails(setDoc(doc(guest(), `wishlists/${S}w`), list({ owner: 'guest' })));
});

test('the owner can never read claims, even to check one', async () => {
  const me = db('jordan');
  await assertFails(getDoc(doc(me, `wishlists/${L}/claims/w1`)));
  await assertFails(getDocs(collection(me, `wishlists/${L}/claims`)));
  await assertFails(setDoc(doc(me, `wishlists/${L}/claims/w2`), { uid: 'jordan', at: 1 }));
});

test('anyone but the owner sees which wishes are taken, and claims as themselves', async () => {
  await assertSucceeds(getDocs(collection(db('sam'), `wishlists/${L}/claims`)));
  await assertSucceeds(getDocs(collection(guest(), `wishlists/${L}/claims`)));
  await assertSucceeds(getDocs(collection(db('riley'), `wishlists/${L}/claims`)));
  await assertSucceeds(setDoc(doc(guest(), `wishlists/${L}/claims/w3`), { uid: 'guest', at: 2 }));
  await assertSucceeds(setDoc(doc(db('riley'), `wishlists/${L}/claims/w4`), { uid: 'riley', at: 2, gift: 'g1' }));
  await assertFails(setDoc(doc(guest(), `wishlists/${L}/claims/w5`), { uid: 'sam', at: 2 }));
  await assertFails(setDoc(doc(guest(), `wishlists/${L}/claims/w6`), { uid: 'guest', at: 2, name: 'Aunt Pat' }));
  await assertFails(setDoc(doc(guest(), `wishlists/${L}/claims/w7`), { uid: 'guest', at: 2, person: 'p2' }));
  await assertFails(getDocs(collection(signedOut(), `wishlists/${L}/claims`)));
});

test('a name typed on the share page is seen only by the owner’s household, never the owner or other viewers', async () => {
  await assertSucceeds(getDocs(collection(db('sam'), `wishlists/${L}/names`)));
  await assertFails(getDocs(collection(db('jordan'), `wishlists/${L}/names`)));
  await assertFails(getDoc(doc(db('jordan'), `wishlists/${L}/names/w2`)));
  await assertFails(getDocs(collection(guest(), `wishlists/${L}/names`)));
  await assertFails(getDocs(collection(db('riley'), `wishlists/${L}/names`)));
  await assertSucceeds(getDoc(doc(env.authenticatedContext('aunt').firestore(), `wishlists/${L}/names/w2`))); // your own
  // written with its claim, as yourself
  const g = guest(), b = writeBatch(g);
  b.set(doc(g, `wishlists/${L}/claims/w8`), { uid: 'guest', at: 3 });
  b.set(doc(g, `wishlists/${L}/names/w8`), { uid: 'guest', name: 'Uncle Lee', at: 3 });
  await assertSucceeds(b.commit());
  await assertFails(setDoc(doc(g, `wishlists/${L}/names/w9`), { uid: 'guest', name: 'No claim', at: 3 }));
  await assertFails(setDoc(doc(g, `wishlists/${L}/names/w1`), { uid: 'guest', name: 'Not my claim', at: 3 }));
});

test('a claim can’t be taken over or changed; only its claimer (or the owner, blindly) removes it', async () => {
  await assertFails(setDoc(doc(guest(), `wishlists/${L}/claims/w1`), { uid: 'guest', at: 3 }));
  await assertFails(deleteDoc(doc(guest(), `wishlists/${L}/claims/w1`)));
  await assertSucceeds(deleteDoc(doc(db('jordan'), `wishlists/${L}/claims/w1`)));
  await assertSucceeds(deleteDoc(doc(db('jordan'), `wishlists/${L}/names/w2`)));
  await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), `wishlists/${L}/claims/w1`), { uid: 'sam', at: 1 }));
  await assertSucceeds(deleteDoc(doc(db('sam'), `wishlists/${L}/claims/w1`)));
});

test('the household’s pointer to each list: members read it, only you set or remove yours', async () => {
  await assertSucceeds(getDoc(doc(db('sam'), `households/${H}/wishlists/p1`)));
  await assertFails(getDoc(doc(guest(), `households/${H}/wishlists/p1`)));
  await assertFails(setDoc(doc(db('sam'), `households/${H}/wishlists/p1`), { listId: 'other', owner: 'sam' }));
  await assertFails(deleteDoc(doc(db('sam'), `households/${H}/wishlists/p1`)));
  await assertSucceeds(setDoc(doc(db('sam'), `households/${H}/wishlists/p2`), { listId: 'x'.repeat(20), owner: 'sam' }));
  await assertFails(setDoc(doc(db('sam'), `households/${H}/wishlists/p2`), { listId: 'x'.repeat(20), owner: 'jordan' }));
  await assertSucceeds(deleteDoc(doc(db('jordan'), `households/${H}/wishlists/p1`)));
});

test('a household can keep someone else’s list on one of its people', async () => {
  const r = db('riley');
  await assertSucceeds(setDoc(doc(r, 'households/home2/linked/p7'), { listId: L, by: 'riley', at: 1 }));
  await assertSucceeds(getDoc(doc(r, 'households/home2/linked/p7')));
  await assertFails(setDoc(doc(r, 'households/home2/linked/p8'), { listId: L, by: 'sam', at: 1 }));
  await assertFails(setDoc(doc(r, 'households/home2/linked/p8'), { listId: 'short', by: 'riley', at: 1 }));
  await assertFails(setDoc(doc(r, 'households/home2/linked/p8'), { listId: L, by: 'riley', at: 1, extra: 1 }));
  await assertFails(setDoc(doc(db('sam'), 'households/home2/linked/p8'), { listId: L, by: 'sam', at: 1 }));
  await assertFails(getDoc(doc(db('sam'), 'households/home2/linked/p7')));
  await assertSucceeds(deleteDoc(doc(r, 'households/home2/linked/p7')));
});

test('the owner can move their list to another household they’re in, as their person there', async () => {
  await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'households/home2/members/jordan'), { personId: 'p9' }));
  const j = db('jordan');
  await assertFails(updateDoc(doc(j, `wishlists/${L}`), { hid: 'home2', personId: 'p6' }));   // not who you are there
  await assertFails(updateDoc(doc(j, `wishlists/${L}`), { hid: 'home3', personId: 'p9' }));   // not a member there
  await assertFails(updateDoc(doc(db('sam'), `wishlists/${L}`), { hid: 'home2', personId: 'p9' }));
  await assertSucceeds(updateDoc(doc(j, `wishlists/${L}`), { hid: 'home2', personId: 'p9' }));
});
