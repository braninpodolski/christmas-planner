# Gift Tags

A personal gift planner for birthdays, Christmas, anniversaries and every other occasion, built as a home-screen web app. It has no build step and no dependencies: just static files hosted free on GitHub Pages.

## Features
- **Home**: a themed "present" card counts down to whatever is next, followed by the next few events, the people you're still shopping for, and your saved ideas.
- **Events**: Christmas, birthdays, anniversaries and celebrations. Each has its own wrapping-paper theme, plus a date, the people involved and an optional budget for each person.
  - Birthdays are set on a person and come back every year automatically.
  - Yearly events (Christmas, anniversaries) roll forward on their own once they pass. Past events stay as history.
- **People**: a gift tag for each person, with a birthday (the year is optional), sizes and favorites, and notes. Type dates naturally, like "March 12" or "3/12/1990". Each person's page shows their upcoming events, saved ideas and what you've given them before.
- **Saved ideas**: write down ideas any time of year, then plan them for an event later.
- **Gifts**: each gift is marked *Buying it* or *Making it*:
  - Buying it: Idea → Ordered → In hand → Wrapped
  - Making it: Idea → Making → Finished → Wrapped
- **Calendar import**: drag events from Calendar onto the window, or pick an `.ics` file. "Amina's Birthday" becomes a birthday tied to Amina, "Christmas" becomes Christmas, and so on. If the app isn't sure, for example with a name that's not on your list or an event it can't place, it asks before adding.
- **Calendar export**: download birthdays and yearly events as a calendar file, with a reminder a week before each.
- **Move and reorder gifts**: drag a gift to any spot in its list, onto another event, or onto Saved ideas (long-press on a phone). The others slide aside to show where it will land. On a computer, you can also press M.
- **Sharing**: one list for your household. Gifts someone else is buying for you stay hidden on your device, for every event.
- **Undo** after any delete. Works offline, installs to your home screen, and has light and dark mode.
- **Desktop layout** on computers: a sidebar, hover actions, centered dialogs and keyboard shortcuts.

## Keyboard shortcuts (desktop)
| Key | Action |
| --- | --- |
| N | New gift |
| I | New saved idea |
| E | New event |
| P | New person |
| / or ⌘K | Search gifts |
| 1–4 | Home, Events, People, Gifts |
| , | Settings |
| ↑ ↓ (or J K) | Move between rows |
| ↩ | Open the selected row |
| Space | Next status for the selected gift |
| M | Move the selected gift to another event |
| F | Pin the selected person to the top of People (pins are yours, not shared with the household) |
| ⌫ | Delete the selected row |
| ⌘Z | Undo a delete |
| ⌘↩ / Esc | Save / close a form |
| ? | Show all shortcuts |

## Install on iPhone or iPad
Open the site in Safari, then tap **Share → Add to Home Screen**.

## Sync and sharing
1. Create a [fine-grained token](https://github.com/settings/personal-access-tokens/new). Under **Account permissions**, set **Gists** to **Read and write**. Leave everything else off.
2. In the app, go to **Settings → Set up sync** and choose **Use a GitHub token instead**.
3. To share, make sure everyone is on the People list, then go to **Settings → Share with your household** and pick yourself.

### Adding a device with a passphrase (no token)
1. On a device that already syncs, go to **Settings → Passphrase for new devices** and save the generated passphrase somewhere safe.
2. On the new device, go to **Settings → Set up sync** and type the passphrase.

The sync token is encrypted with the passphrase (PBKDF2-SHA256 with 600,000 rounds, then AES-256-GCM) and stored in a **public** Gist, so a new device can download it without signing in. Because anyone can download the encrypted copy, the app always generates the passphrase (20 random characters, about 99 bits) instead of letting you choose one.

Sync merges changes item by item, so edits made on two devices at the same time are both kept.

**About privacy:** hiding gifts keeps surprises off your screen; it isn't encryption. The data lives in a *secret* Gist, which is unlisted, but anyone with the token or the Gist's link could read the raw data.

## Upgrading from the Christmas-only version
Your existing list becomes a "Christmas 2026" event, and every person, gift, budget and setting is kept. Before converting, the app saves an untouched copy of the old list on each device. Before its first sync in the new format, it also saves a copy to your Gist as `christmas-planner-backup-before-events.json`.

## Local development
There's no build step: the browser loads the ES modules in `js/` directly.
```bash
python3 -m http.server 8765
```
Open http://localhost:8765. The service worker is skipped on `localhost`, and `window.dev` exposes the modules in the console (for example `dev.store.state`). To try offline mode, use http://127.0.0.1:8765 instead.

Run the tests (Node 20 or newer, nothing to install):
```bash
npm test
```

**Releasing:** bump `CACHE` in `sw.js` and `APP_VERSION` in `js/version.js` to the same value (a test checks). If you add a file to `js/` or `css/`, also add it to `ASSETS` there; a test fails if you forget. The service worker caches every file as one version, so an update can't mix old and new modules.

### Code layout
| File | What it holds |
| --- | --- |
| `js/util.js` | DOM helpers, escaping, money, icons |
| `js/constants.js` | statuses, event types, themes, colors |
| `js/dates.js` | date math and relative dates |
| `js/data.js` | **pure data logic**: sanitizing input, merging devices, planning birthdays and yearly events, the upgrade from the Christmas-only version |
| `js/store.js` | the current state, saving, `commit()`, and who's using this device |
| `js/ics.js` | **pure** calendar file parsing and name detection |
| `js/components.js` | small shared views: present card, tiles, tags, status chips |
| `js/pages.js` | every page (Home, Events, People, Gifts, Settings, detail pages) |
| `js/nav.js` | page stacks, tab switching, swipe-to-delete and edge-swipe back |
| `js/sheets.js` | dialogs, confirmation menus, toasts, undo |
| `js/forms.js`, `js/event-sheet.js`, `js/datefields.js` | the person, gift and event dialogs and typed dates |
| `js/calendar.js` | calendar import (drops, files, review sheet) and export |
| `js/gift-drag.js` | dragging gifts between events and into any order |
| `js/actions.js` | button actions (`data-action`) and app-wide listeners |
| `js/sync.js`, `js/passjoin.js` | Gist sync and the passphrase join |
| `js/identity.js`, `js/desktop.js` | "who's using this device", desktop sidebar and shortcuts |
| `js/errors.js` | error reports to Firebase (readable only in the Firebase console) |
| `js/main.js` | starts the app |
| `css/*.css` | base tokens, layout, lists, sheets, desktop |

The pure modules (`data`, `dates`, `ics`, `datefields`) don't touch the page, so the tests run them directly in Node.
