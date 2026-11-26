import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextOccurrence, ymd, daysUntil, relDays } from '../js/dates.js';
import { parseTypedDate, readDate } from '../js/datefields.js';

test('nextOccurrence finds this year or next year', () => {
  const from = new Date(2026, 10, 26); // Nov 26, 2026
  assert.equal(ymd(nextOccurrence('1990-12-25', from)), '2026-12-25');
  assert.equal(ymd(nextOccurrence('1990-01-15', from)), '2027-01-15');
  assert.equal(ymd(nextOccurrence('0000-11-26', from)), '2026-11-26', 'today counts as upcoming');
});

test('a Feb 29 birthday still comes around every year', () => {
  const d = nextOccurrence('2000-02-29', new Date(2026, 5, 1));
  assert.equal(d.getFullYear(), 2027);
  assert.ok(ymd(d) === '2027-02-28' || ymd(d) === '2027-03-01');
});

test('daysUntil and relDays agree on today and tomorrow', () => {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  assert.equal(daysUntil(ymd(t)), 0);
  assert.match(relDays(0), /today/i);
  assert.match(relDays(1), /tomorrow/i);
});

test('typed dates: month names, numbers and ISO', () => {
  assert.equal(parseTypedDate('March 12, 1990'), '1990-03-12');
  assert.equal(parseTypedDate('mar 12 1990'), '1990-03-12');
  assert.equal(parseTypedDate('12 March 1990'), '1990-03-12');
  assert.equal(parseTypedDate('1990-03-12'), '1990-03-12');
  assert.equal(parseTypedDate('June 3rd, 2027'), '2027-06-03');
});

test('typed dates: the year is optional only when allowed', () => {
  assert.equal(parseTypedDate('jan 16', true), '0000-01-16');
  assert.equal(parseTypedDate('jan 16', false), '');
  assert.equal(parseTypedDate('Feb 29', true), '0000-02-29');
  assert.equal(parseTypedDate('Feb 29 2027'), '', 'not a leap year');
  assert.equal(parseTypedDate('April 31', true), '');
  assert.equal(parseTypedDate('nonsense', true), '');
  assert.equal(readDate({ dt: 'Dec 25' }, 'dt', true), '0000-12-25');
});
