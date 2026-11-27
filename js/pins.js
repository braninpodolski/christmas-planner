/* Pinned people: personal to each account, not shared with the household.
   Kept on this device, and on the signed-in account (users/{uid}.pinned) so it follows you to other devices. */
const KEY = 'xmas-pins';
const load = () => { try { return new Set(JSON.parse(localStorage.getItem(KEY)) || []); } catch { return new Set(); } };

export const Pins = {
  ids: load(),
  has(id) { return this.ids.has(id); },
  save() { try { localStorage.setItem(KEY, JSON.stringify([...this.ids])); } catch {} },
  toggle(id) { this.ids.has(id) ? this.ids.delete(id) : this.ids.add(id); this.save(); return this.ids.has(id); },
  replace(list) { this.ids = new Set(list); this.save(); },
};
