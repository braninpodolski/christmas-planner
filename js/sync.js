import { $ } from './util.js';
import { canon, merge, sanitize } from './data.js';
import { autoPlan, saveLocal, setState, state } from './store.js';
import { timeAgo } from './pages.js';
import { toast } from './sheets.js';
import { refreshIfNewDay, renderAllPreserve } from './actions.js';

/* =========================================================
   Sync via a secret GitHub Gist
   ========================================================= */
export const GIST_FILE = 'christmas-planner.json'; // name kept so existing synced lists are found
export const GIST_BACKUP_FILE = 'christmas-planner-backup-before-events.json';
export const GIST_DESC = 'Christmas Planner data (synced by app)';
export const GIST_MOVED_FILE = 'gift-tags-moved-to-household.json'; // left by the device that moved the list into Firebase
export const GIST_ACCOUNTS_BACKUP_FILE = 'christmas-planner-backup-before-accounts.json';
import { Cloud } from './cloud.js';

// Gist sync. A device that belongs to a Firebase household hands every call to Cloud instead.
export const Sync = {
  cfg: (() => { try { const c = JSON.parse(localStorage.getItem('xmas-sync')) || {}; if (c.gistId && !/^[a-f0-9]{1,64}$/i.test(c.gistId)) delete c.gistId; return c; } catch { return {}; } })(),
  state: 'idle',
  error: '',
  timer: null,
  dirty: false,
  saveCfg() { try { localStorage.setItem('xmas-sync', JSON.stringify(this.cfg)); } catch {} },
  enabled() { return Cloud.wanted() || !!(this.cfg.token && this.cfg.gistId); },
  gist() { return !Cloud.wanted() && !!(this.cfg.token && this.cfg.gistId); },
  statusText() {
    if (Cloud.wanted()) return Cloud.statusText();
    if (!this.enabled()) return 'Off';
    if (this.state === 'syncing') return 'Syncing…';
    if (this.state === 'error') return this.error;
    return this.cfg.lastSync ? `Synced ${timeAgo(this.cfg.lastSync)}` : 'On';
  },
  setState(s, err = '') {
    this.state = s; this.error = err;
    const el = $('#syncStatus'); if (el) el.textContent = this.statusText();
  },
  async api(path, opts = {}) {
    const res = await fetch('https://api.github.com' + path, {
      cache: 'no-store', ...opts,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.cfg.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    if (!res.ok) {
      if (res.status === 401) throw new Error('GitHub rejected the token. Set up sync again with a new one.');
      if (res.status === 404) throw new Error('Gist not found. Check that the token has Gist access.');
      if (res.status === 403) throw new Error('The token needs Gists set to Read and write.');
      throw new Error(`GitHub returned error ${res.status}. Try again in a minute.`);
    }
    return res.json();
  },
  async connect(token) {
    this.cfg = { token: token.trim() };
    let found = null;
    for (let page = 1; page <= 5 && !found; page++) {
      const list = await this.api(`/gists?per_page=100&page=${page}`);
      found = list.find(g => g.files && g.files[GIST_FILE]);
      if (list.length < 100) break;
    }
    if (found) {
      this.cfg.gistId = found.id; this.saveCfg();
      await this.reconcile();
      this.cfg.lastSync = Date.now(); this.saveCfg();
      return 'found';
    }
    const g = await this.api('/gists', { method: 'POST', body: JSON.stringify({ description: GIST_DESC, public: false, files: { [GIST_FILE]: { content: JSON.stringify(state) } } }) });
    this.cfg.gistId = g.id; this.cfg.lastSync = Date.now(); this.saveCfg();
    return 'created';
  },
  async fetchRemote() {
    const g = await this.api(`/gists/${encodeURIComponent(this.cfg.gistId)}`);
    try { this.moved = g.files?.[GIST_MOVED_FILE] ? JSON.parse(g.files[GIST_MOVED_FILE].content) : null; } catch { this.moved = null; }
    const f = g.files && g.files[GIST_FILE];
    if (!f) return null;
    const text = f.truncated ? await (await fetch(f.raw_url, { cache: 'no-store' })).text() : f.content;
    try { return JSON.parse(text); } catch { return null; }
  },
  // Fetch the Gist, merge item-by-item with local data, then write back whichever side is behind.
  async reconcile() {
    const raw = await this.fetchRemote();
    // The first time this version syncs a Christmas-only list, save that original as its own
    // file in the Gist before anything in the new format is written over it.
    if (raw && Array.isArray(raw.people) && !Array.isArray(raw.occasions) && !this.cfg.v2backup) {
      await this.api(`/gists/${encodeURIComponent(this.cfg.gistId)}`, { method: 'PATCH', body: JSON.stringify({ files: { [GIST_BACKUP_FILE]: { content: JSON.stringify(raw) } } }) });
      this.cfg.v2backup = Date.now(); this.saveCfg();
    }
    const remote = raw && Array.isArray(raw.people) ? sanitize(raw) : null;
    const merged = remote ? merge(state, remote) : state;
    if (canon(merged) !== canon(state)) { setState(merged); saveLocal(); renderAllPreserve(); setTimeout(autoPlan, 0); }
    if (!remote || canon(merged) !== canon(remote)) await this.push();
  },
  // Before this list moves into a household: back it up and leave a note for devices still on the Gist
  async markMoved(household) {
    if (!this.gist()) return;
    await this.api(`/gists/${encodeURIComponent(this.cfg.gistId)}`, { method: 'PATCH', body: JSON.stringify({ files: {
      [GIST_ACCOUNTS_BACKUP_FILE]: { content: JSON.stringify(state) },
      [GIST_MOVED_FILE]: { content: JSON.stringify({ at: Date.now(), household }) },
    } }) });
  },
  async push() {
    await this.api(`/gists/${encodeURIComponent(this.cfg.gistId)}`, { method: 'PATCH', body: JSON.stringify({ files: { [GIST_FILE]: { content: JSON.stringify(state) } } }) });
  },
  schedule() {
    if (Cloud.wanted()) return Cloud.schedule();
    if (!this.gist()) return;
    this.dirty = true;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.syncNow(), 1500);
  },
  async syncNow(manual = false) {
    if (Cloud.wanted()) return Cloud.syncNow();
    if (!this.gist()) return;
    if (this.busy) { this.again = true; return; }
    this.busy = true; this.setState('syncing');
    try {
      this.dirty = false;
      await this.reconcile();
      this.cfg.lastSync = Date.now(); this.saveCfg();
      this.setState('idle');
      if (this.moved && !this.movedNoticed) { this.movedNoticed = true; toast('This list moved into a household. See Settings to join it.', 'warn'); }
      if (manual) toast('Synced');
    } catch (err) {
      this.dirty = true;
      const msg = navigator.onLine === false ? 'Offline. Changes will sync when you’re back online.' : (err.message || 'Sync failed. Try again.');
      this.setState('error', msg);
      if (manual) toast(navigator.onLine === false ? 'You’re offline' : 'Sync failed', 'warn');
    } finally {
      this.busy = false;
      if (this.again) { this.again = false; this.syncNow(); }
    }
  },
};
addEventListener('online', () => Sync.syncNow());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { Sync.syncNow(); refreshIfNewDay(); } });
setInterval(() => { if (document.visibilityState === 'visible') Sync.syncNow(); }, 60000);
