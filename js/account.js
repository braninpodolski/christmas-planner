/* Account and household screens: sign in, create a household, invite someone, join with an invite. */
import { esc, Icon } from './util.js';
import { state, sortedPeople, person, me, KEY_BACKUP_ACCOUNTS, firstName, possessive } from './store.js';
import { hasPlans, plansSummary } from './merge.js';
import { openSheet, toast, confirmDestructive } from './sheets.js';
import { renderAllPreserve } from './actions.js';
import { Cloud } from './cloud.js';
import { Sync } from './sync.js';

const errorText = e => ({
  'auth/invalid-credential': 'That email and password don’t match.',
  'auth/wrong-password': 'That email and password don’t match.',
  'auth/user-not-found': 'No account with that email yet. Try “Create account”.',
  'auth/email-already-in-use': 'There’s already an account with that email. Try “Sign in”.',
  'auth/weak-password': 'Use at least 6 characters.',
  'auth/invalid-email': 'That email doesn’t look right.',
  'auth/popup-closed-by-user': 'The Google window was closed before signing in.',
  'auth/popup-blocked': 'The browser blocked the Google window. Allow pop-ups, or use email.',
  'auth/network-request-failed': 'Couldn’t reach the internet. Check your connection.',
}[e?.code] || e?.message || 'Something went wrong. Try again.');

// Run an async step from inside a sheet, showing progress and errors in place
async function busy(sh, fn) {
  const err = sh.querySelector('[data-err]'), btns = sh.querySelectorAll('button');
  err.textContent = ''; btns.forEach(b => (b.disabled = true));
  try { await fn(); return true; } catch (e) { err.textContent = errorText(e); return false; } finally { btns.forEach(b => (b.disabled = false)); }
}
const errLine = '<p class="fnote" data-err role="alert" style="color:var(--cranberry);min-height:1.2em"></p>';

export function signInSheet(then) {
  let sheet, done;
  const finish = async () => {
    done(null); Cloud.afterSignIn();
    const r = await Cloud.restore();
    if (r === 'rejoined') { toast('Welcome back. Your household’s list is loading.'); renderAllPreserve(); if (!then) return; }
    else if (r === 'solo') toast('Signed in. Your list syncs now.');
    renderAllPreserve(); then?.();
  };
  openSheet({
    title: 'Sign in', saveLabel: 'Sign in', required: [],
    body: `
      <p class="fnote" style="margin:0 0 14px;font-size:15px;color:var(--text)">Sign in to sync your list and your wish list, and share them with the people you invite.</p>
      <div class="fgroup"><button type="button" class="row" data-google style="width:100%;font-weight:600">${Icon.google || ''}<span class="row-main">Continue with Google</span></button></div>
      <div class="flabel">Or with email</div>
      <div class="fgroup">
        <div class="row"><input class="field" name="email" type="email" autocomplete="username" placeholder="Email" autocapitalize="off" aria-label="Email"></div>
        <div class="row"><input class="field" name="password" type="password" autocomplete="current-password" placeholder="Password" aria-label="Password"></div>
      </div>
      <div class="fgroup"><button type="button" class="row" data-create style="width:100%;color:var(--cranberry);font-weight:500">Create an account with this email</button></div>
      ${errLine}`,
    onOpen(sh, close) {
      sheet = sh; done = close;
      sh.querySelector('[data-google]').onclick = async () => { if (await busy(sh, () => Cloud.signInGoogle())) finish(); };
      sh.querySelector('[data-create]').onclick = async () => {
        const f = sh.querySelector('form');
        if (await busy(sh, () => Cloud.signInEmail(f.email.value.trim(), f.password.value, true))) finish();
      };
    },
    onSave(d) {
      busy(sheet, () => Cloud.signInEmail(d.email.trim(), d.password)).then(ok => ok && finish());
      return false; // stays open until signed in
    },
  });
}

