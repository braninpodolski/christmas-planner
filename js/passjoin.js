import { $, sleep } from './util.js';
import { renderAll } from './nav.js';
import { confirmDestructive, openSheet, toast } from './sheets.js';
import { Sync } from './sync.js';

/* =========================================================
   Passphrase join: a new device unlocks the sync token with a passphrase.
   The token + data-Gist id are encrypted on an already-synced device
   (PBKDF2-SHA256, 600k rounds -> AES-256-GCM) and stored in a *public*
   Gist, which a new device can read without any credentials.
   ========================================================= */
export const KEY_FILE = 'christmas-planner-key.json';
export const KEY_DESC = 'Christmas Planner sign-in (encrypted, needs a passphrase)';
export const PASS_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no look-alikes (i, l, o, 0, 1)
export const PassJoin = {
  ITER: 600000,
  normalize: p => String(p || '').toLowerCase().replace(/[\s\-_.]/g, ''),
  generate() {
    // 20 characters from a 31-letter alphabet: about 99 bits, shown as 5 groups of 4
    const out = [];
    const buf = new Uint8Array(1);
    while (out.length < 20) {
      crypto.getRandomValues(buf);
      if (buf[0] < 248) out.push(PASS_ALPHABET[buf[0] % 31]); // rejection sampling keeps it uniform
    }
    return out.join('').match(/.{4}/g).join('-');
  },
  b64: buf => btoa(String.fromCharCode(...new Uint8Array(buf))),
  unb64: s => Uint8Array.from(atob(s), c => c.charCodeAt(0)),
  async key(pass, salt, iter, usage) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(this.normalize(pass)), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, [usage]);
  },
  async seal(obj, pass) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const k = await this.key(pass, salt, this.ITER, 'encrypt');
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(JSON.stringify(obj)));
    return { v: 1, kdf: 'PBKDF2-SHA256', iter: this.ITER, salt: this.b64(salt), iv: this.b64(iv), ct: this.b64(ct) };
  },
  async unseal(blob, pass) {
    if (!blob || blob.v !== 1 || !blob.salt || !blob.iv || !blob.ct) throw new Error('The saved sign-in is damaged. Set the passphrase again on your other device.');
    const iter = Math.min(Math.max(Number(blob.iter) || this.ITER, 100000), 5000000);
    const k = await this.key(pass, this.unb64(blob.salt), iter, 'decrypt');
    let pt;
    try { pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: this.unb64(blob.iv) }, k, this.unb64(blob.ct)); }
    catch { throw new Error('That passphrase didn’t work. Check it and try again.'); }
    return JSON.parse(new TextDecoder().decode(pt));
  },
  // GitHub Pages lives at <user>.github.io, so the account is known without asking.
  pagesUser() {
    const h = location.hostname.toLowerCase();
    return h.endsWith('.github.io') ? h.slice(0, -'.github.io'.length) : '';
  },
  async publicApi(path) {
    const res = await fetch('https://api.github.com' + path, { cache: 'no-store', headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } });
    if (res.status === 404) throw new Error('That GitHub account wasn’t found.');
    if (res.status === 403 || res.status === 429) throw new Error('GitHub is limiting requests from this network. Try again in a few minutes.');
    if (!res.ok) throw new Error(`GitHub returned error ${res.status}. Try again in a minute.`);
    return res.json();
  },
  async findKeyGist(user) {
    for (let page = 1; page <= 3; page++) {
      const list = await this.publicApi(`/users/${encodeURIComponent(user)}/gists?per_page=100&page=${page}`);
      const g = list.find(x => x.files && x.files[KEY_FILE]);
      if (g) return g.id;
      if (list.length < 100) break;
    }
    return null;
  },
  // On a synced device: encrypt this device's sync details and publish them.
  async save(pass) {
    const blob = await this.seal({ token: Sync.cfg.token, gistId: Sync.cfg.gistId }, pass);
    const body = { description: KEY_DESC, files: { [KEY_FILE]: { content: JSON.stringify(blob) } } };
    let id = Sync.cfg.keyGistId;
    if (!id) {
      const mine = await Sync.api('/gists?per_page=100');
      id = mine.find(g => g.files && g.files[KEY_FILE])?.id;
    }
    if (id) await Sync.api(`/gists/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) });
    else id = (await Sync.api('/gists', { method: 'POST', body: JSON.stringify({ ...body, public: true }) })).id;
    Sync.cfg.keyGistId = id; Sync.cfg.passSet = Date.now(); Sync.saveCfg();
  },
  async remove() {
    let id = Sync.cfg.keyGistId;
    if (!id) { const mine = await Sync.api('/gists?per_page=100'); id = mine.find(g => g.files && g.files[KEY_FILE])?.id; }
    if (id) {
      const res = await fetch(`https://api.github.com/gists/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${Sync.cfg.token}`, Accept: 'application/vnd.github+json' } });
      if (!res.ok && res.status !== 404) throw new Error(`GitHub returned error ${res.status}. Try again in a minute.`);
    }
    delete Sync.cfg.keyGistId; delete Sync.cfg.passSet; Sync.saveCfg();
  },
  // On a new device: find the published sign-in, unlock it, then connect.
  async join(user, pass) {
    if (!/^[a-z0-9-]{1,39}$/i.test(user)) throw new Error('Enter the GitHub username the list belongs to.');
    const id = await this.findKeyGist(user);
    if (!id) throw new Error('No passphrase has been set up yet. On a device that already syncs, go to Settings and choose Passphrase for new devices.');
    const g = await this.publicApi(`/gists/${encodeURIComponent(id)}`);
    const blob = JSON.parse(g.files?.[KEY_FILE]?.content || 'null');
    const secret = await this.unseal(blob, pass);
    if (typeof secret.token !== 'string' || !/^[a-f0-9]{1,64}$/i.test(String(secret.gistId))) throw new Error('The saved sign-in is damaged. Set the passphrase again on your other device.');
    Sync.cfg = { token: secret.token, gistId: secret.gistId, keyGistId: id };
    Sync.saveCfg();
    await Sync.reconcile();
    Sync.cfg.lastSync = Date.now(); Sync.saveCfg();
  },
};

