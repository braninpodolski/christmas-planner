# Christmas Planner

A personal, iOS-style Christmas planning and gift tracking web app. No build step, no dependencies: just static files hosted free on GitHub Pages.

## Features
- **Overview**: countdown to Christmas, budget ring, gift progress, people still needing gifts, upcoming tasks
- **People**: budgets, avatars, sizes and preferences, notes, per-person spending
- **Gifts**: tap a status pill to move a gift along: Idea → Bought → Wrapped → Given. Includes search and filters
- **To-Do**: a holiday checklist grouped by category with due dates, plus a starter checklist
- **Sync**: optional cross-device sync through a secret GitHub Gist
- Works offline and installs to your home screen (PWA), with light and dark mode

## Install on iPhone or iPad
Open the site in Safari, then tap **Share → Add to Home Screen**. It launches full-screen like a native app.

## Sync between devices
1. Create a [fine-grained token](https://github.com/settings/personal-access-tokens/new). Under **Account permissions**, set **Gists** to **Read and write**. Nothing else is needed.
2. In the app, go to **Settings → Set Up Sync…** and paste the token.
3. Do the same on each device with the same token. The app finds the existing data Gist automatically.

The token is stored only in that device's browser storage. Your data lives in a *secret* Gist. It is unlisted, but anyone with its URL can view it.

## Local development
```bash
python3 -m http.server 8765
```
After changing files, bump `CACHE` in `sw.js` so installed copies pick up the update.
