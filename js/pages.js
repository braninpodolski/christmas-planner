import { BOW_SMALL, Icon, esc, money, num, plural } from './util.js';
import { CATEGORIES, STATUSES, STATUS_IDS } from './constants.js';
import { dateRel, daysUntil, fmtDate, relDays } from './dates.js';
import { firstName, ideasFor, isMe, isReady, isSpent, me, nextFor, occ, occBudget, occGifts, occPeople, occSpent, occTitle, occYearTitle, pastOccasions, person, possessive, sharing, sortedPeople, state, sumSpent, ui, upcomingOccasions, visibleGifts } from './store.js';
import { bow, evBadge, eventTile, leftLabel, presentCard, statusChip, tag } from './components.js';
import { Nav } from './nav.js';
import { fmtBirthday } from './datefields.js';
import { byGiftOrder, byPersonThenOrder } from './gift-drag.js';
import { Sync } from './sync.js';
import { Desk } from './desktop.js';
import { Cloud } from './cloud.js';
import { Pins } from './pins.js';
import { ownWishBlock, wishEntryRow, wishListPage } from './wish-ui.js';
import { Wishes } from './wishes.js';

/* =========================================================
   Pages
   ========================================================= */
export const TABS = [
  { id: 'home', label: 'Home', icon: 'star', root: 'home' },
  { id: 'events', label: 'Events', icon: 'calendar', root: 'events' },
  { id: 'people', label: 'People', icon: 'tag', root: 'people' },
  { id: 'gifts', label: 'Gifts', icon: 'gift', root: 'gifts' },
];

