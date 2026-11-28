/* =========================================================
   Utilities
   ========================================================= */
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Formatters are expensive to construct, so build them once.
export const MONEY_WHOLE = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
export const MONEY_CENTS = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = n => ((n || 0) % 1 ? MONEY_CENTS : MONEY_WHOLE).format(n || 0);
export const num = v => { const n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; };
export const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
export const nextFrame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
export const sleep = ms => new Promise(r => setTimeout(r, ms));

export function words(n) {
  const a = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const t = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  if (n < 20) return a[n];
  if (n < 100) return t[Math.floor(n / 10)] + (n % 10 ? '-' + a[n % 10] : '');
  return a[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' ' + words(n % 100) : '');
}
export const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

export const Icon = {
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3"/><path d="M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>',
  wish: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 4.6l.6 1.2 1.3.2-1 .9.3 1.3-1.2-.7-1.2.7.3-1.3-1-.9 1.3-.2z"/><circle cx="4.5" cy="12" r=".9"/><circle cx="4.5" cy="18" r=".9"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 3h6l-1 6 4 4H6l4-4z"/><path d="M12 13v8"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3.2l2.5 5.6 6.1.6-4.6 4.1 1.3 6-5.3-3.1-5.3 3.1 1.3-6L3.4 9.4l6.1-.6Z"/></svg>',
  tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M8.2 5h11.3c.8 0 1.5.7 1.5 1.5v11c0 .8-.7 1.5-1.5 1.5H8.2c-.4 0-.8-.2-1.1-.5L3.4 12.9a1.4 1.4 0 0 1 0-1.8l3.7-5.6c.3-.3.7-.5 1.1-.5Z"/><circle cx="8.6" cy="12" r="1.3"/></svg>',
  gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="8" width="17" height="4" rx="1"/><path d="M5 12v7.5c0 .6.4 1 1 1h12c.6 0 1-.4 1-1V12M12 8v12.5"/><path d="M12 8C11 5 9.4 3.6 8 3.6c-1.2 0-2 .8-2 1.9C6 7.2 8 8 12 8Zm0 0c1-3 2.6-4.4 4-4.4 1.2 0 2 .8 2 1.9C18 7.2 16 8 12 8Z"/></svg>',
  todo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><path d="m8 12.2 2.7 2.7L16.2 9"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M10.4 3h3.2l.5 2.4c.7.3 1.3.6 1.9 1.1l2.3-.8 1.6 2.8-1.8 1.6a7 7 0 0 1 0 2.2l1.8 1.6-1.6 2.8-2.3-.8c-.6.5-1.2.8-1.9 1.1l-.5 2.4h-3.2l-.5-2.4c-.7-.3-1.3-.6-1.9-1.1l-2.3.8-1.6-2.8 1.8-1.6a7 7 0 0 1 0-2.2L4.1 8.5l1.6-2.8 2.3.8c.6-.5 1.2-.8 1.9-1.1Z"/><circle cx="12" cy="12" r="2.8"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  back: '<svg viewBox="0 0 12 20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2 2 10l8 8"/></svg>',
  chev: '<svg class="chev" viewBox="0 0 8 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m1 1 6 6-6 6"/></svg>',
  check: '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m2.5 7.5 3 3 6-7"/></svg>',
  search: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="7" cy="7" r="5.2"/><path d="m11 11 3.5 3.5"/></svg>',
  cloud: '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M5.5 16a4 4 0 0 1-.6-8A5.5 5.5 0 0 1 15.4 7.4 4.3 4.3 0 0 1 15 16Z"/></svg>',
  sync: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 8a6.5 6.5 0 0 0-11.7-2.2M4 12a6.5 6.5 0 0 0 11.7 2.2"/><path d="M3.5 2.5v3.8h3.8M16.5 17.5v-3.8h-3.8"/></svg>',
  down: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3v10M5.5 8.5 10 13l4.5-4.5M3.5 16.5h13"/></svg>',
  up: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13V3M5.5 7.5 10 3l4.5 4.5M3.5 16.5h13"/></svg>',
  unlink: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 12 12 8M6.5 9.5l-1.8 1.8a2.8 2.8 0 0 0 4 4l1.8-1.8M13.5 10.5l1.8-1.8a2.8 2.8 0 0 0-4-4L9.5 6.5"/></svg>',
  trash: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 5.5h13M8 5.5V3.8c0-.4.4-.8.8-.8h2.4c.4 0 .8.4.8.8v1.7M5.2 5.5l.8 10.7c0 .7.6 1.3 1.3 1.3h5.4c.7 0 1.3-.6 1.3-1.3l.8-10.7"/></svg>',
  bag: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M4 6.5h12l-.8 10H4.8Z"/><path d="M7.2 8.5V5.8a2.8 2.8 0 0 1 5.6 0v2.7" stroke-linecap="round"/></svg>',
  scissors: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="5.5" cy="14.5" r="2.5"/><circle cx="14.5" cy="14.5" r="2.5"/><path d="M7.3 12.7 15 3M12.7 12.7 5 3"/></svg>',
  key: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="12.5" r="3.5"/><path d="m9.5 10 7-7M14 5.5l2 2M12 7.5l1.5 1.5"/></svg>',
  ok: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m4.5 10.5 3.5 3.5 7.5-8"/></svg>',
  warn: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="10" cy="10" r="7.5"/><path d="M10 6v4.5M10 13.6v.1"/></svg>',
  // event types
  tree: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 16.5 8.5H14l4 5h-2.6l3.6 5H5l3.6-5H6l4-5H7.5Z"/><path d="M12 18.5V21.5"/></svg>',
  cake: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20.5h16M5.5 20.5v-6.5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v6.5"/><path d="M5.5 16.2c1.6 1.2 3.2 1.2 4.6 0s3-1.2 4.4 0 3 1.2 4 .2"/><path d="M12 12V9M12 6.8c-1-.9-1-2.2 0-3.3 1 1.1 1 2.4 0 3.3Z"/></svg>',
  rings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="14.5" r="5.5"/><circle cx="15" cy="14.5" r="5.5"/><path d="m10.4 5.2 1.6-2.2 1.6 2.2-1.6 1.9Z"/></svg>',
  sparkle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M11 3c.7 4.6 2.9 6.8 7.5 7.5-4.6.7-6.8 2.9-7.5 7.5-.7-4.6-2.9-6.8-7.5-7.5C8.1 9.8 10.3 7.6 11 3Z"/><path d="M18.5 15c.3 1.8 1.1 2.6 2.9 2.9-1.8.3-2.6 1.1-2.9 2.9-.3-1.8-1.1-2.6-2.9-2.9 1.8-.3 2.6-1.1 2.9-2.9Z"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="4"/><path d="M3.5 10h17M8 3v4M16 3v4"/><circle cx="12" cy="15" r="1.3" fill="currentColor" stroke="none"/></svg>',
  idea: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 18h5M10.5 21h3"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3Z"/></svg>',
};

export const BOW_SMALL = `<svg viewBox="0 0 72 50" aria-hidden="true"><path d="M36 26 C24 6 6 4 8 18 C9 28 24 30 36 26Z M36 26 C48 6 66 4 64 18 C63 28 48 30 36 26Z" fill="#fff"/><path d="M33 27 L24 48 L30 45 L33 49 L36 29Z M39 27 L48 48 L42 45 L39 49 L36 29Z" fill="rgba(255,255,255,.75)"/><ellipse cx="36" cy="26" rx="6.5" ry="6" fill="#fff"/></svg>`;
