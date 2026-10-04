/* Practice history on this device: one record per checked drawing, in IndexedDB.
   The record format is in docs/data.md. Every function fails soft: if storage is unavailable
   (private browsing, quota) the app keeps working and simply records nothing. */

const DB = 'freehand', STORE = 'attempts';
export const SCHEMA = 1;

let opening = null;
function db() {
  if (!opening) opening = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true }).createIndex('t', 't');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return opening;
}
function run(mode, work) {
  return db().then(d => new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, mode), out = work(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
    tx.onerror = tx.onabort = () => reject(tx.error);
  }));
}

export const addAttempt = rec => run('readwrite', s => s.add(rec)).catch(() => null);
export const allAttempts = () => run('readonly', s => s.getAll()).catch(() => []);
export const countAttempts = () => run('readonly', s => s.count()).catch(() => 0);
// Removes records with from <= t < to (used once a past day is safely on GitHub).
export const deleteAttempts = (from, to) => run('readwrite', s => { s.index('t').openCursor(IDBKeyRange.bound(from, to, false, true)).onsuccess = e => { const c = e.target.result; if (c) { c.delete(); c.continue(); } }; }).catch(() => null);

/* A stroke is stored as a flat list x, y, x, y, ... in sheet pixels, one decimal, after dropping
   the points that do not move the line by more than TOL. A straight edge shrinks to a few
   points; a wobble bigger than half a pixel is kept. This is what keeps a cube near 5 KB. */
const TOL = 0.5;
export function packStroke(pts) {
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) { // Douglas-Peucker, without recursion (strokes can be thousands of points)
    const [a, b] = stack.pop(), A = pts[a], B = pts[b], dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy);
    let far = -1, max = TOL;
    for (let i = a + 1; i < b; i++) {
      const d = L ? Math.abs((pts[i].x - A.x) * dy - (pts[i].y - A.y) * dx) / L : Math.hypot(pts[i].x - A.x, pts[i].y - A.y);
      if (d > max) { max = d; far = i; }
    }
    if (far > 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  const out = [];
  for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(Math.round(pts[i].x * 10) / 10, Math.round(pts[i].y * 10) / 10);
  return out;
}
// Back to the {x, y} points the engine takes, e.g. to mark an old drawing again.
export const unpackStroke = flat => { const pts = []; for (let i = 0; i < flat.length; i += 2) pts.push({ x: flat[i], y: flat[i + 1] }); return pts; };
