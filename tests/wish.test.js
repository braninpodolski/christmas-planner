// Wish list data helpers. Made-up wishes only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanList, listDoc, wishListID, claimTarget, giftFromWish, claimer } from '../js/wish-core.js';

const id = 'k3v9q2m8x4c7b1n5z6h0p3t2';

test('finds the list id in a share link, an app link or a bare id', () => {
  assert.equal(wishListID(`https://example.github.io/gift-tags/wish.html?l=${id}`), id);
  assert.equal(wishListID(`gifttags://wish?l=${id}`), id);
  assert.equal(wishListID(`  ${id} `), id);
  assert.equal(wishListID('wish.html?l=short'), '');
  assert.equal(wishListID('hello'), '');
});

test('cleans a list and writes back only the allowed fields', () => {
  const l = cleanList(id, { owner: 'u1', hid: 'h1', personId: 'p1', name: 'Alex', updated: 5, extra: 1,
    items: [{ id: 'w1', name: ' Kettle ', price: 30 }, { id: 'w1', name: 'dupe' }, { id: 'bad id!' }, { id: 'w2', price: -4 }] });
  assert.deepEqual(l.items.map(w => [w.id, w.name, w.price]), [['w1', 'Kettle', 30], ['w2', 'Wish', '']]);
  assert.deepEqual(Object.keys(listDoc(l)).sort(), ['hid', 'items', 'name', 'owner', 'personId', 'updated']);
  assert.equal(cleanList(id, { hid: 'h1' }), null);
});

test('a claimed wish goes to their next event, or saved ideas', () => {
  const up = [{ id: 'party', people: ['x'] }, { id: 'xmas2026', people: ['p1', 'x'] }];
  assert.equal(claimTarget(up, 'p1', 'next'), 'xmas2026');
  assert.equal(claimTarget(up, 'p1', 'saved'), '');
  assert.equal(claimTarget(up, 'nobody', 'next'), '');
  const g = giftFromWish({ name: 'Kettle', price: 30, url: 'https://www.example.com/k', notes: 'Blue' }, 'p1', 'me', 'xmas2026', 'g9', 1);
  assert.deepEqual([g.personId, g.buyer, g.occasionId, g.status, g.store, g.price], ['p1', 'me', 'xmas2026', 'idea', 'example.com', 30]);
});

test('who claimed it: you, someone here, a typed name, or someone', () => {
  const ctx = { uid: 'u1', members: { u2: 'p2' }, names: { w3: 'Aunt Pat' } };
  assert.ok(claimer({ uid: 'u1', wishId: 'w1' }, ctx).you);
  assert.equal(claimer({ uid: 'u2', wishId: 'w2' }, ctx).person, 'p2');
  assert.equal(claimer({ uid: 'anon', wishId: 'w3' }, ctx).name, 'Aunt Pat');
  assert.ok(claimer({ uid: 'other', wishId: 'w4' }, ctx).someone);
});