export function createHouseholdSheet() {
  const people = sortedPeople();
  let sheet, done;
  openSheet({
    title: 'Create a household', saveLabel: 'Create', required: [],
    body: `
      <div class="fgroup">
        <div class="row"><label class="lbl" for="hhn">Name</label><input class="field right" id="hhn" name="name" value="${esc(person(me) ? `${possessive(firstName(person(me)))} household` : 'Our household')}"></div>
        <div class="row"><label class="lbl" for="hhme">You are</label>
          <select class="field" id="hhme" name="me">${people.map(p => `<option value="${esc(p.id)}" ${p.id === me ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>${Icon.chev}</div>
      </div>
      <p class="fnote">Your list moves into the household: ${state.people.length} people, ${state.gifts.length} gifts and ${state.occasions.length} events. A copy is kept on this device${Sync.gist() ? ' and in your GitHub Gist' : ''} first, and syncing through GitHub stops on this device.</p>
      ${(() => { const n = state.gifts.filter(g => g.personId === me && g.buyer !== me).length; return n ? `<p class="fnote">${n === 1 ? 'One gift' : `${n} gifts`} someone else is planning for you stay hidden on this device. They reach the household when the person buying them joins.</p>` : ''; })()}
      ${Sync.gist() ? '<p class="fnote">Devices still syncing through GitHub will show that the list moved, so you can send them an invite.</p>' : ''}
      ${people.length ? '' : '<p class="fnote" style="color:var(--cranberry)">Add yourself on the People tab first.</p>'}
      ${errLine}`,
    onOpen(sh, close) { sheet = sh; done = close; },
    onSave(d) {
      if (!person(d.me)) return false;
      busy(sheet, async () => {
        try { localStorage.setItem(KEY_BACKUP_ACCOUNTS, JSON.stringify(state)); } catch {}
        const name = d.name.trim() || 'Our household';
        await Sync.markMoved(name); // backup to the Gist first; nothing moves if this fails
        await Cloud.createHousehold(name, d.me);
      }).then(ok => { if (ok) { done(null); toast('Household created'); renderAllPreserve(); } });
      return false;
    },
  });
}

export function inviteSheet() {
  const taken = new Set(Object.values(Cloud.members));
  const people = sortedPeople().filter(p => !taken.has(p.id));
  if (!people.length) { toast('Everyone on your list is already in the household. Add them on the People tab first.', 'warn'); return; }
  let sheet;
  openSheet({
    title: 'Invite someone', saveLabel: 'Create invite', required: [],
    body: `
      <div class="fgroup"><div class="row"><label class="lbl" for="invp">Who</label>
        <select class="field" id="invp" name="pid">${people.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select>${Icon.chev}</div></div>
      <p class="fnote">They join as this person, so gifts you plan for them stay hidden from them from the start. Only invite someone you’d share the list with. The link works for 7 days, and stops working once it’s used.</p>
      <div data-out hidden>
        <div class="fgroup"><div class="row"><input class="field" data-link readonly aria-label="Invite link"></div></div>
        <div class="fgroup"><button type="button" class="row" data-share style="width:100%;color:var(--cranberry);font-weight:600">Share invite</button></div>
      </div>
      ${errLine}`,
    onOpen(sh) { sheet = sh; },
    onSave(d) {
      busy(sheet, async () => {
        const code = await Cloud.invite(d.pid);
        const link = `${location.origin}${location.pathname}?join=${code}`;
        const out = sheet.querySelector('[data-out]'); out.hidden = false;
        const input = sheet.querySelector('[data-link]'); input.value = link; input.select();
        const text = `Join our Gift Tags household: ${link}`;
        sheet.querySelector('[data-share]').onclick = async () => {
          try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(link); toast('Link copied'); } } catch {}
        };
      });
      return false;
    },
  });
}

export async function joinSheet(code) {
  if (!Cloud.user) return signInSheet(() => joinSheet(code));
  let inv;
  try { inv = await Cloud.peekInvite(code); } catch (e) { toast(errorText(e), 'warn'); return; }
  if (Cloud.wanted()) {
    // the household's members decide what joining does, so wait for them (a join link can open before they load)
    for (let i = 0; i < 40 && !Cloud.members[Cloud.user.uid]; i++) await new Promise(r => setTimeout(r, 250));
    if (!Cloud.members[Cloud.user.uid]) { toast('Your household is still loading. Try the invite again in a moment.', 'warn'); return; }
    if (!Cloud.isSolo()) { toast('You’re already in a household with others. Leave it in Settings first.', 'warn'); return; }
  }
  // From a household of one (or a list on this device): ask what to do with the plans already here
  const ask = hasPlans(state, me);
  let sheet, done;
  const go = bring => busy(sheet, () => Cloud.join(code, bring)).then(ok => { if (ok) { done(null); toast('You’re in'); renderAllPreserve(); } });
  openSheet({
    title: 'Join a household', saveLabel: ask ? 'Bring them' : 'Join', required: [],
    body: `
      <p class="fnote" style="margin:0 0 14px;font-size:15px;color:var(--text)">You’ve been invited to join a Gift Tags household.</p>
      ${ask ? `<p class="fnote">You have ${esc(plansSummary(state, me))} here. Bring them along (people with the same name are merged), or leave them behind. Your wish list comes with you either way.</p>
        <div class="fgroup"><button type="button" class="row" data-leave style="width:100%;font-weight:500">Join, leave them behind</button></div>`
      : '<p class="fnote">The household’s list will appear on this device. Your wish list comes with you.</p>'}
      ${errLine}`,
    onOpen(sh, close) {
      sheet = sh; done = close;
      sh.querySelector('[data-leave]')?.addEventListener('click', () => go(false));
    },
    onSave() { go(ask); return false; },
  });
}

export function joinCodeSheet() {
  openSheet({
    title: 'Join with an invite', saveLabel: 'Next', required: ['code'],
    body: `<div class="fgroup"><div class="row"><input class="field" name="code" placeholder="Paste the invite link or code" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="Invite link or code"></div></div>
      <p class="fnote">Someone already in the household can make one in Settings → Invite someone.</p>`,
    onSave(d) {
      const code = (d.code.match(/join=([a-z0-9]+)/) || [, d.code.trim()])[1];
      if (!/^[a-z0-9]{20,64}$/.test(code)) return false;
      setTimeout(() => joinSheet(code), 350);
    },
  });
}

export async function leaveHousehold() {
  if (!await confirmDestructive('Leave this household? Its list stays with everyone else. You go on in a household of your own, and your wish list comes with you.', 'Leave')) return;
  try { await Cloud.leave(); renderAllPreserve(); toast('You left the household'); } catch (e) { toast(errorText(e), 'warn'); }
}

// ?join=CODE in the address bar opens the join flow (after signing in if needed)
export function handleJoinLink() {
  const code = new URLSearchParams(location.search).get('join');
  if (!code || !/^[a-z0-9]{20,64}$/.test(code)) return;
  history.replaceState(null, '', location.pathname);
  Cloud.load().then(() => joinSheet(code)).catch(() => toast('Couldn’t reach Firebase', 'warn'));
}

export function deleteAccountSheet() {
  const pw = Cloud.usesPassword(), alone = !Cloud.wanted() || Cloud.isOnlyMember();
  let sheet, done;
  openSheet({
    title: 'Delete account', saveLabel: 'Delete account', required: pw ? ['password'] : [],
    body: `
      <p class="fnote" style="margin:0 0 12px;font-size:15px;color:var(--text)">This deletes ${esc(Cloud.user?.email || 'your account')} and your wish list. It can’t be undone.</p>
      <p class="fnote">${alone ? 'Nobody else is in your household, so its list is deleted too, along with the copy on this device.' : 'Your household’s list stays with everyone else in it. The copy on this device is deleted.'}</p>
      ${pw ? `<div class="fgroup"><div class="row"><input class="field" name="password" type="password" autocomplete="current-password" placeholder="Password" aria-label="Password"></div></div>
        <p class="fnote">Enter your password to confirm it’s you.</p>` : '<p class="fnote">Google asks you to sign in again to confirm it’s you.</p>'}
      ${errLine}`,
    onOpen(sh, close) { sheet = sh; done = close; },
    onSave(d) {
      busy(sheet, () => Cloud.deleteAccount(d.password || '')).then(ok => { if (ok) { done(null); toast('Your account was deleted'); renderAllPreserve(); } });
      return false;
    },
  });
}
