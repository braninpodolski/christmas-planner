# Gift Tags architecture

How the pieces fit together: the website (this repo), the iPhone and iPad app (`~/gift-tags-apple`, see its
`docs/architecture.md`), and the Firebase project they share. The diagrams are Mermaid, so they render on
GitHub and in any Markdown viewer that supports it.

Updated November 28, 2026, after app build 0.3.

## 1. System overview

```mermaid
flowchart LR
  subgraph Devices
    WEB["Website<br/>index.html + js/*.js<br/>(GitHub Pages, works offline)"]
    SHARE["Share page<br/>wish.html + js/wish.js"]
    IOS["iPhone / iPad app<br/>SwiftUI + GiftTagsKit"]
  end
  subgraph Firebase["Firebase project gift-tags (free Spark plan)"]
    AUTH["Authentication<br/>Google, email, anonymous"]
    FS[("Firestore<br/>+ firestore.rules")]
  end
  GIST[("GitHub Gist<br/>older sync, being retired")]
  WEB -- "signed in: households" --> FS
  WEB -. "not signed in: Gist sync" .-> GIST
  IOS --> FS
  SHARE -- "anonymous sign-in" --> FS
  WEB & IOS & SHARE --> AUTH
  SHARE -- "gifttags://wish?l=… (Add to Gift Tags)" --> IOS
```

- **Firestore is the only server.** There's no backend code: every rule about who may read or write what is
  in `firestore.rules`, tested by `tests/rules/*.test.js` on the emulator.
- **Both apps are equal clients** of the same documents, so the document format below is a contract.
  The Swift side tests it in GiftTagsKit; the website's side is `js/cloud-core.js`.
- **The share page** is the only part that works without an account: a visitor signs in anonymously.

## 2. Data model

```mermaid
erDiagram
  USER ||--o| HOUSEHOLD : "users/{uid}.hid"
  HOUSEHOLD ||--|{ MEMBER : "members/{uid}"
  HOUSEHOLD ||--o{ PERSON : people
  HOUSEHOLD ||--o{ OCCASION : occasions
  HOUSEHOLD ||--o{ GIFT : "gifts (shared)"
  HOUSEHOLD ||--o{ SURPRISE : "surprises/{personId}/gifts"
  HOUSEHOLD ||--o{ TOMBSTONE : tombstones
  HOUSEHOLD ||--o{ OWN_POINTER : "wishlists/{personId}"
  HOUSEHOLD ||--o{ LINK_POINTER : "linked/{personId}"
  MEMBER }o--|| PERSON : "is (personId, never changes)"
  INVITE }o--|| HOUSEHOLD : "for one person"
  OWN_POINTER ||--|| WISHLIST : listId
  LINK_POINTER }o--|| WISHLIST : listId
  WISHLIST ||--o{ CLAIM : "claims/{wishId}"
  WISHLIST ||--o{ NAME : "names/{wishId}"
  CLAIM |o--o| SURPRISE : "gift (the planned gift it made)"

  USER { string hid "the household this account is in" array pinned "per account" }
  MEMBER { string personId string invite "when joined by invite" number joined }
  PERSON { string id string name string birthday "YYYY-MM-DD or 0000-MM-DD" number mod }
  OCCASION { string id string type "christmas, birthday, anniversary, celebration" string date array people map budgets string series number mod }
  GIFT { string id string personId "who it's for" string buyer "who plans it" string occasionId "empty = saved idea" string status string kind number order number mod }
  SURPRISE { string id "a GIFT whose buyer is not its person" }
  TOMBSTONE { number at "a delete, so it isn't merged back" }
  INVITE { string hid string personId string createdBy timestamp expires }
  WISHLIST { string owner "uid" string hid string personId string name array items number updated }
  CLAIM { string uid "opaque account id only" number at string gift }
  NAME { string uid string name "typed on the share page" number at }
```

Paths are `households/{hid}/…` unless they start at the top: `users`, `invites`, `wishlists`, `errors`.

**Field rules both apps follow:** prices and budgets are a number, or `""` when empty. `mod` is milliseconds and
every edit sets it. A delete removes the document and writes a tombstone; when copies disagree, the newest `mod`
wins and a newer tombstone hides a record.

## 3. Who can see what

The privacy promises are enforced by the rules, not just hidden on screen.