export const Pages = {
  home: {
    title: () => 'Home',
    largeTitle: false,
    collapseAt: 120,
    actions: () => `<button class="nav-btn glass" data-action="open-settings" aria-label="Settings">${Icon.gear}</button>`,
    render() {
      const up = upcomingOccasions();
      const next = up[0];
      const intro = !ui.introPlayed; ui.introPlayed = true;
      const ideas = visibleGifts().filter(g => !g.occasionId);

      const hero = next ? presentCard(next, { intro }) : `
        <section class="present hero-colors th-celebration ${intro ? 'intro' : ''}" aria-label="Getting started">
          <span class="ribbon"></span>${bow()}
          <h1>${state.people.length ? 'Plan the next celebration.' : 'Every gift, all year.'}</h1>
          <p>${state.people.length
            ? 'Add birthdays to the people on your list, or create an event like Christmas or an anniversary. This card counts down to whatever is next.'
            : 'Add the people you buy for, then their birthdays and holidays. This card counts down to whatever is next.'}</p>
          <div class="present-actions"><button class="pbtn" data-action="${state.people.length ? 'add-event' : 'add-person'}">${state.people.length ? 'Add event' : 'Add person'}</button></div>
        </section>`;

      const needs = next ? occPeople(next).filter(p => !isMe(p.id) && !occGifts(next).some(g => g.personId === p.id && isSpent(g))) : [];
      const buyingFor = next ? occPeople(next).filter(p => !isMe(p.id)).length : 0;
      // only what's close: the next 8 weeks (the hero card already shows the very next one)
      const soon = up.slice(1).filter(o => daysUntil(o.date) <= 56).slice(0, 6);
      const later = up.length - 1 - soon.length;
      return `
        ${hero}

        ${soon.length ? `
          <div class="block">
            <div class="block-head"><h2>Coming up</h2><button class="link" data-action="tab" data-tab="events">See all</button></div>
            <div class="shelf">${soon.map(eventTile).join('')}</div>
            ${later ? `<p class="note">Showing the next 8 weeks. ${plural(later, 'more event')} later in the year in Events.</p>` : ''}
          </div>` : up.length > 1 ? `
          <div class="block"><div class="list"><button class="row" data-action="tab" data-tab="events">
            <span class="row-main"><span class="row-title">Nothing else in the next 8 weeks</span><span class="row-sub">${plural(up.length - 1, 'more event')} later in the year</span></span>${Icon.chev}
          </button></div></div>` : ''}

        ${needs.length ? `
          <div class="block">
            <div class="block-head"><h2>Still need a gift</h2><span class="meta">${buyingFor - needs.length} of ${buyingFor} sorted</span></div>
            <p class="note" style="padding-top:0;padding-bottom:6px">${needs.length === 1 ? `${esc(firstName(needs[0]))} has nothing` : 'These people have nothing'} ordered or being made yet for ${esc(occTitle(next))}. Tap ${needs.length === 1 ? 'the tag' : 'a tag'} to plan.</p>
            <div class="shelf">
              ${needs.map(p => {
                const n = occGifts(next).filter(g => g.personId === p.id).length;
                const saved = ideasFor(p.id).length;
                return `<button class="shelf-tag" data-action="open-event" data-id="${esc(next.id)}" aria-label="${esc(p.name)}">
                  <span class="tag" style="--c:${p.color}">
                    <span class="nm">${esc(p.name)}</span>
                    <span class="sb">${p.emoji ? `<span class="em">${esc(p.emoji)}</span>` : ''}${n ? `${plural(n, 'idea')}, none ordered` : saved ? `${plural(saved, 'saved idea')} to use` : 'No ideas yet'}</span>
                  </span>
                </button>`;
              }).join('')}
            </div>
          </div>` : ''}

        ${!state.people.length ? `
          <div class="empty">
            <span class="tag xl" style="--c:var(--cranberry)">?</span>
            <h3>Who’s on your list?</h3>
            <p>Start with the people you buy for. Add their birthdays and they’ll show up on their own every year.</p>
            <button class="btn" data-action="add-person">Add person</button>
          </div>` : ''}

        ${ideas.length ? `
          <div class="block">
            <div class="list"><button class="row" data-action="show-ideas" data-row="link">
              <span class="ev-badge th-idea">${Icon.idea}</span>
              <div class="row-main"><div class="row-title">${plural(ideas.length, 'saved idea')}</div><div class="row-sub">Ideas you haven’t planned for an event yet</div></div>${Icon.chev}
            </button></div>
          </div>` : ''}

      `;
    },
  },

  events: {
    title: () => 'Events',
    render() {
      const up = upcomingOccasions(), past = pastOccasions();
      if (!state.occasions.length) return `
        <div class="empty">
          <span class="ev-badge xl th-birthday">${Icon.cake}</span>
          <h3>No events yet</h3>
          <p>Birthdays you add to people show up here on their own. You can also add Christmas, anniversaries and other celebrations.</p>
          <button class="btn" data-action="add-event">Add event</button>
          <button class="btn quiet" data-action="import-ics">Import from Calendar</button>
        </div>`;
      return `
        ${up.length ? `
          <div class="block">
            <div class="block-head"><h2>Coming up</h2><span class="meta">${up.length}</span></div>
            <div class="list" style="--inset:66px">${up.map(eventRow).join('')}</div>
          </div>` : '<p class="note" style="font-size:15px">Nothing coming up. Add an event, or add birthdays to people.</p>'}
        ${past.length ? `
          <div class="block">
            <div class="block-head"><h2>Past</h2><button class="link" data-action="toggle-past" aria-expanded="${ui.showPast}">${ui.showPast ? 'Hide' : `Show ${past.length}`}</button></div>
            ${ui.showPast ? `<div class="list" style="--inset:66px">${past.map(eventRow).join('')}</div>` : ''}
          </div>` : ''}
        <div class="block"><div class="list">
          <button class="row add" data-action="import-ics"><span class="plus-dot">${Icon.calendar}</span>Import from a calendar file</button>
        </div>
        <p class="note">${Desk.on() ? 'You can also drag events straight from Calendar onto this window. Press E to add an event.' : 'Birthdays and yearly events repeat on their own, and their gifts are kept as history.'}</p></div>`;
    },
  },

  event: {
    title: r => { const o = occ(r.id); return o ? occTitle(o) : ''; },
    largeTitle: false,
    collapseAt: 220,
    actions: r => `<button class="nav-btn text glass" data-action="edit-event" data-id="${esc(r.id)}">Edit</button>`,
    render(r) {
      const o = occ(r.id);
      if (!o) { setTimeout(() => Nav.pop(), 0); return ''; }
      const people = occPeople(o);
      const budget = occBudget(o), spent = occSpent(o);
      return `
        ${presentCard(o, { link: false })}
        ${budget ? `
          <div class="ledger">
            <div class="ledger-row"><span class="big">${money(spent)}</span><span class="of">of ${money(budget)}</span></div>
            <div class="meter ${spent > budget ? 'over' : ''}"><i style="width:${Math.min(spent / budget, 1) * 100}%"></i></div>
            <div class="say">${spent <= budget ? `<b>${money(budget - spent)}</b> left to spend.` : `<b class="over">${money(spent - budget)}</b> over budget.`}</div>
          </div>` : ''}
        ${people.map(p => {
          if (isMe(p.id)) return `
            <div class="block">
              <div class="group-head">${tag(p)}<h2>${esc(p.name)}</h2><span class="you">You</span></div>
              <p class="note" style="padding-top:2px">Your gifts are a surprise, so they’re hidden here.</p>
            </div>`;
          const gs = occGifts(o).filter(g => g.personId === p.id).sort(byGiftOrder);
          const saved = ideasFor(p.id).length;
          const b = num(o.budgets[p.id]);
          return `
            <div class="block">
              <button class="group-head" data-action="open-person" data-id="${esc(p.id)}" style="width:100%;text-align:left">${tag(p)}<h2>${esc(p.name)}</h2>${b ? leftLabel(occSpent(o, p.id), b) : ''}</button>
              <div class="list">
                ${gs.map(g => giftRow(g)).join('')}
                <button class="row add" data-action="add-gift" data-person="${esc(p.id)}" data-occ="${esc(o.id)}"><span class="plus-dot">${Icon.plus}</span>Add gift</button>
                ${saved ? `<button class="row add" data-action="use-ideas" data-person="${esc(p.id)}" data-occ="${esc(o.id)}"><span class="plus-dot">${Icon.idea}</span>Use a saved idea<span class="meta" style="margin-left:auto">${saved}</span></button>` : ''}
              </div>
            </div>`;
        }).join('')}
        ${o.type === 'birthday' ? '' : `<div class="block"><div class="list">
          <button class="row add" data-action="edit-event" data-id="${esc(o.id)}"><span class="plus-dot">${Icon.tag}</span>${people.length ? 'Add or remove people' : 'Choose who you’re buying for'}</button>
        </div></div>`}`;
    },
  },

  people: {
    title: () => 'People',
    render() {
      if (!state.people.length) return `
        <div class="empty">
          <span class="tag xl" style="--c:var(--fir)">?</span>
          <h3>Who’s on your list?</h3>
          <p>Add the people you buy for. Give them a birthday and it shows up in Events every year.</p>
          <button class="btn" data-action="add-person">Add person</button>
        </div>`;
      return `
        <div class="block">
          <div class="list" style="--inset:80px">
            ${[...sortedPeople().filter(p => Pins.has(p.id)), ...sortedPeople().filter(p => !Pins.has(p.id))].map(p => {
              const nx = nextFor(p.id);
              const nxLabel = nx ? `${nx.type === 'birthday' && nx.people[0] === p.id ? 'Birthday' : occTitle(nx)} ${relDays(daysUntil(nx.date))}` : (p.relation || 'Nothing coming up');
              if (isMe(p.id)) return `
              <div class="swipe"><div class="swipe-content">
                <button class="row" data-action="open-person" data-id="${esc(p.id)}" data-row="person">
                  ${tag(p)}
                  <div class="row-main"><div class="row-title">${esc(p.name)} <span class="you">You</span>${Pins.has(p.id) ? `<span class="pinned" title="Pinned">${Icon.pin}</span>` : ''}</div><div class="row-sub">${esc(nxLabel)}</div></div>
                  ${Icon.chev}
                </button>
              </div></div>`;
              const saved = ideasFor(p.id).length;
              return `
              <div class="swipe ${ui.justAdded === p.id ? 'enter' : ''}">
                <div class="swipe-actions"><button class="pin-act" data-action="toggle-pin" data-id="${esc(p.id)}" aria-label="${Pins.has(p.id) ? 'Unpin' : 'Pin to top'}" title="${Pins.has(p.id) ? 'Unpin (F)' : 'Pin to top (F)'}">${Pins.has(p.id) ? 'Unpin' : 'Pin'}</button><button data-action="delete-person" data-id="${esc(p.id)}">Delete</button></div>
                <div class="swipe-content">
                  <button class="row" data-action="open-person" data-id="${esc(p.id)}" data-row="person">
                    ${tag(p)}
                    <div class="row-main">
                      <div class="row-title">${esc(p.name)}${Pins.has(p.id) ? `<span class="pinned" title="Pinned">${Icon.pin}</span>` : ''}</div>
                      <div class="row-sub">${esc(nxLabel)}</div>
                    </div>
                    ${saved ? `<span class="row-count">${plural(saved, 'idea')}</span>` : ''}
                    ${Icon.chev}
                  </button>
                </div>
              </div>`;
            }).join('')}
          </div>
          <p class="note">${plural(state.people.length, 'person', 'people')}. ${Desk.on() ? 'Hover a person to pin or delete, or select one and press F or ⌫.' : 'Swipe left on a person to pin or delete.'}</p>
        </div>`;
    },
  },

  person: {
    title: r => person(r.id)?.name || '',
    largeTitle: false,
    collapseAt: 150,
    actions: r => `<button class="nav-btn glass pin-btn ${Pins.has(r.id) ? 'on' : ''}" data-action="toggle-pin" data-id="${esc(r.id)}" aria-pressed="${!!Pins.has(r.id)}" aria-label="${Pins.has(r.id) ? 'Unpin from the top of People' : 'Pin to the top of People'}" title="Pin to top (F)">${Icon.pin}</button><button class="nav-btn text glass" data-action="edit-person" data-id="${esc(r.id)}">Edit</button>`,
    render(r) {
      const p = person(r.id);
      if (!p) { setTimeout(() => Nav.pop(), 0); return ''; }
      const bday = p.birthday ? `Birthday ${fmtBirthday(p.birthday)}` : '';
      const head = `
        <div class="person-head">
          ${tag(p, 'lg')}
          <h1>${esc(p.name)}</h1>
          <div class="rel">${[isMe(p.id) ? 'You' : esc(p.relation), bday].filter(Boolean).join('<br>')}</div>
        </div>`;
      if (isMe(p.id)) return `${head}
        ${ownWishBlock(p)}
        <p class="note" style="text-align:center">Gifts others plan for you stay hidden, along with their price and status.</p>
        ${p.sizes ? `<div class="block"><div class="block-head"><h2>Sizes and favorites</h2></div><div class="prose">${esc(p.sizes)}</div><p class="note">Everyone sharing this list can see this, so it’s a good place for hints.</p></div>` : `<p class="note" style="text-align:center">Add your sizes and favorites with Edit. Everyone sharing the list can see them.</p>`}`;
      const sortGifts = gs => gs.sort(byGiftOrder);
      const upcoming = upcomingOccasions().filter(o => o.people.includes(p.id));
      const ideas = sortGifts(ideasFor(p.id));
      const history = pastOccasions().map(o => [o, sortGifts(occGifts(o).filter(g => g.personId === p.id))]).filter(([, gs]) => gs.length);
      return `${head}
        ${wishEntryRow(p.id)}
        ${upcoming.map(o => {
          const gs = sortGifts(occGifts(o).filter(g => g.personId === p.id));
          const b = num(o.budgets[p.id]);
          return `
          <div class="block" data-drop="${esc(o.id)}">
            <button class="group-head" data-action="open-event" data-id="${esc(o.id)}" style="width:100%;text-align:left">
              ${evBadge(o, 'sm')}<h2>${esc(occTitle(o))}</h2><span class="meta">${esc(dateRel(o.date))}</span>
            </button>
            <div class="list">
              ${gs.map(g => giftRow(g)).join('')}
              <button class="row add" data-action="add-gift" data-person="${esc(p.id)}" data-occ="${esc(o.id)}"><span class="plus-dot">${Icon.plus}</span>Add gift</button>
              ${ideas.length ? `<button class="row add" data-action="use-ideas" data-person="${esc(p.id)}" data-occ="${esc(o.id)}"><span class="plus-dot">${Icon.idea}</span>Use a saved idea<span class="meta" style="margin-left:auto">${ideas.length}</span></button>` : ''}
            </div>
            ${b ? `<p class="note">${money(occSpent(o, p.id))} spent of ${money(b)}.</p>` : ''}
          </div>`;
        }).join('')}
        <div class="block" data-drop="">
          <div class="block-head"><h2>Saved ideas</h2>${ideas.length ? `<span class="meta">${ideas.length}</span>` : ''}</div>
          <div class="list">
            ${ideas.map(g => giftRow(g)).join('')}
            <button class="row add" data-action="add-gift" data-person="${esc(p.id)}" data-occ=""><span class="plus-dot">${Icon.plus}</span>${ideas.length ? 'Add idea' : `Save an idea for ${esc(firstName(p))}`}</button>
          </div>
          ${!ideas.length ? `<p class="note">Heard them mention something? Save it here and plan it for an event later.</p>` : ''}
        </div>
        ${!upcoming.length && !p.birthday ? `<div class="block"><div class="list"><button class="row add" data-action="edit-person" data-id="${esc(p.id)}"><span class="plus-dot">${Icon.cake}</span>Add ${esc(possessive(firstName(p)))} birthday</button></div></div>` : ''}
        ${history.length ? `
          <div class="block">
            <div class="block-head"><h2>Given before</h2></div>
            ${history.map(([o, gs]) => `
              <div class="hist">
                <button class="hist-head" data-action="open-event" data-id="${esc(o.id)}">${evBadge(o, 'xs')}<span>${esc(occYearTitle(o))}</span></button>
                <div class="list">${gs.map(g => giftRow(g)).join('')}</div>
              </div>`).join('')}
          </div>` : ''}
        ${p.sizes ? `<div class="block"><div class="block-head"><h2>Sizes and favorites</h2></div><div class="prose">${esc(p.sizes)}</div></div>` : ''}
        ${p.notes ? `<div class="block"><div class="block-head"><h2>Notes</h2></div><div class="prose">${esc(p.notes)}</div></div>` : ''}`;
    },
  },

  wishlist: wishListPage,

  gifts: {
    title: () => 'Gifts',
    render() {
      if (!visibleGifts().length) return `
        <div class="empty">
          <span class="tag xl" style="--c:var(--pine)">?</span>
          <h3>No gifts yet</h3>
          <p>${state.people.length ? 'Save ideas whenever they come up, then plan them for a birthday, Christmas or any other event.' : 'Add a person first, then start saving gift ideas for them.'}</p>
          <button class="btn" data-action="${state.people.length ? 'add-gift' : 'add-person'}">${state.people.length ? 'Add gift' : 'Add person'}</button>
        </div>`;
      return `
        <div class="search">${Icon.search}<input type="search" id="giftSearch" placeholder="Search gifts, stores, people, events" value="${esc(ui.giftQuery)}" autocomplete="off" aria-label="Search gifts"></div>
        <div class="chips" id="giftChips">${giftChips()}</div>
        <div id="giftResults">${giftResults()}</div>`;
    },
  },

  todo: {
    title: () => 'To-Do',
    render() {
      if (!state.tasks.length) return `
        <div class="empty">
          <span class="tag xl" style="--c:var(--brass)">?</span>
          <h3>Plan ahead</h3>
          <p>Keep track of cards, parties, shipping deadlines and everything else. Start with a Christmas checklist, or add your own.</p>
          <button class="btn" data-action="starter-tasks">Add Christmas checklist</button>
          <button class="btn quiet" data-action="add-task">Add task</button>
        </div>`;
      const open = state.tasks.filter(t => !t.done);
      const done = state.tasks.filter(t => t.done);
      const groups = CATEGORIES.map(c => [c, open.filter(t => t.category === c).sort(byDue)]).filter(([, ts]) => ts.length);
      return `
        ${groups.map(([c, ts]) => `
          <div class="block">
            <div class="block-head"><h2>${c}</h2><span class="meta">${ts.length}</span></div>
            <div class="list" style="--inset:56px">${ts.map(taskRow).join('')}</div>
          </div>`).join('')}
        ${!open.length ? `<div class="empty" style="padding-top:8px"><h3>All done</h3><p>Nothing left on the list.</p></div>` : ''}
        ${done.length ? `
          <div class="block">
            <div class="block-head"><h2>Completed</h2><button class="link" data-action="clear-done">Clear</button></div>
            <div class="list" style="--inset:56px">${done.map(taskRow).join('')}</div>
          </div>` : ''}`;
    },
  },

  settings: {
    title: () => 'Settings',
    render() {
      const c = Sync.cfg;
      const connected = Sync.enabled();
      return `
      ${(() => {
        const inHH = Cloud.wanted(), u = Cloud.user;
        const members = Object.entries(Cloud.members).map(([uid, pid]) => ({ uid, p: person(pid) })).filter(m => m.p);
        return `
        <div class="block">
          <div class="block-head"><h2>Household</h2><span class="meta">Beta</span></div>
          <div class="list" style="--inset:64px">
            ${inHH && u && Cloud.isSolo() ? `
              <div class="row"><div class="row-icon" style="background:${Cloud.status === 'error' ? 'var(--cranberry)' : 'var(--pine)'}">${Icon.cloud}</div>
                <div class="row-main"><div class="row-title">Just you</div><div class="row-sub"><span id="syncStatus">${Cloud.statusText()}</span> · ${esc(u.email || '')}</div></div></div>
              <button class="row" data-action="household-invite"><div class="row-icon" style="background:var(--fir)">${Icon.gift}</div><div class="row-main">Invite someone</div>${Icon.chev}</button>
              <button class="row" data-action="household-join"><div class="row-icon" style="background:var(--brass)">${Icon.tag}</div><div class="row-main">Join a household</div>${Icon.chev}</button>
            ` : inHH ? `
              <div class="row"><div class="row-icon" style="background:${Cloud.status === 'error' ? 'var(--cranberry)' : 'var(--pine)'}">${Icon.cloud}</div>
                <div class="row-main"><div class="row-title">${esc(u?.email || 'Signed out')}</div><div class="row-sub" id="syncStatus">${Cloud.statusText()}</div></div></div>
              ${members.map(m => `<div class="row">${tag(m.p)}<div class="row-main">${esc(m.p.name)}</div>${m.uid === u?.uid ? '<span class="you">You</span>' : ''}</div>`).join('')}
              ${u ? `<button class="row" data-action="household-invite"><div class="row-icon" style="background:var(--fir)">${Icon.gift}</div><div class="row-main">Invite someone</div>${Icon.chev}</button>
              <button class="row" data-action="household-leave"><div class="row-icon" style="background:var(--cranberry)">${Icon.unlink}</div><div class="row-main">Leave household</div></button>`
              : `<button class="row" data-action="account-signin"><div class="row-icon" style="background:var(--fir)">${Icon.key}</div><div class="row-main">Sign in again</div>${Icon.chev}</button>`}
            ` : u ? `
              <button class="row" data-action="household-create"><div class="row-icon" style="background:var(--pine)">${Icon.cloud}</div><div class="row-main"><div class="row-title">Create a household</div><div class="row-sub">Move this list into your account</div></div>${Icon.chev}</button>
              <button class="row" data-action="household-join"><div class="row-icon" style="background:var(--fir)">${Icon.gift}</div><div class="row-main">Join with an invite</div>${Icon.chev}</button>
            ` : `
              <button class="row" data-action="account-signin"><div class="row-icon" style="background:var(--pine)">${Icon.cloud}</div><div class="row-main"><div class="row-title">Sign in</div><div class="row-sub">Sync your list and keep a wish list</div></div>${Icon.chev}</button>
            `}
          </div>
          <p class="note">${inHH && Cloud.isSolo() ? 'Everything syncs to your account. Invite someone to share the list; gifts for each other stay hidden.' : inHH ? 'Everyone in the household shares one list. Gifts someone else is buying for you never reach your devices.' : 'Each household has its own list. Gifts for each other stay hidden, enforced by the database rather than just on screen.'}</p>
        </div>
        ${inHH && u ? `
        <div class="block">
          <div class="block-head"><h2>Wish lists</h2></div>
          <div class="list"><div class="row"><div class="row-main"><label for="claimDest">Claimed wishes go to</label></div>
            <select class="field right" id="claimDest" style="flex:none;width:auto"><option value="next" ${Wishes.destination === 'next' ? 'selected' : ''}>Their next event</option><option value="saved" ${Wishes.destination === 'saved' ? 'selected' : ''}>Saved ideas</option></select></div></div>
          <p class="note">When you tap “I’ll get it” on someone’s wish list, it becomes a gift idea from you here. This choice is for this device.</p>
        </div>` : ''}
        ${u ? `
        <div class="block">
          <div class="block-head"><h2>Account</h2></div>
          <div class="list" style="--inset:64px">
            <button class="row" data-action="account-signout"><div class="row-icon" style="background:var(--s-idea)">${Icon.key}</div><div class="row-main"><div class="row-title">Sign out</div><div class="row-sub">${esc(u.email || '')}</div></div></button>
            <button class="row danger" data-action="delete-account">Delete account…</button>
          </div>
        </div>` : ''}`;
      })()}
        ${Cloud.wanted() || !(Sync.gist() || sharing()) ? '' : `<div class="block">
          <div class="block-head"><h2>Sync</h2></div>
          <div class="list" style="--inset:64px">
            <div class="row">
              <div class="row-icon" style="background:${connected ? 'var(--pine)' : 'var(--s-idea)'}">${Icon.cloud}</div>
              <div class="row-main"><div class="row-title">Sync across devices</div><div class="row-sub" id="syncStatus">${Sync.statusText()}</div></div>
            </div>
            ${connected ? `
              <button class="row" data-action="sync-now"><div class="row-icon" style="background:var(--fir)">${Icon.sync}</div><div class="row-main">Sync now</div></button>
              <button class="row" data-action="passphrase"><div class="row-icon" style="background:var(--brass)">${Icon.key}</div><div class="row-main"><div class="row-title">Passphrase for new devices</div><div class="row-sub">${c.passSet ? `Set ${timeAgo(c.passSet)}` : c.keyGistId ? 'Set' : 'Not set'}</div></div>${Icon.chev}</button>
              <button class="row" data-action="sync-disconnect"><div class="row-icon" style="background:var(--cranberry)">${Icon.unlink}</div><div class="row-main">Turn off sync on this device</div></button>
            ` : `
              <button class="row" data-action="sync-connect"><div class="row-icon" style="background:var(--fir)">${Icon.sync}</div><div class="row-main">Set up sync</div>${Icon.chev}</button>
            `}
          </div>
          ${connected && Sync.moved ? `<p class="note" style="color:var(--cranberry)">This list was moved into “${esc(Sync.moved.household || 'a household')}” on ${esc(new Date(Sync.moved.at).toLocaleDateString())}. Ask whoever moved it for an invite link, then open it on this device. Until then this device keeps syncing through GitHub.</p>` : ''}
          <p class="note">${connected
            ? `Your data is saved in a secret GitHub Gist${c.gistId ? ` (<a href="https://gist.github.com/${esc(c.gistId)}" target="_blank" rel="noopener">view</a>)` : ''}. Changes sync automatically.`
            : 'Sync saves your data to a secret GitHub Gist, so every device you use sees the same list.'}</p>
        </div>
        <div class="block">
          <div class="block-head"><h2>Sharing</h2></div>
          <div class="list" style="--inset:64px">
            ${sharing() ? `
              <button class="row" data-action="pick-me">${person(me) ? tag(person(me)) : `<div class="row-icon" style="background:var(--s-idea)">${Icon.tag}</div>`}<div class="row-main"><div class="row-title">This device belongs to</div><div class="row-sub">${person(me) ? esc(person(me).name) : 'Not chosen'}</div></div>${Icon.chev}</button>
              <button class="row" data-action="sharing-off"><div class="row-icon" style="background:var(--cranberry)">${Icon.unlink}</div><div class="row-main">Stop sharing</div></button>
            ` : `
              <button class="row" data-action="sharing-on"><div class="row-icon" style="background:var(--cranberry)">${Icon.gift}</div><div class="row-main"><div class="row-title">Share with your household</div><div class="row-sub">Keep gifts for each other secret</div></div>${Icon.chev}</button>
            `}
          </div>
          <p class="note">${sharing()
            ? 'Each device hides the gifts other people are buying for its owner, for every event. Everything else is shared.'
            : 'Use one list with someone else. Each of you picks your name, and gifts for each other stay hidden.'}</p>
        </div>
`}
        <div class="block">
          <div class="block-head"><h2>Calendar</h2></div>
          <div class="list" style="--inset:64px">
            <button class="row" data-action="import-ics"><div class="row-icon" style="background:var(--s-have)">${Icon.up}</div><div class="row-main"><div class="row-title">Import from Calendar</div><div class="row-sub">Add birthdays and events from a calendar file</div></div>${Icon.chev}</button>
            <button class="row" data-action="export-ics"><div class="row-icon" style="background:var(--cranberry)">${Icon.calendar}</div><div class="row-main"><div class="row-title">Add events to Calendar</div><div class="row-sub">Birthdays and yearly events, with a reminder a week before</div></div>${Icon.chev}</button>
          </div>
          <p class="note">${Desk.on() ? 'To import, you can also drag events from Calendar onto this window. ' : ''}Exporting downloads a calendar file you can open in Apple Calendar or Google Calendar.</p>
        </div>
        <div class="block">
          <div class="block-head"><h2>Backup</h2></div>
          <div class="list" style="--inset:64px">
            <button class="row" data-action="export"><div class="row-icon" style="background:var(--s-have)">${Icon.down}</div><div class="row-main">Export backup</div>${Icon.chev}</button>
            <button class="row" data-action="import"><div class="row-icon" style="background:var(--brass)">${Icon.up}</div><div class="row-main">Import backup</div>${Icon.chev}</button>
            <button class="row danger" data-action="reset">Erase all data</button>
          </div>
          <p class="note">${plural(state.people.length, 'person', 'people')}, ${plural(state.occasions.length, 'event')} and ${plural(visibleGifts().length, 'gift')}${state.updatedAt ? `. Last edited ${timeAgo(state.updatedAt)}` : ''}.</p>
        </div>
        <p class="note" style="text-align:center;padding-top:4px">To install on iPhone, open this page in Safari and tap Share, then Add to Home Screen.</p>`;
    },
  },
};