export function joinSheet() {
  const user = PassJoin.pagesUser();
  return openSheet({
    title: 'Set up sync',
    saveLabel: 'Join',
    required: user ? ['pass'] : ['pass', 'user'],
    body: `
      <p class="fnote" style="margin:0 0 20px;font-size:15px;color:var(--text)">Already using the app on another device? Enter the passphrase you set there, and this device will get the same list.</p>
      ${user ? '' : `
      <div class="flabel">GitHub username</div>
      <div class="fgroup"><div class="row"><input class="field" name="user" placeholder="username" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="GitHub username"></div></div>`}
      <div class="flabel">Passphrase</div>
      <div class="fgroup"><div class="row"><input class="field num" name="pass" type="password" placeholder="xxxx-xxxx-xxxx-xxxx-xxxx" autocapitalize="off" autocorrect="off" spellcheck="false" autocomplete="current-password" aria-label="Passphrase"></div></div>
      <p class="fnote">Find it in Settings on your other device, under Passphrase for new devices. Capital letters and dashes don’t matter.</p>
      <div class="fgroup"><button type="button" class="row" data-token-instead style="width:100%;color:var(--cranberry);font-weight:500">Use a GitHub token instead</button></div>
      <p class="fnote">Setting up your first device? Use a GitHub token, then set a passphrase so other devices can join.</p>`,
    onOpen(sh, close) {
      $('[data-token-instead]', sh).addEventListener('click', async () => { close(null); await sleep(500); tokenSheet(); });
    },
    onSave(d, form) {
      const sh = form.closest('.sheet'), btn = $('[data-sheet=save]', sh);
      btn.disabled = true; btn.textContent = 'Unlocking…';
      PassJoin.join(user || d.user.trim(), d.pass).then(() => {
        sh._close(null); renderAll();
        toast('Sync is on. List loaded.');
      }).catch(err => {
        if (!Sync.cfg.lastSync) { Sync.cfg = {}; Sync.saveCfg(); }
        btn.disabled = false; btn.textContent = 'Join';
        toast(err.message || 'Couldn’t join', 'warn');
      });
      return false;
    },
  });
}

