import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitize, merge, planOccasions, canon } from '../js/data.js';
import { blank } from '../js/constants.js';
import { ymd, nextOccurrence } from '../js/dates.js';

const person = (id, extra = {}) => ({ id, name: 'P' + id, created: 1, mod: 1, ...extra });

test('sanitize drops unsafe and unknown values', () => {
  const s = sanitize({
    occasions: [],
    people: [person('a', { name: '<img src=x onerror=alert(1)>', color: 'javascript:alert(1)' }), { id: '../bad', name: 'Bad id' }],
    gifts: [{ id: 'g1', personId: 'a', title: 'Scarf', status: 'bought', price: '-5', order: 12.5 }, { id: 'g2', personId: 'nobody', title: 'Orphan' }],
  });
  assert.equal(s.people.length, 2);
  assert.ok(/^[a-z0-9]+$/i.test(s.people[1].id), 'a bad id is replaced');
  assert.equal(s.people[0].name, '<img src=x onerror=alert(1)>', 'text is kept as text (it is escaped when shown)');
  assert.notEqual(s.people[0].color, 'javascript:alert(1)');
  assert.equal(s.gifts.length, 1, 'a gift for someone not on the list is dropped');
  assert.equal(s.gifts[0].status, 'have', 'old "bought" becomes "In hand"');
  assert.equal(s.gifts[0].price, 0);
  assert.equal(s.gifts[0].order, 12.5);
});

test('upgrading a Christmas-only list keeps everything in one Christmas event', () => {
  const v2 = { people: [person('a', { budget: 50 }), person('b')], gifts: [{ id: 'g1', personId: 'a', title: 'Book', status: 'idea' }], tasks: [] };
  const s = sanitize(v2);
  assert.equal(s.occasions.length, 1);
  const x = s.occasions[0];
  assert.equal(x.type, 'christmas');
  assert.deepEqual(x.people.sort(), ['a', 'b']);
  assert.equal(x.budgets.a, 50);
  assert.equal(s.gifts[0].occasionId, x.id);
});

test('an already-upgraded list is not upgraded again', () => {
  const s = sanitize({ occasions: [], people: [person('a')], gifts: [] });
  assert.equal(s.occasions.length, 0);
});

test('merge keeps the newest edit of each item from either device', () => {
  const base = sanitize({ occasions: [], people: [person('a'), person('b')], gifts: [] });
  const A = structuredClone(base), B = structuredClone(base);
  A.people[0].name = 'Edited on A'; A.people[0].mod = 10;
  B.people[1].name = 'Edited on B'; B.people[1].mod = 10;
  const m = merge(A, B);
  assert.deepEqual(m.people.map(p => p.name).sort(), ['Edited on A', 'Edited on B']);
  assert.equal(canon(merge(A, B)), canon(merge(B, A)), 'order of merging does not matter');
});

test('a deletion wins over an older edit, but not a newer one', () => {
  const base = sanitize({ occasions: [], people: [person('a'), person('b')], gifts: [] });
  const A = structuredClone(base), B = structuredClone(base);
  A.people = A.people.filter(p => p.id !== 'a'); A.deleted.a = 20;
  B.people[0].mod = 10;
  assert.ok(!merge(A, B).people.some(p => p.id === 'a'));
  B.people[0].mod = 30;
  assert.ok(merge(A, B).people.some(p => p.id === 'a'), 'edited after the delete, so it comes back');
});

test('planOccasions creates each upcoming birthday once, with a stable id', () => {
  const s = blank();
  s.people = [person('a', { birthday: '0000-03-12' })];
  planOccasions(s);
  const due = ymd(nextOccurrence('0000-03-12'));
  assert.deepEqual(s.occasions.map(o => o.id), [`bay${due.slice(0, 4)}`]);
  planOccasions(s);
  assert.equal(s.occasions.length, 1, 'running it again changes nothing');
});

test('a deleted birthday event is not recreated', () => {
  const s = blank();
  s.people = [person('a', { birthday: '1990-03-12' })];
  const due = ymd(nextOccurrence('1990-03-12'));
  s.deleted[`bay${due.slice(0, 4)}`] = Date.now();
  planOccasions(s);
  assert.equal(s.occasions.length, 0);
});

test('a yearly event rolls forward once it has passed', () => {
  const s = blank();
  s.occasions = [{ id: 'xmas2020', type: 'christmas', title: '', date: '2020-12-25', people: [], budgets: {}, repeat: true, series: 'xmas', mod: 0, created: 0 }];
  planOccasions(s);
  const next = ymd(nextOccurrence('2020-12-25'));
  assert.ok(s.occasions.some(o => o.id === 'xmas' + next.slice(0, 4)));
  assert.ok(s.occasions.some(o => o.id === 'xmas2020'), 'past years stay as history');
});
