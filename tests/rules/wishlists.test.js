// Wish list rules. Run with: npm run test:rules (starts the local Firestore emulator).
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where, setLogLevel } from 'firebase/firestore';
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
    await setDoc(doc(d, `wishlists/${L}/claims/w1`), { uid: 'sam', person: 'p2', at: 1 });
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

test('household members and guests see claims and claim as themselves', async () => {
  await assertSucceeds(getDocs(collection(db('sam'), `wishlists/${L}/claims`)));
  await assertSucceeds(getDocs(collection(guest(), `wishlists/${L}/claims`)));
  await assertSucceeds(setDoc(doc(guest(), `wishlists/${L}/claims/w2`), { uid: 'guest', name: 'Aunt Pat', at: 2 }));
  await assertFails(setDoc(doc(guest(), `wishlists/${L}/claims/w3`), { uid: 'sam', name: 'Not me', at: 2 }));
  await assertFails(setDoc(doc(guest(), `wishlists/${L}/claims/w4`), { uid: 'guest', name: 'x'.repeat(61), at: 2 }));
  await assertFails(setDoc(doc(guest(), `wishlists/${L}/claims/w5`), { uid: 'guest', at: 2, extra: 1 }));
  await assertFails(getDocs(collection(signedOut(), `wishlists/${L}/claims`)));
});

test('a claim can’t be taken over or changed; only its claimer (or the owner, blindly) removes it', async () => {
  await assertFails(setDoc(doc(guest(), `wishlists/${L}/claims/w1`), { uid: 'guest', at: 3 }));
  await assertFails(deleteDoc(doc(guest(), `wishlists/${L}/claims/w1`)));
  await assertSucceeds(deleteDoc(doc(db('jordan'), `wishlists/${L}/claims/w1`)));
  await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), `wishlists/${L}/claims/w1`), { uid: 'sam', person: 'p2', at: 1 }));
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
