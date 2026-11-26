// End-to-end: two devices (Branin and his wife) syncing one household through the emulator,
// with the real security rules. Run with: npm run test:rules
import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as F from 'firebase/firestore';
import { createCloud, pathFor, surpriseFor } from '../../js/cloud-core.js';
import { sanitize } from '../../js/data.js';
F.setLogLevel('silent');

let env, devices = [];
const H = 'home1';
const person = (id, name) => ({ id, name, created: 1, mod: 1 });
const gift = (id, personId, buyer, title, mod = 1) => ({ id, personId, buyer, title, status: 'idea', kind: 'buy', created: 1, mod });

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-gift-tags',
    firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8181 },
  });
});
after(() => env?.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const d = ctx.firestore();
    await F.setDoc(F.doc(d, `households/${H}`), { name: 'Home', createdBy: 'branin' });
    await F.setDoc(F.doc(d, `households/${H}/members/branin`), { personId: 'p1' });
    await F.setDoc(F.doc(d, `households/${H}/members/wife`), { personId: 'p2' });
  });
});
afterEach(() => { devices.forEach(d => d.cloud.stop()); devices = []; });

// A device: its own local state, synced through its own signed-in Firestore client
function device(uid, initial = {}) {
  const dev = { errors: [], state: sanitize({ occasions: [], people: [], gifts: [], ...initial }) };
  dev.cloud = createCloud({ F, db: env.authenticatedContext(uid).firestore(), hid: H, uid, getLocal: () => dev.state, setLocal: s => { dev.state = s; }, onStatus: (st, e) => { if (e) dev.errors.push(e.code || e.message); } });
  dev.edit = fn => { fn(dev.state); dev.cloud.sync(); };
  devices.push(dev);
  return dev;
}
const until = async (check, what) => {
  for (let i = 0; i < 100; i++) { if (check()) return; await new Promise(r => setTimeout(r, 50)); }
  assert.fail('timed out waiting for: ' + what + ' ' + JSON.stringify(devices.map(d => ({ errors: d.errors, gifts: d.state.gifts.length, people: d.state.people.length }))));
};
const titles = dev => dev.state.gifts.map(g => g.title).sort();

test('paths: a gift is a surprise only for a member someone else is buying for', () => {
  const m = { branin: 'p1', wife: 'p2' };
  assert.equal(surpriseFor(gift('a', 'p2', 'p1'), m), 'wife');
  assert.equal(surpriseFor(gift('b', 'p2', 'p2'), m), '', 'her own wish-list item');
  assert.equal(surpriseFor(gift('c', 'p3', 'p1'), m), '', 'grandma is not a member');
  assert.equal(pathFor('gifts', gift('a', 'p2', 'p1'), m), 'surprises/wife/gifts/a');
  assert.equal(pathFor('people', person('p1', 'B'), m), 'people/p1');
});

test('the list reaches the other device, but never the surprise meant for it', async () => {
  const people = [person('p1', 'Branin'), person('p2', 'Wife'), person('p3', 'Grandma')];
  const b = device('branin', { people, gifts: [gift('g1', 'p3', 'p1', 'Scarf for Grandma'), gift('g2', 'p2', 'p1', 'Airwrap for wife')] });
  const w = device('wife');
  await until(() => w.state.people.length === 3 && w.state.gifts.length === 1, 'wife gets the list');
  assert.deepEqual(titles(w), ['Scarf for Grandma']);
  assert.deepEqual(titles(b), ['Airwrap for wife', 'Scarf for Grandma']);
});

test('a surprise she plans for him stays off his device', async () => {
  const people = [person('p1', 'Branin'), person('p2', 'Wife')];
  const b = device('branin', { people });
  const w = device('wife');
  await until(() => w.state.people.length === 2, 'wife gets people');
  w.edit(s => s.gifts.push(gift('g3', 'p1', 'p2', 'Watch for Branin', 5)));
  w.edit(s => s.gifts.push(gift('g4', 'p2', 'p2', 'Wife wish list', 5)));
  await until(() => titles(b).includes('Wife wish list'), 'branin gets her wish-list item');
  await w.cloud.flush(); await new Promise(r => setTimeout(r, 300));
  assert.ok(!titles(b).includes('Watch for Branin'));
  assert.ok(titles(w).includes('Watch for Branin'));
});

test('edits on both devices merge, newest edit of each record wins', async () => {
  const people = [person('p1', 'Branin'), person('p2', 'Wife'), person('p3', 'Grandma'), person('p4', 'Grandpa')];
  const b = device('branin', { people });
  const w = device('wife');
  await until(() => w.state.people.length === 4, 'wife gets people');
  b.edit(s => { const p = s.people.find(x => x.id === 'p3'); p.name = 'Nana'; p.mod = 10; });
  w.edit(s => { const p = s.people.find(x => x.id === 'p4'); p.name = 'Pop'; p.mod = 10; });
  await until(() => [b, w].every(d => d.state.people.some(p => p.name === 'Nana') && d.state.people.some(p => p.name === 'Pop')), 'both edits everywhere');
});

test('a delete travels as a tombstone and doesn’t come back', async () => {
  const people = [person('p1', 'Branin'), person('p2', 'Wife'), person('p3', 'Grandma')];
  const b = device('branin', { people, gifts: [gift('g1', 'p3', 'p1', 'Scarf')] });
  const w = device('wife');
  await until(() => w.state.gifts.length === 1, 'wife gets the gift');
  w.edit(s => { s.gifts = []; s.deleted.g1 = Date.now(); });
  await until(() => b.state.gifts.length === 0, 'branin loses the gift');
  await new Promise(r => setTimeout(r, 300));
  assert.equal(b.state.gifts.length, 0);
  assert.equal(w.state.gifts.length, 0);
});

test('changing who a gift is for moves it into (or out of) a surprise', async () => {
  const people = [person('p1', 'Branin'), person('p2', 'Wife'), person('p3', 'Grandma')];
  const b = device('branin', { people, gifts: [gift('g1', 'p3', 'p1', 'Candle')] });
  const w = device('wife');
  await until(() => titles(w).includes('Candle'), 'wife sees the candle');
  b.edit(s => { const g = s.gifts.find(x => x.id === 'g1'); g.personId = 'p2'; g.mod = 20; });
  await until(() => !titles(w).includes('Candle'), 'the candle becomes a surprise for her');
  b.edit(s => { const g = s.gifts.find(x => x.id === 'g1'); g.personId = 'p3'; g.mod = 30; });
  await until(() => titles(w).includes('Candle'), 'and visible again once it’s for Grandma');
});

test('a new device joining later gets everything it is allowed to see', async () => {
  const people = [person('p1', 'Branin'), person('p2', 'Wife')];
  const b = device('branin', { people, gifts: [gift('g1', 'p2', 'p1', 'Secret'), gift('g2', 'p1', 'p1', 'Shared')] });
  await until(() => b.cloud.ready(), 'branin ready'); await b.cloud.flush();
  const w2 = device('wife');
  await until(() => w2.state.gifts.length === 1, 'second wife device loads');
  assert.deepEqual(titles(w2), ['Shared']);
});
