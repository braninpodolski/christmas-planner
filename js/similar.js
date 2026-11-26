/* "Given before" and "already planned" hints: finds gifts for the same person with a similar title.
   Plain word matching (no AI): tidy both titles, then compare their key words, allowing for plurals,
   one word inside another ("robe" / "bathrobe") and a short list of gift synonyms. */

const FILLER = new Set(('a an the and or of for with to in on my his her their our new big small little cute nice cozy comfy fluffy soft ' +
  'set kit pack pair box gift card some more mini large extra really very work everyday daily').split(' '));

// Words that mean the same gift. Each group maps to its first word.
const SYNONYMS = [
  ['robe', 'bathrobe', 'dressinggown', 'housecoat'],
  ['sweater', 'jumper', 'pullover', 'sweatshirt', 'hoodie', 'cardigan'],
  ['headphone', 'earbud', 'earphone', 'airpod', 'headset'],
  ['slipper', 'houseshoe'],
  ['mug', 'cup', 'tumbler'],
  ['scarf', 'shawl', 'wrap'],
  ['beanie', 'hat', 'toque'],
  ['glove', 'mitten', 'mitt'],
  ['necklace', 'pendant', 'chain'],
  ['candle', 'diffuser'],
  ['blanket', 'throw', 'quilt'],
  ['lotion', 'moisturizer', 'cream'],
  ['perfume', 'cologne', 'fragrance'],
  ['wallet', 'purse', 'cardholder'],
  ['book', 'novel', 'paperback', 'hardcover'],
  ['kindle', 'ereader'],
  ['watch', 'smartwatch'],
  ['speaker', 'soundbar'],
  ['airwrap', 'hairdryer', 'blowdryer', 'dryer', 'straightener', 'curler'],
  ['lunchbox', 'bento'],
  ['seat', 'stool', 'chair', 'bench'],
  ['paint', 'watercolor', 'acrylic', 'gouache', 'paintbrush'],
  ['ticket', 'tickets', 'admission'],
];
const CANON = new Map(SYNONYMS.flatMap(g => g.map(w => [w, g[0]])));

function stem(w) {
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 4 && /(ches|shes|xes|sses)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}
// "Big comfy robe!" -> ['robe']; "Dressing gown" -> ['robe']; "Phantom of the Opera tickets" -> ['phantom', 'opera', 'ticket']
export function keyWords(title) {
  let s = String(title || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
  s = s.replace(/dressing gown/g, 'dressinggown').replace(/house ?shoes?/g, 'houseshoe').replace(/hair ?dryers?/g, 'hairdryer').replace(/blow ?dryers?/g, 'blowdryer')
    .replace(/e-?readers?/g, 'ereader').replace(/card ?holders?/g, 'cardholder').replace(/lunch ?box(es)?/g, 'lunchbox');
  const words = s.replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean).map(stem).filter(w => !FILLER.has(w) && !/^\d+$/.test(w));
  return [...new Set(words.map(w => CANON.get(w) || w))];
}
// Two key words match when equal, or when one (4+ letters) sits inside the other: robe / bathrobe
const wordsMatch = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a)));

export function similarity(titleA, titleB) {
  const a = keyWords(titleA), b = keyWords(titleB);
  return a.filter(w => b.some(x => wordsMatch(w, x)));
}

/* Gifts for the same person that look like this one.
   given: from events that have passed, and got past "Idea" (so they were actually given)
   planned: on upcoming events or saved ideas, by anyone in the household */
export function findSimilar({ title, personId, gifts, occasions, excludeId = '', today }) {
  if (!personId || keyWords(title).length === 0) return [];
  const occ = new Map(occasions.map(o => [o.id, o]));
  const out = [];
  for (const g of gifts) {
    if (g.id === excludeId || g.personId !== personId) continue;
    const words = similarity(title, g.title);
    if (!words.length) continue;
    const o = occ.get(g.occasionId);
    const past = o && o.date < today;
    if (past && g.status === 'idea') continue; // never actually given
    out.push({ gift: g, occasion: o || null, kind: past ? 'given' : 'planned', words });
  }
  // most recent gifts first: planned ones, then the latest given
  return out.sort((x, y) => (x.kind === y.kind ? (y.occasion?.date || '9999').localeCompare(x.occasion?.date || '9999') : x.kind === 'planned' ? -1 : 1));
}
