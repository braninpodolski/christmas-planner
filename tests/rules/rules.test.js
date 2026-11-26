// Security rules tests. Run with: npm run test:rules (starts the local Firestore emulator).
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, writeBatch, Timestamp, setLogLevel } from 'firebase/firestore';
setLogLevel('silent'); // denied writes are expected here; keep the output readable

let env;
const H = 'home1';
const CODE = 'invite-code-0123456789abcdef';
const db = uid => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const later = () => Timestamp.fromMillis(Date.now() + 7 * 86400000);

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-gift-tags',
    firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8181 },
  });
});
after(() => env?.cleanup());

// A household where Branin and his wife are members, with a shared gift and a surprise for each
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const d = ctx.firestore();
    await setDoc(doc(d, `households/${H}`), { name: 'Home', createdBy: 'branin' });
    await setDoc(doc(d, `households/${H}/members/branin`), { personId: 'p1' });
    await setDoc(doc(d, `households/${H}/members/wife`), { personId: 'p2' });
    await setDoc(doc(d, `households/${H}/people/p3`), { name: 'Grandma' });
    await setDoc(doc(d, `households/${H}/gifts/g1`), { title: 'Scarf for Grandma', personId: 'p3' });
    await setDoc(doc(d, `households/${H}/surprises/p1/gifts/s1`), { title: 'Watch for Branin', personId: 'p1' });
    await setDoc(doc(d, `households/${H}/surprises/p2/gifts/s2`), { title: 'Airwrap for wife', personId: 'p2' });
    await setDoc(doc(d, `invites/${CODE}`), { hid: H, personId: 'p4', createdBy: 'branin', expires: later() });
    await setDoc(doc(d, 'invites/expired-code-0123456789abc'), { hid: H, personId: 'p5', createdBy: 'branin', expires: Timestamp.fromMillis(Date.now() - 1000) });
  });
});

test('members can read and write the shared list', async () => {
  await assertSucceeds(getDoc(doc(db('wife'), `households/${H}/gifts/g1`)));
  await assertSucceeds(setDoc(doc(db('wife'), `households/${H}/gifts/g2`), { title: 'Socks' }));
  await assertSucceeds(getDocs(collection(db('branin'), `households/${H}/people`)));
});

test('a recipient can never read, list, change or delete their own surprises', async () => {
  const me = db('branin');
  await assertFails(getDoc(doc(me, `households/${H}/surprises/p1/gifts/s1`)));
  await assertFails(getDocs(collection(me, `households/${H}/surprises/p1/gifts`)));
  await assertFails(setDoc(doc(me, `households/${H}/surprises/p1/gifts/s1`), { title: 'peek' }));
  await assertFails(deleteDoc(doc(me, `households/${H}/surprises/p1/gifts/s1`)));
  await assertFails(setDoc(doc(me, `households/${H}/surprises/p1/gifts/new`), { title: 'planted' }));
});

test('other members can read and plan surprises for someone', async () => {
  const wife = db('wife');
  await assertSucceeds(getDocs(collection(wife, `households/${H}/surprises/p1/gifts`)));
  await assertSucceeds(setDoc(doc(wife, `households/${H}/surprises/p1/gifts/s3`), { title: 'Book for Branin' }));
  await assertSucceeds(getDoc(doc(db('branin'), `households/${H}/surprises/p2/gifts/s2`)));
});

test('people outside the household (or signed out) can read nothing', async () => {
  for (const d of [db('stranger'), anon()]) {
    await assertFails(getDoc(doc(d, `households/${H}`)));
    await assertFails(getDoc(doc(d, `households/${H}/gifts/g1`)));
    await assertFails(getDocs(collection(d, `households/${H}/people`)));
    await assertFails(getDoc(doc(d, `households/${H}/surprises/p1/gifts/s1`)));
    await assertFails(setDoc(doc(d, `households/${H}/gifts/x`), { title: 'spam' }));
  }
});

test('collections outside the allowed list are closed', async () => {
  await assertFails(setDoc(doc(db('branin'), `households/${H}/secrets/x`), { a: 1 }));
  await assertFails(setDoc(doc(db('branin'), 'other/x'), { a: 1 }));
});

