/* Wish list data, shared by the website and its tests: the same format as the app's GiftTagsKit Wishes.swift.
   wishlists/{listId} = { owner, hid, personId, name, items: [{ id, name, price, url, notes, created }], updated } */

const str = (v, max) => (typeof v === 'string' ? v : '').slice(0, max);
const price = v => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : '');
export const MAX_WISHES = 200;

export function cleanWish(w) {
  if (!w || typeof w.id !== 'string' || !/^[a-z0-9]{1,40}$/i.test(w.id)) return null;
  return { id: w.id, name: str(w.name, 200).trim() || 'Wish', price: price(w.price), url: str(w.url, 2000), notes: str(w.notes, 1000), created: Number(w.created) || 0 };
}

export function cleanList(id, d) {
  if (!d || typeof d.owner !== 'string' || typeof d.hid !== 'string' || typeof d.personId !== 'string') return null;
  const seen = new Set();
  const items = (Array.isArray(d.items) ? d.items : []).map(cleanWish).filter(w => w && !seen.has(w.id) && seen.add(w.id));
  return { id, owner: d.owner, hid: d.hid, personId: d.personId, name: str(d.name, 100), items, updated: Number(d.updated) || 0 };
}

// Exactly the fields the rules allow
export const listDoc = l => ({
  owner: l.owner, hid: l.hid, personId: l.personId, name: str(l.name, 100),
  items: l.items.slice(0, MAX_WISHES).map(w => ({ id: w.id, name: str(w.name, 200), price: price(w.price), url: str(w.url, 2000), notes: str(w.notes, 1000), created: w.created || 0 })),
  updated: l.updated,
});

// The list id in a share link (…wish.html?l=<id>, gifttags://wish?l=<id>) or a pasted id, if it looks like one
export function wishListID(text) {
  const t = String(text || '').trim();
  const m = t.match(/[?&]l=([a-z0-9]+)/);
  const id = m ? m[1] : t;
  return /^[a-z0-9]{20,64}$/.test(id) ? id : '';
}

// The event a claimed wish joins: their next upcoming event, or '' (saved ideas)
export function claimTarget(upcoming, personId, destination) {
  if (destination !== 'next') return '';
  return upcoming.find(o => o.people.includes(personId))?.id || '';
}

// The planned gift a claimed wish becomes: a surprise from me, as an idea
export const giftFromWish = (w, personId, me, occasionId, id, now = Date.now()) => ({
  id, created: now, personId, occasionId, title: str(w.name, 200) || 'Gift', price: w.price === '' ? '' : w.price,
  buyer: me, status: 'idea', kind: 'buy', store: storeOf(w.url), url: w.url || '', notes: w.notes || '',
});

export function storeOf(url) {
  try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? u.hostname.replace(/^www\./, '') : ''; } catch { return ''; }
}

/* Who took a wish, as far as this household may know:
   'you', a person here ({ person }), a name typed on the share page ({ name }), or 'someone'. */
export function claimer(claim, { uid, members, names }) {
  if (claim.uid === uid) return { you: true };
  if (members[claim.uid]) return { person: members[claim.uid] };
  if (names?.[claim.wishId]) return { name: names[claim.wishId] };
  return { someone: true };
}
