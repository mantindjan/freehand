/* Canvas drawing helpers shared by the drills (what is given, corrections) and the UI.
   Kept in their own module so drills.js and ui.js do not import each other. */
export const D = {
  line(g, a, b, color, w, dash) { g.save(); g.strokeStyle = color; g.lineWidth = w || 2; g.lineCap = 'round'; if (dash) g.setLineDash(dash); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); g.restore(); },
  cap(g, at, toward, size, color) { const L = Math.hypot(toward.x - at.x, toward.y - at.y) || 1, nx = -(toward.y - at.y) / L, ny = (toward.x - at.x) / L; D.line(g, { x: at.x + nx * size, y: at.y + ny * size }, { x: at.x - nx * size, y: at.y - ny * size }, color, 2); },
  dot(g, p, r, color) { g.save(); g.fillStyle = color; g.beginPath(); g.arc(p.x, p.y, r, 0, 7); g.fill(); g.restore(); },
  label(g, t, x, y, color) { g.save(); g.fillStyle = color; g.font = '600 16px "Instrument Sans", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, x, y); g.restore(); },
  ellipse(g, e, color, w) { g.save(); g.strokeStyle = color; g.lineWidth = w || 2; g.beginPath(); g.ellipse(e.cx, e.cy, e.a, e.b, e.ang, 0, 2 * Math.PI); g.stroke(); g.restore(); },
  poly(g, pts, color, w) { g.save(); g.strokeStyle = color; g.lineWidth = w || 2; g.lineJoin = 'round'; g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.closePath(); g.stroke(); g.restore(); },
  boxCorners(G) { const c = Math.cos(G.ang), s = Math.sin(G.ang); return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(q => ({ x: G.cx + q[0] * G.a * c - q[1] * G.b * s, y: G.cy + q[0] * G.a * s + q[1] * G.b * c })); }
};
