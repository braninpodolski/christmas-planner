/* Error reports: anything that goes wrong is saved to the Firestore "errors" collection, which only
   the project owner can read (in the Firebase console). Reports carry the error and where it happened,
   the app version and the browser — never the list itself. Until someone is signed in, reports wait
   on the device (at most 20) and go out after the next sign-in. At most 10 are sent per session. */
import { Cloud } from './cloud.js';
import { APP_VERSION } from './version.js';

const PENDING = 'xmas-errors-pending', MAX_SENT = 10, MAX_PENDING = 20;
const NOISE = /ResizeObserver loop|^Script error\.?$|Load failed|NetworkError when attempting to fetch|Failed to fetch|The user aborted a request|AbortError/i;
const seen = new Set();
let sent = 0, flushing = false;

const load = () => { try { return JSON.parse(localStorage.getItem(PENDING)) || []; } catch { return []; } };
const save = list => { try { list.length ? localStorage.setItem(PENDING, JSON.stringify(list.slice(-MAX_PENDING))) : localStorage.removeItem(PENDING); } catch {} };

export function report(err, where = '') {
  try {
    const message = String(err?.message || err?.reason?.message || err || 'Unknown error').slice(0, 500);
    if (NOISE.test(message)) return;
    const key = message + '|' + where;
    if (seen.has(key) || seen.size > 100) return; // the same error once per session
    seen.add(key);
    save([...load(), {
      message,
      stack: String(err?.stack || '').slice(0, 3000),
      where: String(where).slice(0, 200),
      version: APP_VERSION,
      ua: navigator.userAgent.slice(0, 300),
      page: location.pathname.slice(0, 100), // never the query string (invite codes live there)
      at: Date.now(),
    }]);
    flush();
  } catch {}
}

export async function flush() {
  if (flushing || !Cloud.user || !Cloud.F || sent >= MAX_SENT) return;
  const items = load(); if (!items.length) return;
  flushing = true; save([]);
  const { F, db } = Cloud, uid = Cloud.user.uid;
  for (const e of items) {
    if (sent >= MAX_SENT) break;
    sent++;
    try { await F.addDoc(F.collection(db, 'errors'), { ...e, uid }); } catch {}
  }
  flushing = false;
}

// errors from anywhere in the page, including ones caught by the inline catcher before the app loaded
addEventListener('error', e => report(e.error || e.message, e.filename ? `${e.filename.split('/').pop()}:${e.lineno}` : 'page'));
addEventListener('unhandledrejection', e => report(e.reason, 'promise'));
for (const e of (window.__earlyErrors || [])) report(e.error || e.message, 'startup');
window.__earlyErrors = [];
