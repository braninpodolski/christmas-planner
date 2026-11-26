import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyWords, similarity, findSimilar } from '../js/similar.js';

test('titles are tidied down to their key words', () => {
  assert.deepEqual(keyWords('Big comfy robe!'), ['robe']);
  assert.deepEqual(keyWords('Dressing gown'), ['robe']);
  assert.deepEqual(keyWords('Fuzzy slippers'), ['fuzzy', 'slipper']);
  assert.deepEqual(keyWords('A set of 3 mugs'), ['mug']);
});

test('similar gifts match', () => {
  for (const [a, b] of [
    ['Big comfy robe', 'Fluffy bathrobe'],
    ['Big comfy robe', 'Dressing gown'],
    ['Cozy sweater', 'Wool jumper'],
    ['AirPods Pro', 'Noise-cancelling headphones'],
    ['Dyson Airwrap', 'Dyson hair dryer'],
    ['Watercolor Kit + Book', 'Watercolor paints'],
    ['Phantom of the Opera tickets', 'Opera tickets'],
    ['Cute lunchbox', 'Bento box'],
  ]) assert.ok(similarity(a, b).length, `${a} ~ ${b}`);
});

test('different gifts don’t', () => {
  for (const [a, b] of [
    ['Floor lamp', 'Paper slicer'],
    ['Pen', 'Pendant'],
    ['Big comfy robe', 'Big screen TV'],
    ['Gift card', 'Gift card'],          // nothing left once filler words go
    ['Automatic watch for work', 'Work bag'],
  ]) assert.equal(similarity(a, b).length, 0, `${a} vs ${b}`);
});

test('finds past gifts that were given and gifts already planned, for that person only', () => {
  const occasions = [{ id: 'x25', date: '2025-12-25' }, { id: 'x26', date: '2026-12-25' }];
  const gifts = [
    { id: 'g1', personId: 'a', occasionId: 'x25', status: 'wrapped', title: 'Fluffy bathrobe' },
    { id: 'g2', personId: 'a', occasionId: 'x25', status: 'idea', title: 'Silk robe' },          // never given
    { id: 'g3', personId: 'a', occasionId: 'x26', status: 'idea', title: 'Robe from Target' },    // planned this year
    { id: 'g4', personId: 'b', occasionId: 'x25', status: 'wrapped', title: 'Bathrobe' },        // someone else
    { id: 'g5', personId: 'a', occasionId: '', status: 'idea', title: 'Spa robe' },              // saved idea
  ];
  const r = findSimilar({ title: 'Big comfy robe', personId: 'a', gifts, occasions, today: '2026-11-26', excludeId: 'g9' });
  assert.deepEqual(r.map(x => `${x.gift.id}:${x.kind}`), ['g5:planned', 'g3:planned', 'g1:given']);
  assert.equal(findSimilar({ title: 'Robe', personId: 'a', gifts, occasions, today: '2026-11-26', excludeId: 'g3' }).some(x => x.gift.id === 'g3'), false, 'not itself');
  assert.deepEqual(findSimilar({ title: 'Gift card', personId: 'a', gifts, occasions, today: '2026-11-26' }), []);
});
