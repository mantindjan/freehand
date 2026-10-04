/* Drill definitions: what to show, and how to mark what was drawn. */
import { FH } from './engine.js';
import { D } from './canvas.js';

export const DRILLS = (function () {
  const { DEG, dist, sub, angDiff, clockDeg, clockText, score } = FH;
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const rand = (a, b) => a + Math.random() * (b - a);
  const pct = (v, d) => (v * 100).toFixed(d == null ? 0 : d) + '%';
  const st = (v, good, warn) => Math.abs(v) <= good ? 'good' : Math.abs(v) <= warn ? 'warn' : 'bad';
  const sgn = v => (v >= 0 ? '+' : '−') + Math.abs(v);
  const longest = strokes => { let b = null; for (const s of strokes) { const l = FH.strokeLine(s); if (l && (!b || l.len > b.len)) b = l; } return b; };
  const need = msg => ({ score: null, title: msg, rows: [], notes: [] });
  const fracLabel = f => ({ '0.5': 'half', '0.333': 'one third', '0.667': 'two thirds', '0.75': 'three quarters' }[f] || f + ' times');

  /* ---------- Proportion ---------- */
  const divide = {
    id: 'divide', name: 'Divide a line', how: 'Marked on how far each mark sits from the true position, as a share of the line.',
    opts: [{ key: 'parts', label: 'Parts', def: 'r', choices: [['r', 'Random'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5'], ['6', '6'], ['7', '7']] },
      { key: 'tilt', label: 'Line', def: 'level', choices: [['level', 'Level'], ['any', 'Any angle']] }],
    spec(o) { return { n: o.parts === 'r' ? pick([2, 3, 3, 4, 5, 5, 6, 7, 7]) : +o.parts, ang: o.tilt === 'level' ? 0 : pick([0, 90, 25, -25, 50, -50, 70, -70]), len: rand(0.72, 0.95) }; },
    lay(s, A) {
      const c = Math.cos(s.ang * DEG), sn = Math.sin(s.ang * DEG);
      const half = 0.5 * s.len * Math.min(A.w / Math.max(Math.abs(c), 0.01), A.h / Math.max(Math.abs(sn), 0.01)) * 0.98;
      return { a: { x: A.cx - c * half, y: A.cy - sn * half }, b: { x: A.cx + c * half, y: A.cy + sn * half } };
    },
    task(s) { return s.n === 2 ? 'Mark the middle of the line: one mark.' : `Divide the line into ${s.n} equal parts: ${s.n - 1} marks.`; },
    draw(g, G, C) { D.line(g, G.a, G.b, C.blue, 2); D.cap(g, G.a, G.b, 9, C.blue); D.cap(g, G.b, G.a, 9, C.blue); },
    grade(strokes, s, G) {
      const L = dist(G.a, G.b), ux = (G.b.x - G.a.x) / L, uy = (G.b.y - G.a.y) / L, marks = [];
      for (const sk of strokes) {
        let best = null;
        for (const q of sk) { const dx = q.x - G.a.x, dy = q.y - G.a.y, d = Math.abs(-dx * uy + dy * ux); if (!best || d < best.d) best = { d, t: (dx * ux + dy * uy) / L }; }
        if (best && best.d < 0.12 * L && best.t > 0.02 && best.t < 0.98) marks.push(best.t);
      }
      marks.sort((a, b) => a - b);
      const overlay = (g, C) => { for (let k = 1; k < s.n; k++) { const p = { x: G.a.x + ux * L * k / s.n, y: G.a.y + uy * L * k / s.n }; D.line(g, { x: p.x - uy * 3, y: p.y + ux * 3 }, { x: p.x - uy * 26, y: p.y + ux * 26 }, C.red, 2); } };
      if (!marks.length) return need('No marks found on the line');
      if (marks.length !== s.n - 1) return { score: null, title: `Found ${marks.length} mark${marks.length > 1 ? 's' : ''}, expected ${s.n - 1}`, sub: 'The true marks are shown in red.', rows: [], notes: [], overlay };
      const dir = Math.abs(ux) >= Math.abs(uy) ? (ux > 0 ? ['right', 'left'] : ['left', 'right']) : (uy > 0 ? ['low', 'high'] : ['high', 'low']);
      const errs = marks.map((t, i) => t - (i + 1) / s.n), rms = Math.sqrt(errs.reduce((a, e) => a + e * e, 0) / errs.length);
      const cuts = [0, ...marks, 1], parts = []; for (let i = 1; i < cuts.length; i++) parts.push((cuts[i] - cuts[i - 1]) * 100);
      const rows = errs.map((e, i) => ({ k: s.n === 2 ? 'Middle' : `Mark ${i + 1}`, v: Math.abs(e) < 0.004 ? 'on the spot' : `${pct(Math.abs(e), 1)} too far ${e > 0 ? dir[0] : dir[1]}`, s: st(e, 0.015, 0.03) }));
      rows.push({ k: 'Parts', v: parts.map(p => p.toFixed(0)).join(' · ') + ` (true ${(100 / s.n).toFixed(1)} each)` });
      return { score: score(rms / 0.02), title: `Average miss ${pct(errs.reduce((a, e) => a + Math.abs(e), 0) / errs.length, 1)} of the line`,
        sub: `Largest part is ${(Math.max(...parts) / Math.min(...parts)).toFixed(2)} times the smallest.`, rows, notes: [], overlay };
    }
  };

  const ratio = {
    id: 'ratio', name: 'Scale a length', how: 'Marked on the length of your line against the blue one.',
    opts: [{ key: 'frac', label: 'Length', def: 'r', choices: [['r', 'Random'], ['0.5', '1/2'], ['0.333', '1/3'], ['0.667', '2/3'], ['0.75', '3/4'], ['0.4', '0.4'], ['0.7', '0.7'], ['0.9', '0.9'], ['1', 'Same']] }],
    spec(o) { return { f: o.frac === 'r' ? pick(['0.5', '0.333', '0.667', '0.75', '0.4', '0.7', '0.9', '1']) : o.frac, ang: pick([0, 90, 30, -30, 60, -60]), len: rand(0.75, 1) }; },
    lay(s, A) {
      const L = Math.min(0.42 * A.w, 0.8 * A.h) * s.len, c = Math.cos(s.ang * DEG), sn = Math.sin(s.ang * DEG), cx = A.x0 + 0.26 * A.w;
      return { a: { x: cx - c * L / 2, y: A.cy - sn * L / 2 }, b: { x: cx + c * L / 2, y: A.cy + sn * L / 2 }, L };
    },
    task(s) { return s.f === '1' ? 'Draw a line the same length as the blue one, in a different direction.' : `Draw a line ${fracLabel(s.f)} as long as the blue one. Any direction.`; },
    draw(g, G, C) { D.line(g, G.a, G.b, C.blue, 2); D.cap(g, G.a, G.b, 9, C.blue); D.cap(g, G.b, G.a, 9, C.blue); },
    grade(strokes, s, G) {
      const l = longest(strokes); if (!l || l.len < 10) return need('No line found');
      const f = +s.f, r = l.len / G.L, e = r / f - 1, ux = (l.b.x - l.a.x) / l.len, uy = (l.b.y - l.a.y) / l.len;
      const end = { x: l.a.x + ux * G.L * f, y: l.a.y + uy * G.L * f };
      return { score: score(e / 0.07), title: Math.abs(e) < 0.01 ? 'Right length' : `${pct(Math.abs(e), 0)} too ${e > 0 ? 'long' : 'short'}`,
        sub: 'The red tick is where the line should end, measured from where you started.',
        rows: [{ k: 'You drew', v: r.toFixed(2) + ' of the blue line', s: st(e, 0.03, 0.08) }, { k: 'Asked', v: f.toFixed(2) }], notes: [],
        overlay: (g, C) => { D.line(g, { x: l.a.x - uy * 10, y: l.a.y + ux * 10 }, { x: end.x - uy * 10, y: end.y + ux * 10 }, C.red, 2); D.line(g, { x: end.x - uy * 22, y: end.y + ux * 22 }, { x: end.x + uy * 22, y: end.y - ux * 22 }, C.red, 2); } };
    }
  };

  const clock = {
    id: 'clock', name: 'Clock direction', how: 'Marked on the angle of your line against the true clock direction. One minute on the clock is half a degree.',
    opts: [{ key: 'set', label: 'Directions', def: 'arms', choices: [['arms', 'Arm directions'], ['any', 'Whole clock']] }],
    spec(o, prev) {
      const pool = o.set === 'arms' ? [9, 9.5, 10, 10.5, 11, 1, 1.5, 2, 2.5, 3] : Array.from({ length: 24 }, (_, i) => (i + 1) / 2);
      let h; do { h = pick(pool); } while (prev && prev.h === h); return { h };
    },
    lay(s, A) { return { c: { x: A.cx, y: A.cy }, R: 0.4 * A.U }; },
    task(s) { return `From the dot, draw a line towards ${clockText(s.h * 30)}.`; },
    draw(g, G, C) { D.dot(g, G.c, 4.5, C.blue); },
    grade(strokes, s, G) {
      const l = longest(strokes); if (!l || l.len < 15) return need('No line found');
      const from = dist(l.a, G.c) <= dist(l.b, G.c) ? l.a : l.b, to = from === l.a ? l.b : l.a;
      const deg = clockDeg(sub(to, from)), d = angDiff(deg, s.h * 30), T = s.h * 30 * DEG;
      return { score: score(d / 5), title: Math.abs(d) < 1 ? 'On target' : `${Math.abs(d).toFixed(0)}° ${d > 0 ? 'clockwise' : 'anticlockwise'} of target`,
        sub: `You drew ${clockText(deg)}. The red line is ${clockText(s.h * 30)}.`,
        rows: [{ k: 'You drew', v: clockText(deg), s: st(d, 2.5, 6) }, { k: 'Asked', v: clockText(s.h * 30) }], notes: [],
        overlay: (g, C) => { const R = Math.max(l.len, 60);
          for (let i = 0; i < 12; i++) { const a = i * 30 * DEG, p = { x: G.c.x + Math.sin(a) * G.R, y: G.c.y - Math.cos(a) * G.R }, q = { x: G.c.x + Math.sin(a) * (G.R - (i % 3 ? 8 : 16)), y: G.c.y - Math.cos(a) * (G.R - (i % 3 ? 8 : 16)) }; D.line(g, p, q, C.muted, 1.5); }
          D.line(g, G.c, { x: G.c.x + Math.sin(T) * R, y: G.c.y - Math.cos(T) * R }, C.red, 2); } };
    }
  };

  const measure = {
    id: 'measure', name: 'Free measure', free: true, how: 'Draw lines and tick them anywhere. You get their lengths against the longest, their directions, and what the ticks divide them into.',
    opts: [], spec() { return {}; }, lay() { return {}; }, task() { return 'Draw any lines, and tick them if you like. Check tells you what you made.'; }, draw() {},
    grade(strokes) {
      const all = strokes.map(s => ({ s, l: FH.strokeLine(s) })).filter(x => x.l), maxL = Math.max(0, ...all.map(x => x.l.len));
      if (maxL < 30) return need('No lines found');
      const lines = all.filter(x => x.l.len >= 0.25 * maxL).map(x => x.l).slice(0, 6), ticks = strokes.filter(s => { const l = FH.strokeLine(s); return !l || l.len < 0.25 * maxL; });
      lines.sort((a, b) => b.len - a.len);
      const rows = [], marks = [], names = 'ABCDEF';
      lines.forEach((l, i) => {
        const ux = (l.b.x - l.a.x) / l.len, uy = (l.b.y - l.a.y) / l.len;
        let tilt = Math.abs(Math.atan2(uy, ux) / DEG); if (tilt > 90) tilt = 180 - tilt;
        const cd = clockDeg({ x: ux, y: uy }), up = cd > 90 && cd < 270 ? (cd + 180) % 360 : cd;
        let v = i === 0 ? 'longest, taken as 1' : (() => { const r = l.len / lines[0].len, f = FH.nearestFraction(r, 8); return `${r.toFixed(2)} of A` + (f.e < 0.03 ? `, close to ${f.n}/${f.d}` : ''); })();
        v += `; ${tilt.toFixed(0)}° from level, towards ${clockText(up)}`;
        rows.push({ k: 'Line ' + names[i], v });
        const ts = [];
        for (const sk of ticks) { let b = null; for (const q of sk) { const dx = q.x - l.a.x, dy = q.y - l.a.y, d = Math.abs(-dx * uy + dy * ux); if (!b || d < b.d) b = { d, t: (dx * ux + dy * uy) / l.len }; }
          if (b && b.d < 0.08 * l.len && b.t > 0.02 && b.t < 0.98) ts.push(b.t); }
        if (ts.length) {
          ts.sort((a, b) => a - b); const n = ts.length + 1;
          if (ts.length === 1) { const f = FH.nearestFraction(ts[0], 8); rows.push({ k: 'Mark on ' + names[i], v: `at ${pct(ts[0])}; nearest simple split is ${f.n}/${f.d} (${pct(f.v, 1)})`, s: st(f.e, 0.012, 0.03) }); marks.push({ l, ux, uy, at: [f.v] }); }
          else { const errs = ts.map((t, k) => t - (k + 1) / n), worst = Math.max(...errs.map(Math.abs));
            rows.push({ k: 'Marks on ' + names[i], v: `${ts.map(t => (t * 100).toFixed(0)).join(', ')}%; as ${n} equal parts the worst mark is ${pct(worst, 1)} off`, s: st(worst, 0.012, 0.03) }); marks.push({ l, ux, uy, at: ts.map((t, k) => (k + 1) / n) }); }
        }
      });
      if (lines.length >= 2) { const a = lines[0], b = lines[1]; let an = Math.abs(angDiff(Math.atan2(a.b.y - a.a.y, a.b.x - a.a.x) / DEG, Math.atan2(b.b.y - b.a.y, b.b.x - b.a.x) / DEG)); if (an > 90) an = 180 - an; rows.push({ k: 'Angle A to B', v: an.toFixed(0) + '°' }); }
      return { score: null, title: `${lines.length} line${lines.length > 1 ? 's' : ''} measured`, sub: marks.length ? 'Red ticks show the exact split nearest to your marks.' : '', rows, notes: [],
        overlay: (g, C) => { lines.forEach((l, i) => D.label(g, names[i], (l.a.x + l.b.x) / 2 - ((l.b.y - l.a.y) / l.len) * 16, (l.a.y + l.b.y) / 2 + ((l.b.x - l.a.x) / l.len) * 16, C.red));
          for (const m of marks) for (const t of m.at) { const p = { x: m.l.a.x + m.ux * m.l.len * t, y: m.l.a.y + m.uy * m.l.len * t }; D.line(g, { x: p.x - m.uy * 3, y: p.y + m.ux * 3 }, { x: p.x - m.uy * 22, y: p.y + m.ux * 22 }, C.red, 2); } } };
    }
  };

  /* ---------- Ellipse ---------- */
  const sideWord = v => Math.abs(v.x) >= Math.abs(v.y) ? (v.x > 0 ? 'right' : 'left') : (v.y > 0 ? 'bottom' : 'top');
  function shapeRows(e) {
    const rows = [], ca = Math.cos(e.ang), sa = Math.sin(e.ang);
    rows.push({ k: 'Evenness', v: e.rms < 0.006 ? 'very even' : `wobbles ${pct(e.rms, 1)} of the half-width off a true ellipse`, s: st(e.rms, 0.015, 0.035) });
    let shape = 'even all round', s = 'good';
    if (e.b / e.a < 0.93) {
      const m = Math.max(Math.abs(e.c4), Math.abs(e.c3), Math.abs(e.s3));
      if (m > 0.012) { s = m > 0.025 ? 'bad' : 'warn';
        if (m === Math.abs(e.c4)) shape = e.c4 > 0 ? 'pointed ends, like a lemon: round the ends more' : 'boxy: the long sides run flat and the ends turn too tightly';
        else if (m === Math.abs(e.c3)) shape = `egg-shaped: fatter towards the ${sideWord({ x: -ca * Math.sign(e.c3), y: -sa * Math.sign(e.c3) })} end`;
        else shape = `lopsided: flatter on the ${sideWord({ x: -sa * Math.sign(e.s3), y: ca * Math.sign(e.s3) })} side`; }
    }
    rows.push({ k: 'Shape', v: shape, s });
    rows.push({ k: 'Closing', v: e.sweep < 345 ? `left open by about ${(360 - e.sweep).toFixed(0)}°` : e.sweep > 395 ? `overlaps by about ${(e.sweep - 360).toFixed(0)}°` : 'closed cleanly', s: e.sweep < 330 || e.sweep > 430 ? 'warn' : 'good' });
    return rows;
  }
  const drawFit = (g, e, color, axes) => { D.ellipse(g, e, color, 2); if (axes) { const c = Math.cos(e.ang), s = Math.sin(e.ang); D.line(g, { x: e.cx - c * e.a, y: e.cy - s * e.a }, { x: e.cx + c * e.a, y: e.cy + s * e.a }, color, 1, [5, 5]); D.line(g, { x: e.cx + s * e.b, y: e.cy - c * e.b }, { x: e.cx - s * e.b, y: e.cy + c * e.b }, color, 1, [5, 5]); } };
  const minorLean = e => { let a = e.ang / DEG; return a; }; // long axis from level = short axis from vertical

  const ellFree = {
    id: 'ellfree', name: 'Free ellipse', free: true, how: 'Draw any ellipse. You get its degree, its tilt, how even it is, and what kind of unevenness it has.',
    opts: [], spec() { return {}; }, lay() { return {}; }, task() { return 'Draw any ellipse in one or two strokes.'; }, draw() {},
    grade(strokes) {
      const e = FH.fitEllipse(strokes); if (!e || e.a < 15) return need('No ellipse found');
      const tn = FH.tableNames(45, e.degree), tilt = e.ang / DEG;
      const rows = [{ k: 'Degree', v: `${e.degree.toFixed(0)}°: short axis is ${(e.b / e.a).toFixed(2)} of the long one` },
        { k: 'Tilt', v: e.b / e.a > 0.93 ? 'nearly a circle, no tilt to speak of' : Math.abs(tilt) < 1.5 ? 'long axis level' : `long axis ${Math.abs(tilt).toFixed(0)}° from level, ${tilt > 0 ? 'right end down' : 'right end up'}` }].concat(shapeRows(e));
      return { score: score(e.rms / 0.025), title: `A ${e.degree.toFixed(0)}° ellipse`,
        sub: `A circle seen from ${e.degree.toFixed(0)}° above its plane. Nearest row of the cube table: camera ${tn.pitch}°.`, rows, notes: [], overlay: (g, C) => drawFit(g, e, C.red, true) };
    }
  };

  const ellBox = {
    id: 'ellbox', name: 'In a box', how: 'Marked on centre, width, height, tilt and evenness against the ellipse that touches all four sides.',
    opts: [{ key: 'tilt', label: 'Box', def: 'level', choices: [['level', 'Level'], ['tilted', 'Tilted']] }],
    spec(o) { return { r: pick([0.25, 0.4, 0.55, 0.7, 1]), ang: o.tilt === 'level' ? 0 : pick([-35, -20, -10, 10, 20, 35]), w: rand(0.55, 0.8), tall: Math.random() < 0.2 }; },
    lay(s, A) { const t = (s.ang + (s.tall ? 90 : 0)) * DEG, c = Math.abs(Math.cos(t)), sn = Math.abs(Math.sin(t));
      const a = Math.min(0.5 * s.w * A.w, 0.46 * A.h / (sn + s.r * c), 0.46 * A.w / (c + s.r * sn));
      return { cx: A.cx, cy: A.cy, a, b: a * s.r, ang: t }; },
    task() { return 'Draw the ellipse that touches all four sides of the box.'; },
    draw(g, G, C) { D.poly(g, D.boxCorners(G), C.blue, 2); },
    grade(strokes, s, G) {
      const e = FH.fitEllipse(strokes); if (!e || e.a < 15) return need('No ellipse found');
      const T = { cx: G.cx, cy: G.cy, a: G.a, b: G.b, ang: Math.atan(Math.tan(G.ang)) }, d = e.ang - G.ang;
      const ew = Math.hypot(e.a * Math.cos(d), e.b * Math.sin(d)), eh = Math.hypot(e.a * Math.sin(d), e.b * Math.cos(d));
      const c = Math.hypot(e.cx - T.cx, e.cy - T.cy) / T.a, dw = ew / T.a - 1, dh = eh / T.b - 1;
      let tilt = angDiff(e.ang / DEG, T.ang / DEG); if (tilt > 90) tilt -= 180; if (tilt < -90) tilt += 180;
      const round = s.r > 0.93, terms = [(c / 0.04) ** 2, (dw / 0.05) ** 2, (dh / 0.06) ** 2, (e.rms / 0.03) ** 2]; if (!round) terms.push((tilt / 5) ** 2);
      const rows = [{ k: 'Centre', v: c < 0.015 ? 'centred' : `${pct(c)} of the half-length off centre`, s: st(c, 0.03, 0.07) },
        { k: 'Length', v: Math.abs(dw) < 0.015 ? 'right' : `${pct(Math.abs(dw))} too ${dw > 0 ? 'long' : 'short'}`, s: st(dw, 0.03, 0.07) },
        { k: 'Thickness', v: Math.abs(dh) < 0.02 ? 'right' : `${pct(Math.abs(dh))} too ${dh > 0 ? 'fat' : 'thin'}`, s: st(dh, 0.04, 0.09) }];
      if (!round) rows.push({ k: 'Tilt', v: Math.abs(tilt) < 1.5 ? 'lined up with the box' : `${Math.abs(tilt).toFixed(0)}° ${tilt > 0 ? 'clockwise' : 'anticlockwise'} of the box`, s: st(tilt, 2.5, 6) });
      return { score: score(Math.sqrt(terms.reduce((a, b) => a + b, 0) / terms.length)), title: 'Against the true ellipse', sub: 'The red ellipse touches each side at its middle.', rows: rows.concat(shapeRows(e).slice(0, 2)), notes: [], overlay: (g, C) => drawFit(g, T, C.red, false) };
    }
  };

  const cubePlace = (m, A, size) => { // scale and centre a posed cube in the drawing area
    const b = FH.bbox(m.V), sc = Math.min(size * A.U, 0.9 * A.w / (b.x1 - b.x0), 0.9 * A.h / (b.y1 - b.y0));
    return { sc, tx: A.cx - sc * b.cx, ty: A.cy - sc * b.cy };
  };
  const tfOf = P => v => ({ x: P.sc * v.x + P.tx, y: P.sc * v.y + P.ty });

  const ellTop = {
    id: 'elltop', name: 'On a cube top', how: 'Marked on how far your ellipse runs from the true one: the circle that sits in the top face, seen in perspective.',
    opts: [], spec() { return { turn: pick([22.5, 30, 45, 45, 60, 67.5]), pitch: pick([22.5, 30, 35, 45, 55]), k: pick([0.1, 0.2, 0.3]) }; },
    lay(s, A) { const m = FH.cubeModel(s.turn, s.pitch, s.k), P = cubePlace(m, A, 0.52); return { m, P }; },
    task() { return 'Draw the ellipse that sits in the top face and touches all four of its sides.'; },
    draw(g, G, C) { const tf = tfOf(G.P); for (const e of G.m.edges) if (e.visible) D.line(g, tf(G.m.V[e.a]), tf(G.m.V[e.b]), C.blue, 2); },
    grade(strokes, s, G) {
      const e = FH.fitEllipse(strokes); if (!e || e.a < 12) return need('No ellipse found');
      const tf = tfOf(G.P), T = FH.faceEllipse(G.m, 1, tf);
      let miss = 0; for (const q of e.pts) miss += Math.abs(FH.ellipseDist(T, q)); miss /= e.pts.length * T.a;
      let lean = angDiff(e.ang / DEG, T.ang / DEG); if (lean > 90) lean -= 180; if (lean < -90) lean += 180;
      const dd = e.degree - T.degree, touch = [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]].map(q => tf(G.m.project(q[0], q[1], 1)));
      return { score: score(miss / 0.045), title: `Average miss ${pct(miss, 1)} of the half-width`, sub: 'Red dots are the four touching points: the middle of each side in perspective, so the far ones sit closer together.',
        rows: [{ k: 'Degree', v: `yours ${e.degree.toFixed(0)}°, true ${T.degree.toFixed(0)}°` + (Math.abs(dd) < 3 ? '' : dd > 0 ? ': too open' : ': too flat'), s: st(dd, 3, 7) },
          { k: 'Short axis', v: Math.abs(lean) < 2 ? 'lined up with the uprights' : `leans ${Math.abs(lean).toFixed(0)}° ${lean > 0 ? 'clockwise' : 'anticlockwise'} of true; it should run with the uprights`, s: st(lean, 3, 7) }].concat(shapeRows(e).slice(0, 2)),
        notes: [], overlay: (g, C) => { drawFit(g, T, C.red, true); for (const p of touch) D.dot(g, p, 3.5, C.red); } };
    }
  };

  const ellDeg = {
    id: 'elldeg', name: 'Set degree', how: 'Marked on the degree you drew (short axis against long), the width, the centre and the tilt.',
    opts: [{ key: 'deg', label: 'Degree', def: 'r', choices: [['r', 'Random'], ['15', '15°'], ['22.5', '22.5°'], ['30', '30°'], ['45', '45°'], ['60', '60°'], ['67.5', '67.5°']] },
      { key: 'axis', label: 'Short axis', def: 'upright', choices: [['upright', 'Upright'], ['tilted', 'Tilted']] }],
    spec(o) { return { deg: o.deg === 'r' ? pick([15, 22.5, 30, 45, 60, 67.5]) : +o.deg, ang: o.axis === 'upright' ? 0 : pick([-40, -25, -12, 12, 25, 40]), w: rand(0.3, 0.4) }; },
    lay(s, A) { const a = s.w * A.U; return { cx: A.cx, cy: A.cy, a, b: a * Math.sin(s.deg * DEG), ang: s.ang * DEG }; },
    task(s) { return `Draw a ${s.deg}° ellipse between the two end marks, short axis on the long blue line.`; },
    draw(g, G, C) {
      const c = Math.cos(G.ang), s = Math.sin(G.ang), ctr = { x: G.cx, y: G.cy };
      D.line(g, { x: G.cx + s * G.a, y: G.cy - c * G.a }, { x: G.cx - s * G.a, y: G.cy + c * G.a }, C.blue, 1.5);
      for (const k of [-1, 1]) { const p = { x: G.cx + k * c * G.a, y: G.cy + k * s * G.a }; D.line(g, { x: p.x + s * 12, y: p.y - c * 12 }, { x: p.x - s * 12, y: p.y + c * 12 }, C.blue, 2); }
      D.dot(g, ctr, 3.5, C.blue);
    },
    grade(strokes, s, G) {
      const e = FH.fitEllipse(strokes); if (!e || e.a < 15) return need('No ellipse found');
      const dd = e.degree - s.deg, db = (e.b - G.b) / G.a, dw = e.a / G.a - 1, c = Math.hypot(e.cx - G.cx, e.cy - G.cy) / G.a;
      let tilt = angDiff(e.ang / DEG, G.ang / DEG); if (tilt > 90) tilt -= 180; if (tilt < -90) tilt += 180;
      const terms = [(db / 0.05) ** 2, (dw / 0.05) ** 2, (c / 0.05) ** 2]; if (s.deg < 65) terms.push((tilt / 5) ** 2);
      const rows = [{ k: 'Degree', v: `you drew ${e.degree.toFixed(0)}°, asked ${s.deg}°` + (Math.abs(dd) < 3 ? '' : dd > 0 ? ': too open' : ': too flat'), s: st(db, 0.03, 0.07) },
        { k: 'Short axis', v: `${(e.b / e.a).toFixed(2)} of the long one; true ${Math.sin(s.deg * DEG).toFixed(2)}` },
        { k: 'Width', v: Math.abs(dw) < 0.015 ? 'on the marks' : `${pct(Math.abs(dw))} too ${dw > 0 ? 'wide' : 'narrow'}`, s: st(dw, 0.03, 0.07) },
        { k: 'Centre', v: c < 0.02 ? 'centred' : `${pct(c)} of the half-width off`, s: st(c, 0.03, 0.07) }];
      if (s.deg < 65) rows.push({ k: 'Tilt', v: Math.abs(tilt) < 1.5 ? 'short axis on the line' : `short axis ${Math.abs(tilt).toFixed(0)}° ${tilt > 0 ? 'clockwise' : 'anticlockwise'} of the line`, s: st(tilt, 2.5, 6) });
      return { score: score(Math.sqrt(terms.reduce((a, b) => a + b, 0) / terms.length)), title: Math.abs(dd) < 3 ? 'Right degree' : `${Math.abs(dd).toFixed(0)}° too ${dd > 0 ? 'open' : 'flat'}`, sub: '', rows: rows.concat(shapeRows(e).slice(0, 2)), notes: [], overlay: (g, C) => drawFit(g, { cx: G.cx, cy: G.cy, a: G.a, b: G.b, ang: G.ang }, C.red, false) };
    }
  };

  /* ---------- Cube ---------- */
  /* Set-up follows Krenz's 16-cube sheet: four turns, four camera rows. The sheet is drawn at average
     distance (front pillar to back pillar about 5:4), so that is the default. */
  const TURNS = [0, 22.5, 45, 67.5], CAMS = [0, 22.5, 45, 67.5];
  const turnLabel = t => t ? t + '°' : '0° face-on', camLabel = c => c ? c + '°' : 'Level';
  // The Y and Complete the cube leave out the face-on column: its left arm points straight back and
  // shrinks to a stub, so there is no Y to draw.
  const cubeOptsFor = turns => [
    { key: 'turn', label: 'Turn', def: 'r', choices: [['r', 'Random']].concat(turns.map(t => [String(t), turnLabel(t)])) },
    { key: 'cam', label: 'Camera', def: 'r', choices: [['r', 'Random']].concat(CAMS.map(c => [String(c), camLabel(c)])) },
    { key: 'view', label: 'Seen from', def: 'above', choices: [['above', 'Above'], ['below', 'Below'], ['either', 'Either']] },
    { key: 'dist', label: 'Distance', def: 'avg', choices: [['far', 'Far'], ['avg', 'Average'], ['close', 'Close'], ['r', 'Random']] }];
  const cubeOpts = cubeOptsFor(TURNS), yOpts = cubeOptsFor(TURNS.slice(1));
  const KS = { far: 0.05, avg: 0.2, close: 0.5 }, DW = { far: 'far away (20 cube-lengths)', avg: 'at average distance (5 cube-lengths)', close: 'close (2 cube-lengths)' };
  const specFor = turns => o => {
    const dist = o.dist === 'r' ? pick(['far', 'avg', 'close']) : o.dist, cam = o.cam === 'r' ? pick(CAMS) : +o.cam;
    // A level camera is neither above nor below.
    const below = cam > 0 && (o.view === 'below' || (o.view === 'either' && Math.random() < 0.5));
    return { turn: o.turn === 'r' ? pick(turns) : +o.turn, cam, below, dist };
  };
  const cubeSpec = specFor(TURNS), ySpec = specFor(TURNS.slice(1));
  const poseOf = s => FH.cubeModel(s.turn, s.below ? -s.cam : s.cam, KS[s.dist]);
  const camText = s => s.cam ? `seen from ${s.cam}° ${s.below ? 'below' : 'above'}` : 'seen level';
  // The task line must fit on one line of the sheet, so it uses the short distance words.
  const DS = { far: 'far', avg: 'average distance', close: 'close' };
  const poseText = s => `Cube ${s.turn ? `turned ${s.turn}°` : 'face-on (turn 0°)'}, ${camText(s)}, ${DS[s.dist]}.`;
  const viewText = (t, p) => `turned ${t.toFixed(0)}°, ` + (Math.abs(p) < 4 ? 'seen level' : `seen from ${Math.abs(p).toFixed(0)}° ${p < 0 ? 'below' : 'above'}`);
  // Turn 0 and turn 90 are the same picture, so a turn error is the shorter way round.
  const turnDiff = (a, b) => ((a - b + 135) % 90) - 45;
  function describeEdge(r) {
    const bits = [];
    if (Math.abs(r.dAng) >= 2) bits.push(`${Math.abs(r.dAng).toFixed(0)}° ${r.dAng > 0 ? 'clockwise' : 'anticlockwise'}`);
    if (Math.abs(r.dLen) >= 0.04) bits.push(`${pct(Math.abs(r.dLen))} ${r.dLen > 0 ? 'long' : 'short'}`);
    return bits.length ? bits.join(', ') : 'shifted, but right angle and length';
  }
  function edgeRows(rep, max) {
    const sorted = rep.slice().sort((a, b) => b.miss - a.miss), rows = [];
    for (const r of sorted.slice(0, max)) if (r.miss > 0.04) rows.push({ k: r.name[0].toUpperCase() + r.name.slice(1), v: describeEdge(r), s: st(r.miss, 0.06, 0.12) });
    const rest = sorted.length - rows.length;
    if (rest > 0) rows.push({ k: rows.length ? `Other ${rest} edges` : 'All edges', v: `within ${pct(Math.max(0.01, ...sorted.slice(rows.length).map(r => r.miss)))} of an edge`, s: 'good' });
    return rows;
  }
  function hiddenCheck(rep, sc) { // recipe step 7
    const f = n => rep.find(r => r.name === n), up = f('hidden upright'), a = rep.find(r => /^hidden (floor|ceiling) edge, left/.test(r.name)), b = rep.find(r => /^hidden (floor|ceiling) edge, right/.test(r.name));
    if (!up || !a || !b) return null;
    const x = FH.lineX(a.ua, sub(a.ub, a.ua), b.ua, sub(b.ub, b.ua)); if (!x) return null;
    const X = { x: a.ua.x + (a.ub.x - a.ua.x) * x.t1, y: a.ua.y + (a.ub.y - a.ua.y) * x.t1 }, d = Math.min(dist(up.ua, X), dist(up.ub, X)) / sc;
    return { k: 'Hidden upright', v: d < 0.06 ? 'lands on the hidden corner' : `misses the hidden corner by ${pct(d)} of an edge: a side edge or a top edge is off`, s: st(d, 0.06, 0.13) };
  }
  const drawCube = (g, al, color, yToo) => { for (const e of al.model.edges) { if (!yToo && e.isY) continue; D.line(g, al.P[e.a], al.P[e.b], color, e.visible ? 2 : 1.5, e.visible ? null : [6, 6]); } };
  const missOf = al => al.pairs.length ? Math.sqrt(al.sum / (2 * al.pairs.length)) / al.sc : 1;

  const cubeY = {
    id: 'cubey', name: 'The Y', how: 'Marked on the direction of the stem and each arm, and on each arm’s length as a share of your stem. Any size, anywhere.',
    opts: yOpts, spec: ySpec, lay() { return {}; }, task(s) { return poseText(s) + ' Draw its Y: the stem, then the two arms.'; }, draw() {},
    grade(strokes, s) {
      let segs = FH.segmentsOf(strokes); if (segs.length < 3) return need(`Found ${segs.length} line${segs.length === 1 ? '' : 's'}; a Y needs 3`);
      segs = segs.sort((a, b) => b.len - a.len).slice(0, 3);
      let best = null;
      for (let m = 0; m < 8; m++) { const p = segs.map((sg, i) => (m >> i) & 1 ? sg.b : sg.a), cx = (p[0].x + p[1].x + p[2].x) / 3, cy = (p[0].y + p[1].y + p[2].y) / 3;
        const sp = p.reduce((a, q) => a + (q.x - cx) ** 2 + (q.y - cy) ** 2, 0); if (!best || sp < best.sp) best = { sp, m, J: { x: cx, y: cy } }; }
      const J = best.J, arms = segs.map((sg, i) => sub((best.m >> i) & 1 ? sg.a : sg.b, J)), want = s.below ? -1 : 1;
      arms.sort((a, b) => want * (b.y / Math.hypot(b.x, b.y) - a.y / Math.hypot(a.x, a.y)));
      const stem = arms[0], left = arms[1].x <= arms[2].x ? arms[1] : arms[2], right = left === arms[1] ? arms[2] : arms[1], sl = Math.hypot(stem.x, stem.y);
      const model = poseOf(s), my = FH.modelY(model), ms = Math.hypot(my.stem.x, my.stem.y);
      const rows = [], terms = [], dS = angDiff(clockDeg(stem), clockDeg(my.stem));
      rows.push({ k: 'Stem', v: Math.abs(dS) < 1.5 ? 'right direction' : `${Math.abs(dS).toFixed(0)}° off the true stem`, s: st(dS, 2, 5) }); terms.push((dS / 5) ** 2);
      const meas = {};
      for (const [nm, u, t] of [['Left', left, my.left], ['Right', right, my.right]]) {
        const ud = clockDeg(u), td = clockDeg(t), d = angDiff(ud, td), ul = Math.hypot(u.x, u.y) / sl, tl = Math.hypot(t.x, t.y) / ms, dl = ul / tl - 1;
        const high = u.y / Math.hypot(u.x, u.y) < t.y / Math.hypot(t.x, t.y);
        rows.push({ k: nm + ' arm, direction', v: `${clockText(ud)}, true ${clockText(td)}` + (Math.abs(d) < 2 ? '' : `: ${Math.abs(d).toFixed(0)}° too ${high ? 'high' : 'low'}`), s: st(d, 3, 7) });
        rows.push({ k: nm + ' arm, length', v: `${ul.toFixed(2)} of the stem, true ${tl.toFixed(2)}` + (Math.abs(dl) < 0.04 ? '' : `: ${pct(Math.abs(dl))} ${dl > 0 ? 'long' : 'short'}`), s: st(dl, 0.06, 0.13) });
        terms.push((d / 6) ** 2, (dl / 0.1) ** 2); meas[nm.toLowerCase() + 'Deg'] = ud; meas[nm.toLowerCase() + 'Len'] = ul;
      }
      const fy = FH.fitY(meas, model.k, s.below ? -1 : 1), k = sl / ms;
      return { score: score(Math.sqrt(terms.reduce((a, b) => a + b, 0) / terms.length)), title: `You drew a cube ${viewText(fy.turn, fy.pitch)}`, sub: `Asked: turned ${s.turn}°, ${camText(s)}. The red Y is the true one at your stem length.`, rows, notes: [],
        overlay: (g, C) => { for (const v of [my.stem, my.left, my.right]) D.line(g, J, { x: J.x + v.x * k, y: J.y + v.y * k }, C.red, 2); D.dot(g, J, 3, C.red); } };
    }
  };

  const cubeDone = {
    id: 'cubedone', name: 'Complete the cube', how: 'Marked edge by edge against the true cube built on the given Y, plus the recipe checks: each family of edges closes going back, and the hidden upright lands on the hidden corner.',
    opts: yOpts.concat([{ key: 'hidden', label: 'Hidden edges', def: 'yes', choices: [['yes', 'Draw them'], ['no', 'Skip']] }]),
    spec(o) { const s = ySpec(o); s.hidden = o.hidden !== 'no'; return s; },
    lay(s, A) { const m = poseOf(s), P = cubePlace(m, A, 0.45); return { m, P }; },
    task(s) { return poseText(s) + ` The Y is given: add the other edges${s.hidden ? ', hidden ones too' : ' you can see'}.`; },
    draw(g, G, C) { const tf = tfOf(G.P); for (const e of G.m.edges) if (e.isY) D.line(g, tf(G.m.V[e.a]), tf(G.m.V[e.b]), C.blue, 2.5); D.dot(g, tf(G.m.V[G.m.nearH << 2]), 4, C.blue); },
    grade(strokes, s, G) {
      const segs = FH.segmentsOf(strokes); if (!segs.length) return need('No lines found');
      const E = G.m.edges.filter(e => !e.isY && (s.hidden || e.visible));
      const al = FH.alignCube(G.m, segs, { edges: E, fixed: { sc: G.P.sc, rot: 0, tx: G.P.tx, ty: G.P.ty }, pen: 2 * (0.3 * G.P.sc) ** 2 });
      const rep = FH.edgeReport(al), miss = missOf(al), rows = edgeRows(rep, 4);
      const missing = E.filter((e, j) => !al.pairs.some(p => p.ei === j)).map(e => e.name);
      if (missing.length) rows.push({ k: 'Not found', v: missing.join('; '), s: 'bad' });
      const lines = rep.map(r => ({ edge: r.edge, ua: r.ua, ub: r.ub })).concat(G.m.edges.filter(e => e.isY).map(e => ({ edge: e, ua: al.P[e.a], ub: al.P[e.b] })));
      const checks = FH.familyChecks(lines, G.m), hc = hiddenCheck(rep, G.P.sc); if (hc) checks.push(hc);
      return { score: Math.round(score(miss / 0.07) * al.pairs.length / E.length), title: `Corners miss by ${pct(miss)} of an edge on average`, sub: 'The red cube is the true one on this Y. Draw over it to feel the correction.', rows: rows.concat(checks), notes: [],
        overlay: (g, C) => drawCube(g, al, C.red, false) };
    }
  };

  function freeRead(segs, roll) { const R = FH.fitCube(segs, { maxRoll: roll }); return R && R.best ? R : null; }

  // Marks a whole cube against the one asked for. Shared by Named cube and the 16-cube course.
  // faceOn adds the sheet's thin face-on cube of the same row under the correction.
  function gradeNamed(strokes, s, faceOn) {
    const m = poseOf(s), nVis = m.edges.filter(e => e.visible).length;
    // Flat views show fewer edges: a level face-on cube is a single square.
    const segs = FH.segmentsOf(strokes); if (segs.length < Math.min(5, nVis)) return need(`Found ${segs.length} edges; draw at least the ${nVis} visible ones`);
    const a1 = FH.alignCube(m, segs, { hidden: false, maxRoll: 0, iters: 8 }), a2 = segs.length > nVis ? FH.alignCube(m, segs, { hidden: true, maxRoll: 0, iters: 8 }) : null;
    const al = a2 && a2.cost < a1.cost ? a2 : a1, rep = FH.edgeReport(al), miss = missOf(al), R = freeRead(segs, 12), rows = [];
    if (R) { const b = R.best.model, dt = turnDiff(b.turn, s.turn), dp = Math.abs(b.pitch) - s.cam, dw = FH.distanceWords(b.k), face = s.below ? 'bottom' : 'top';
      if (s.cam > 0 && Math.abs(b.pitch) > 4 && (b.pitch < 0) !== s.below) rows.push({ k: 'View', v: `reads as seen from ${b.pitch < 0 ? 'below' : 'above'}, asked ${s.below ? 'below' : 'above'}`, s: 'bad' });
      rows.push({ k: 'Turn', v: `drew ${b.turn.toFixed(0)}°, asked ${s.turn}°` + (Math.abs(dt) < 4 ? '' : dt > 0 ? ': left face too wide' : ': right face too wide'), s: st(dt, 5, 11) });
      rows.push({ k: 'Camera', v: `drew ${Math.abs(b.pitch).toFixed(0)}°, asked ${s.cam ? s.cam + '°' : 'level'}` + (Math.abs(dp) < 4 ? '' : dp > 0 ? `: ${face} face too open` : `: ${face} face too flat`), s: st(dp, 5, 11) });
      rows.push({ k: 'Distance', v: `reads as ${dw.text}; asked ${DW[s.dist]}` }); }
    const checks = FH.familyChecks(rep.map(r => ({ edge: r.edge, ua: r.ua, ub: r.ub })), m), hc = hiddenCheck(rep, al.sc); if (hc) checks.push(hc);
    return { score: Math.round(score(miss / 0.08) * al.pairs.length / al.E.length), title: R ? `You drew a cube ${viewText(R.best.model.turn, R.best.model.pitch)}` : 'Against the cube asked for',
      sub: `Against the cube asked for, corners miss by ${pct(miss)} of an edge on average. It is shown in red.`, rows: rows.concat(edgeRows(rep, 3), checks), notes: [],
      overlay: (g, C) => {
        if (faceOn && s.turn) { // both cubes share a centre, so the alignment of the true cube places the face-on one too
          const f = FH.cubeModel(0, m.pitch, m.k), cr = Math.cos(al.rot), sr = Math.sin(al.rot), tf = v => ({ x: al.sc * (cr * v.x - sr * v.y) + al.tx, y: al.sc * (sr * v.x + cr * v.y) + al.ty });
          for (const e of f.edges) D.line(g, tf(f.V[e.a]), tf(f.V[e.b]), C.muted, 1);
        }
        drawCube(g, al, C.red, true);
      } };
  }

  const cubeNamed = {
    id: 'cubenamed', name: 'Named cube', how: 'Marked against the cube asked for, laid over your drawing at its best size and position. You also get the cube you actually drew.',
    opts: cubeOpts, spec: cubeSpec, lay() { return {}; }, task(s) { return poseText(s) + ' Draw the whole cube; hidden edges optional.'; }, draw() {},
    grade(strokes, s) { return gradeNamed(strokes, s, false); }
  };

  /* ---------- Krenz's 16-cube sheet ---------- */
  // One cell of the sheet: the thin face-on cube of the row, then the turned cube over it with
  // its hidden edges thin. Both sit on the same centre, as on the sheet.
  function drawCell(g, m, tf, color, thin) {
    if (m.turn) { const f = FH.cubeModel(0, m.pitch, m.k); for (const e of f.edges) D.line(g, tf(f.V[e.a]), tf(f.V[e.b]), thin, 1); }
    for (const vis of [false, true]) for (const e of m.edges) if (e.visible === vis) D.line(g, tf(m.V[e.a]), tf(m.V[e.b]), color, vis ? 2.2 : 1);
  }
  const cubeTable = {
    id: 'cubetable', name: 'The table', reference: true,
    how: 'Krenz’s 16 cubes: four turns across, four camera heights down. The thin cube in each cell is the face-on cube of that row, on the same centre. Nothing is marked here; draw over the sheet to trace it.',
    opts: [{ key: 'view', label: 'Seen from', def: 'above', choices: [['above', 'Above'], ['below', 'Below']] },
      { key: 'dist', label: 'Distance', def: 'avg', choices: [['far', 'Far'], ['avg', 'Average'], ['close', 'Close']] }],
    spec(o) { return { below: o.view === 'below', dist: o.dist }; },
    lay(s, A) { // a square grid with a margin on the left and top for the row and column names
      const padL = 46, padT = 26, cell = Math.min((A.w - padL) / 4, (A.h - padT) / 4), x0 = A.cx - (4 * cell + padL) / 2 + padL, y0 = A.cy - (4 * cell + padT) / 2 + padT;
      return { cell, x0, y0, sc: cell * 0.58, below: s.below, k: KS[s.dist] };
    },
    task(s) { return `The 16 cubes, ${s.below ? 'seen from below' : 'seen from above'}, ${DS[s.dist]}.`; },
    draw(g, G, C) {
      TURNS.forEach((t, c) => D.label(g, t + '°', G.x0 + (c + 0.5) * G.cell, G.y0 - 12, C.muted));
      CAMS.forEach((cam, r) => {
        D.label(g, cam ? cam + '°' : 'Level', G.x0 - 24, G.y0 + (r + 0.5) * G.cell, C.muted);
        TURNS.forEach((t, c) => { const cx = G.x0 + (c + 0.5) * G.cell, cy = G.y0 + (r + 0.5) * G.cell;
          drawCell(g, FH.cubeModel(t, G.below ? -cam : cam, G.k), v => ({ x: cx + G.sc * v.x, y: cy + G.sc * v.y }), C.blue, C.muted); });
      });
    }
  };

  const CELLS = CAMS.flatMap(cam => TURNS.map(turn => ({ turn, cam })));
  const cube16 = {
    id: 'cube16', name: '16 cubes', how: 'The sheet, one cube at a time. Pick a turn and a camera to practise one cube, or leave either on All to step through, left to right and top to bottom. Each is marked like a named cube; the correction also shows the thin face-on cube of its row.',
    opts: [{ key: 'turn', label: 'Turn (column)', def: 'all', choices: [['all', 'All']].concat(TURNS.map(t => [String(t), turnLabel(t)])) },
      { key: 'cam', label: 'Camera, from above (row)', def: 'all', choices: [['all', 'All']].concat(CAMS.map(c => [String(c), camLabel(c)])) },
      { key: 'model', label: 'Small picture', def: 'show', choices: [['show', 'Shown'], ['hide', 'From memory']] }],
    // Steps to the cell after the previous one within the chosen column and row. With both chosen
    // the list is one cube, which then repeats.
    spec(o, prev) {
      const list = CELLS.filter(c => (o.turn === 'all' || c.turn === +o.turn) && (o.cam === 'all' || c.cam === +o.cam)), at = prev ? list.findIndex(c => c.turn === prev.turn && c.cam === prev.cam) : -1, n = (at + 1) % list.length;
      return { turn: list[n].turn, cam: list[n].cam, below: false, dist: 'avg', n: n + 1, total: list.length, show: o.model !== 'hide' };
    },
    lay(s, A) { const m = poseOf(s), sc = 0.2 * A.U; return { m, show: s.show, tf: v => ({ x: A.x1 - 0.85 * sc + sc * v.x, y: A.y0 + 0.9 * sc + sc * v.y }) }; }, // the picture, top right
    task(s) { return (s.total > 1 ? `Cube ${s.n} of ${s.total}: ` : 'Cube: ') + `turn ${turnLabel(s.turn)}, camera ${s.cam ? s.cam + '° above' : 'level'}. Draw it whole, hidden edges too.`; },
    draw(g, G, C) { if (G.show) drawCell(g, G.m, G.tf, C.blue, C.muted); },
    grade(strokes, s) { return gradeNamed(strokes, s, true); }
  };

  const cubeFree = {
    id: 'cubefree', name: 'Free cube', free: true, how: 'Draw any cube. The app finds the true cube nearest to your drawing and names its turn, camera angle and distance.',
    opts: [], spec() { return {}; }, lay() { return {}; }, task() { return 'Draw any cube. One stroke per edge reads best; hidden edges are optional.'; }, draw() {},
    grade(strokes) {
      const segs = FH.segmentsOf(strokes); if (segs.length < 4) return need(`Found ${segs.length} edges; draw at least the visible ones`);
      const R = freeRead(segs, 20); if (!R) return need('Could not read a cube here');
      const al = R.best, b = al.model, rep = FH.edgeReport(al), miss = missOf(al), tn = FH.tableNames(b.turn, b.pitch), dw = FH.distanceWords(b.k), roll = al.rot / DEG;
      const rows = [{ k: 'Turn', v: `${b.turn.toFixed(0)}°; nearest table column ${tn.turn}°` }, { k: 'Camera', v: `${Math.abs(b.pitch).toFixed(0)}° from ${b.pitch < 0 ? 'below' : 'above'}; nearest table row ${tn.pitch}°` }, { k: 'Distance', v: dw.text }];
      if (tn.recipe && b.pitch > 0) rows.push({ k: 'Recipe corner', v: tn.recipe });
      if (Math.abs(roll) > 2.5) rows.push({ k: 'Lean', v: `the whole cube leans ${Math.abs(roll).toFixed(0)}° ${roll > 0 ? 'clockwise' : 'anticlockwise'}`, s: st(roll, 3, 7) });
      rows.push({ k: 'Fit', v: `corners miss the nearest true cube by ${pct(miss)} of an edge on average`, s: st(miss, 0.05, 0.1) });
      const checks = FH.familyChecks(rep.map(r => ({ edge: r.edge, ua: r.ua, ub: r.ub })), b), hc = hiddenCheck(rep, al.sc); if (hc) checks.push(hc);
      const notes = [];
      if (R.alt) notes.push(`With hidden edges drawn this far away, it reads just as well as a cube ${viewText(R.alt.model.turn, R.alt.model.pitch)}.`);
      if (al.unSegs) notes.push(`${al.unSegs} stroke${al.unSegs > 1 ? 's were' : ' was'} not used.`);
      if (al.unEdges) notes.push(`${al.unEdges} edge${al.unEdges > 1 ? 's' : ''} of the cube had no stroke.`);
      return { score: Math.round(score(miss / 0.07) * al.pairs.length / al.E.length), title: `Best match: cube ${viewText(b.turn, b.pitch)}`, sub: `${dw.text[0].toUpperCase() + dw.text.slice(1)}. The red cube is the nearest true one.`, rows: rows.concat(edgeRows(rep, 3), checks), notes,
        overlay: (g, C) => drawCube(g, al, C.red, true) };
    }
  };

  return { sections: [{ id: 'proportion', name: 'Proportion', drills: [divide, ratio, clock, measure] }, { id: 'ellipse', name: 'Ellipse', drills: [ellFree, ellBox, ellTop, ellDeg] }, { id: 'cube', name: 'Cube', drills: [cubeTable, cube16, cubeY, cubeDone, cubeNamed, cubeFree] }] };
})();
