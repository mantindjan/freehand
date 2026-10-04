import { FH } from './engine.js';
import { DRILLS } from './drills.js';

(function () {
  const $ = id => document.getElementById(id), esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pad = $('pad'), g = pad.getContext('2d'), stage = $('stage'), taskEl = $('task'), panel = $('panel');
  const KEY = 'freehand.v1';
  let saved = {}; try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { saved = {}; }
  saved.opts = saved.opts || {}; saved.hist = saved.hist || {}; saved.last = saved.last || {};
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (e) { /* storage unavailable: the page works without it */ } };
  const grp = d => /^cube(y|done|named)$/.test(d.id) ? 'cube' : d.id;
  const optsOf = d => { const o = {}, sv = saved.opts[grp(d)] || {}; for (const op of d.opts) o[op.key] = op.choices.some(c => c[0] === sv[op.key]) ? sv[op.key] : op.def; return o; };

  const C = {};
  function readColors() { const cs = getComputedStyle(document.documentElement); for (const k of ['ink', 'sketch', 'blue', 'red', 'muted', 'paper', 'line']) C[k] = cs.getPropertyValue('--' + k).trim(); }

  const S = { sec: null, drill: null, spec: null, geo: null, strokes: [], result: null, gradedCount: 0, W: 0, H: 0 };
  const session = { n: 0, sum: 0 };

  function area() {
    const bar = $('top'), x0 = 30, x1 = S.W - 30, y0 = bar.offsetTop + bar.offsetHeight + 10, y1 = S.H - 20; // below the buttons and task line
    const w = Math.max(60, x1 - x0), h = Math.max(60, y1 - y0);
    return { x0, y0, x1, y1, w, h, cx: x0 + w / 2, cy: y0 + h / 2, U: Math.min(w, h) };
  }
  function layout() { S.geo = S.drill.lay(S.spec, area()); }
  // keep = true is a set-up change: the prompt is rebuilt for the new options but the drawing stays.
  // Only Clear, Again, Next and leaving the exercise wipe the sheet; a stray tap on an option
  // must never cost the boss his drawing. Any result is dropped, since it described the old prompt.
  function newPrompt(keep) {
    S.spec = S.drill.spec(optsOf(S.drill), S.spec, !!keep); if (!keep) S.strokes = []; S.result = null;
    taskEl.textContent = S.drill.task(S.spec); layout(); render(); renderPanel(); buttons();
  }

  function drawStroke(pts, color, w) {
    g.save(); g.strokeStyle = color; g.fillStyle = color; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round';
    if (pts.length < 2 || FH.pathLen(pts) < 2.5) { g.beginPath(); g.arc(pts[0].x, pts[0].y, w * 1.3, 0, 7); g.fill(); g.restore(); return; }
    g.beginPath(); g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) g.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
    g.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y); g.stroke(); g.restore();
  }
  function render() {
    g.clearRect(0, 0, S.W, S.H);
    if (!S.spec) return;
    S.drill.draw(g, S.geo, C);
    const n = S.result ? S.gradedCount : S.strokes.length;
    // Sketch strokes go under the final ones so the answer stays readable on top of the drafting.
    if (showSketch) for (let i = 0; i < n; i++) if (S.strokes[i].sketch) drawStroke(S.strokes[i], C.sketch, SKETCH_W);
    for (let i = 0; i < n; i++) if (!S.strokes[i].sketch) drawStroke(S.strokes[i], C.ink, FINAL_W);
    if (S.result && S.result.overlay) S.result.overlay(g, C);
    for (let i = n; i < S.strokes.length; i++) drawStroke(S.strokes[i], C.muted, FINAL_W); // tracing over the correction
    if (cur && tool !== 'erase') drawStroke(cur, S.result ? C.muted : tool === 'sketch' ? C.sketch : C.ink, tool === 'sketch' && !S.result ? SKETCH_W : FINAL_W);
    if (cur && tool === 'erase') { const p = cur[cur.length - 1]; g.save(); g.strokeStyle = C.muted; g.lineWidth = 1; g.beginPath(); g.arc(p.x, p.y, ERASE_R, 0, 7); g.stroke(); g.restore(); }
  }

  /* Tools. 'final' strokes are the answer and are the only ones passed to the marking.
     'sketch' strokes are drafting: thinner, in another colour, never marked.
     'erase' removes whole strokes it touches. A sketch stroke is a normal stroke array
     carrying sketch = true, so undo and erase treat both kinds alike. */
  const SKETCH_W = 0.9, FINAL_W = 1.8, ERASE_R = 12;
  let tool = 'final';
  // Sketch lines can be hidden at any time, before or after Check, to see the answer on its own.
  // They are only hidden, never removed; drawing a new sketch stroke shows them again.
  let showSketch = true;
  function setSketchShown(on) { showSketch = on; $('peek').setAttribute('aria-pressed', on); render(); }
  const finals = () => S.strokes.filter(st => !st.sketch);
  function setTool(t) { tool = t; for (const b of document.querySelectorAll('[data-tool]')) b.setAttribute('aria-pressed', b.dataset.tool === t); }
  // Distance from p to the stroke's polyline, so a fast stroke with sparse points is still hit.
  function touches(st, p) {
    if (st.length === 1) return Math.hypot(st[0].x - p.x, st[0].y - p.y) <= ERASE_R;
    for (let i = 1; i < st.length; i++) {
      const a = st[i - 1], b = st[i], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
      const t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
      if (Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y) <= ERASE_R) return true;
    }
    return false;
  }
  // Marked strokes are frozen once a result is shown (the result describes them), so after
  // Check the eraser only reaches the tracing strokes drawn over the correction.
  function eraseAt(p) {
    const keep = S.result ? S.gradedCount : 0;
    S.strokes = S.strokes.filter((st, i) => i < keep || !touches(st, p));
  }

  /* pen input: one contact draws; a resting palm is dropped as soon as the pen moves */
  let cur = null, active = null, penSeen = false, ignored = new Set();
  const at = e => { const r = pad.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  pad.addEventListener('pointerdown', e => {
    if (e.pointerType === 'pen') penSeen = true;
    if ((penSeen && e.pointerType === 'touch') || e.button > 0) return;
    if (e.pointerType === 'touch' && Math.max(e.width || 0, e.height || 0) > 90) return; // palm-sized contact
    if (active != null) { if (cur && FH.pathLen(cur) < 10) ignored.add(active); else return; } // the first contact never moved: it was the hand
    active = e.pointerId; cur = [at(e)]; if (tool === 'erase') eraseAt(cur[0]); try { pad.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
    e.preventDefault(); render();
  });
  pad.addEventListener('pointermove', e => {
    if (e.pointerId !== active || !cur) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of (evs.length ? evs : [e])) { const p = at(ev), q = cur[cur.length - 1]; if (Math.hypot(p.x - q.x, p.y - q.y) >= 0.8) { cur.push(p); if (tool === 'erase') eraseAt(p); } }
    render();
  });
  const end = (e, keep) => {
    if (ignored.delete(e.pointerId)) return;
    if (e.pointerId !== active) return;
    if (keep && cur && cur.length && tool !== 'erase') { if (tool === 'sketch' && !S.result) { cur.sketch = true; if (!showSketch) setSketchShown(true); } S.strokes.push(cur); }
    cur = null; active = null; render(); buttons();
  };
  pad.addEventListener('pointerup', e => end(e, true));
  pad.addEventListener('pointercancel', e => end(e, false));
  pad.addEventListener('contextmenu', e => e.preventDefault());

  function check() {
    if (!finals().length) return;
    let r; try { r = S.drill.grade(finals(), S.spec, S.geo); } catch (err) { r = { score: null, title: 'Could not read this drawing', sub: 'Clear the sheet and try once more.', rows: [], notes: [] }; }
    S.result = r; S.gradedCount = S.strokes.length;
    if (r.score != null) { const h = saved.hist[S.drill.id] = (saved.hist[S.drill.id] || []).concat(r.score).slice(-30); session.n++; session.sum += r.score; save(); }
    render(); renderPanel(); buttons(); panel.scrollTop = 0;
  }
  function buttons() {
    const done = !!S.result, go = $('go');
    go.textContent = done ? (S.drill.free ? 'New sheet' : 'Next') : 'Check'; go.disabled = !done && !finals().length;
    go.hidden = !!S.drill.reference; // a reference sheet is looked at and traced, never marked
    $('again').hidden = !done || !!S.drill.free; $('undo').disabled = !S.strokes.length; $('clear').disabled = !S.strokes.length && !done;
    $('tally').textContent = session.n ? `This sitting: ${session.n} checked, average ${Math.round(session.sum / session.n)}` : 'This sitting: nothing checked yet';
  }
  $('go').addEventListener('click', () => { if (S.drill.reference) return; if (S.result) return newPrompt(false); if (!finals().length) return; $('go').textContent = 'Reading…'; $('go').disabled = true; setTimeout(check, 30); });
  $('again').addEventListener('click', () => { S.strokes = []; S.result = null; render(); renderPanel(); buttons(); });
  $('clear').addEventListener('click', () => { S.strokes = []; S.result = null; render(); renderPanel(); buttons(); });
  $('undo').addEventListener('click', () => {
    if (S.result && S.strokes.length <= S.gradedCount) S.result = null; else S.strokes.pop();
    render(); renderPanel(); buttons();
  });
  for (const b of document.querySelectorAll('[data-tool]')) b.addEventListener('click', () => setTool(b.dataset.tool));
  $('peek').addEventListener('click', () => setSketchShown(!showSketch));
  // Safari ignores user-scalable=no in a normal tab, so pinch zoom is also refused here: its own
  // gesture events, and any touch move with two fingers down.
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, e => e.preventDefault());
  document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  document.addEventListener('keydown', e => { if (e.key === 'Enter') $('go').click(); else if (e.key === 'z' || e.key === 'Backspace') $('undo').click(); });

  const tier = s => s >= 80 ? 'good' : s >= 55 ? 'warn' : 'bad';
  function renderPanel() {
    const d = S.drill, o = optsOf(d), r = S.result; let h = '';
    if (r) {
      h += '<section class="res"><h3>Marking</h3><div class="res-top">';
      if (r.score != null) h += `<div class="score ${tier(r.score)}">${r.score}<small>of 100</small></div>`;
      h += `<div><h2>${esc(r.title)}</h2>${r.sub ? `<p class="sub">${esc(r.sub)}</p>` : ''}</div></div>`;
      if (r.rows.length) h += '<dl class="rows">' + r.rows.map(x => `<div class="row ${x.s || ''}"><span class="mark"></span><dt>${esc(x.k)}</dt><dd>${esc(x.v)}</dd></div>`).join('') + '</dl>';
      if (r.notes.length) h += '<ul class="notes">' + r.notes.map(n => `<li>${esc(n)}</li>`).join('') + '</ul>';
      h += '</section>';
    } else h += `<section><h3>${d.reference ? 'About this sheet' : 'How it is marked'}</h3><p class="how">${esc(d.how)}</p></section>`;
    if (d.opts.length) h += '<section><h3>Set-up</h3>' + d.opts.map(op => `<div class="opt"><span>${esc(op.label)}</span><div>` + op.choices.map(c => `<button type="button" data-k="${op.key}" data-v="${c[0]}" aria-pressed="${o[op.key] === c[0]}">${esc(c[1])}</button>`).join('') + '</div></div>').join('') + '</section>';
    const hist = (saved.hist[d.id] || []).slice(-10);
    if (!d.reference) h += '<section><h3>Last ten on this exercise</h3>' + (hist.length ? `<div class="hist"><div class="bars">${hist.map(s => `<i class="${tier(s)}" style="height:${Math.max(6, s)}%"></i>`).join('')}</div><b>avg ${Math.round(hist.reduce((a, b) => a + b, 0) / hist.length)}</b></div>` : '<p class="how">Nothing marked yet.</p>') + '</section>';
    panel.innerHTML = h;
  }
  panel.addEventListener('click', e => {
    const b = e.target.closest('button[data-k]'); if (!b) return;
    const k = grp(S.drill); saved.opts[k] = saved.opts[k] || {}; saved.opts[k][b.dataset.k] = b.dataset.v; save(); newPrompt(true);
  });

  function renderNav() {
    $('tabs').innerHTML = DRILLS.sections.map(s => `<button type="button" role="tab" data-s="${s.id}" aria-selected="${s === S.sec}">${s.name}</button>`).join('');
    $('drills').innerHTML = S.sec.drills.map(d => `<button type="button" data-d="${d.id}" aria-pressed="${d === S.drill}">${d.name}${d.free ? '<span class="free">free</span>' : ''}</button>`).join('');
  }
  // Every exercise keeps its own sheet: the prompt, the strokes and any marking. Leaving an exercise
  // puts its sheet aside and coming back restores it, so looking something up on the table or in
  // another section never costs a drawing. A sheet is only emptied by Clear, Again or Next.
  // Kept in memory only: a reload starts with blank sheets.
  const sheets = {};
  function open(secId, drillId) {
    if (S.drill && S.spec) sheets[S.drill.id] = { spec: S.spec, strokes: S.strokes, result: S.result, gradedCount: S.gradedCount };
    S.sec = DRILLS.sections.find(s => s.id === secId) || DRILLS.sections[0];
    S.drill = S.sec.drills.find(d => d.id === (drillId || saved.last[S.sec.id])) || S.sec.drills[0];
    saved.last[S.sec.id] = S.drill.id; saved.sec = S.sec.id; save(); renderNav();
    const kept = sheets[S.drill.id];
    if (!kept) { S.spec = null; return newPrompt(); }
    Object.assign(S, kept);
    taskEl.textContent = S.drill.task(S.spec); layout(); render(); renderPanel(); buttons();
  }
  $('tabs').addEventListener('click', e => { const b = e.target.closest('button[data-s]'); if (b) open(b.dataset.s); });
  $('drills').addEventListener('click', e => { const b = e.target.closest('button[data-d]'); if (b) open(S.sec.id, b.dataset.d); });

  function resize() {
    const r = stage.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    if (r.width < 2 || r.height < 2) return;
    S.W = r.width; S.H = r.height; pad.width = Math.round(r.width * dpr); pad.height = Math.round(r.height * dpr); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (S.spec && !S.strokes.length && !S.result) layout();
    render();
  }
  readColors();
  const mq = window.matchMedia('(prefers-color-scheme: dark)'), recolor = () => { readColors(); render(); };
  if (mq.addEventListener) mq.addEventListener('change', recolor);
  new MutationObserver(recolor).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const hash = (location.hash || '').slice(1);
  S.sec = DRILLS.sections[0]; S.drill = S.sec.drills[0];
  resize();
  open(DRILLS.sections.some(s => s.id === hash) ? hash : saved.sec);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage); else window.addEventListener('resize', resize);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (S.spec && !S.strokes.length && !S.result) layout(); render(); });
  window.__fh = { S, check, open, FH, setTool }; // handle for the page tests (modules have no globals to reach otherwise)
})();
