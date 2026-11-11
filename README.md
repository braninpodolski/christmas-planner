# Christmas Planner

A personal Christmas planner and gift tracker built as a home-screen web app. It has no build step and no dependencies: just static files hosted free on GitHub Pages.

## Features
- **Overview**: a countdown written out like a holiday card, plus your spending, gift progress, the people you're still shopping for, and upcoming tasks.
- **People**: a gift tag for each person, with a budget, sizes and favorites, and notes.
- **Gifts**: each gift is marked *Buying it* or *Making it*, and its progress follows that choice:
  - Buying it: Idea → Ordered → In hand → Wrapped
  - Making it: Idea → Making → Finished → Wrapped

  Tap a status to move a gift to the next step. You can search and filter, including by handmade gifts.
- **To-Do**: a holiday checklist grouped by category, with due dates and a starter list.
- **Undo** after any delete.
- **Sharing**: one list for your household. Gifts someone else is buying for you stay hidden on your device.
- Works offline and installs to your home screen, with light and dark mode.
- **Desktop layout** on computers: a sidebar, hover actions, centered dialogs and keyboard shortcuts.

## Keyboard shortcuts (desktop)
| Key | Action |
| --- | --- |
| N / P / T | New gift / person / task |
| / or ⌘K | Search gifts |
| 1–4 | Overview, People, Gifts, To-Do |
| , | Settings |
| ↑ ↓ (or J K) | Move between rows |
| ↩ | Open the selected row |
| Space | Next status, or check off a task (X also works) |
| ⌫ | Delete the selected row |
| ⌘Z | Undo a delete |
| ⌘↩ / Esc | Save / close a form |
| ? | Show all shortcuts |

## Install on iPhone or iPad
Open the site in Safari, then tap **Share → Add to Home Screen**.

## Sync and sharing
1. Create a [fine-grained token](https://github.com/settings/personal-access-tokens/new). Under **Account permissions**, set **Gists** to **Read and write**. Leave everything else off.
2. In the app, go to **Settings → Set up sync** and paste the token.
3. To share, make sure everyone is on the People list, then go to **Settings → Share with your household** and pick yourself.
4. On the other phone, set up sync with the same token. The app asks who they are before showing anything.

### Adding a device with a passphrase (no token)
1. On a device that already syncs, go to **Settings → Passphrase for new devices** and save the suggested passphrase somewhere safe.
2. On the new device, go to **Settings → Set up sync** and type the passphrase.

How it works: the sync token is encrypted with your passphrase (PBKDF2-SHA256 with 600,000 rounds, then AES-256-GCM) and stored in a **public** Gist, so a new device can download it without signing in. It can't be read without the passphrase, but anyone can download the encrypted copy, so keep the passphrase long and random. If you replace your token, set the passphrase again.

Sync merges changes item by item, so edits made on two devices at the same time are both kept.

**About privacy:** hiding gifts works by keeping surprises off your screen, not by encrypting them. The data lives in a *secret* Gist, which is unlisted, but anyone with the token or the Gist's link could read the raw data. The token is stored only in each device's browser.

## Local development
```bash
python3 -m http.server 8765
```
The service worker is skipped on `localhost`. After changing files, bump `CACHE` in `sw.js` so installed copies get the update.