export function passphraseSheet() {
  const suggestion = PassJoin.generate();
  const isSet = !!(Sync.cfg.passSet || Sync.cfg.keyGistId);
  return openSheet({
    title: 'Passphrase for new devices',
    saveLabel: isSet ? 'Replace passphrase' : 'Save passphrase',
    required: ['pass'],
    body: `
      <p class="fnote" style="margin:0 0 20px;font-size:15px;color:var(--text)">Set a passphrase once. On any new device, open Settings, choose Set up sync and type it. No token or phone needed.</p>
      <div class="flabel">Passphrase</div>
      <div class="fgroup">
        <div class="row"><input class="field num big" name="pass" value="${suggestion}" readonly autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="Passphrase" style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:20px;letter-spacing:.5px"></div>
        <button type="button" class="row" data-copy style="width:100%;color:var(--cranberry);font-weight:500">Copy passphrase</button>
        <button type="button" class="row" data-regen style="width:100%;color:var(--cranberry);font-weight:500">Make a different one</button>
      </div>
      <p class="fnote">Write it down or save it in your passwords app. You won’t be able to see it again here.</p>
      <p class="fnote">
        How it works: your sync sign-in is encrypted with this passphrase and saved as a public Gist in your GitHub account, so new devices can find it.
        Anyone can download the encrypted copy, which is why the app always makes a long random passphrase rather than letting you pick one. Guessing it isn’t practical.<br><br>
        If you ever replace your GitHub token, set the passphrase again.
      </p>
      ${isSet ? `<div class="fgroup"><button type="button" class="row danger" data-pass-remove style="width:100%">Remove passphrase</button></div>` : ''}`,
    onOpen(sh, close) {
      const input = $('[name=pass]', sh);
      $('[data-regen]', sh).addEventListener('click', () => { input.value = PassJoin.generate(); input.dispatchEvent(new Event('input', { bubbles: true })); });
      $('[data-copy]', sh).addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(input.value); toast('Passphrase copied'); }
        catch { input.select(); toast('Select the passphrase and copy it', 'warn'); }
      });
      $('[data-pass-remove]', sh)?.addEventListener('click', async () => {
        if (!await confirmDestructive('New devices won’t be able to join with the passphrase anymore. Devices already syncing keep working.', 'Remove passphrase')) return;
        try { await PassJoin.remove(); close(null); renderAll(); toast('Passphrase removed'); }
        catch (err) { toast(err.message || 'Couldn’t remove it', 'warn'); }
      });
    },
    onSave(d, form) {
      // Only app-generated passphrases (~99 bits) are accepted, since the encrypted copy is public.
      if (!/^[a-hj-km-np-z2-9]{20}$/.test(PassJoin.normalize(d.pass))) return false;
      const sh = form.closest('.sheet'), btn = $('[data-sheet=save]', sh);
      btn.disabled = true; btn.textContent = 'Encrypting…';
      PassJoin.save(d.pass).then(() => {
        sh._close(null); renderAll();
        toast('Passphrase saved');
      }).catch(err => {
        btn.disabled = false; btn.textContent = isSet ? 'Replace passphrase' : 'Save passphrase';
        toast(err.message || 'Couldn’t save it', 'warn');
      });
      return false;
    },
  });
}

export function tokenSheet() {
  return openSheet({
    title: 'Set up sync',
    saveLabel: 'Connect',
    required: ['token'],
    body: `
      <p class="fnote" style="margin:0 0 20px;font-size:15px;color:var(--text)">Sync saves your list to a secret Gist in your GitHub account. Every device with the same token sees the same list.</p>
      <div class="flabel">GitHub token</div>
      <div class="fgroup"><div class="row"><input class="field" name="token" type="password" placeholder="github_pat_…" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="GitHub token"></div></div>
      <p class="fnote">
        1. Open <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">GitHub’s fine-grained token page</a>.<br>
        2. Choose an expiration, like one year. Under Account permissions, set Gists to Read and write. Leave everything else off.<br>
        3. Generate the token, copy it and paste it here. Use the same token on each device.<br><br>
        The token is stored only on this device. If you’ve already set up sync on another device, this one loads that list.
      </p>`,
    onSave(d, form) {
      const sh = form.closest('.sheet'), btn = $('[data-sheet=save]', sh);
      btn.disabled = true; btn.textContent = 'Connecting…';
      Sync.connect(d.token).then(r => {
        sh._close(null); renderAll();
        toast(r === 'found' ? 'Sync is on. List loaded.' : 'Sync is on');
      }).catch(err => {
        Sync.cfg = {}; Sync.saveCfg();
        btn.disabled = false; btn.textContent = 'Connect';
        toast(err.message || 'Couldn’t connect', 'warn');
      });
      return false;
    },
  });
}
