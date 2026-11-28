import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// Every module and stylesheet must be cached for offline use, or the app won't start without a connection.
// The shared wish list page (wish.html, js/wish.js) isn't part of the app: it always loads fresh.
const NOT_APP = new Set(['js/wish.js']);
test('the service worker caches every app file', () => {
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  for (const dir of ['js', 'css']) {
    for (const f of readdirSync(new URL(`../${dir}/`, import.meta.url))) {
      if (NOT_APP.has(`${dir}/${f}`)) continue;
      assert.ok(sw.includes(`'./${dir}/${f}'`), `${dir}/${f} is missing from ASSETS in sw.js`);
    }
  }
});

test('the version sent with error reports matches the service worker cache', async () => {
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const { APP_VERSION } = await import('../js/version.js');
  assert.ok(sw.includes(`const CACHE = '${APP_VERSION}';`), `bump APP_VERSION in js/version.js to match CACHE in sw.js`);
});
