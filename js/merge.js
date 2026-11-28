/* Bringing plans along when joining a household: the same rules as the app's GiftTagsKit Merge.swift.
   Pure functions on the website's records, so tests run them in Node. */

const key = name => String(name || '').trim().toLowerCase();

/* What to add to `target` ({ people, occasions }) to bring `from` ({ people, occasions, gifts }) along:
   `me` there becomes `targetMe`, and people with the same name are the same person. Events that are the same
   (same id, like a birthday or Christmas, or same type, date and title) merge, picking up anyone missing; the
   rest are added. Every gift comes along, pointed at the merged people and events. Records get mod = now. */
export function bringing(from, target, me, targetMe, now = Date.now()) {
  const personMap = new Map([[me, targetMe]]);
  const people = [];
  for (const p of from.people) {
    if (p.id === me) continue;
    const same = target.people.find(t => key(t.name) === key(p.name));
    if (same) personMap.set(p.id, same.id);
    else { people.push({ ...p, mod: now }); personMap.set(p.id, p.id); }
  }
  const mapPerson = id => personMap.get(id) ?? id;

  const occasionMap = new Map(), out = new Map();
  for (const o of from.occasions) {
    const mine = { ...o, people: o.people.map(mapPerson), budgets: {} };
    for (const [pid, b] of Object.entries(o.budgets || {})) if (!(mapPerson(pid) in mine.budgets)) mine.budgets[mapPerson(pid)] = b;
    if (o.type === 'birthday' && (o.series || '').startsWith('b') && o.people[0]) {
      mine.series = 'b' + mapPerson(o.people[0]);
      mine.id = `${mine.series}y${o.date.slice(0, 4)}`;
    }
    const same = target.occasions.find(t => t.id === mine.id)
      || target.occasions.find(t => t.type === mine.type && t.date === mine.date && key(t.title) === key(mine.title));
    if (same) {
      occasionMap.set(o.id, same.id);
      const missing = mine.people.filter(pid => !same.people.includes(pid));
      if (missing.length) {
        const t = out.get(same.id) || { ...same, people: [...same.people], budgets: { ...(same.budgets || {}) } };
        for (const pid of missing) {
          if (!t.people.includes(pid)) t.people.push(pid);
          if (mine.budgets[pid] != null && t.budgets[pid] == null) t.budgets[pid] = mine.budgets[pid];
        }
        t.mod = now;
        out.set(t.id, t);
      }
    } else {
      occasionMap.set(o.id, mine.id);
      out.set(mine.id, { ...mine, mod: now });
    }
  }

  const gifts = from.gifts.map(g => ({
    ...g,
    personId: mapPerson(g.personId),
    buyer: g.buyer ? mapPerson(g.buyer) : '',
    occasionId: g.occasionId ? (occasionMap.get(g.occasionId) ?? '') : '',
    mod: now,
  }));
  return { people, occasions: [...out.values()].sort((a, b) => (a.id < b.id ? -1 : 1)), gifts };
}

/* Anything worth asking about before joining another household: people besides you, events or gifts. */
export const hasPlans = (s, me) => s.people.some(p => p.id !== me) || s.gifts.length > 0 || s.occasions.length > 0;

/* "4 people, 3 events and 12 gifts", for the join question */
export function plansSummary(s, me) {
  const n = (c, one, many) => `${c} ${c === 1 ? one : many}`;
  const parts = [];
  const people = s.people.filter(p => p.id !== me).length;
  if (people) parts.push(n(people, 'person', 'people'));
  if (s.occasions.length) parts.push(n(s.occasions.length, 'event', 'events'));
  if (s.gifts.length) parts.push(n(s.gifts.length, 'gift', 'gifts'));
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0] || 'nothing';
}
