/* GitHub sync: checked drawings go to a private repo, automatically.
   One readable JSON file per exercise per UTC day, e.g. cubefree/2026-10-04.json, one record per
   line (docs/data.md). Same scheme as the boss's Woodshed app.

   A sync:
    1. lists the repo (which files exist, and their version);
    2. uploads every file where this device has records GitHub has not. If the file already
       exists there (another device, or the Home Screen app next to Safari), the two are merged
       first, add-only, so nothing is ever overwritten;
    3. removes local days older than KEEP_DAYS once they are confirmed on GitHub.

   The repo name and token live only in this device's localStorage, typed in by the boss.
   They are never in the code, which is public. */

import { allAttempts, deleteAttempts } from './store.js';

const REPO_KEY = 'freehand.syncRepo', TOKEN_KEY = 'freehand.syncToken', STATE_KEY = 'freehand.syncState';
export const DEFAULT_REPO = 'mantindjan/freehand-data';
const KEEP_DAYS = 60, DAY_MS = 86400000;

// UTC days, so a change of time zone never splits or re-files a day.
const utcDay = t => new Date(t).toISOString().slice(0, 10);
const dayStart = day => Date.parse(`${day}T00:00:00Z`);
const pathOf = r => `${r.exercise}/${utcDay(r.t)}.json`;
const FILE_RE = /^([a-z0-9-]+)\/(\d{4}-\d{2}-\d{2})\.json$/;
const stripId = ({ id, ...rest }) => rest;
// One record per line: readable, and one drawing per line in a git diff.
const fileText = recs => `[\n${[...recs].sort((a, b) => a.t - b.t).map(r => JSON.stringify(stripId(r))).join(',\n')}\n]\n`;

function ls(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
  } catch (e) { /* storage unavailable */ }
  return null;
}
export const syncConfig = () => ({ repo: ls(REPO_KEY) || '', token: ls(TOKEN_KEY) || '' });
export function setSyncConfig(repo, token) {
  // Another repo starts the bookkeeping over; the same repo with a renewed token keeps it.
  if (repo.trim() !== syncConfig().repo) ls(STATE_KEY, null);
  ls(REPO_KEY, repo.trim() || null); ls(TOKEN_KEY, token.trim() || null);
}
const loadState = () => { try { return JSON.parse(ls(STATE_KEY)) || { files: {} }; } catch (e) { return { files: {} }; } };
export const syncState = loadState;

class SyncError extends Error {}

const b64encode = text => { const bytes = new TextEncoder().encode(text); let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(bin); };

async function gh(method, path, body, raw) {
  const { repo, token } = syncConfig();
  let res;
  try {
    res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
      method, cache: 'no-store', body: body ? JSON.stringify(body) : undefined,
      // The raw form returns a file's text directly and has no 1 MB limit, which a heavy day could pass.
      headers: { Authorization: `Bearer ${token}`, Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    });
  } catch (e) { throw new SyncError('Offline. It will sync next time.'); }
  if (res.status === 401) throw new SyncError('Token rejected. Make a new one on GitHub and paste it here.');
  if (res.status === 403) throw new SyncError('The token cannot use that repo. It needs Contents: read and write.');
  if (res.status === 404 && path === '') throw new SyncError('Repo not found. Check the name, and that the token covers it.');
  return res;
}

// path -> version (blob sha) of every file in the repo. An empty repo gives an empty map.
async function listRemote() {
  const info = await gh('GET', '');
  if (!info.ok) throw new SyncError(`GitHub error ${info.status}.`);
  const res = await gh('GET', `/git/trees/${(await info.json()).default_branch}?recursive=1`);
  if (res.status === 409 || res.status === 404) return new Map();
  if (!res.ok) throw new SyncError(`GitHub error ${res.status}.`);
  return new Map((await res.json()).tree.filter(x => x.type === 'blob').map(x => [x.path, x.sha]));
}
async function readRecords(path) {
  const res = await gh('GET', `/contents/${path}`, null, true);
  if (res.status === 404) return [];
  if (!res.ok) throw new SyncError(`GitHub error ${res.status}.`);
  return JSON.parse(await res.text());
}
// Returns the new version, or null when GitHub says the file changed underneath.
async function writeFile(path, text, sha, message) {
  const res = await gh('PUT', `/contents/${path}`, { message, content: b64encode(text), ...(sha ? { sha } : {}) });
  if (res.status === 409 || res.status === 422) return null;
  if (!res.ok) throw new SyncError(`GitHub error ${res.status}.`);
  return (await res.json()).content.sha;
}

let running = null;
// Sync now. Resolves to { ok, uploaded, pruned, message }. Concurrent calls share one run.
export function sync() {
  const c = syncConfig();
  if (!c.repo || !c.token) return Promise.resolve({ ok: false, off: true, message: 'Not set up.' });
  if (!running) running = run().finally(() => { running = null; });
  return running;
}

async function run() {
  const state = loadState(), result = { ok: true, uploaded: 0, pruned: 0 };
  try {
    const now = Date.now();
    let remote = await listRemote();
    const local = new Map();
    for (const r of await allAttempts()) { const p = pathOf(r); if (!local.has(p)) local.set(p, []); local.get(p).push(r); }

    for (const [path, mine] of local) {
      const known = state.files[path];
      if (known && known.sha === remote.get(path) && known.count >= mine.length) continue;
      const message = `freehand: ${path.slice(0, -5).replace('/', ' ')} (${mine.length} drawing${mine.length > 1 ? 's' : ''})`;
      // Upload this device's records together with whatever GitHub already has for that file
      // (same drawing = same time stamp). Retries once if another device wrote in between.
      const put = async () => {
        const have = new Set(mine.map(r => r.t)), theirs = remote.has(path) ? (await readRecords(path)).filter(r => !have.has(r.t)) : [];
        return writeFile(path, fileText([...mine, ...theirs]), remote.get(path), message);
      };
      let sha = await put();
      if (sha === null) { remote = await listRemote(); sha = await put(); }
      if (sha === null) throw new SyncError('GitHub kept changing. It will retry next time.');
      state.files[path] = { sha, count: mine.length };
      result.uploaded++;
    }

    // Old days leave the device once GitHub has them; GitHub is then the only copy.
    // A day is removed as a whole, so every exercise's file of that day must be confirmed first.
    const cutoff = dayStart(utcDay(now)) - KEEP_DAYS * DAY_MS, days = new Map();
    for (const [path, mine] of local) {
      const day = path.match(FILE_RE)[2], d = days.get(day) || { paths: [], n: 0, safe: true };
      d.paths.push(path); d.n += mine.length; d.safe = d.safe && (state.files[path]?.count ?? -1) >= mine.length; days.set(day, d);
    }
    for (const [day, d] of days) {
      if (dayStart(day) >= cutoff || !d.safe) continue;
      await deleteAttempts(dayStart(day), dayStart(day) + DAY_MS);
      for (const p of d.paths) delete state.files[p];
      result.pruned += d.n;
    }
    state.last = now; state.error = null;
    result.message = 'Synced.';
  } catch (err) {
    if (!(err instanceof SyncError)) console.error(err); // a bug, not a network state
    state.error = err.message; result.ok = false; result.message = err.message;
  }
  ls(STATE_KEY, JSON.stringify(state));
  return result;
}