test('creating a household makes you its first member', async () => {
  const d = db('cousin');
  const b = writeBatch(d);
  b.set(doc(d, 'households/home2'), { name: 'Cousins', createdBy: 'cousin' });
  b.set(doc(d, 'households/home2/members/cousin'), { personId: 'c1' });
  await assertSucceeds(b.commit());
  await assertSucceeds(getDoc(doc(d, 'households/home2')));
});

test('you cannot create a household in someone else’s name or add yourself to one you didn’t create', async () => {
  await assertFails(setDoc(doc(db('cousin'), 'households/home3'), { name: 'X', createdBy: 'branin' }));
  await assertFails(setDoc(doc(db('stranger'), `households/${H}/members/stranger`), { personId: 'p9' }));
});

test('joining needs a live invite to that household', async () => {
  await assertFails(setDoc(doc(db('daughter'), `households/${H}/members/daughter`), { personId: 'p2', invite: CODE }), 'not as someone else');
  await assertSucceeds(setDoc(doc(db('daughter'), `households/${H}/members/daughter`), { personId: 'p4', invite: CODE }));
  await assertFails(setDoc(doc(db('late'), `households/${H}/members/late`), { personId: 'p5', invite: 'expired-code-0123456789abc' }));
  await assertFails(setDoc(doc(db('typo'), `households/${H}/members/typo`), { personId: 'p6', invite: 'no-such-code-0123456789abc' }));
});

test('you cannot add someone else with an invite', async () => {
  await assertFails(setDoc(doc(db('stranger'), `households/${H}/members/friend`), { personId: 'p7', invite: CODE }));
});

test('an invite to one household does not open another', async () => {
  await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'households/home2'), { name: 'Other', createdBy: 'x' }));
  await assertFails(setDoc(doc(db('stranger'), 'households/home2/members/stranger'), { personId: 'p8', invite: CODE }));
});

test('invites can be fetched by code but never listed, and only members create them', async () => {
  await assertSucceeds(getDoc(doc(db('stranger'), `invites/${CODE}`)));
  await assertFails(getDocs(collection(db('stranger'), 'invites')));
  await assertFails(getDocs(collection(db('branin'), 'invites')));
  await assertSucceeds(setDoc(doc(db('branin'), 'invites/another-long-code-0123456789'), { hid: H, personId: 'p6', createdBy: 'branin', expires: later() }));
  await assertFails(setDoc(doc(db('stranger'), 'invites/sneaky-long-code-0123456789'), { hid: H, personId: 'p6', createdBy: 'stranger', expires: later() }));
  await assertFails(setDoc(doc(db('branin'), 'invites/short'), { hid: H, personId: 'p6', createdBy: 'branin', expires: later() }));
});

test('members can leave, and a removed member loses access', async () => {
  await assertSucceeds(deleteDoc(doc(db('wife'), `households/${H}/members/wife`)));
  await assertFails(getDoc(doc(db('wife'), `households/${H}/gifts/g1`)));
});

test('the sign-in test area is private to each person', async () => {
  await assertSucceeds(setDoc(doc(db('branin'), 'spike/branin/notes/n'), { a: 1 }));
  await assertFails(getDoc(doc(db('wife'), 'spike/branin/notes/n')));
});

test('nobody can change which person they are (to read someone else’s surprises)', async () => {
  await assertFails(setDoc(doc(db('branin'), `households/${H}/members/branin`), { personId: 'p3' }));
  await assertFails(setDoc(doc(db('branin'), `households/${H}/members/wife`), { personId: 'p1' }));
  await assertSucceeds(setDoc(doc(db('branin'), `households/${H}/members/branin`), { personId: 'p1', name: 'B' }));
});

test('surprises for people who aren’t members are visible to every member', async () => {
  await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), `households/${H}/surprises/p3/gifts/s9`), { title: 'For Grandma' }));
  await assertSucceeds(getDoc(doc(db('branin'), `households/${H}/surprises/p3/gifts/s9`)));
  await assertSucceeds(getDoc(doc(db('wife'), `households/${H}/surprises/p3/gifts/s9`)));
});
