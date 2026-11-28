import { KEY } from './constants.js';
import { autoPlan, load, saveLocal, setState } from './store.js';
import { Nav } from './nav.js';
import { refreshIfNewDay, renderAllPreserve } from './actions.js';
import { Sync } from './sync.js';
import { Cloud } from './cloud.js';
import './errors.js';
import { Identity } from './identity.js';
import { Desk } from './desktop.js';
import './util.js';
import './dates.js';
import './data.js';
import './components.js';
import './pages.js';
import './sheets.js';
import './forms.js';
import './datefields.js';
import './event-sheet.js';
import './calendar.js';
import './gift-drag.js';
import './passjoin.js';
import './wish-ui.js';

setInterval(refreshIfNewDay, 60000);
addEventListener('storage', e => { if (e.key === KEY) { setState(load()); renderAllPreserve(); } });

/* Keep sheet buttons above the on-screen keyboard */
if (window.visualViewport) {
  const vv = window.visualViewport;
  const onVV = () => {
    const kb = Math.max(0, innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--kb', (kb > 80 ? kb - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dock-b')) || 0) : 0) + 'px');
  };
  vv.addEventListener('resize', onVV); vv.addEventListener('scroll', onVV);
}

// iOS only shows :active press states promptly when a touch listener exists
document.addEventListener('touchstart', () => {}, { passive: true });
document.documentElement.classList.toggle('desk', Desk.on());
Nav.init();
Desk.apply();
saveLocal();   // persists any one-time migration (Christmas list -> events)
autoPlan();    // make sure upcoming birthdays and yearly events exist
Identity.check();
import('./account.js').then(m => m.handleJoinLink());
if (Cloud.wanted()) Cloud.boot();
else if (Sync.enabled()) Sync.syncNow();
if ('serviceWorker' in navigator && location.protocol.startsWith('http') && location.hostname !== 'localhost') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// On a local dev server, expose the modules in the console for debugging: dev.store.state, dev.forms.giftSheet() …
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
  const names = ['store', 'data', 'dates', 'datefields', 'sheets', 'forms', 'event-sheet', 'calendar', 'gift-drag', 'nav', 'sync', 'passjoin'];
  Promise.all(names.map(m => import(`./${m}.js`))).then(ms => { window.dev = Object.fromEntries(names.map((n, i) => [n.replace('-', ''), ms[i]])); });
}
