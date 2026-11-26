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
- **Move gifts between events**: drag a gift onto another event or onto Saved ideas (long-press on a phone). On a computer, you can also press M.
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
```bash
python3 -m http.server 8765
```
The service worker is skipped on `localhost`. After changing files, bump `CACHE` in `sw.js` so installed copies get the update.