| Data | Readable by | Not readable by |
| --- | --- | --- |
| People, events, shared gifts | Members of the household | Everyone else |
| `surprises/{p}/gifts` | Members of the household | The member who **is** person `p` |
| A wish list (`wishlists/{id}`) | Anyone signed in who knows its id (the link). It can't be listed | |
| Claims (`claims/{wishId}`: just "taken" + an account id) | Anyone with the link | The list's owner |
| Names typed on the share page (`names/{wishId}`) | The owner's household, and whoever wrote it | The owner, other link holders |
| Who in **your** household claimed a wish | Your household, through the gift in `surprises/` | The list's owner, other households |
| `users/{uid}` | That account | Everyone else |
| `errors/{id}` | Nobody (Firebase console only) | |

```mermaid
flowchart TB
  subgraph H1["Household A (Alex, Sam)"]
    A_SAM["Sam's page<br/>linked/{sam} → list k3v9"]
    A_GIFT["surprises/sam/gifts/g7<br/>Board game, buyer Alex"]
  end
  subgraph H2["Household B (Sam's own)"]
    B_OWN["wishlists/{sam} → list k3v9"]
  end
  L[("wishlists/k3v9<br/>owner: Sam")]
  C["claims/w1 { uid: Alex, gift: g7 }"]
  A_SAM --> L
  B_OWN --> L
  L --> C
  C -. "gift id only means something in A" .-> A_GIFT
  SAM(("Sam")) -- "can't read" --x C
```

## 4. The website's modules

No build step: `index.html` loads `js/main.js` as an ES module, and `sw.js` caches every file as one version
(`CACHE` in `sw.js` must equal `APP_VERSION` in `js/version.js`; a test checks).

```mermaid
flowchart TB
  main["main.js<br/>boot"] --> nav & desk & store & cloud & sync & identity
  subgraph UI
    nav["nav.js<br/>page stack, tab bar"]
    pages["pages.js<br/>Home, Events, People, Gifts, Settings"]
    desk["desktop.js<br/>sidebar, keyboard shortcuts"]
    sheets["sheets.js<br/>dialogs, toasts, undo"]
    forms["forms.js / event-sheet.js<br/>gift, person, event editors"]
    comp["components.js<br/>tags, present card, chips"]
    drag["gift-drag.js<br/>reorder and move"]
    cal["calendar.js + ics.js<br/>import and export"]
    acct["account.js<br/>sign-in, invite, join, delete account"]
    wui["wish-ui.js<br/>wish lists, claims, linking"]
  end
  subgraph State
    store["store.js<br/>state, commit(), localStorage"]
    data["data.js<br/>sanitize, merge, plan events"]
    similar["similar.js<br/>given-before hints"]
    pins["pins.js"]
    merge["merge.js<br/>bringing plans when joining"]
    wcore["wish-core.js<br/>wish list format"]
  end
  subgraph Sync
    cloud["cloud.js<br/>Firebase sign-in, household"]
    core["cloud-core.js<br/>diff and merge with Firestore"]
    sync["sync.js + passjoin.js + identity.js<br/>Gist sync (older)"]
    errors["errors.js<br/>error reports"]
    wishes["wishes.js<br/>live wish lists and claims"]
  end
  pages --> wui --> wishes --> wcore
  cloud --> merge & wishes
  nav --> pages --> comp
  pages --> forms --> sheets
  pages --> drag
  forms --> similar
  store --> data
  cloud --> core --> data
  forms & drag & sheets --> store
  store -- "commit() schedules" --> cloud & sync
```

**The state model:** the whole household is one object in memory (`store.js` `state`), saved to
`localStorage`. Every edit goes through `commit()`, which re-renders and schedules a sync. That's different
from the iPhone app, which shows Firestore's live snapshots directly.

### Website sync with a household

```mermaid
sequenceDiagram
  participant U as You
  participant S as store.js
  participant C as cloud-core.js
  participant F as Firestore
  U->>S: edit (commit)
  S->>S: set mod = now, save to localStorage
  S->>C: sync() after 400 ms
  Note over C: waits until members and every list<br/>have loaded once (never merges half a household)
  C->>C: merge(local, remote): newest mod wins,<br/>tombstones hide deleted records
  C->>C: diffDocs(what I want, what the server has)
  C->>F: batched set / delete (≤ 450 per batch)
  F-->>C: snapshot listeners fire
  C->>S: setLocal(merged) if anything changed
  S-->>U: re-render
```

A gift for someone else goes to `surprises/{personId}/gifts`; the website never listens to the surprises of
the person you are, so they never reach your device.

