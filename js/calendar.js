import { CELEBRATION_RE, BDAY_RE, parseIcs, nameFrom } from './ics.js';
import { $, $$, Icon, esc, plural, uid } from './util.js';
import { COLORS, EVENT_TYPES, THEMES } from './constants.js';
import { fmtDate, nextOccurrence, pad2, parseYmd, ymd } from './dates.js';
import { clearBirthdayDeletion, dateOf } from './data.js';
import { needsIdentity, nextChristmasDate, occ, occTitle, person, possessive, sortedPeople, state, upcomingOccasions } from './store.js';
import { Nav } from './nav.js';
import { openSheet, toast, undoable } from './sheets.js';
import { dateFields, hintDate, readDate } from './datefields.js';
import { openEvent } from './event-sheet.js';
import { Desk } from './desktop.js';

/* =========================================================
   Calendar import: read .ics files (dropped, picked or pasted),
   guess what each event is, and ask only when unsure.
   ========================================================= */
export const CalImport = {
  MAX_BYTES: 2_000_000,
  CELEBRATION_RE, BDAY_RE,
  parse: parseIcs,
  nameFrom,
  matchPeople(name) {
    const n = name.toLowerCase();
    const exact = state.people.filter(p => p.name.toLowerCase() === n);
    if (exact.length) return exact;
    const first = n.split(/\s+/)[0];
    const byFirst = state.people.filter(p => p.name.toLowerCase().split(/\s+/)[0] === first);
    if (byFirst.length) return byFirst;
    return state.people.filter(p => n.startsWith(p.name.toLowerCase() + ' ') || p.name.toLowerCase().startsWith(n + ' '));
  },

  classify(ev, birthdayCalendar) {
    const t = ev.summary, md = ev.date.slice(5);
    const it = { summary: t, date: ev.date, repeat: !!ev.yearly, type: 'celebration', personId: '', newName: '', confident: false, exists: false, note: '' };
    if (this.BDAY_RE.test(t) || birthdayCalendar) {
      it.type = 'birthday'; it.repeat = true;
      const yy = +it.date.slice(0, 4);
      if (yy >= new Date().getFullYear() || yy < 1900) it.date = '0000' + it.date.slice(4);
      const name = this.nameFrom(t) || (birthdayCalendar ? t.trim() : '');
      it.newName = name;
      const matches = name ? this.matchPeople(name) : [];
      if (matches.length === 1) { it.personId = matches[0].id; it.confident = true; }
      else if (matches.length > 1) it.note = `More than one person matches “${name}”. Choose who this is.`;
      else if (name) { it.personId = 'new'; it.note = `${name} isn’t on your list yet.`; }
      else it.note = 'Choose whose birthday this is.';
      const p = it.personId && it.personId !== 'new' ? person(it.personId) : null;
      if (p?.birthday) {
        if (p.birthday.slice(5) === md) it.exists = true;
        else { it.confident = false; it.note = `This replaces ${possessive(p.name)} saved birthday, ${fmtDate(p.birthday, { month: 'long', day: 'numeric' })}.`; }
      }
    } else if (/\b(christmas|xmas|x-mas)\b/i.test(t) && (md === '12-25' || md === '12-24')) {
      it.type = 'christmas'; it.repeat = true; it.confident = true;
      if (occ('xmas' + nextChristmasDate().slice(0, 4))) it.exists = true;
    } else if (/anniversary/i.test(t)) {
      it.type = 'anniversary'; it.repeat = true; it.confident = true;
    } else if (this.CELEBRATION_RE.test(t)) {
      it.type = 'celebration'; it.confident = true;
    } else {
      it.note = 'Choose what kind of event this is.';
    }
    if (!it.exists && (it.type === 'anniversary' || it.type === 'celebration')) {
      const tl = t.toLowerCase();
      it.exists = state.occasions.some(o => o.type === it.type && o.date.slice(5) === md && (o.title || '').toLowerCase() === tl);
    }
    return it;
  },

  async readFiles(files) {
    const texts = [];
    for (const f of files) {
      if (!(/\.ics$/i.test(f.name) || /calendar/i.test(f.type))) continue;
      if (f.size > this.MAX_BYTES) { toast('That calendar file is too large', 'warn'); continue; }
      texts.push(await f.text());
    }
    return texts;
  },
  /* Browsers only let a page read dropped data during the drop event itself, so take a
     synchronous snapshot of every type first; the async work happens afterwards. */
  snapshot(dt) {
    const strings = {};
    for (const type of [...(dt.types || [])]) {
      if (type === 'Files') continue;
      try { const v = dt.getData(type); if (v) strings[type] = v; } catch {}
    }
    return { files: [...(dt.files || [])], strings };
  },
  async fromSnapshot(snap) {
    // 1. .ics files (Safari and Firefox receive these when dragging from Calendar; Finder too)
    let texts = await this.readFiles(snap.files);
    // 2. calendar data passed as text
    if (!texts.length) {
      for (const v of Object.values(snap.strings)) if (/BEGIN:VCALENDAR/i.test(v)) { texts.push(v.slice(v.search(/BEGIN:VCALENDAR/i))); break; }
    }
    if (texts.length) return this.run(texts);
    // 3. a readable description: title plus a date
    const plain = snap.strings['text/plain'] || (snap.strings['text/html'] || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ');
    const ev = plain && this.fromText(plain);
    if (ev) return this.run([], [ev]);
    // 4. nothing usable: explain the reliable route
    const link = snap.strings['text/uri-list'] || snap.strings['text/x-moz-url'] || (/^[a-z][\w+.-]*:\/\//i.test(plain || '') ? plain : '');
    if (snap.files.length) toast('That file isn’t a calendar file (.ics)', 'warn');
    else this.dropHelp(!!link);
  },
  // Reads "Title" + a date out of plain text, in the common formats Calendar apps use.
  fromText(text) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, 20);
    if (!lines.length || /^[a-z][\w+.-]*:\/\//i.test(lines[0])) return null;
    const months = 'jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec';
    const monthIdx = m => months.split('|').indexOf(m.slice(0, 3).toLowerCase()) + 1;
    const dmyFirst = !/^en-(US|PH)$/i.test(navigator.language || 'en-US');
    const tryDate = s => {
      let m;
      if ((m = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/))) return dateOf(`${m[1]}-${m[2]}-${m[3]}`);
      if ((m = s.match(new RegExp(`\\b(${months})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})`, 'i')))) return dateOf(`${m[3]}-${pad2(monthIdx(m[1]))}-${pad2(+m[2])}`);
      if ((m = s.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${months})[a-z]*\\.?,?\\s+(\\d{4})`, 'i')))) return dateOf(`${m[3]}-${pad2(monthIdx(m[2]))}-${pad2(+m[1])}`);
      if ((m = s.match(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/))) { const [a, b] = dmyFirst ? [m[2], m[1]] : [m[1], m[2]]; return dateOf(`${m[3]}-${pad2(+a)}-${pad2(+b)}`); }
      return '';
    };
    let date = '';
    for (const l of lines) { date = tryDate(l); if (date) break; }
    if (!date) return null;
    const title = lines.find(l => !tryDate(l) && !/^(scheduled|location|notes?|url|invitees?|calendar)\b/i.test(l) && !/^[a-z][\w+.-]*:\/\//i.test(l));
    if (!title) return null;
    return { summary: title.slice(0, 120), date, yearly: this.BDAY_RE.test(title), fromText: true };
  },
  dropHelp(gotLink) {
    openSheet({
      title: 'Add from calendar',
      saveLabel: 'Choose a file',
      required: [],
      body: `
        <div class="empty" style="padding:4px 24px 18px"><span class="ev-badge xl th-celebration">${Icon.calendar}</span>
          <h3>${gotLink ? 'Calendar only sent a link' : 'Nothing to add yet'}</h3>
          <p>${gotLink
            ? 'Some browsers only receive a link to the event, not its details. This works in every browser:'
            : 'That didn’t include any event details. This works in every browser:'}</p></div>
        <div class="fgroup">
          <div class="row"><span class="ev-badge sm th-idea">1</span><span class="row-main">Drag the event from Calendar to your Desktop. It becomes an .ics file.</span></div>
          <div class="row"><span class="ev-badge sm th-idea">2</span><span class="row-main">Drop that file here, or choose it below.</span></div>
        </div>
        <p class="fnote">To bring in many events at once, select a calendar in the Calendar app and choose File, then Export.</p>`,
      onSave() { setTimeout(() => $('#icsFile').click(), 50); },
    });
  },

  run(texts, extraEvents = []) {
    if (needsIdentity()) return;
    const items = [];
    const seen = new Set();
    for (const ev of extraEvents) {
      const it = this.classify(ev, false);
      it.confident = false; // text was guessed from a description, so always show it for a check
      it.fromText = true;
      it.note = [it.note, 'Read from the dragged text, so check the date.'].filter(Boolean).join(' ');
      seen.add(ev.summary.toLowerCase() + '|' + ev.date.slice(5));
      items.push(it);
    }
    for (const text of texts) {
      if (!/BEGIN:VCALENDAR/i.test(text)) continue;
      const { events, calName } = this.parse(text);
      const bdayCal = /birthday/i.test(calName);
      for (const ev of events) {
        const key = ev.summary.toLowerCase() + '|' + ev.date.slice(5);
        if (seen.has(key)) continue; // a yearly event exported as several dated copies
        seen.add(key);
        items.push(this.classify(ev, bdayCal));
      }
    }
    if (!items.length) { toast('No events found in that file', 'warn'); return; }
    const fresh = items.filter(i => !i.exists);
    if (!fresh.length) { toast(items.length === 1 ? 'That event is already in Events' : 'Those events are already in Events'); return; }
    if (fresh.every(i => i.confident)) this.apply(fresh);
    else this.review(items);
  },

  apply(items) {
    const added = [];
    undoable(`Added ${plural(items.length, 'event')}`, s => {
      for (const it of items) {
        if (it.type === 'birthday') {
          let p = it.personId && it.personId !== 'new' ? s.people.find(x => x.id === it.personId) : null;
          if (!p) {
            const name = (it.newName || '').trim().slice(0, 100); if (!name) continue;
            p = { id: uid(), created: Date.now(), name, relation: '', birthday: '', budget: '', color: COLORS[s.people.length % COLORS.length], emoji: '', notes: '', sizes: '' };
            s.people.push(p);
          }
          p.birthday = it.date; // planOccasions (run by commit) creates the upcoming birthday event
          clearBirthdayDeletion(s, p.id);
          added.push({ series: 'b' + p.id });
        } else if (it.type === 'christmas') {
          const date = nextChristmasDate(), id = 'xmas' + date.slice(0, 4);
          if (!s.occasions.some(o => o.id === id)) s.occasions.push({ id, created: Date.now(), type: 'christmas', title: '', date, people: s.people.map(p => p.id), budgets: {}, repeat: true, series: 'xmas' });
          added.push({ id });
        } else {
          const id = uid();
          const date = it.repeat || it.date.startsWith('0000') ? ymd(nextOccurrence(it.date)) : it.date;
          s.occasions.push({ id, created: Date.now(), type: it.type, title: it.summary.slice(0, 100), date, people: [], budgets: {}, repeat: !!it.repeat, series: it.repeat ? id : '' });
          added.push({ id });
        }
      }
    });
    // Open the single event that was added; for several, show the Events list.
    if (items.length === 1 && added[0]) {
      const o = added[0].id ? occ(added[0].id) : upcomingOccasions().find(x => x.series === added[0].series);
      if (o) setTimeout(() => openEvent(o.id), 250);
    } else if (Nav.current !== 'events') Nav.switchTab('events');
  },

  review(items) {
    const single = items.length === 1;
    const typeOpts = sel => EVENT_TYPES.map(t => `<option value="${t}" ${t === sel ? 'selected' : ''}>${THEMES[t].label}</option>`).join('');
    const whoOpts = it => `<option value="" ${it.personId ? '' : 'selected'} disabled>Choose</option>
      ${sortedPeople().map(p => `<option value="${esc(p.id)}" ${p.id === it.personId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
      <option value="new" ${it.personId === 'new' ? 'selected' : ''}>Add as a new person${it.newName ? `: ${esc(it.newName)}` : ''}</option>`;
    const when = it => it.type === 'birthday' || it.repeat
      ? `${fmtDate(it.date, { month: 'long', day: 'numeric' })}, every year`
      : fmtDate(it.date, { month: 'long', day: 'numeric', year: 'numeric' });
    const needs = items.filter(i => !i.exists && !i.confident).length;
    const intro = single
      ? (items[0].exists ? 'This event is already in Events.' : needs ? 'Check the details, then add it.' : 'Ready to add.')
      : `Found ${plural(items.length, 'event')}.${needs ? ` ${needs === 1 ? 'One needs' : `${needs} need`} a quick check.` : ''}`;
    openSheet({
      title: 'Add from calendar',
      saveLabel: single ? 'Add event' : 'Add events',
      required: [],
      body: `
        <p class="fnote" style="margin:0 0 16px;font-size:15px;color:var(--text)">${intro}</p>
        ${items.map((it, i) => `
          <div class="fgroup imp ${it.exists ? 'is-done' : ''}" data-i="${i}">
            <label class="row imp-head ${single ? '' : 'pick'}">
              <input type="checkbox" name="inc" value="${i}" ${single ? 'hidden' : ''} ${it.exists ? 'disabled' : (single || it.confident || it.type !== 'celebration') ? 'checked' : ''}>
              ${single ? '' : `<span class="pick-box">${Icon.check}</span>`}
              <span class="ev-badge sm th-${it.type}" data-badge>${Icon[THEMES[it.type].icon]}</span>
              <span class="row-main"><span class="row-title">${esc(it.summary)}</span><span class="row-sub" data-when>${esc(when(it))}</span></span>
              <span class="imp-pill" data-pill></span>
            </label>
            ${it.exists ? '' : `
              <div class="imp-more" ${it.confident ? 'hidden' : ''}>
                <div class="row"><label class="lbl" for="it${i}">Kind</label><select class="field" id="it${i}" name="type_${i}">${typeOpts(it.type)}</select>${Icon.chev}</div>
                <div class="row" data-whose><label class="lbl" for="iw${i}">Whose</label><select class="field" id="iw${i}" name="who_${i}">${whoOpts(it)}</select>${Icon.chev}</div>
                <div class="row" data-newname><label class="lbl" for="in${i}">Name</label><input class="field right" id="in${i}" name="name_${i}" value="${esc(it.newName)}" placeholder="Their name" autocapitalize="words"></div>
                ${dateFields('dt' + i, it.date, { label: 'Date', yearOptional: it.type === 'birthday' || it.repeat })}
                <label class="row" data-repeat><span class="row-main">Repeats every year</span><input type="checkbox" class="switch" name="rep_${i}" ${it.repeat ? 'checked' : ''}></label>
              </div>
              ${it.confident ? `<button type="button" class="row imp-change" data-change>Change details</button>` : ''}
              ${it.note ? `<div class="imp-note">${Icon.warn}<span>${esc(it.note)}</span></div>` : ''}`}
          </div>`).join('')}`,
      onOpen(sh) {
        const form = $('form', sh), btn = $('[data-sheet=save]', sh);
        const touched = new Set();
        form.addEventListener('input', e => { const m = e.target.name?.match(/^dt(\d+)$/); if (m) touched.add(+m[1]); });
        const sync = () => {
          let count = 0, ok = true;
          $$('.imp', form).forEach(box => {
            const i = +box.dataset.i, it = items[i], pill = box.querySelector('[data-pill]');
            if (it.exists) { pill.className = 'imp-pill done'; pill.textContent = 'Already added'; return; }
            const t = form.elements['type_' + i].value;
            const who = form.elements['who_' + i].value;
            const name = form.elements['name_' + i].value.trim();
            const rep = t === 'birthday' || t === 'christmas' || form.elements['rep_' + i].checked;
            box.querySelector('[data-whose]').hidden = t !== 'birthday';
            box.querySelector('[data-newname]').hidden = !(t === 'birthday' && who === 'new');
            box.querySelector('[data-repeat]').hidden = t === 'birthday' || t === 'christmas';
            const badge = box.querySelector('[data-badge]');
            badge.className = `ev-badge sm th-${t}`; badge.innerHTML = Icon[THEMES[t].icon];
            const date = hintDate(form, 'dt' + i, rep);
            if (date) box.querySelector('[data-when]').textContent = when({ type: t, repeat: rep, date: date.startsWith('0000') ? ymd(nextOccurrence(date)) : date });
            const complete = !!date && !(t === 'birthday' && (!who || (who === 'new' && !name)));
            const needsDateCheck = it.fromText && !touched.has(i);
            pill.className = `imp-pill ${!complete ? 'ask' : needsDateCheck ? 'verify' : 'ok'}`;
            pill.textContent = !complete ? 'Choose' : needsDateCheck ? 'Check date' : 'Ready';
            if (!box.querySelector('input[name=inc]').checked) return;
            count++;
            if (!complete) ok = false;
          });
          btn.disabled = !ok || !count;
          btn.firstChild.textContent = count === 1 ? 'Add event' : count ? `Add ${count} events` : 'Add events';
        };
        form.addEventListener('input', sync); form.addEventListener('change', sync);
        form.addEventListener('click', e => {
          const b = e.target.closest('[data-change]'); if (!b) return;
          const more = b.closest('.imp').querySelector('.imp-more');
          more.hidden = false; b.remove();
          more.querySelector('select, input')?.focus();
        });
        sync();
        // With a keyboard, start on the first thing that needs attention
        if (Desk.on()) setTimeout(() => $('.imp-more:not([hidden]) select, .imp-more:not([hidden]) input', form)?.focus({ preventScroll: true }), 60);
      },
      onSave(d, form) {
        const chosen = [];
        for (const box of $$('.imp', form)) {
          const i = +box.dataset.i, it = items[i];
          if (it.exists || !box.querySelector('input[name=inc]').checked) continue;
          const t = EVENT_TYPES.includes(d['type_' + i]) ? d['type_' + i] : 'celebration';
          const rep = t === 'birthday' || t === 'christmas' ? true : d['rep_' + i] === 'on';
          const date = readDate(d, 'dt' + i, rep);
          if (!date) return false;
          chosen.push({ ...it, type: t, date, repeat: rep,
            personId: t === 'birthday' ? d['who_' + i] : '', newName: (d['name_' + i] || '').trim() });
        }
        if (!chosen.length) return false;
        if (chosen.some(c => c.type === 'birthday' && (!c.personId || (c.personId === 'new' && !c.newName)))) return false;
        CalImport.apply(chosen);
      },
    });
  },
};

/* Drag events from Calendar (or any .ics file) onto the page */
(() => {
  let depth = 0, overlay = null, internal = false;
  // Any drag coming from outside the page. Text dropped into a text field is left alone.
  const isCal = e => {
    if (internal) return false;
    const types = [...(e.dataTransfer?.types || [])];
    if (!types.length) return false;
    const intoField = e.target?.closest?.('input, textarea, [contenteditable="true"]');
    return !(intoField && !types.includes('Files'));
  };
  addEventListener('dragstart', () => { internal = true; });
  addEventListener('dragend', () => { internal = false; });
  const show = () => {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.className = 'drop-zone';
    overlay.innerHTML = `<div class="drop-card"><span class="ev-badge xl th-birthday">${Icon.calendar}</span><h3>Drop to add events</h3><p>Birthdays are matched to people on your list. Anything unclear gets a quick question.</p></div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay?.classList.add('show'));
  };
  const hide = () => { const o = overlay; overlay = null; depth = 0; if (!o) return; o.classList.remove('show'); setTimeout(() => o.remove(), 200); };
  addEventListener('dragenter', e => { if (!isCal(e) || $('.whoami')) return; e.preventDefault(); depth++; show(); });
  addEventListener('dragover', e => { if (!isCal(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  addEventListener('dragleave', e => { if (!isCal(e)) return; depth = Math.max(0, depth - 1); if (!depth) hide(); });
  addEventListener('drop', e => {
    if (!isCal(e)) return;
    e.preventDefault(); // never let a dropped link navigate the page or open another app
    hide();
    if ($('.whoami')) return;
    const snap = CalImport.snapshot(e.dataTransfer); // must happen during the event
    CalImport.fromSnapshot(snap);
  });
})();

/* Calendar file (.ics) with yearly birthdays and events, each with a reminder a week before. */
export function exportIcs() {
  const esc2 = v => String(v).replace(/[\\;,]/g, m => '\\' + m).replace(/\r?\n/g, '\\n');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Gift Tags//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Gift Tags'];
  let count = 0;
  const add = (key, date, summary, yearly) => {
    const d0 = parseYmd(date), d1 = new Date(d0); d1.setDate(d1.getDate() + 1);
    lines.push('BEGIN:VEVENT', `UID:${key}@gift-tags`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${date.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${ymd(d1).replace(/-/g, '')}`,
      `SUMMARY:${esc2(summary)}`, ...(yearly ? ['RRULE:FREQ=YEARLY'] : []), 'TRANSP:TRANSPARENT',
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc2(summary)} is in a week`, 'TRIGGER:-P7D', 'END:VALARM', 'END:VEVENT');
    count++;
  };
  state.people.forEach(p => { if (p.birthday) add('bday-' + p.id, ymd(nextOccurrence(p.birthday)), `${possessive(p.name)} birthday`, true); });
  const seen = new Set();
  upcomingOccasions().forEach(o => {
    if (o.type === 'birthday') return;
    const key = o.repeat && o.series ? 'series-' + o.series : 'event-' + o.id;
    if (seen.has(key)) return; seen.add(key);
    add(key, o.date, occTitle(o), !!(o.repeat && o.series));
  });
  if (!count) { toast('Add a birthday or an event first', 'warn'); return; }
  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/calendar' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'gift-tags-events.ics';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast(`Exported ${plural(count, 'event')}`);
}