export function byDue(a, b) {
  if (a.due && b.due) return a.due.localeCompare(b.due);
  if (a.due) return -1; if (b.due) return 1;
  return (a.created || 0) - (b.created || 0);
}
export function dueInfo(d) {
  if (!d) return null;
  const diff = daysUntil(d);
  const label = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff === -1 ? 'Yesterday' : fmtDate(d);
  return { label, diff };
}
export function timeAgo(t) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} hr ago`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function eventRow(o) {
  const gs = occGifts(o);
  const ready = gs.filter(isReady).length;
  const budget = occBudget(o), spent = sumSpent(gs);
  return `
    <div class="swipe ${ui.justAdded === o.id ? 'enter' : ''}">
      <div class="swipe-actions"><button data-action="delete-event" data-id="${esc(o.id)}">Delete</button></div>
      <div class="swipe-content">
        <button class="row" data-action="open-event" data-id="${esc(o.id)}" data-row="event">
          ${evBadge(o)}
          <div class="row-main"><div class="row-title">${esc(daysUntil(o.date) < 0 ? occYearTitle(o) : occTitle(o))}</div><div class="row-sub">${esc(dateRel(o.date))}</div></div>
          <div class="row-end">${gs.length ? `<span class="row-count">${ready} of ${gs.length} wrapped</span>` : ''}${budget ? leftLabel(spent, budget) : ''}</div>
          ${Icon.chev}
        </button>
      </div>
    </div>`;
}

export function taskRow(t) {
  const d = dueInfo(t.due);
  const cls = !d || t.done ? '' : d.diff < 0 ? 'late' : d.diff <= 2 ? 'soon' : '';
  return `
    <div class="swipe ${ui.justAdded === t.id ? 'enter' : ''}">
      <div class="swipe-actions"><button data-action="delete-task" data-id="${esc(t.id)}">Delete</button></div>
      <div class="swipe-content">
        <div class="row ${t.done ? 'done' : ''}" data-task="${esc(t.id)}" data-row="task" data-id="${esc(t.id)}" tabindex="0">
          <button class="check" data-action="toggle-task" data-id="${esc(t.id)}" aria-label="${t.done ? 'Mark as not done' : 'Mark as done'}">${Icon.check}</button>
          <div class="row-main" data-action="edit-task" data-id="${esc(t.id)}" style="cursor:pointer">
            <div class="row-title task-title">${esc(t.title)}</div>
            ${t.notes ? `<div class="row-sub">${esc(t.notes)}</div>` : ''}
          </div>
          ${d ? `<span class="due ${cls}">${d.label}</span>` : ''}
        </div>
      </div>
    </div>`;
}

export function giftRow(g, showPerson = false) {
  const p = person(g.personId);
  const sub = showPerson ? [p?.name, g.store].filter(Boolean).join(', ') : g.store;
  return `
    <div class="swipe ${ui.justAdded === g.id ? 'enter' : ''}">
      <div class="swipe-actions"><button data-action="delete-gift" data-id="${esc(g.id)}">Delete</button></div>
      <div class="swipe-content">
        <div class="row tap" data-action="edit-gift" data-id="${esc(g.id)}" data-row="gift" tabindex="0" role="button" aria-label="${esc(g.title)}">
          ${showPerson ? tag(p) : ''}
          <div class="row-main">
            <div class="row-title">${esc(g.title)}</div>
            ${sub ? `<div class="row-sub">${esc(sub)}</div>` : ''}
          </div>
          <div class="row-end">
            ${g.price !== '' ? `<span class="money">${money(num(g.price))}</span>` : ''}
            ${statusChip(g)}
          </div>
        </div>
      </div>
    </div>`;
}

export function giftChips() {
  const opts = [{ id: 'all', label: 'All' }, { id: 'later', label: 'Saved ideas' }, ...STATUSES.slice(1), { id: 'make', label: 'Handmade' }];
  const vg = visibleGifts();
  return opts.map(o => {
    const n = o.id === 'all' ? vg.length : o.id === 'make' ? vg.filter(g => g.kind === 'make').length : o.id === 'later' ? vg.filter(g => !g.occasionId).length : vg.filter(g => g.status === o.id).length;
    return `<button class="chip ${o.id === ui.giftFilter ? 'on' : ''} ${STATUS_IDS.includes(o.id) ? 's-' + o.id : ''}" data-action="gift-filter" data-f="${o.id}" aria-pressed="${o.id === ui.giftFilter}">
      ${STATUS_IDS.includes(o.id) ? '<span class="sw"></span>' : ''}${o.label}<span class="ct">${n}</span></button>`;
  }).join('');
}

export function giftResults() {
  const q = ui.giftQuery.trim().toLowerCase();
  const f = ui.giftFilter;
  let gs = visibleGifts().filter(g => f === 'all' || (f === 'make' ? g.kind === 'make' : f === 'later' ? !g.occasionId : g.status === f));
  if (q) gs = gs.filter(g => [g.title, g.store, g.notes, person(g.personId)?.name, g.occasionId ? occTitle(occ(g.occasionId)) : 'saved idea'].join(' ').toLowerCase().includes(q));
  if (!gs.length) return `<p class="note" style="text-align:center;padding-top:24px;font-size:15px">${q ? 'No gifts match your search.' : f === 'make' ? 'No handmade gifts yet.' : f === 'later' ? 'No saved ideas. Ideas you save without an event show up here.' : `Nothing is ${STATUSES.find(s => s.id === f)?.label.toLowerCase()} right now.`}</p>`;
  const groups = new Map();
  gs.forEach(g => { const k = g.occasionId || ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(g); });
  const order = [...upcomingOccasions().map(o => o.id), '', ...pastOccasions().map(o => o.id)].filter(k => groups.has(k));
  const sortG = list => list.sort(byPersonThenOrder);
  return order.map(k => {
    const o = k ? occ(k) : null;
    const head = o
      ? `<button class="group-head" data-action="open-event" data-id="${esc(o.id)}" style="width:100%;text-align:left">${evBadge(o, 'sm')}<h2>${esc(daysUntil(o.date) < 0 ? occYearTitle(o) : occTitle(o))}</h2><span class="meta">${esc(dateRel(o.date))}</span></button>`
      : `<div class="group-head"><span class="ev-badge sm th-idea">${Icon.idea}</span><h2>Saved ideas</h2><span class="meta">Not planned yet</span></div>`;
    return `<div class="block" data-drop="${esc(k)}">${head}<div class="list" data-sort="person" style="--inset:80px">${sortG(groups.get(k)).map(g => giftRow(g, true)).join('')}</div></div>`;
  }).join('') + (f === 'all' && !q ? `
    <div class="drop-only">
      <div class="block-head"><h2>Move to another event</h2></div>
      ${[...upcomingOccasions().filter(o => !groups.has(o.id)), ...(groups.has('') ? [] : [null])].map(o => o
        ? `<div class="block drop-pad" data-drop="${esc(o.id)}"><div class="group-head">${evBadge(o, 'sm')}<h2>${esc(occTitle(o))}</h2><span class="meta">${esc(dateRel(o.date))}</span></div></div>`
        : `<div class="block drop-pad" data-drop=""><div class="group-head"><span class="ev-badge sm th-idea">${Icon.idea}</span><h2>Saved ideas</h2></div></div>`).join('')}
    </div>` : '');
}