## 5. Wish lists

### Claiming from the share page (no app, no account)

```mermaid
sequenceDiagram
  participant V as Visitor's browser
  participant A as Firebase Auth
  participant F as Firestore
  participant H as Owner's household (app)
  V->>A: signInAnonymously (or keep an existing sign-in)
  V->>F: listen wishlists/{id}
  V->>F: listen wishlists/{id}/claims
  F-->>V: list + "taken" marks (never who)
  V->>V: "I'll get it", asks a name once (remembered)
  V->>F: batch: claims/{wish} {uid, at} + names/{wish} {uid, name, at}
  Note over F: rules: not the owner, unclaimed,<br/>name written with its own claim
  F-->>H: claims + names listeners: "Aunt Pat is getting this"
  Note over H: the owner's own device can't read either
```

### Claiming in the app (household member)

```mermaid
sequenceDiagram
  participant M as Member (Alex)
  participant F as Firestore
  M->>M: Sam's wish list → "I'll get it"
  M->>M: where it goes: Sam's next event,<br/>or Saved ideas (setting)
  M->>F: batch: claims/{wish} {uid, at, gift: g7}<br/>+ households/A/surprises/sam/gifts/g7
  F-->>M: "You're getting this" + toast with Undo
  Note over M,F: Undo deletes both. Deleting gift g7 later releases<br/>the claim too ("Keep claim" in the toast keeps it).
```

### Linking someone's list from another household

```mermaid
sequenceDiagram
  participant M as Member
  participant F as Firestore
  M->>M: tap "Add to Gift Tags" on the share page,<br/>or paste the link on a person's page
  M->>F: get wishlists/{id}
  M->>M: pick the person (a name match is suggested)<br/>refused if the list is already in this household
  M->>F: set households/{hid}/linked/{personId} {listId, by, at}
  Note over M: the whole household now sees it live, on that person's page
```

## 6. Accounts and households

```mermaid
stateDiagram-v2
  [*] --> SignedOut
  SignedOut --> Solo: sign in, new account (on or after Nov 26, 2026)<br/>a household of one is made
  SignedOut --> Member: sign in, users/{uid}.hid exists<br/>rejoin it
  SignedOut --> CheckAgain: sign in, older account, no household
  CheckAgain --> Member: household found
  Solo --> Shared: invite someone, they join
  Solo --> Member: join with an invite<br/>asks whether to bring your plans
  Member --> Solo: leave (a new household of one,<br/>your wish list comes along)
  Shared --> Solo: everyone else leaves
  Solo --> [*]: delete account<br/>(its lists are deleted too)
  Member --> [*]: delete account<br/>(the household stays with the others)
```

Joining with plans already in your household of one: people with the same name are merged, events that are
the same (same id, or same type, date and title) merge, everything else is added, and your wish list moves
with you (`wishlists/{id}.hid` and `personId` change; the rules allow it only into a household you're in).
The household of one is then emptied.

Both apps follow this lifecycle. On the website, a signed-in account in a household of one keeps the list that
was on the computer (a copy is kept in `localStorage` first). Signing out forgets the household on that browser,
so the next person to sign in there doesn't pick it up. A computer still syncing through a GitHub Gist keeps
Create a household instead, which backs the Gist up before moving the list.

## 7. Gift status

```mermaid
flowchart LR
  idea["idea<br/>Idea"] --> started["started<br/>Ordered · Making"] --> have["have<br/>In hand · Finished"] --> wrapped["wrapped<br/>Wrapped"]
```

The second label in each box is for Buying it, then Making it.

Stored as `status` (`idea`, `started`, `have`, `wrapped`) plus `kind` (`buy` or `make`); the labels change
with the kind. A gift with no `occasionId` is a saved idea.

## 8. Testing

| What | Where | How |
| --- | --- | --- |
| Security rules | `tests/rules/*.test.js` | `npm run test:rules` (starts the Firestore emulator) |
| Website logic | `tests/*.test.js` | `npm test` |
| App logic and the document contract | `~/gift-tags-apple/Packages/GiftTagsKit/Tests` | `swift test` |
| App UI (drag and drop) | `~/gift-tags-apple/UITests` | Xcode, on the simulator |
| End to end | emulator (`demo-gift-tags`, Auth 9099, Firestore 8181) | app with `-useEmulator`; share page with `&emulator` on localhost |

All sample data in tests and docs is made up.
