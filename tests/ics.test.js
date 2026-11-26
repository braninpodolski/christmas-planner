import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIcs, nameFrom, BDAY_RE, CELEBRATION_RE } from '../js/ics.js';

const cal = body => `BEGIN:VCALENDAR\r\nX-WR-CALNAME:Birthdays\r\n${body}END:VCALENDAR\r\n`;

test('reads summary, date and yearly repeat', () => {
  const { events, calName } = parseIcs(cal('BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:19950312\r\nRRULE:FREQ=YEARLY\r\nSUMMARY:Amina’s Birthday\r\nEND:VEVENT\r\n'));
  assert.equal(calName, 'Birthdays');
  assert.deepEqual(events, [{ date: '1995-03-12', yearly: true, summary: 'Amina’s Birthday' }]);
});

test('unfolds long lines and unescapes text', () => {
  const { events } = parseIcs(cal('BEGIN:VEVENT\r\nSUMMARY:Dinner\\, drinks\r\n  and cake\r\nDTSTART:20270603T140000\r\nEND:VEVENT\r\n'));
  assert.equal(events[0].summary, 'Dinner, drinks and cake');
  assert.equal(events[0].date, '2027-06-03');
});

test('skips events without a date or a title', () => {
  const { events } = parseIcs(cal('BEGIN:VEVENT\r\nSUMMARY:No date\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nDTSTART:20270101\r\nEND:VEVENT\r\n'));
  assert.equal(events.length, 0);
});

test('finds the name in common birthday titles', () => {
  assert.equal(nameFrom('Amina’s Birthday'), 'Amina');
  assert.equal(nameFrom("Arina Guliyeva's 30th birthday"), 'Arina Guliyeva');
  assert.equal(nameFrom('Birthday: Marcus'), 'Marcus');
  assert.equal(nameFrom('Happy birthday Lily 🎂'), 'Lily');
  assert.equal(nameFrom('Drew bday'), 'Drew');
  assert.equal(nameFrom('My birthday'), '');
});

test('tells birthdays and celebrations apart', () => {
  assert.ok(BDAY_RE.test('Mom bday'));
  assert.ok(!BDAY_RE.test('Birthdate paperwork'));
  assert.ok(CELEBRATION_RE.test('Lily’s graduation'));
  assert.ok(!CELEBRATION_RE.test('Dentist'));
});
