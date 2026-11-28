// Bringing solo plans into a household on joining: the same cases as the app's MergeTests. Made-up people only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bringing, hasPlans, plansSummary } from '../js/merge.js';

const P = (id, name, birthday = '') => ({ id, name, birthday });
const O = (id, type, date, people, extra = {}) => ({ id, type, title: '', date, people, budgets: {}, series: '', ...extra });
const G = (id, personId, occasionId, title) => ({ id, personId, occasionId, title, buyer: 'me' });
const solo = {
  people: [P('me', 'Alex'), P('m1', 'Mom'), P('t1', 'Theo'), P('r1', 'Riley', '0000-04-02')],
  occasions: [O('xmas2026', 'christmas', '2026-12-25', ['m1', 't1'], { budgets: { m1: 50 }, series: 'xmas' }),
    O('br1y2027', 'birthday', '2027-04-02', ['r1'], { series: 'br1' }),
    O('party', 'celebration', '2026-12-12', ['t1'], { title: 'Game night' })],
  gifts: [G('g1', 'm1', 'xmas2026', 'Scarf'), G('g2', 't1', 'party', 'Card game'), G('g3', 'r1', 'br1y2027', 'Book'), G('g4', 'me', '', 'Socks')],
};
const target = {
  people: [P('pa', 'Sam'), P('pb', 'Jordan'), P('pm', ' mom ')],
  occasions: [O('xmas2026', 'christmas', '2026-12-25', ['pa', 'pm'], { series: 'xmas' })],
};

test('same people and events merge, and the rest is added', () => {
  const add = bringing(solo, target, 'me', 'pb', 9);
  assert.deepEqual(new Set(add.people.map(p => p.name)), new Set(['Theo', 'Riley']));
  assert.ok(add.people.every(p => p.mod === 9));
  const byId = Object.fromEntries(add.occasions.map(o => [o.id, o]));
  assert.deepEqual(byId.xmas2026.people, ['pa', 'pm', 't1']);
  assert.ok(byId.br1y2027 && !byId.bpr1y2027);
  assert.deepEqual(byId.party.people, ['t1']);
  const g = Object.fromEntries(add.gifts.map(x => [x.id, x]));
  assert.equal(g.g1.personId, 'pm'); assert.equal(g.g1.buyer, 'pb'); assert.equal(g.g1.occasionId, 'xmas2026');
  assert.equal(g.g3.occasionId, 'br1y2027');
  assert.equal(g.g4.personId, 'pb'); // your own idea stays yours
});

test('a matched person’s birthday merges with theirs', () => {
  const t = { people: [...target.people, P('pr', 'Riley', '0000-04-02')],
    occasions: [...target.occasions, O('bpry2027', 'birthday', '2027-04-02', ['pr'], { series: 'bpr' })] };
  const add = bringing(solo, t, 'me', 'pb', 9);
  assert.ok(!add.occasions.some(o => o.id === 'br1y2027' || o.id === 'bpry2027'));
  assert.equal(add.gifts.find(x => x.id === 'g3').occasionId, 'bpry2027');
});

test('only real plans are worth asking about', () => {
  assert.equal(hasPlans({ people: [P('me', 'Alex')], occasions: [], gifts: [] }, 'me'), false);
  assert.ok(hasPlans(solo, 'me'));
  assert.equal(plansSummary(solo, 'me'), '3 people, 3 events and 4 gifts');
});
