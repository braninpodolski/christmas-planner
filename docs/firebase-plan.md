# Plan: accounts and households with Firebase

**Goal:** family members can use Gift Tags for their own households. They sign in like any normal app: no GitHub account, no tokens, no passphrases. Surprise gifts become truly private, enforced by the database instead of only hidden on screen. It stays free.

**Status:** phases 0–4 are built (November 26, 2026). Moving your list over is Settings → Household → Create a household. Phase 5 (rollout, then removing Gist sync) is next.

---

## What changes for people using it

| Today | After |
| --- | --- |
| Set up a GitHub token, or type a 20-character passphrase on each device | Sign in with Google or email on any device |
| One list, shared by whoever has the token | Each household has its own list; you invite people with a link |
| "Who's using this device?" picker | You are whoever is signed in |
| Gifts for you are hidden on screen, but the data is on your device | Gifts for you never reach your device; the database refuses to send them |
| Sync about once a minute, last write per item wins | Live updates within a second or two, and it still works offline |

Your current list moves over with one tap (see [Moving your list over](#5-moving-your-list-over)), and the Gist stays as a backup.

---

## Why Firebase (free Spark plan)

- **Free limits are far beyond a few families.** 1 GiB of data, 50,000 reads, 20,000 writes and 20,000 deletes a day, with no credit card. A household's whole list is a few hundred small documents.
- **Free projects aren't paused when idle.** Supabase's free tier pauses after a week of inactivity, which is a bad fit for an app that's quiet between holidays.
- **Sign-in comes built in:** Google, and email with a link or password.
- **Offline support and live updates are built in** (Firestore's local cache). That replaces the merge-and-tombstone sync I wrote by hand for the Gist.
- **Security rules** let the database itself decide who can read each gift. That's what makes surprises private for real.
- **No build step needed:** the Firebase SDK loads as ES modules straight from Google's CDN, the same way the app loads its own modules now.

**Trade-offs:** everything depends on a Google-run service. The Firebase config in the page is public by design; only the security rules protect the data, so they get their own tests (phase 1).

---

## Data model (Firestore)

```
households/{hid}
  name, createdBy, created
  members/{uid}          { personId, name, joined }   ← links a signed-in account to a person on the list
  people/{id}            same fields as today's person records
  occasions/{id}         same as today (ids stay deterministic: b{pid}y{yyyy}, xmas{yyyy}, …)
  gifts/{id}             gifts everyone in the household can see
  surprises/{uid}/gifts/{id}   gifts for member {uid} that someone else is buying
  tombstones/{id}        { at }   ← "don't recreate this birthday event"; replaces state.deleted
invites/{code}           { hid, createdBy, expires }
```

- **Surprises live under their own path, per recipient.** A gift goes there when it's *for* a member and someone else is buying it. That's the rule the app already uses to hide gifts (`isMe(g.personId) && g.buyer !== me`). Because it's a separate path, the security rule is simple, and queries never even ask for documents the reader can't see.
- **Changing a gift's recipient or buyer** can move it between `gifts` and `surprises/{uid}`. That's a delete plus a create in one batch.
- **Inside the app, nothing changes:** `state` keeps its current shape (people, gifts, occasions, tasks). Only the sync layer knows about paths.

### Security rules (sketch)

```js
function member(hid)      { return exists(/databases/$(db)/documents/households/$(hid)/members/$(request.auth.uid)); }

match /households/{hid} {
  allow read: if member(hid);
  allow create: if request.auth != null && request.resource.data.createdBy == request.auth.uid;
  match /{coll}/{id} { allow read, write: if member(hid) && coll in ['people', 'occasions', 'gifts', 'tombstones']; }
  match /surprises/{uid}/gifts/{id} {
    allow read, write: if member(hid) && request.auth.uid != uid;   // the recipient can never read these
  }
  match /members/{uid} {
    allow read: if member(hid);
    // join: you may add yourself if you hold a live invite for this household
    allow create: if request.auth.uid == uid
      && get(/databases/$(db)/documents/invites/$(request.resource.data.invite)).data.hid == hid
      && get(/databases/$(db)/documents/invites/$(request.resource.data.invite)).data.expires > request.time;
    allow update, delete: if request.auth.uid == uid || member(hid);   // leave, or remove someone
  }
}
match /invites/{code} {
  allow get: if request.auth != null;   // read one by its code; listing is not allowed
  allow create: if member(request.resource.data.hid);
}
```
Invite codes are random and long (like the passphrase today), expire after 7 days, and can't be listed, so they can't be guessed or browsed.

---

## How the code changes

The refactor already isolated these parts, so the change stays contained:

| File | Change |
| --- | --- |
| `js/cloud.js` (new) | Firebase setup, sign-in, household listeners, writes. Same interface as `Sync`: `enabled()`, `statusText()`, `schedule()`, `syncNow()` |
| `js/store.js` | `commit()` already works out exactly which records changed or were deleted. It hands that list to the cloud layer instead of scheduling a whole-file upload. `me` comes from the signed-in member instead of `localStorage` |
| `js/sync.js`, `js/passjoin.js` | Kept for one or two releases, for moving your list over; then removed |
| `js/identity.js` | The "Who's using this device?" gate becomes "Which person on the list is you?", asked once when you join a household |
| `js/pages.js` (Settings) | Account, household members, "Invite someone", "Leave household" |
| `js/data.js` | `merge()` and the tombstone pruning are no longer needed for cloud households. `sanitize()` stays and still checks every record that arrives |
| `sw.js` | Never caches Firestore or sign-in traffic (like the GitHub API today) |

**Writes:** each changed record becomes one document write. Changes are sent in a batch shortly after a commit, so typing in a field doesn't send a write per keystroke.

**Reads:** one live listener per collection. With the local cache, reopening the app mostly reads only what changed.

---

## Sign-in on the iPhone home-screen app: test this first

This is the part most likely to go wrong, so it's phase 0:

- **Email links open in Safari, not in the installed app.** On iOS, Safari and the home-screen app keep separate storage, so a sign-in finished in Safari doesn't carry over. Email links are out for the iPhone app.
- **Google sign-in by redirect breaks on GitHub Pages.** Safari blocks the cross-site storage it relies on. Firebase's own fix is to serve the sign-in helper from the same domain, which GitHub Pages can't do.
- **What works reliably:**
  1. **Email and password.** It works everywhere, password managers fill it in, and nothing leaves the app.
  2. **Google with a popup.** Probably fine on desktop and in Safari, but it has to be checked inside the iPhone home-screen app.
  3. **Moving hosting to Firebase Hosting (also free)** would make Google redirect sign-in work everywhere. The catch is a new URL (`<project>.web.app`), so the app would need adding to home screens again.

**Proposal:** offer email and password everywhere, plus Google where the phase 0 test shows it works. Stay on GitHub Pages unless that test fails badly.

### Phase 0 results (iPhone, iOS 18.7)
| Check | Safari | Home Screen app |
| --- | --- | --- |
| Google sign-in, popup | ✓ | ✓ |
| Google sign-in, redirect | not tried | ✗ came back signed out (as expected on GitHub Pages) |
| Still signed in after reopening | ✓ | ✓ |
| Save to the cloud and read it back | ✓ | ✓ |
| Save offline, reopen offline, sync when back online | ✓ | ✓ |
| Email and password | not tried | not tried |

**Decided:**
- **Google sign-in uses the popup**, never the redirect.
- **Email and password stays as the fallback.** It doesn't involve a popup or a redirect, so it has nothing to break in the Home Screen app, but it hasn't been tested on a device yet.
- **Hosting stays on GitHub Pages**, at the same URL.
- **Still to check during phase 3:** sign-in on the Mac and the work computer. A work browser that blocks popups or third-party cookies could need the email fallback.

---

## Phases

**0. Sign-in test (about a session).**
- You create a free Firebase project (Google account, about 5 minutes; I'll give exact clicks).
- I build a throwaway test page: sign in, write a document, read it back offline.
- You try it on your iPhone home-screen app, the Mac and the work computer.
- Outcome: choose the sign-in methods and hosting.

**1. Backend and rules (about a session).**
- Firestore rules as above.
- Rules tests that run against the Firebase emulator. This needs Java and the Firebase CLI on this Mac (optional, but it's the only way to be sure surprises really are private).
- Test cases: a recipient can't read their surprises, a non-member can't read anything, invites expire, no one can list invites.

**2. Cloud sync layer (one to two sessions).**
- `js/cloud.js` behind the same interface as `Sync`.
- Gist sync keeps working the whole time; cloud is opt-in from Settings.
- Node tests for the mapping between `state` and paths (which gifts are surprises, and what a recipient change moves).

**3. Accounts and households UI (one to two sessions).**
- Sign in, create a household, invite by link or code, "Which person is you?", members list, leave or remove.
- Keyboard and desktop support as everywhere else.

**4. Moving your list over** (below).

**5. Rollout.**
- You and your wife first, for a couple of weeks. Then invite family.
- After that, remove the Gist sync and the passphrase code, and update the README.

### 5. Moving your list over
1. Settings → **Move to accounts**. It saves a backup of your current list to the Gist (`christmas-planner-backup-before-accounts.json`) and on the device, as the last upgrade did.
2. Sign in and create your household. Every person, gift, event and budget is uploaded with its current id, so nothing is duplicated.
3. Pick which person on the list is you. Gifts for you that your wife is buying go straight to your surprises; this device never downloads them again.
4. Your wife opens the invite link, signs in, and picks herself.
5. Other devices still on Gist sync show "This list moved to accounts. Sign in to keep syncing." They stop writing to the Gist, so nothing ends up out of sync.

---

## Decisions for you
1. ~~Sign-in methods~~: decided in phase 0. Google (popup), plus email and password.
2. ~~Hosting~~: decided in phase 0. Stay on GitHub Pages.
3. **The old to-do list data** (`tasks`, no longer shown anywhere): bring it along or drop it in the move?

## Not in scope
- Apple sign-in (needs a $99/year Apple developer account).
- Push notifications for reminders (possible later with Firebase Cloud Messaging, also free).
- Sharing between households (for example, a gift idea for a cousin both families buy for).
