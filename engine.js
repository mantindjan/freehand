/* FreeHand engine: stroke fitting, cube projection, best-match fitting. No DOM. */
export const FH = (function () {
  const DEG = Math.PI / 180, hyp = Math.hypot;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
  const dist = (a, b) => hyp(a.x - b.x, a.y - b.y);
  const angDiff = (a, b) => { let d = (a - b) % 360; if (d > 180) d -= 360; if (d <= -180) d += 360; return d; };
  // direction of a vector as degrees clockwise from 12 o'clock (screen coords, y down)
  const clockDeg = v => { let a = Math.atan2(v.x, -v.y) / DEG; return a < 0 ? a + 360 : a; };
  function clockText(deg) {
    let mins = Math.round(((deg % 360) + 360) % 360 * 2); // 1 degree = 2 minutes
    let h = Math.floor(mins / 60) % 12, m = mins % 60; if (h === 0) h = 12;
    return h + ':' + String(m).padStart(2, '0');
  }

  function pathLen(p) { let L = 0; for (let i = 1; i < p.length; i++) L += dist(p[i], p[i - 1]); return L; }
  function resample(p, n) {
    const L = pathLen(p); if (L === 0 || p.length < 2 || n < 2) return p.slice();
    const out = [p[0]], step = L / (n - 1); let acc = 0, target = step;
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1], b = p[i], d = dist(a, b);
      if (d > 0) while (acc + d >= target && out.length < n - 1) {
        const t = (target - acc) / d; out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }); target += step;
      }
      acc += d;
    }
    out.push(p[p.length - 1]); return out;
  }
  function bbox(pts) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const q of pts) { if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x; if (q.y < y0) y0 = q.y; if (q.y > y1) y1 = q.y; }
    return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, diag: hyp(x1 - x0, y1 - y0) };
  }
  function fitLine(p) {
    const n = p.length; let mx = 0, my = 0; for (const q of p) { mx += q.x; my += q.y; } mx /= n; my /= n;
    let sxx = 0, sxy = 0, syy = 0;
    for (const q of p) { const dx = q.x - mx, dy = q.y - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
    const th = 0.5 * Math.atan2(2 * sxy, sxx - syy), ux = Math.cos(th), uy = Math.sin(th);
    let tmin = Infinity, tmax = -Infinity, ss = 0;
    for (const q of p) {
      const dx = q.x - mx, dy = q.y - my, t = dx * ux + dy * uy, d = -dx * uy + dy * ux;
      ss += d * d; if (t < tmin) tmin = t; if (t > tmax) tmax = t;
    }
    const t0 = (p[0].x - mx) * ux + (p[0].y - my) * uy, t1 = (p[n - 1].x - mx) * ux + (p[n - 1].y - my) * uy;
    let ta = tmin, tb = tmax; if (t0 > t1) { ta = tmax; tb = tmin; }
    const a = { x: mx + ux * ta, y: my + uy * ta }, b = { x: mx + ux * tb, y: my + uy * tb };
    return { a, b, len: dist(a, b), rms: Math.sqrt(ss / n) };
  }
  // one stroke as one straight line
  function strokeLine(raw) {
    const L = pathLen(raw); if (raw.length < 2 || L < 3) return null;
    return fitLine(resample(raw, clamp(Math.round(L / 3), 6, 300)));
  }
  function rdp(p, eps) {
    const keep = new Uint8Array(p.length); keep[0] = keep[p.length - 1] = 1; const st = [[0, p.length - 1]];
    while (st.length) {
      const [i, j] = st.pop(); let md = 0, mi = -1; const a = p[i], b = p[j], dx = b.x - a.x, dy = b.y - a.y, L = hyp(dx, dy);
      for (let k = i + 1; k < j; k++) {
        const d = L < 1e-6 ? dist(p[k], a) : Math.abs((p[k].x - a.x) * dy - (p[k].y - a.y) * dx) / L;
        if (d > md) { md = d; mi = k; }
      }
      if (md > eps && mi > 0) { keep[mi] = 1; st.push([i, mi], [mi, j]); }
    }
    const idx = []; for (let i = 0; i < p.length; i++) if (keep[i]) idx.push(i); return idx;
  }
  // a stroke may hold several edges drawn without lifting: split at corners
  function strokeSegments(raw) {
    const L = pathLen(raw); if (raw.length < 2 || L < 8) return [];
    const p = resample(raw, clamp(Math.round(L / 3), 8, 500));
    const idx = rdp(p, Math.max(5, 0.07 * bbox(p).diag));
    let changed = true;
    while (changed && idx.length > 2) {
      changed = false;
      for (let i = 1; i < idx.length - 1; i++) {
        const a = p[idx[i - 1]], b = p[idx[i]], c = p[idx[i + 1]];
        const t = Math.abs(angDiff(Math.atan2(b.y - a.y, b.x - a.x) / DEG, Math.atan2(c.y - b.y, c.x - b.x) / DEG));
        if (t < 25) { idx.splice(i, 1); changed = true; break; }
      }
    }
    const segs = [];
    for (let i = 0; i < idx.length - 1; i++) {
      const pts = p.slice(idx[i], idx[i + 1] + 1); if (pts.length >= 2) segs.push(fitLine(pts));
    }
    const maxL = Math.max(...segs.map(s => s.len));
    return segs.filter(s => s.len >= Math.max(8, 0.18 * maxL));
  }
  // an edge stroked twice counts once
  function mergeOverdrawn(segs) {
    const out = segs.map(s => ({ a: s.a, b: s.b, len: s.len, rms: s.rms }));
    let merged = true;
    while (merged) {
      merged = false;
      outer: for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
        const s = out[i].len >= out[j].len ? out[i] : out[j], t = s === out[i] ? out[j] : out[i];
        const ux = (s.b.x - s.a.x) / s.len, uy = (s.b.y - s.a.y) / s.len;
        const tx = (t.b.x - t.a.x) / t.len, ty = (t.b.y - t.a.y) / t.len;
        if (Math.abs(ux * ty - uy * tx) > Math.sin(5 * DEG)) continue;
        const tol = Math.max(4, 0.025 * s.len);
        const pa = { t: (t.a.x - s.a.x) * ux + (t.a.y - s.a.y) * uy, d: -(t.a.x - s.a.x) * uy + (t.a.y - s.a.y) * ux };
        const pb = { t: (t.b.x - s.a.x) * ux + (t.b.y - s.a.y) * uy, d: -(t.b.x - s.a.x) * uy + (t.b.y - s.a.y) * ux };
        if (Math.abs(pa.d) > tol || Math.abs(pb.d) > tol) continue;
        const lo = Math.min(pa.t, pb.t), hi = Math.max(pa.t, pb.t);
        const overlap = Math.min(hi, s.len) - Math.max(lo, 0);
        if (overlap < 0.7 * t.len) continue;
        const n0 = Math.min(0, lo), n1 = Math.max(s.len, hi);
        const na = { x: s.a.x + ux * n0, y: s.a.y + uy * n0 }, nb = { x: s.a.x + ux * n1, y: s.a.y + uy * n1 };
        out.splice(j, 1); out[i] = { a: na, b: nb, len: dist(na, nb), rms: Math.max(s.rms, t.rms) };
        merged = true; break outer;
      }
    }
    return out;
  }
  function segmentsOf(strokes) { let all = []; for (const s of strokes) all = all.concat(strokeSegments(s)); return mergeOverdrawn(all); }

  // rectangular assignment, n <= m
  function hungarian(C, n, m) {
    const u = new Float64Array(n + 1), v = new Float64Array(m + 1), p = new Int32Array(m + 1), way = new Int32Array(m + 1);
    for (let i = 1; i <= n; i++) {
      p[0] = i; let j0 = 0; const minv = new Float64Array(m + 1).fill(Infinity), used = new Uint8Array(m + 1);
      do {
        used[j0] = 1; const i0 = p[j0]; let delta = Infinity, j1 = 0;
        for (let j = 1; j <= m; j++) if (!used[j]) {
          const cur = C[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
          if (minv[j] < delta) { delta = minv[j]; j1 = j; }
        }
        for (let j = 0; j <= m; j++) { if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta; }
        j0 = j1;
      } while (p[j0] !== 0);
      do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
    }
    const res = new Int32Array(n).fill(-1); for (let j = 1; j <= m; j++) if (p[j]) res[p[j] - 1] = j - 1; return res;
  }
  function nelderMead(f, x0, steps, iters) {
    const n = x0.length; let S = [x0.slice()];
    for (let i = 0; i < n; i++) { const x = x0.slice(); x[i] += steps[i]; S.push(x); }
    let F = S.map(f);
    for (let it = 0; it < iters; it++) {
      const ord = F.map((v, i) => i).sort((a, b) => F[a] - F[b]); S = ord.map(i => S[i]); F = ord.map(i => F[i]);
      if (Math.abs(F[n] - F[0]) < 1e-10 * (Math.abs(F[0]) + 1e-12)) break;
      const c = new Array(n).fill(0); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += S[i][j] / n;
      const xr = c.map((v, j) => v + (v - S[n][j])), fr = f(xr);
      if (fr < F[0]) { const xe = c.map((v, j) => v + 2 * (v - S[n][j])), fe = f(xe); if (fe < fr) { S[n] = xe; F[n] = fe; } else { S[n] = xr; F[n] = fr; } }
      else if (fr < F[n - 1]) { S[n] = xr; F[n] = fr; }
      else {
        const xc = c.map((v, j) => v + 0.5 * (S[n][j] - v)), fc = f(xc);
        if (fc < F[n]) { S[n] = xc; F[n] = fc; }
        else for (let i = 1; i <= n; i++) { S[i] = S[i].map((v, j) => S[0][j] + 0.5 * (v - S[0][j])); F[i] = f(S[i]); }
      }
    }
    let bi = 0; for (let i = 1; i <= n; i++) if (F[i] < F[bi]) bi = i; return { x: S[bi], f: F[bi] };
  }

  /* Cube. Edge = 1. turn: 0 = face-on, 45 = corner-on (right face width cos, left face width sin).
     pitch: + looking down onto the top, - seen from below. k = 1/N, N = eye to nearest corner in cube-lengths.
     The near corner (the Y's junction) is the centre of view and stays put; every other corner slides towards it
     by depth / (N + depth), so the stem stays exactly vertical. Unit screen scale = 1 edge at the near corner. */
  function cubeModel(turn, pitch, k) {
    const th = turn * DEG, ph = pitch * DEG, c = Math.cos(th), s = Math.sin(th), cp = Math.cos(ph), sp = Math.sin(ph);
    const toCam = (x, y, z) => [x, y * cp + z * sp, -y * sp + z * cp];
    const nearH = pitch >= 0 ? 1 : 0;
    // The view is centred on the middle of the cube, and the cube turns about its own upright axis,
    // as on Krenz's sheet. That is what makes the face-on column (turn 0) symmetric and puts the
    // horizon through the middle of the cube in the level row. Corners are scaled towards that
    // centre by 1 / (1 + k * depth), depth counted from the nearest corner.
    const world = (i, j, h) => [(i - 0.5) * c - (j - 0.5) * s, h - 0.5, (i - 0.5) * s + (j - 0.5) * c];
    const cam = []; for (let n = 0; n < 8; n++) cam.push(toCam(...world(n & 1, (n >> 1) & 1, (n >> 2) & 1)));
    let zmin = Infinity; for (const q of cam) zmin = Math.min(zmin, q[2]);
    const proj = q => { const d = 1 + k * (q[2] - zmin); return { x: q[0] / d, y: -q[1] / d, depth: q[2] - zmin }; };
    const V = cam.map(proj);
    const normals = [[c, 0, s], [-s, 0, c], [0, 1, 0]], vis = {};
    for (let ax = 0; ax < 3; ax++) for (let val = 0; val < 2; val++) {
      const sg = val ? 1 : -1, nc = toCam(normals[ax][0] * sg, normals[ax][1] * sg, normals[ax][2] * sg);
      let cx = 0, cy = 0, cz = 0;
      for (let n = 0; n < 8; n++) if (((n >> ax) & 1) === val) { cx += cam[n][0] / 4; cy += cam[n][1] / 4; cz += cam[n][2] / 4; }
      const d = k < 1e-6 ? nc[2] : (nc[0] * cx + nc[1] * cy + nc[2] * (cz - zmin)) * k + nc[2];
      vis[ax * 2 + val] = d < -1e-7;
    }
    const edges = [];
    for (let a = 0; a < 8; a++) for (let f = 0; f < 3; f++) {
      if ((a >> f) & 1) continue;
      const b = a | (1 << f), o = [0, 1, 2].filter(x => x !== f);
      const e = { a, b, fam: f, visible: o.some(ax => vis[ax * 2 + ((a >> ax) & 1)]), i: a & 1, j: (a >> 1) & 1, h: (a >> 2) & 1 };
      e.name = edgeName(e, nearH); e.isY = (f === 2 && !e.i && !e.j) || (f !== 2 && e.h === nearH && !e.i && !e.j);
      edges.push(e);
    }
    return { V, edges, turn, pitch, k, nearH, faceVisible: vis, project: (i, j, h) => proj(toCam(...world(i, j, h))) };
  }
  function edgeName(e, nearH) {
    const near = e.h === nearH, tb = nearH ? ['top', 'bottom', 'floor'] : ['bottom', 'top', 'ceiling'];
    if (e.fam === 2) return !e.i && !e.j ? 'stem' : e.i && !e.j ? 'right side edge' : !e.i && e.j ? 'left side edge' : 'hidden upright';
    if (e.fam === 0) return !e.j ? (near ? 'right arm' : tb[1] + ' right edge') : (near ? tb[0] + ' edge, back left' : 'hidden ' + tb[2] + ' edge, left');
    return !e.i ? (near ? 'left arm' : tb[1] + ' left edge') : (near ? tb[0] + ' edge, back right' : 'hidden ' + tb[2] + ' edge, right');
  }
  function modelY(m) {
    const J = m.V[m.nearH << 2];
    return { stem: sub(m.V[(1 - m.nearH) << 2], J), right: sub(m.V[1 | (m.nearH << 2)], J), left: sub(m.V[2 | (m.nearH << 2)], J) };
  }

  /* People build an edge from several strokes: two or three pieces end to end, or the same edge gone
     over again a few pixels off. The assignment below is one stroke to one edge, so the spare pieces
     were paired with the wrong edges and came out as edges "50% too long". Once a first alignment
     says where the cube sits, every segment that lies along one of its edges is put with that edge,
     and each edge's pieces become one segment spanning them all. A segment that lies along no edge
     (a badly placed line) is left alone and is matched, or not, as before. */
  function joinAlongEdges(al) {
    const groups = new Map(), loose = [], tol = 0.1 * al.sc;
    for (const sg of al.segs) {
      let best = null;
      for (const e of al.E) {
        const A = al.P[e.a], B = al.P[e.b], L = dist(A, B); if (L < 1e-6) continue;
        const ux = (B.x - A.x) / L, uy = (B.y - A.y) / L;
        if (Math.abs(ux * (sg.b.y - sg.a.y) - uy * (sg.b.x - sg.a.x)) / sg.len > Math.sin(15 * DEG)) continue;
        // distance of each end to the edge itself (not its endless line), so a piece is tied to the
        // edge it lies on and not to a parallel one further along
        let d = 0;
        for (const q of [sg.a, sg.b]) { const t = clamp((q.x - A.x) * ux + (q.y - A.y) * uy, -0.2 * L, 1.2 * L); d = Math.max(d, hyp(q.x - A.x - t * ux, q.y - A.y - t * uy)); }
        if (d <= tol && (!best || d < best.d)) best = { d, e };
      }
      if (!best) { loose.push(sg); continue; }
      if (!groups.has(best.e)) groups.set(best.e, []); groups.get(best.e).push(sg);
    }
    const out = loose.slice();
    for (const g of groups.values()) {
      if (g.length === 1) { out.push(g[0]); continue; }
      // One segment for the group: along its longest piece, through the pieces' common centre, from the
      // first end to the last.
      const main = g.reduce((a, b) => b.len > a.len ? b : a), ux = (main.b.x - main.a.x) / main.len, uy = (main.b.y - main.a.y) / main.len;
      let cx = 0, cy = 0, w = 0; for (const sg of g) { cx += (sg.a.x + sg.b.x) / 2 * sg.len; cy += (sg.a.y + sg.b.y) / 2 * sg.len; w += sg.len; } cx /= w; cy /= w;
      let lo = Infinity, hi = -Infinity; for (const sg of g) for (const q of [sg.a, sg.b]) { const t = (q.x - cx) * ux + (q.y - cy) * uy; lo = Math.min(lo, t); hi = Math.max(hi, t); }
      out.push({ a: { x: cx + ux * lo, y: cy + uy * lo }, b: { x: cx + ux * hi, y: cy + uy * hi }, len: hi - lo, rms: Math.max(...g.map(sg => sg.rms || 0)) });
    }
    return out;
  }
  // Align a posed cube to a drawing. opt.join puts the pieces of each edge together first (see
  // joinAlongEdges); the searches over many poses leave it off, the final reading turns it on.
  function alignCube(model, segs, opt) {
    const al = alignOnce(model, segs, opt);
    if (!al || !opt.join) return al;
    const joined = joinAlongEdges(al);
    if (joined.length === segs.length) return al;
    // Kept only when it helps: where two cube edges nearly coincide (flat views), joining can fuse
    // strokes of different edges, which shows as fewer edges matched or a worse fit.
    const al2 = alignOnce(model, joined, opt);
    return al2 && al2.pairs.length >= al.pairs.length && al2.cost <= al.cost ? al2 : al;
  }
  // Align a posed cube to drawn segments: scale + shift (+ limited roll), edges assigned one to one.
  function alignOnce(model, segs, opt) {
    const E = opt.edges || model.edges.filter(e => opt.hidden || e.visible);
    if (!E.length || !segs.length) return null;
    const pts = []; for (const e of E) pts.push(model.V[e.a], model.V[e.b]);
    const mb = bbox(pts), ub = bbox(segs.flatMap(s => [s.a, s.b]));
    const pen = opt.pen || 2 * Math.pow(0.18 * ub.diag, 2), maxRoll = (opt.maxRoll || 0) * DEG;
    let sc = opt.fixed ? opt.fixed.sc : ub.diag / (mb.diag || 1), rot = opt.fixed ? opt.fixed.rot : 0;
    let tx = opt.fixed ? opt.fixed.tx : ub.cx - sc * mb.cx, ty = opt.fixed ? opt.fixed.ty : ub.cy - sc * mb.cy;
    const n = segs.length, m = E.length, tall = n > m;
    let pairs = [], P;
    const tf = v => { const cr = Math.cos(rot), sr = Math.sin(rot); return { x: sc * (cr * v.x - sr * v.y) + tx, y: sc * (sr * v.x + cr * v.y) + ty }; };
    const match = () => {
      P = model.V.map(tf);
      const D = [], F = [];
      for (let i = 0; i < n; i++) {
        D.push(new Float64Array(m)); F.push(new Uint8Array(m));
        for (let j = 0; j < m; j++) {
          const A = P[E[j].a], B = P[E[j].b], s = segs[i];
          const d1 = (s.a.x - A.x) ** 2 + (s.a.y - A.y) ** 2 + (s.b.x - B.x) ** 2 + (s.b.y - B.y) ** 2;
          const d2 = (s.a.x - B.x) ** 2 + (s.a.y - B.y) ** 2 + (s.b.x - A.x) ** 2 + (s.b.y - A.y) ** 2;
          if (d2 < d1) { D[i][j] = d2; F[i][j] = 1; } else D[i][j] = d1;
        }
      }
      let asg;
      if (!tall) asg = hungarian(D, n, m);
      else { const T = []; for (let j = 0; j < m; j++) { T.push(new Float64Array(n)); for (let i = 0; i < n; i++) T[j][i] = D[i][j]; }
        const r = hungarian(T, m, n); asg = new Int32Array(n).fill(-1); for (let j = 0; j < m; j++) if (r[j] >= 0) asg[r[j]] = j; }
      pairs = [];
      for (let i = 0; i < n; i++) { const j = asg[i]; if (j >= 0 && D[i][j] < 2 * pen) pairs.push({ si: i, ei: j, flip: F[i][j], c: D[i][j] }); }
    };
    const iters = opt.fixed ? 0 : (opt.iters || 4);
    for (let it = 0; it < iters; it++) {
      match(); if (pairs.length < 2) break;
      const M = [], U = [];
      for (const pr of pairs) {
        const e = E[pr.ei], s = segs[pr.si];
        M.push(model.V[e.a], model.V[e.b]); if (pr.flip) U.push(s.b, s.a); else U.push(s.a, s.b);
      }
      let mcx = 0, mcy = 0, ucx = 0, ucy = 0; const N = M.length;
      for (let q = 0; q < N; q++) { mcx += M[q].x; mcy += M[q].y; ucx += U[q].x; ucy += U[q].y; }
      mcx /= N; mcy /= N; ucx /= N; ucy /= N;
      let a = 0, b = 0, mm = 0;
      for (let q = 0; q < N; q++) {
        const mx = M[q].x - mcx, my = M[q].y - mcy, ux = U[q].x - ucx, uy = U[q].y - ucy;
        a += mx * ux + my * uy; b += mx * uy - my * ux; mm += mx * mx + my * my;
      }
      rot = clamp(Math.atan2(b, a), -maxRoll, maxRoll);
      sc = Math.max(1e-6, (a * Math.cos(rot) + b * Math.sin(rot)) / (mm || 1));
      const cr = Math.cos(rot), sr = Math.sin(rot);
      tx = ucx - sc * (cr * mcx - sr * mcy); ty = ucy - sc * (sr * mcx + cr * mcy);
    }
    match();
    let sum = 0; for (const pr of pairs) sum += pr.c;
    // drawn uprights are usually meant upright: a leaning reading has to earn it
    const cost = (sum + pen * ((n - pairs.length) + (m - pairs.length))) / (ub.diag * ub.diag) * (1 + 0.5 * Math.pow(rot / (15 * DEG), 2));
    return { cost, sc, rot, tx, ty, pairs, E, P, model, segs, sum, unSegs: n - pairs.length, unEdges: m - pairs.length };
  }
  // Best cube for a free drawing. Returns the best reading plus, when hidden edges are drawn, the flipped (Necker) reading.
  function fitCubeMode(segs, hidden, maxRoll, sign) {
    const ev = (t, p, k, it) => alignCube(cubeModel(t, p, k), segs, { hidden, maxRoll, iters: it });
    const cand = [];
    for (let t = 5; t < 90; t += 10) for (const pa of [8, 20, 33, 47, 62, 78]) for (const sg of [1, -1]) {
      if (sign && sg !== sign) continue;
      for (const k of [0.06, 0.3]) { const r = ev(t, pa * sg, k, 3); if (r) cand.push({ t, p: pa * sg, k, cost: r.cost }); }
    }
    cand.sort((a, b) => a.cost - b.cost);
    let best = null;
    for (const c0 of cand.slice(0, 5)) {
      const sg = Math.sign(c0.p) || 1;
      const lim = x => [clamp(x[0], 0, 90), sg * clamp(sg * x[1], 0.5, 89.5), clamp(x[2], 0, 0.8)];
      const f = x => { const y = lim(x), r = ev(y[0], y[1], y[2], 4), out = (x[0] - y[0]) ** 2 + (x[1] - y[1]) ** 2 + 400 * (x[2] - y[2]) ** 2;
        return (r ? r.cost : 9) * (1 + 0.01 * out) + 1e-6 * out; };
      const r = nelderMead(f, [c0.t, c0.p, c0.k], [6, 6, 0.08], 80), y = lim(r.x), al = ev(y[0], y[1], y[2], 5);
      if (al && (!best || al.cost < best.cost)) best = al;
    }
    if (best) best.hidden = hidden;
    return best;
  }
  function fitCube(segs, opt) {
    opt = opt || {}; const maxRoll = opt.maxRoll == null ? 20 : opt.maxRoll;
    if (segs.length < 4) return null;
    const vis = fitCubeMode(segs, false, maxRoll, 0);
    // The reading is chosen on the strokes as drawn; only then are the pieces of each edge joined
    // (joinAlongEdges), so joining cannot tip the choice between two poses.
    const join = a => a && Object.assign(alignCube(a.model, segs, { hidden: a.hidden, maxRoll, iters: 5, join: true }), { hidden: a.hidden });
    if (segs.length <= 9) return { best: join(vis), alt: null };
    const up = fitCubeMode(segs, true, maxRoll, 1), dn = fitCubeMode(segs, true, maxRoll, -1);
    const hid = up.cost <= dn.cost * 1.05 + 1e-6 ? up : dn, other = hid === up ? dn : up;
    if (vis.cost <= hid.cost) return { best: join(vis), alt: null };
    return { best: join(hid), alt: other.cost < hid.cost * 1.6 + 2e-3 ? other : null };
  }
  // per-edge report of an alignment
  function edgeReport(al) {
    return al.pairs.map(pr => {
      const e = al.E[pr.ei], s = al.segs[pr.si], A = al.P[e.a], B = al.P[e.b];
      const ua = pr.flip ? s.b : s.a, ub = pr.flip ? s.a : s.b;
      const mt = Math.atan2(B.y - A.y, B.x - A.x) / DEG, ut = Math.atan2(ub.y - ua.y, ub.x - ua.x) / DEG;
      return { edge: e, name: e.name, ua, ub, A, B, dAng: angDiff(ut, mt), dLen: dist(ua, ub) / dist(A, B) - 1, miss: Math.sqrt(pr.c / 2) / al.sc };
    });
  }
  function lineX(p1, d1, p2, d2) { // intersection params along both lines
    const den = d1.x * d2.y - d1.y * d2.x; if (Math.abs(den) < 1e-9) return null;
    const w = sub(p2, p1); return { t1: (w.x * d2.y - w.y * d2.x) / den, t2: (w.x * d1.y - w.y * d1.x) / den };
  }
  // Recipe step 5: every family of edges runs together or closes going back, never spreads.
  function familyChecks(lines, model) { // lines: [{edge, ua, ub}] oriented like the model edge a->b
    const names = ['Edges going right', 'Edges going left', 'Uprights'], out = [];
    for (let f = 0; f < 3; f++) {
      const L = lines.filter(l => l.edge.fam === f); if (L.length < 2) continue;
      const or = L.map(l => {
        const da = model.V[l.edge.a].depth, db = model.V[l.edge.b].depth, near = da <= db ? l.ua : l.ub, far = da <= db ? l.ub : l.ua;
        const len = dist(near, far) || 1; return { near, d: { x: (far.x - near.x) / len, y: (far.y - near.y) / len }, len, rec: Math.abs(da - db), l };
      });
      const flat = Math.max(...or.map(o => o.rec)) < 0.15;
      let spread = 0, cross = 0, maxAng = 0, worst = null;
      for (let a = 0; a < or.length; a++) for (let b = a + 1; b < or.length; b++) {
        const A = or[a], B = or[b], ang = Math.asin(clamp(Math.abs(A.d.x * B.d.y - A.d.y * B.d.x), 0, 1)) / DEG;
        if (ang > maxAng) { maxAng = ang; worst = [A.l.edge.name, B.l.edge.name]; }
        if (flat || ang < 2.5) continue;
        const x = lineX(A.near, A.d, B.near, B.d); if (!x) continue;
        if (x.t1 < 0 && x.t2 < 0) spread++; else if ((x.t1 > 0 && x.t1 < A.len) || (x.t2 > 0 && x.t2 < B.len)) cross++;
      }
      let state = 'good', text;
      if (flat) { text = maxAng < 3 ? 'parallel, as they should be here' : 'should be parallel here; ' + worst.join(' and ') + ' differ by ' + maxAng.toFixed(0) + '°'; if (maxAng >= 3) state = maxAng > 6 ? 'bad' : 'warn'; }
      else if (spread) { state = 'bad'; text = 'spread apart going back (' + worst.join(' / ') + ')'; }
      else if (cross) { state = 'warn'; text = 'close too fast: two of them would cross inside the cube'; }
      else text = maxAng < 2.5 ? 'run parallel' : 'close gently going back';
      out.push({ k: names[f], v: text, s: state });
    }
    return out;
  }
  function tableNames(turn, pitch) {
    const snap = (v, list) => list.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a);
    const t = snap(turn, [0, 22.5, 45, 67.5, 90]) % 90, p = snap(Math.abs(pitch), [0, 22.5, 45, 67.5]);
    let recipe = '';
    const ap = Math.abs(pitch);
    if (ap >= 8 && ap <= 50) recipe = (ap < 25 ? 'low' : 'high') + ', ' + (Math.abs(turn - 45) < 11.25 ? 'corner-on' : 'turned');
    return { turn: t, pitch: p, recipe };
  }
  function distanceWords(k) {
    if (k < 0.05) return { n: Infinity, text: 'far away (over 20 cube-lengths): edges parallel' };
    const N = 1 / k, steps = [1.5, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20], n = steps.reduce((a, b) => Math.abs(b - N) < Math.abs(a - N) ? b : a);
    return { n, text: (N < 3 ? 'close' : N < 8 ? 'average distance' : 'fairly far') + ', about ' + n + ' cube-lengths away' };
  }
  // The pose whose Y is closest to a drawn Y (angles in clock degrees, arm lengths as a share of the stem)
  function fitY(meas, k, sign) {
    const err = (t, p) => {
      const y = modelY(cubeModel(t, p, k)), st = hyp(y.stem.x, y.stem.y);
      return (angDiff(clockDeg(y.left), meas.leftDeg) / 6) ** 2 + (angDiff(clockDeg(y.right), meas.rightDeg) / 6) ** 2
        + ((hyp(y.left.x, y.left.y) / st - meas.leftLen) / 0.1) ** 2 + ((hyp(y.right.x, y.right.y) / st - meas.rightLen) / 0.1) ** 2;
    };
    let best = null;
    for (const t0 of [15, 45, 75]) for (const p0 of [15, 40, 65]) {
      const lim = x => [clamp(x[0], 0, 90), sign * clamp(sign * x[1], 1, 89)];
      const r = nelderMead(x => { const y = lim(x); return err(y[0], y[1]) + (x[0] - y[0]) ** 2 + (x[1] - y[1]) ** 2; }, [t0, sign * p0], [8, 8], 80);
      if (!best || r.f < best.f) best = { f: r.f, turn: lim(r.x)[0], pitch: lim(r.x)[1] };
    }
    return best;
  }

  /* Ellipse */
  function ellipseDist(e, q) { // signed radial miss, + outside
    const c = Math.cos(e.ang), s = Math.sin(e.ang), dx = q.x - e.cx, dy = q.y - e.cy, x = dx * c + dy * s, y = -dx * s + dy * c;
    const r = hyp(x, y), rho = hyp(x / e.a, y / e.b); return rho < 1e-9 ? -Math.min(e.a, e.b) : r * (1 - 1 / rho);
  }
  function fitEllipse(strokes) {
    let pts = [], total = 0; for (const s of strokes) total += pathLen(s);
    if (total < 30) return null;
    for (const s of strokes) { const L = pathLen(s); if (L > 4) pts = pts.concat(resample(s, Math.max(6, Math.round(140 * L / total)))); }
    const n = pts.length; if (n < 12) return null;
    let mx = 0, my = 0; for (const q of pts) { mx += q.x; my += q.y; } mx /= n; my /= n;
    let sxx = 0, sxy = 0, syy = 0; for (const q of pts) { const dx = q.x - mx, dy = q.y - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
    sxx /= n; sxy /= n; syy /= n;
    const th = 0.5 * Math.atan2(2 * sxy, sxx - syy), tr = sxx + syy, df = Math.sqrt(Math.max(0, (sxx - syy) ** 2 + 4 * sxy * sxy));
    const a0 = Math.sqrt(Math.max(1, tr + df)), b0 = Math.sqrt(Math.max(1, tr - df));
    const mk = x => ({ cx: x[0], cy: x[1], a: Math.max(2, Math.abs(x[2])), b: Math.max(2, Math.abs(x[3])), ang: x[4] });
    const r = nelderMead(x => { const e = mk(x); let s = 0; for (const q of pts) { const d = ellipseDist(e, q); s += d * d; } return s / n; },
      [mx, my, a0, b0, th], [a0 * 0.1, a0 * 0.1, a0 * 0.1, b0 * 0.1 + 1, 0.15], 500);
    const e = mk(r.x); if (e.b > e.a) { const t = e.a; e.a = e.b; e.b = t; e.ang += Math.PI / 2; }
    e.ang = Math.atan(Math.tan(e.ang)); // (-90, 90]
    const c = Math.cos(e.ang), s = Math.sin(e.ang);
    let ss = 0, c4 = 0, c3 = 0, s3 = 0, sweep = 0, prev = null; const perStroke = [];
    for (const st of strokes) { // sweep per stroke, in drawing order
      const L = pathLen(st); if (L <= 4) continue; let sw = 0, pv = null;
      for (const q of resample(st, Math.max(6, Math.round(140 * L / total)))) {
        const dx = q.x - e.cx, dy = q.y - e.cy, t = Math.atan2((-dx * s + dy * c) / e.b, (dx * c + dy * s) / e.a);
        if (pv != null) { let d = t - pv; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; sw += d; } pv = t;
      }
      perStroke.push(Math.abs(sw) / DEG);
    }
    for (const q of pts) {
      const dx = q.x - e.cx, dy = q.y - e.cy, t = Math.atan2((-dx * s + dy * c) / e.b, (dx * c + dy * s) / e.a), d = ellipseDist(e, q);
      ss += d * d; c4 += d * Math.cos(4 * t); c3 += d * Math.cos(3 * t); s3 += d * Math.sin(3 * t);
    }
    sweep = perStroke.reduce((a, b) => a + b, 0);
    e.rms = Math.sqrt(ss / n) / e.a; e.c4 = 2 * c4 / n / e.a; e.c3 = 2 * c3 / n / e.a; e.s3 = 2 * s3 / n / e.a;
    e.sweep = sweep; e.degree = Math.asin(clamp(e.b / e.a, 0, 1)) / DEG; e.pts = pts;
    return e;
  }
  // exact ellipse for the circle inscribed in a face of a posed cube (top face: h fixed)
  function faceEllipse(model, h, tf) {
    const ring = []; for (let i = 0; i < 72; i++) { const t = i / 72 * 2 * Math.PI; ring.push(tf(model.project(0.5 + 0.5 * Math.cos(t), 0.5 + 0.5 * Math.sin(t), h))); }
    ring.push(ring[0]); return fitEllipse([ring]);
  }
  function nearestFraction(v, maxDen) {
    let best = null; for (let d = 2; d <= (maxDen || 8); d++) for (let n = 1; n < d; n++) {
      const g = (a, b) => b ? g(b, a % b) : a; if (g(n, d) !== 1) continue;
      const e = Math.abs(n / d - v); if (!best || e < best.e - 1e-9) best = { n, d, e, v: n / d };
    } return best;
  }
  const score = E => Math.round(100 / (1 + E * E));

  return { DEG, clamp, sub, dist, angDiff, clockDeg, clockText, pathLen, resample, bbox, fitLine, strokeLine, strokeSegments, mergeOverdrawn,
    segmentsOf, hungarian, nelderMead, cubeModel, modelY, alignCube, fitCube, edgeReport, familyChecks, lineX, tableNames, distanceWords, fitY,
    ellipseDist, fitEllipse, faceEllipse, nearestFraction, score };
})();
