import { useState, useRef, useCallback, useEffect } from "react";

function labToXYZ(L, a, b) {
  const fy = (L + 16) / 116, fx = a / 500 + fy, fz = fy - b / 200;
  const Xn = 95.047, Yn = 100, Zn = 108.883, kap = 903.3;
  const X = fx ** 3 > 0.008856 ? fx ** 3 : (116 * fx - 16) / kap;
  const Y = L > kap * 0.008856 ? ((L + 16) / 116) ** 3 : L / kap;
  const Z = fz ** 3 > 0.008856 ? fz ** 3 : (116 * fz - 16) / kap;
  return [X * Xn, Y * Yn, Z * Zn];
}
function xyzToRgb(X, Y, Z) {
  X /= 100; Y /= 100; Z /= 100;
  let r = X * 3.2406 + Y * -1.5372 + Z * -0.4986;
  let g = X * -0.9689 + Y * 1.8758 + Z * 0.0415;
  let bv = X * 0.0557 + Y * -0.2040 + Z * 1.057;
  const gc = v => v > 0.0031308 ? 1.055 * v ** (1 / 2.4) - 0.055 : 12.92 * v;
  return [Math.round(Math.min(255, Math.max(0, gc(r) * 255))),
          Math.round(Math.min(255, Math.max(0, gc(g) * 255))),
          Math.round(Math.min(255, Math.max(0, gc(bv) * 255)))];
}
function labToHex(L, a, b) {
  const [r, g, bv] = xyzToRgb(...labToXYZ(L, a, b));
  return "#" + [r, g, bv].map(v => v.toString(16).padStart(2, "0")).join("");
}
function dE(L1, a1, b1, L2, a2, b2) {
  return Math.sqrt((L2 - L1) ** 2 + (a2 - a1) ** 2 + (b2 - b1) ** 2);
}
function interpDE(de) {
  if (de < 1)   return { label: "Imperceptible",           color: "#1D9E75" };
  if (de < 2)   return { label: "Perceptible par expert",  color: "#639922" };
  if (de < 3.5) return { label: "Perceptible à l'œil nu", color: "#EF9F27" };
  if (de < 5)   return { label: "Différence nette",        color: "#D85A30" };
  return         { label: "Très importante",                color: "#E24B4A" };
}
function hueName(h, C) {
  if (C < 8) return "Neutre";
  h = ((h % 360) + 360) % 360;
  if (h < 30) return "Rouge"; if (h < 60) return "Orange";
  if (h < 80) return "Jaune-orange"; if (h < 105) return "Jaune";
  if (h < 135) return "Jaune-vert"; if (h < 165) return "Vert";
  if (h < 195) return "Cyan-vert"; if (h < 225) return "Cyan";
  if (h < 255) return "Bleu"; if (h < 285) return "Bleu-violet";
  if (h < 315) return "Violet"; return "Rouge-violet";
}

const PCOLS  = ["#e74c3c","#3498db","#2ecc71","#f39c12","#9b59b6","#1abc9c","#e67e22","#e91e63"];
const PLBLS  = ["①","②","③","④","⑤","⑥","⑦","⑧"];
const SIZE   = 520;
const CX     = SIZE / 2, CY = SIZE / 2;
const ARANGE = 100; // axis always ±100

// ─── Disc canvas ─────────────────────────────────────────────────────────────
function AbDisc({ L, points, setPoints, zoom, setZoom, showColor, showGrid, Lval, coordMode, exportRef }) {
  const colRef    = useRef(null);
  const ovRef     = useRef(null);
  // drag state: { kind: "point"|"pan", idx?, startPx, startPy, startPanA, startPanB }
  const drag      = useRef(null);
  const didMove   = useRef(false);
  const lastWh    = useRef(0);
  // pan offset in LAB units (how much the view center is shifted)
  const [pan, setPan] = useState({ a: 0, b: 0 });

  const visRange = ARANGE / zoom; // LAB units visible from center to edge

  // LAB → canvas pixel  (pan shifts the origin)
  const l2p = useCallback((a, b) => ({
    x: CX + ((a - pan.a) / visRange) * (SIZE / 2),
    y: CY - ((b - pan.b) / visRange) * (SIZE / 2),
  }), [visRange, pan]);

  // canvas pixel → LAB  (pan shifts origin back)
  const p2l = useCallback((px, py) => {
    const a = ((px - CX) / (SIZE / 2)) * visRange + pan.a;
    const b = -((py - CY) / (SIZE / 2)) * visRange + pan.b;
    return [Math.round(a), Math.round(b)];
  }, [visRange, pan]);

  // pixel delta → LAB delta
  const dp2dl = useCallback((dpx, dpy) => ({
    da: (dpx / (SIZE / 2)) * visRange,
    db: -(dpy / (SIZE / 2)) * visRange,
  }), [visRange]);

  const clampPt = (a, b) => {
    const d = Math.sqrt(a * a + b * b);
    if (d > ARANGE) return [Math.round(a / d * ARANGE), Math.round(b / d * ARANGE)];
    return [Math.round(a), Math.round(b)];
  };

  // ── Color fill ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const cv = colRef.current; if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!showColor) { ctx.clearRect(0, 0, SIZE, SIZE); return; }
    const img = ctx.createImageData(SIZE, SIZE);
    const d = img.data;
    const R2 = (SIZE / 2 - 1) ** 2;
    for (let py = 0; py < SIZE; py++) {
      for (let px = 0; px < SIZE; px++) {
        const dx = px - CX, dy = py - CY;
        const idx = (py * SIZE + px) * 4;
        if (dx * dx + dy * dy <= R2) {
          // color at screen pixel = LAB coord accounting for pan
          const a = (dx / (SIZE / 2)) * visRange + pan.a;
          const b = -(dy / (SIZE / 2)) * visRange + pan.b;
          const [r, g, bv] = xyzToRgb(...labToXYZ(L, a, b));
          d[idx] = r; d[idx+1] = g; d[idx+2] = bv; d[idx+3] = 255;
        } else { d[idx+3] = 0; }
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [L, zoom, showColor, visRange, pan]);

  // ── Overlay: grid + axes + labels + points ─────────────────────────────────
  useEffect(() => {
    const cv = ovRef.current; if (!cv) return;
    const ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, SIZE, SIZE);
    const R = SIZE / 2 - 1;

    // helper: LAB value v → canvas x (for a* axis) accounting for pan
    const vToX = v => CX + ((v - pan.a) / visRange) * (SIZE / 2);
    // LAB value v → canvas y (for b* axis) accounting for pan
    const vToY = v => CY - ((v - pan.b) / visRange) * (SIZE / 2);

    // ── Grid (clipped to disc) ─────────────────────────────────────────────
    ctx.save();
    ctx.beginPath(); ctx.arc(CX, CY, R, 0, Math.PI * 2); ctx.clip();

    if (showGrid) {
      const lo  = Math.floor((pan.a - visRange) / 5) * 5 - 5;
      const hi  = Math.ceil((pan.a + visRange)  / 5) * 5 + 5;
      const loB = Math.floor((pan.b - visRange) / 5) * 5 - 5;
      const hiB = Math.ceil((pan.b + visRange)  / 5) * 5 + 5;

      for (let v = lo; v <= hi; v += 5) {
        const major = v % 10 === 0;
        const px = vToX(v);
        if (px < -10 || px > SIZE + 10) continue;
        const col_ = showColor
          ? (major ? "rgba(0,0,0,0.28)" : "rgba(0,0,0,0.09)")
          : (major ? "rgba(70,70,70,0.55)" : "rgba(120,120,120,0.2)");
        ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, SIZE);
        ctx.strokeStyle = col_; ctx.lineWidth = major ? 0.9 : 0.45; ctx.stroke();
      }
      for (let v = loB; v <= hiB; v += 5) {
        const major = v % 10 === 0;
        const py = vToY(v);
        if (py < -10 || py > SIZE + 10) continue;
        const col_ = showColor
          ? (major ? "rgba(0,0,0,0.28)" : "rgba(0,0,0,0.09)")
          : (major ? "rgba(70,70,70,0.55)" : "rgba(120,120,120,0.2)");
        ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(SIZE, py);
        ctx.strokeStyle = col_; ctx.lineWidth = major ? 0.9 : 0.45; ctx.stroke();
      }
    }

    // Main axes (zero lines) — always visible but clamped to central zone of disc
    // "central zone": axes never go closer than 15% of SIZE from the disc edge
    const axisX    = vToX(0);
    const axisY    = vToY(0);
    const NEAR     = SIZE * 0.15;   // min distance from edge
    const FAR      = SIZE * 0.85;   // max distance from edge
    const clampedX = Math.min(Math.max(axisX, NEAR), FAR);
    const clampedY = Math.min(Math.max(axisY, NEAR), FAR);
    const axisInX  = axisX >= 0 && axisX <= SIZE;
    const axisInY  = axisY >= 0 && axisY <= SIZE;

    ctx.save();
    ctx.beginPath(); ctx.arc(CX, CY, R, 0, Math.PI * 2); ctx.clip();

    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(0,0,0,0.85)";

    // Vertical axis
    ctx.beginPath();
    ctx.moveTo(axisInX ? axisX : clampedX, 0);
    ctx.lineTo(axisInX ? axisX : clampedX, SIZE);
    ctx.stroke();

    // Horizontal axis
    ctx.beginPath();
    ctx.moveTo(0,    axisInY ? axisY : clampedY);
    ctx.lineTo(SIZE, axisInY ? axisY : clampedY);
    ctx.stroke();

    // Dot at true 0,0 when in view
    if (axisInX && axisInY) {
      ctx.fillStyle = "rgba(0,0,0,0.9)";
      ctx.beginPath(); ctx.arc(axisX, axisY, 3.5, 0, Math.PI * 2); ctx.fill();
    }

    // ── Reticule at screen centre (CX, CY) — always visible ──────────────
    const RET = 14;  // half-length of reticule arms
    const GAP = 4;   // gap around centre dot
    ctx.strokeStyle = "rgba(0,0,0,0.60)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    // Horizontal arms
    ctx.beginPath(); ctx.moveTo(CX - RET, CY); ctx.lineTo(CX - GAP, CY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(CX + GAP, CY); ctx.lineTo(CX + RET, CY); ctx.stroke();
    // Vertical arms
    ctx.beginPath(); ctx.moveTo(CX, CY - RET); ctx.lineTo(CX, CY - GAP); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(CX, CY + GAP); ctx.lineTo(CX, CY + RET); ctx.stroke();
    // Small circle at reticule centre
    ctx.beginPath(); ctx.arc(CX, CY, GAP - 0.5, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(0,0,0,0.50)"; ctx.lineWidth = 1; ctx.stroke();

    ctx.restore();

    // ── Tick labels (no background — direct text with shadow for readability) ─
    if (showGrid) {
      ctx.font = "900 12px sans-serif"; // maximum weight
      ctx.textBaseline = "middle";
      const txtCol    = showColor ? "rgba(0,0,0,0.92)" : "rgba(20,20,20,0.98)";
      const shadowCol = showColor ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.5)";

      const loA  = Math.floor((pan.a - visRange) / 10) * 10;
      const hiA  = Math.ceil((pan.a + visRange)  / 10) * 10;
      const loB2 = Math.floor((pan.b - visRange) / 10) * 10;
      const hiB2 = Math.ceil((pan.b + visRange)  / 10) * 10;

      // a* labels sit just below the horizontal axis, clamped to disc
      const labelY = Math.min(Math.max(clampedY + 8, 10), SIZE - 14);
      for (let v = loA; v <= hiA; v += 10) {
        if (v === 0) continue;
        const px = vToX(v);
        if (px < 14 || px > SIZE - 14) continue;
        ctx.textAlign = "center";
        ctx.shadowColor = shadowCol; ctx.shadowBlur = 3;
        ctx.fillStyle = txtCol;
        ctx.fillText(String(v), px, labelY);
        ctx.shadowBlur = 0;
      }

      // b* labels sit just right of the vertical axis, clamped to disc
      const labelX = Math.min(Math.max(clampedX + 5, 5), SIZE - 30);
      for (let v = loB2; v <= hiB2; v += 10) {
        if (v === 0) continue;
        const py = vToY(v);
        if (py < 14 || py > SIZE - 14) continue;
        ctx.textAlign = "left";
        ctx.shadowColor = shadowCol; ctx.shadowBlur = 3;
        ctx.fillStyle = txtCol;
        ctx.fillText(String(v), labelX, py);
        ctx.shadowBlur = 0;
      }
    }

    // Axis name labels — white pill background, 4px padding, border-radius = height/2 (≈1em)
    ctx.shadowBlur = 0;
    ctx.font = "900 13px sans-serif";

    const drawAxisLabel = (text, x, y, textAlign, textBaseline, textColor) => {
      ctx.font = "900 13px sans-serif";
      ctx.textAlign = textAlign;
      ctx.textBaseline = textBaseline;
      const tw = ctx.measureText(text).width;
      const PAD = 4;
      const H = 18; // pill height
      const R = H / 2; // border-radius = 1em ≈ half height for pill

      // Compute pill rect top-left based on alignment
      let rx, ry;
      if (textAlign === "right")  rx = x - tw - PAD;
      else if (textAlign === "left") rx = x - PAD;
      else rx = x - tw / 2 - PAD; // center

      if (textBaseline === "bottom") ry = y - H;
      else if (textBaseline === "top") ry = y;
      else ry = y - H / 2;

      const rw = tw + PAD * 2;

      // White pill
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.beginPath();
      ctx.moveTo(rx + R, ry);
      ctx.lineTo(rx + rw - R, ry);
      ctx.arcTo(rx + rw, ry, rx + rw, ry + H, R);
      ctx.lineTo(rx + rw, ry + R);
      ctx.arcTo(rx + rw, ry + H, rx + rw - R, ry + H, R);
      ctx.lineTo(rx + R, ry + H);
      ctx.arcTo(rx, ry + H, rx, ry + H - R, R);
      ctx.lineTo(rx, ry + R);
      ctx.arcTo(rx, ry, rx + R, ry, R);
      ctx.closePath();
      ctx.fill();

      // Text on top
      ctx.fillStyle = textColor;
      // vertically centre text in pill
      const textY = ry + H / 2;
      const prevBaseline = ctx.textBaseline;
      ctx.textBaseline = "middle";
      ctx.fillText(text, x, textY);
      ctx.textBaseline = prevBaseline;
    };

    drawAxisLabel("+a* Rouge", SIZE - 8,  CY - 10, "right",  "bottom", "rgba(185,30,30,1)");
    drawAxisLabel("−a* Vert",  8,          CY - 10, "left",   "bottom", "rgba(20,110,20,1)");
    drawAxisLabel("+b* Jaune", CX,         8,        "center", "top",    "rgba(140,100,0,1)");
    drawAxisLabel("−b* Bleu",  CX,         SIZE - 8, "center", "bottom", "rgba(15,55,185,1)");



    // ── C*/h° cylindrical visuals ────────────────────────────────────────────
    if (coordMode === "ch") {
      // NO disc clip — circles must be fully visible outside disc boundary too
      points.forEach((p, i) => {
        if (p.a === 0 && p.b === 0) return;
        const { x: px, y: py } = l2p(p.a, p.b);

        const C    = Math.sqrt(p.a * p.a + p.b * p.b);
        const hRad = Math.atan2(p.b, p.a);
        const hDeg = ((hRad * 180 / Math.PI) + 360) % 360;

        const origX = vToX(0);
        const origY = vToY(0);

        // C* radius in canvas pixels, grows with zoom
        const cPx = (C / visRange) * (SIZE / 2);

        // ── Single solid circle at C* distance (no sub-rings) ─────────────
        if (cPx >= 3) {
          ctx.beginPath();
          ctx.arc(origX, origY, cPx, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(0,0,0,0.80)";
          ctx.lineWidth = 2;
          ctx.setLineDash([]);
          ctx.stroke();
        }

        // C* value label — at top of outermost circle, outside
        const cLblX = origX;
        const cLblY = origY - cPx - 5;
        ctx.font = "900 12px sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "bottom";
        ctx.fillStyle = "rgba(0,0,0,0.90)";
        ctx.shadowColor = "rgba(255,255,255,0.9)"; ctx.shadowBlur = 4;
        ctx.fillText(`C*=${C.toFixed(1)}`, cLblX, cLblY);
        ctx.shadowBlur = 0;

        // ── Radius line from origin to point ────────────────────────────────
        ctx.beginPath();
        ctx.moveTo(origX, origY);
        ctx.lineTo(px, py);
        ctx.strokeStyle = "rgba(0,0,0,0.55)";
        ctx.lineWidth = 1.4;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // ── Angle arc — scales with zoom, minimum useful size ───────────────
        // Base arc radius = 40px at zoom=1, grows with zoom
        const arcR = Math.max(28, Math.min(cPx * 0.55, 28 * zoom));
        // Canvas angle convention: LAB +a* = canvas right (angle 0)
        // LAB b* grows upward but canvas y grows downward → flip sign
        const canvasAngle = -hRad;

        // Reference line: 0° = +a* direction
        ctx.beginPath();
        ctx.moveTo(origX, origY);
        ctx.lineTo(origX + arcR + 10, origY);
        ctx.strokeStyle = "rgba(0,0,0,0.30)";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        // The arc itself (from 0 to h°)
        ctx.beginPath();
        ctx.moveTo(origX, origY);
        const ccw = canvasAngle < 0;
        ctx.arc(origX, origY, arcR, 0, canvasAngle, ccw);
        ctx.closePath();
        ctx.fillStyle = "rgba(0,0,0,0.07)";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(origX, origY, arcR, 0, canvasAngle, ccw);
        ctx.strokeStyle = "rgba(0,0,0,0.75)";
        ctx.lineWidth = 1.8;
        ctx.stroke();

        // h° label at midpoint of arc, pushed outward
        const midAngle = canvasAngle / 2;
        const lblDist  = arcR + 16;
        const hLblX    = origX + Math.cos(midAngle) * lblDist;
        const hLblY    = origY + Math.sin(midAngle) * lblDist;
        ctx.font = "900 12px sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillStyle = "rgba(0,0,0,0.90)";
        ctx.shadowColor = "rgba(255,255,255,0.9)"; ctx.shadowBlur = 4;
        ctx.fillText(`${Math.round(hDeg)}°`, hLblX, hLblY);
        ctx.shadowBlur = 0;
      });

    } else {
      // Cartesian mode: no extra decorations from origin
    }
    if (points.length >= 2) {
      ctx.setLineDash([5, 3]);
      for (let i = 0; i < points.length - 1; i++) {
        const pa = l2p(points[i].a, points[i].b);
        const pb = l2p(points[i + 1].a, points[i + 1].b);
        ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y);
        ctx.strokeStyle = "rgba(255,255,255,0.88)"; ctx.lineWidth = 1.5; ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // ── Points ───────────────────────────────────────────────────────────────
    points.forEach((p, i) => {
      const { x, y } = l2p(p.a, p.b);
      const hex = labToHex(p.L, p.a, p.b);
      const pc  = PCOLS[i % PCOLS.length];
      ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2);
      ctx.fillStyle = "white"; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fillStyle = hex; ctx.fill();
      ctx.strokeStyle = pc; ctx.lineWidth = 2.2; ctx.stroke();
      // Show custom name (truncated) or default label
      const lbl = p.name ? p.name.slice(0, 4) : PLBLS[i];
      const fontSize = p.name ? 8 : 10;
      ctx.font = `bold ${fontSize}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.strokeStyle = "rgba(0,0,0,0.55)"; ctx.lineWidth = 2.8;
      ctx.strokeText(lbl, x, y);
      ctx.fillStyle = "white"; ctx.fillText(lbl, x, y);
    });
  }, [L, points, zoom, showColor, showGrid, visRange, pan, l2p, coordMode]);

  // ── Input helpers ──────────────────────────────────────────────────────────
  const getPos = useCallback((e) => {
    const rect = ovRef.current.getBoundingClientRect();
    const sc = SIZE / rect.width;
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - rect.left) * sc, y: (src.clientY - rect.top) * sc };
  }, []);

  const hitTest = useCallback((px, py) => {
    for (let i = 0; i < points.length; i++) {
      const { x, y } = l2p(points[i].a, points[i].b);
      if (Math.hypot(px - x, py - y) < 14) return i;
    }
    return -1;
  }, [points, l2p]);

  const inDisc = useCallback((px, py) =>
    Math.hypot(px - CX, py - CY) <= SIZE / 2 - 2, []);

  const panRef = useRef({ a: 0, b: 0 });
  // keep panRef in sync so mousedown can read current pan without stale closure
  useEffect(() => { panRef.current = pan; }, [pan]);

  const onMouseDown = useCallback((e) => {
    didMove.current = false;
    const { x, y } = getPos(e);
    const hit = hitTest(x, y);
    if (hit >= 0) {
      drag.current = { kind: "point", idx: hit };
    } else if (inDisc(x, y)) {
      // snapshot current pan at drag start
      drag.current = { kind: "pan", startX: x, startY: y,
        basePanA: panRef.current.a, basePanB: panRef.current.b };
    }
    e.preventDefault();
  }, [getPos, hitTest, inDisc]);

  const onMouseMove = useCallback((e) => {
    if (!drag.current) return;
    didMove.current = true;
    const { x, y } = getPos(e);

    if (drag.current.kind === "point") {
      const [a, b] = p2l(x, y);
      const [ca, cb] = clampPt(a, b);
      setPoints(pts => pts.map((p, i) => i === drag.current.idx ? { ...p, a: ca, b: cb } : p));
    } else if (drag.current.kind === "pan") {
      const dpx = x - drag.current.startX;
      const dpy = y - drag.current.startY;
      const { da, db } = dp2dl(dpx, dpy);
      // pan = snapshot − pixel delta (drag right → content moves right → origin shifts left)
      setPan({ a: drag.current.basePanA - da, b: drag.current.basePanB - db });
    }
    e.preventDefault();
  }, [getPos, p2l, dp2dl, setPoints]);

  const onMouseUp = useCallback((e) => {
    const kind    = drag.current?.kind;
    const wasDrag = drag.current !== null && didMove.current;
    drag.current  = null;
    if (wasDrag) { didMove.current = false; return; }
    didMove.current = false;

    const rect = ovRef.current.getBoundingClientRect();
    const sc = SIZE / rect.width;
    const src = e.changedTouches ? e.changedTouches[0] : e;
    const px = (src.clientX - rect.left) * sc;
    const py = (src.clientY - rect.top) * sc;

    const hit = hitTest(px, py);

    if (hit >= 0) {
      if (e.button === 2 || e.shiftKey || e.ctrlKey) {
        setPoints(pts => pts.filter((_, i) => i !== hit));
      }
    } else if (inDisc(px, py) && e.button !== 2 && !e.shiftKey && !e.ctrlKey) {
      if (points.length >= 8) return;
      const [a, b] = p2l(px, py);
      const [ca, cb] = clampPt(a, b);
      setPoints(pts => [...pts, { L: Lval, a: ca, b: cb, name: "" }]);
    }
  }, [hitTest, inDisc, p2l, setPoints, points.length, Lval]);

  const onContextMenu = useCallback((e) => {
    e.preventDefault();
    const { x, y } = getPos(e);
    const hit = hitTest(x, y);
    if (hit >= 0) setPoints(pts => pts.filter((_, i) => i !== hit));
  }, [getPos, hitTest, setPoints]);

  // ── Wheel zoom ─────────────────────────────────────────────────────────────
  const onWheel = useCallback((e) => {
    e.preventDefault();
    const now = Date.now();
    if (now - lastWh.current < 40) return;
    lastWh.current = now;
    const steps = [1, 1.5, 2, 3, 4, 6, 7];
    setZoom(z => {
      const idx = steps.findIndex(s => Math.abs(s - z) < 0.01);
      const ni = Math.max(0, Math.min(steps.length - 1, idx + (e.deltaY > 0 ? -1 : 1)));
      return steps[ni];
    });
  }, [setZoom]);

  useEffect(() => {
    const el = ovRef.current; if (!el) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onWheel]);

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  // Expose export function via ref
  useEffect(() => {
    if (!exportRef) return;
    exportRef.current = () => {
      const SCALE = 2; // HD
      const W = SIZE * SCALE;
      // Info panel height
      const INFO_H = Math.max(120, points.length * 36 + 80) * SCALE;
      const TOTAL_H = W + INFO_H;

      const out = document.createElement("canvas");
      out.width  = W;
      out.height = TOTAL_H;
      const ctx = out.getContext("2d");

      // ── White background ──────────────────────────────────────────────────
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, TOTAL_H);

      // ── Disc: composite color + overlay ──────────────────────────────────
      ctx.save();
      ctx.beginPath();
      ctx.arc(W / 2, W / 2, W / 2 - 1, 0, Math.PI * 2);
      ctx.clip();
      if (colRef.current) ctx.drawImage(colRef.current, 0, 0, W, W);
      if (ovRef.current)  ctx.drawImage(ovRef.current,  0, 0, W, W);
      ctx.restore();
      // disc border
      ctx.beginPath();
      ctx.arc(W / 2, W / 2, W / 2 - 1, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(0,0,0,0.15)"; ctx.lineWidth = 2 * SCALE; ctx.stroke();

      // ── Info panel ────────────────────────────────────────────────────────
      const iY = W + 8 * SCALE; // start y of info
      ctx.fillStyle = "#f7f7f7";
      ctx.fillRect(0, W, W, INFO_H);
      ctx.strokeStyle = "rgba(0,0,0,0.08)"; ctx.lineWidth = SCALE;
      ctx.beginPath(); ctx.moveTo(0, W); ctx.lineTo(W, W); ctx.stroke();

      // Title
      ctx.font = `900 ${13 * SCALE}px sans-serif`;
      ctx.fillStyle = "#111";
      ctx.textAlign = "left"; ctx.textBaseline = "top";
      ctx.fillText(`Plan a*b* CIELAB · L*=${L} · Zoom ×${zoom} · Mode ${coordMode === "ch" ? "C*/h°" : "a*/b*"}`, 16 * SCALE, iY);

      // Points table
      const rowH = 30 * SCALE;
      let ry = iY + 22 * SCALE;
      ctx.font = `bold ${10 * SCALE}px sans-serif`;
      ctx.fillStyle = "#555";
      ctx.fillText("Pt   L*     a*     b*     C*     h°     HEX", 16 * SCALE, ry);
      ry += rowH * 0.8;

      ctx.font = `${10 * SCALE}px sans-serif`;
      points.forEach((p, i) => {
        const C   = Math.sqrt(p.a * p.a + p.b * p.b);
        const hRad = Math.atan2(p.b, p.a);
        const hDeg = ((hRad * 180 / Math.PI) + 360) % 360;
        const hex  = labToHex(p.L, p.a, p.b);
        const pc   = PCOLS[i % PCOLS.length];

        // color swatch
        ctx.fillStyle = hex;
        ctx.fillRect(16 * SCALE, ry - 2 * SCALE, 14 * SCALE, 14 * SCALE);
        ctx.strokeStyle = pc; ctx.lineWidth = 1.5 * SCALE;
        ctx.strokeRect(16 * SCALE, ry - 2 * SCALE, 14 * SCALE, 14 * SCALE);

        ctx.fillStyle = "#111";
        const txt = `${PLBLS[i]}   ${p.L}     ${Math.round(p.a)}     ${Math.round(p.b)}     ${C.toFixed(1)}     ${hDeg.toFixed(1)}°     ${hex.toUpperCase()}`;
        ctx.fillText(txt, 36 * SCALE, ry);
        ry += rowH;
      });

      // Delta E section
      if (points.length >= 2) {
        ry += 4 * SCALE;
        ctx.font = `bold ${10 * SCALE}px sans-serif`;
        ctx.fillStyle = "#555";
        ctx.fillText("Écarts ΔE*₇₆", 16 * SCALE, ry);
        ry += rowH * 0.8;
        ctx.font = `${10 * SCALE}px sans-serif`;
        for (let i = 0; i < points.length - 1; i++) {
          for (let j = i + 1; j < points.length; j++) {
            const de = dE(points[i].L, points[i].a, points[i].b, points[j].L, points[j].a, points[j].b);
            const { label } = interpDE(de);
            ctx.fillStyle = "#111";
            ctx.fillText(`${PLBLS[i]} ↔ ${PLBLS[j]}  ΔE = ${de.toFixed(2)}  (${label})`, 16 * SCALE, ry);
            ry += rowH * 0.8;
          }
        }
      }

      // Trigger download
      const a = document.createElement("a");
      a.download = `cielab_L${L}_z${zoom}.png`;
      a.href = out.toDataURL("image/png");
      a.click();
    };
  }, [points, L, zoom, coordMode, exportRef]);

  // Cursor: grab when not hovering a point
  const [cursor, setCursor] = useState("crosshair");
  const onHover = useCallback((e) => {
    const { x, y } = getPos(e);
    const hit = hitTest(x, y);
    const isPanning = drag.current?.kind === "pan";
    setCursor(isPanning ? "grabbing" : hit >= 0 ? "grab" : inDisc(x,y) ? "crosshair" : "default");
  }, [getPos, hitTest, inDisc]);

  return (
    <div style={{ position: "relative", width: "100%", maxWidth: SIZE, borderRadius: "50%",
      background: showColor ? "transparent" : "var(--color-background-secondary)", flexShrink: 0 }}>
      <canvas ref={colRef} width={SIZE} height={SIZE}
        style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", display: "block" }} />
      <canvas ref={ovRef} width={SIZE} height={SIZE}
        style={{ position: "relative", width: "100%", display: "block", cursor, background: "transparent" }}
        onMouseDown={onMouseDown}
        onMouseMove={onHover}
        onContextMenu={onContextMenu} />
      {/* Reset pan button */}
      {(pan.a !== 0 || pan.b !== 0) && (
        <button
          onClick={() => setPan({ a: 0, b: 0 })}
          style={{
            position: "absolute", bottom: "8%", left: "50%", transform: "translateX(-50%)",
            fontSize: 10, padding: "3px 10px", cursor: "pointer",
            border: "0.5px solid rgba(255,255,255,0.6)",
            background: "rgba(0,0,0,0.35)", color: "white",
            borderRadius: 20, backdropFilter: "blur(4px)", zIndex: 10,
          }}>
          ↺ Recentrer
        </button>
      )}
    </div>
  );
}

// ─── Slider ───────────────────────────────────────────────────────────────────
function Slider({ label, color, min, max, value, onChange, step = 1 }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 }}>
        <span style={{ fontSize: 11, color: color || "var(--color-text-secondary)", letterSpacing: ".02em" }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: color || "var(--color-text-primary)", fontFamily: "monospace" }}>{value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(+e.target.value)}
        style={{ width: "100%", height: 3, accentColor: color || "var(--color-text-primary)", cursor: "pointer" }} />
    </div>
  );
}

// ─── Icon toggle button ───────────────────────────────────────────────────────
function Btn({ children, active, onClick, title, accent }) {
  return (
    <button title={title} onClick={onClick} style={{
      padding: "4px 9px", cursor: "pointer", fontSize: 11, fontWeight: 600,
      border: "none", borderRadius: 6, letterSpacing: ".02em",
      background: active ? (accent || "var(--color-text-primary)") : "rgba(128,128,128,0.12)",
      color: active ? "#fff" : "var(--color-text-secondary)",
      transition: "background .15s, color .15s",
    }}>{children}</button>
  );
}

// ── Coord helpers ──────────────────────────────────────────────────────────────
function abToCH(a, b) {
  const C = Math.sqrt(a * a + b * b);
  const h = (a === 0 && b === 0) ? 0 : ((Math.atan2(b, a) * 180 / Math.PI) + 360) % 360;
  return { C: Math.round(C * 10) / 10, h: Math.round(h * 10) / 10 };
}
function chToAB(C, h) {
  const rad = h * Math.PI / 180;
  return { a: Math.round(C * Math.cos(rad)), b: Math.round(C * Math.sin(rad)) };
}

// ─── Points panel ─────────────────────────────────────────────────────────────
function PointsPanel({ points, setPoints, coordMode, setCoordMode }) {

  if (points.length === 0) return (
    <div>
      {/* coord toggle always visible even with no points */}
      <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
        {["ab","ch"].map(m => (
          <button key={m} onClick={() => setCoordMode(m)}
            style={{
              flex: 1, fontSize: 11, padding: "5px 0", cursor: "pointer", borderRadius: 7,
              border: `0.5px solid ${coordMode===m ? "var(--color-text-primary)" : "var(--color-border-secondary)"}`,
              background: coordMode===m ? "var(--color-background-secondary)" : "transparent",
              fontWeight: coordMode===m ? 500 : 400,
              color: coordMode===m ? "var(--color-text-primary)" : "var(--color-text-secondary)",
            }}>
            {m === "ab" ? "a* b*  Cartésien" : "C* h°  Cylindrique"}
          </button>
        ))}
      </div>
      <div style={{ background: "var(--color-background-secondary)", borderRadius: 12, padding: "16px", textAlign: "center", fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
        Cliquez sur le disque<br />pour ajouter un point
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* ── Mode toggle ── */}
      <div style={{ display: "flex", gap: 4 }}>
        {["ab","ch"].map(m => (
          <button key={m} onClick={() => setCoordMode(m)}
            style={{
              flex: 1, fontSize: 11, padding: "5px 0", cursor: "pointer", borderRadius: 7,
              border: `0.5px solid ${coordMode===m ? "var(--color-text-primary)" : "var(--color-border-secondary)"}`,
              background: coordMode===m ? "var(--color-background-secondary)" : "transparent",
              fontWeight: coordMode===m ? 500 : 400,
              color: coordMode===m ? "var(--color-text-primary)" : "var(--color-text-secondary)",
            }}>
            {m === "ab" ? "a* b*  Cartésien" : "C* h°  Cylindrique"}
          </button>
        ))}
      </div>

      {/* ── Coord mode description ── */}
      <div style={{ fontSize: 10, color: "var(--color-text-secondary)", lineHeight: 1.5, padding: "4px 6px",
        background: "var(--color-background-secondary)", borderRadius: 7 }}>
        {coordMode === "ab"
          ? <><b style={{ fontWeight: 600 }}>a*</b> rouge(+) ↔ vert(−) &nbsp;·&nbsp; <b style={{ fontWeight: 600 }}>b*</b> jaune(+) ↔ bleu(−)</>
          : <><b style={{ fontWeight: 600 }}>C*</b> = √(a*²+b*²) distance à l'origine = saturation &nbsp;·&nbsp; <b style={{ fontWeight: 600 }}>h°</b> = arctan(b*/a*) angle de teinte 0–360°</>}
      </div>

      {points.map((p, i) => {
        const hex = labToHex(p.L, p.a, p.b);
        const { C, h } = abToCH(p.a, p.b);
        const pc  = PCOLS[i % PCOLS.length];

        // Handlers for cylindrical mode
        const setC = (newC) => {
          const { a, b } = chToAB(newC, h);
          setPoints(pts => pts.map((pt, j) => j === i ? { ...pt, a, b } : pt));
        };
        const setH = (newH) => {
          const { a, b } = chToAB(C, newH);
          setPoints(pts => pts.map((pt, j) => j === i ? { ...pt, a, b } : pt));
        };

        return (
          <div key={i} style={{ background: "var(--color-background-primary)", border: `0.5px solid ${pc}55`, borderRadius: 10, padding: "10px 12px" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
              <div style={{ width: 26, height: 26, borderRadius: 6, background: hex, flexShrink: 0, border: `2px solid ${pc}` }} />
              <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: pc, flexShrink: 0 }}>{PLBLS[i]}</span>
                <input
                  value={p.name || ""}
                  onChange={e => setPoints(pts => pts.map((pt, j) => j === i ? { ...pt, name: e.target.value } : pt))}
                  placeholder="Nom…"
                  maxLength={12}
                  style={{
                    flex: 1, minWidth: 0, fontSize: 11, padding: "2px 6px",
                    border: `0.5px solid ${pc}44`,
                    borderRadius: 5, background: "var(--color-background-secondary)",
                    color: "var(--color-text-primary)", outline: "none",
                  }}
                />
              </div>
              <span style={{ fontSize: 10, fontFamily: "monospace", color: "var(--color-text-secondary)", flexShrink: 0 }}>{hex.toUpperCase()}</span>
              <button onClick={() => setPoints(pts => pts.filter((_, j) => j !== i))}
                style={{ fontSize: 11, padding: "2px 7px", cursor: "pointer", border: "0.5px solid var(--color-border-secondary)", background: "transparent", borderRadius: 5, color: "var(--color-text-secondary)", flexShrink: 0 }}>✕</button>
            </div>

            {/* Coord badges: always show all 5 */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 3, marginBottom: 8 }}>
              {[
                ["L*",  p.L,              "#888",    coordMode === "ab"],
                ["a*",  Math.round(p.a),  "#c0392b", coordMode === "ab"],
                ["b*",  Math.round(p.b),  "#e6ac00", coordMode === "ab"],
                ["C*",  C.toFixed(1),     "#1D9E75", coordMode === "ch"],
                ["h°",  h !== null ? h.toFixed(1)+"°" : "—", "#185FA5", coordMode === "ch"],
              ].map(([k, v, c, active]) => (
                <div key={k} style={{
                  background: active ? c + "18" : "var(--color-background-secondary)",
                  borderRadius: 5, padding: 4, textAlign: "center",
                  border: active ? `0.5px solid ${c}44` : "0.5px solid transparent",
                }}>
                  <div style={{ fontSize: 9, color: active ? c : "var(--color-text-secondary)", fontWeight: active ? 600 : 400 }}>{k}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: active ? c : "var(--color-text-secondary)" }}>{v}</div>
                </div>
              ))}
            </div>

            {/* L* slider always */}
            <Slider label="L*" color="#888" min={0} max={100} value={p.L}
              onChange={v => setPoints(pts => pts.map((pt,j) => j===i?{...pt,L:v}:pt))} />

            {/* Coord sliders: switch mode */}
            {coordMode === "ab" ? (
              <>
                <Slider label="a*  rouge(+) / vert(−)" color="#c0392b" min={-ARANGE} max={ARANGE} value={Math.round(p.a)}
                  onChange={v => setPoints(pts => pts.map((pt,j) => j===i?{...pt,a:v}:pt))} />
                <Slider label="b*  jaune(+) / bleu(−)" color="#e6ac00" min={-ARANGE} max={ARANGE} value={Math.round(p.b)}
                  onChange={v => setPoints(pts => pts.map((pt,j) => j===i?{...pt,b:v}:pt))} />
              </>
            ) : (
              <>
                <Slider label={`C*  saturation  (distance au centre = ${C.toFixed(1)})`} color="#1D9E75"
                  min={0} max={ARANGE} step={1} value={Math.round(C)}
                  onChange={setC} />
                <Slider label={`h°  angle de teinte  (${h.toFixed(1)}°)`} color="#185FA5"
                  min={0} max={359} step={1} value={Math.round(h)}
                  onChange={setH} />
                {/* Hue wheel mini preview */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                    background: `conic-gradient(
                      hsl(0,80%,55%), hsl(30,80%,55%), hsl(60,80%,55%), hsl(90,80%,55%),
                      hsl(120,80%,55%), hsl(150,80%,55%), hsl(180,80%,55%), hsl(210,80%,55%),
                      hsl(240,80%,55%), hsl(270,80%,55%), hsl(300,80%,55%), hsl(330,80%,55%), hsl(360,80%,55%))`,
                    position: "relative",
                  }}>
                    {/* needle */}
                    <div style={{
                      position: "absolute", top: "50%", left: "50%",
                      width: 12, height: 2, background: "white",
                      transformOrigin: "0 50%",
                      transform: `translateY(-50%) rotate(${h}deg)`,
                      borderRadius: 1,
                    }} />
                    <div style={{ position: "absolute", top: "50%", left: "50%", width: 4, height: 4,
                      background: "white", borderRadius: "50%", transform: "translate(-50%,-50%)" }} />
                  </div>
                  <span style={{ fontSize: 10, color: "var(--color-text-secondary)" }}>
                    {hueName(h, C)} · C*={C.toFixed(1)}
                  </span>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Delta panel ─────────────────────────────────────────────────────────────
function DeltaPanel({ points }) {
  if (points.length < 2) return (
    <div style={{ background: "var(--color-background-secondary)", borderRadius: 12, padding: "14px", fontSize: 12, color: "var(--color-text-secondary)", textAlign: "center", lineHeight: 1.6 }}>
      Ajoutez au moins<br />2 points pour calculer ΔE
    </div>
  );
  const pairs = [];
  for (let i = 0; i < points.length - 1; i++)
    for (let j = i + 1; j < points.length; j++)
      pairs.push([i, j]);

  return (
    <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, padding: "12px 14px" }}>
      <div style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 10 }}>Écarts ΔE*₇₆</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {pairs.map(([i, j]) => {
          const pa = points[i], pb = points[j];
          const de = dE(pa.L, pa.a, pa.b, pb.L, pb.a, pb.b);
          const { label, color } = interpDE(de);
          const pct = Math.min(100, (de / 20) * 100);
          return (
            <div key={`${i}-${j}`} style={{ background: "var(--color-background-secondary)", borderRadius: 9, padding: "8px 10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                <div style={{ width: 16, height: 16, borderRadius: 4, background: labToHex(pa.L,pa.a,pa.b), border: `2px solid ${PCOLS[i%8]}` }} />
                <span style={{ fontSize: 11, color: PCOLS[i%8], fontWeight: 500 }}>{points[i].name || PLBLS[i]}</span>
                <span style={{ fontSize: 10, color: "var(--color-text-secondary)" }}>↔</span>
                <div style={{ width: 16, height: 16, borderRadius: 4, background: labToHex(pb.L,pb.a,pb.b), border: `2px solid ${PCOLS[j%8]}` }} />
                <span style={{ fontSize: 11, color: PCOLS[j%8], fontWeight: 500 }}>{points[j].name || PLBLS[j]}</span>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 20, fontWeight: 500, color }}>{de.toFixed(2)}</span>
              </div>
              <div style={{ height: 4, background: "var(--color-background-primary)", borderRadius: 2, overflow: "hidden", marginBottom: 3 }}>
                <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2, transition: "width .2s" }} />
              </div>
              <div style={{ fontSize: 10, color: "var(--color-text-secondary)" }}>{label}</div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 10, fontSize: 10, color: "var(--color-text-secondary)", lineHeight: 2 }}>
        {[["< 1","Imperceptible","#1D9E75"],["1–2","Expert","#639922"],["2–3.5","Œil nu","#EF9F27"],["3.5–5","Nette","#D85A30"],["> 5","Majeure","#E24B4A"]].map(([r,l,c]) => (
          <span key={r} style={{ display: "inline-flex", alignItems: "center", gap: 4, marginRight: 8 }}>
            <span style={{ width: 7, height: 7, borderRadius: 2, background: c, display: "inline-block" }} />
            {r} {l}
          </span>
        ))}
      </div>
    </div>
  );
}


function Tabs({ tabs, active, onChange }) {
  return (
    <div style={{ display: "flex", borderBottom: "1px solid var(--color-border-tertiary)", marginBottom: 14, gap: 0 }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} style={{
          padding: "7px 16px", fontSize: 11, fontWeight: 700, border: "none", background: "transparent",
          cursor: "pointer", letterSpacing: ".06em", textTransform: "uppercase",
          color: active === t.id ? "var(--color-text-primary)" : "var(--color-text-secondary)",
          borderBottom: active === t.id ? "2.5px solid var(--color-text-primary)" : "2.5px solid transparent",
          marginBottom: -1, transition: "color .12s",
        }}>{t.label}</button>
      ))}
    </div>
  );
}

const Sep = () => <div style={{ width: 1, height: 14, background: "var(--color-border-secondary)", alignSelf: "center", flexShrink: 0 }} />;

function Btn({ children, active, onClick, title, accent }) {
  return (
    <button title={title} onClick={onClick} style={{
      padding: "4px 8px", cursor: "pointer", fontSize: 10, fontWeight: 700,
      border: "none", borderRadius: 5, letterSpacing: ".04em", whiteSpace: "nowrap",
      background: active ? (accent || "var(--color-text-primary)") : "rgba(128,128,128,0.12)",
      color: active ? "#fff" : "var(--color-text-secondary)",
      transition: "background .15s, color .15s",
    }}>{children}</button>
  );
}

const CoordPill = ({ coordMode, setCoordMode }) => (
  <div style={{
    display: "flex", flexDirection: "column", gap: 3,
    background: "var(--color-background-secondary)",
    borderRadius: 9, padding: 4,
    border: "0.5px solid var(--color-border-tertiary)",
    alignSelf: "flex-start", marginTop: 30,
  }}>
    {[["ab","a*b*"],["ch","C*h°"]].map(([m, lbl]) => (
      <button key={m} onClick={() => setCoordMode(m)} style={{
        padding: "8px 6px", fontSize: 9, fontWeight: 800, cursor: "pointer",
        borderRadius: 6, border: "none", letterSpacing: ".06em",
        background: coordMode === m ? "var(--color-text-primary)" : "transparent",
        color: coordMode === m ? "var(--color-background-primary)" : "var(--color-text-secondary)",
        transition: "background .15s, color .15s",
        writingMode: "vertical-rl", textOrientation: "mixed", transform: "rotate(180deg)",
        minHeight: 50, minWidth: 22,
      }}>{lbl}</button>
    ))}
  </div>
);

export default function CIELABExplorer() {
  const [tab,       setTab]       = useState("main");
  const [Lval,      setLval]      = useState(60);
  const [zoom,      setZoom]      = useState(1);
  const [showPanel, setShowPanel] = useState(true);
  const [showColor, setShowColor] = useState(true);
  const [showGrid,  setShowGrid]  = useState(true);
  const [coordMode, setCoordMode] = useState("ab");
  const [points,    setPoints]    = useState([
    { L: 60, a: 40, b: 15, name: "" },
    { L: 60, a: -28, b: 40, name: "" },
  ]);
  const exportRef = useRef(null);

  const ZOOM_STEPS = [1, 1.5, 2, 3, 4, 6, 7];
  const zoomIdx = ZOOM_STEPS.findIndex(s => Math.abs(s - zoom) < 0.01);
  const handleLval = (v) => { setLval(v); setPoints(pts => pts.map(p => ({ ...p, L: v }))); };

  const disc = (
    <AbDisc L={Lval} points={points} setPoints={setPoints}
      zoom={zoom} setZoom={setZoom}
      showColor={showColor} showGrid={showGrid} Lval={Lval}
      coordMode={coordMode} exportRef={exportRef} />
  );

  const toolbar = (
    <div style={{
      display: "flex", flexWrap: "wrap", alignItems: "center", gap: 5,
      padding: "5px 10px", marginBottom: 10,
      background: "var(--color-background-secondary)", borderRadius: 9,
    }}>
      <span style={{ fontSize: 9, fontWeight: 800, color: "var(--color-text-secondary)", letterSpacing: ".05em" }}>L*</span>
      <input type="range" min={10} max={95} value={Lval} onChange={e => handleLval(+e.target.value)}
        style={{ width: 72, accentColor: "#777", cursor: "pointer" }} />
      <span style={{ fontSize: 11, fontWeight: 700, minWidth: 18, fontFamily: "monospace" }}>{Lval}</span>
      <Sep />
      <span style={{ fontSize: 9, fontWeight: 800, color: "var(--color-text-secondary)", letterSpacing: ".05em" }}>ZOOM</span>
      <button onClick={() => setZoom(ZOOM_STEPS[Math.max(0, zoomIdx - 1)])} disabled={zoomIdx === 0}
        style={{ width: 19, height: 19, border: "1px solid var(--color-border-secondary)", background: "var(--color-background-primary)", borderRadius: 4, cursor: zoomIdx === 0 ? "default" : "pointer", fontSize: 13, lineHeight: "17px", opacity: zoomIdx === 0 ? 0.3 : 1, padding: 0 }}>−</button>
      <span style={{ fontSize: 11, fontWeight: 700, minWidth: 28, textAlign: "center", fontFamily: "monospace" }}>×{zoom}</span>
      <button onClick={() => setZoom(ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, zoomIdx + 1)])} disabled={zoomIdx === ZOOM_STEPS.length - 1}
        style={{ width: 19, height: 19, border: "1px solid var(--color-border-secondary)", background: "var(--color-background-primary)", borderRadius: 4, cursor: zoomIdx === ZOOM_STEPS.length - 1 ? "default" : "pointer", fontSize: 13, lineHeight: "17px", opacity: zoomIdx === ZOOM_STEPS.length - 1 ? 0.3 : 1, padding: 0 }}>+</button>
      {zoom !== 1 && <Btn active={false} onClick={() => setZoom(1)} title="Réinitialiser zoom">×1</Btn>}
      <Sep />
      <Btn active={showColor}  onClick={() => setShowColor(v => !v)}  title={showColor ? "Désactiver couleur" : "Activer couleur"}   accent="#b03020">CLR</Btn>
      <Btn active={showGrid}   onClick={() => setShowGrid(v => !v)}   title={showGrid ? "Masquer grille" : "Afficher grille"}         accent="#185FA5">GRID</Btn>
      <Btn active={!showPanel} onClick={() => setShowPanel(v => !v)}  title={showPanel ? "Masquer panneau" : "Afficher panneau"}      accent="#534AB7">{showPanel ? "⟩⟩" : "⟨⟨"}</Btn>
      <Sep />
      <span style={{ fontSize: 9, color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>
        Clic ajouter · Clic droit retirer
      </span>
      <div style={{ marginLeft: "auto" }}>
        <button onClick={() => exportRef.current && exportRef.current()}
          style={{
            fontSize: 9, fontWeight: 800, padding: "4px 10px", cursor: "pointer",
            border: "1px solid var(--color-border-secondary)", background: "var(--color-background-primary)",
            borderRadius: 5, letterSpacing: ".06em", display: "flex", alignItems: "center", gap: 4,
          }}>↓ PNG</button>
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: "var(--font-sans)", padding: "1rem 0", maxWidth: 1200 }}>
      <Tabs
        tabs={[{ id: "main", label: "Plan a*b* · ΔE" }, { id: "explorer", label: "Explorateur" }, { id: "theory", label: "Théorie" }]}
        active={tab} onChange={setTab}
      />

      {tab === "main" && (
        <div>
          {toolbar}
          {showPanel ? (
            <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr) minmax(0,272px) minmax(0,252px)", gap: 10, alignItems: "start" }}>
              <CoordPill coordMode={coordMode} setCoordMode={setCoordMode} />
              <div>{disc}</div>
              <div style={{ overflowY: "auto", maxHeight: 640 }}>
                <PointsPanel points={points} setPoints={setPoints} coordMode={coordMode} setCoordMode={setCoordMode} />
              </div>
              <DeltaPanel points={points} />
            </div>
          ) : (
            <div style={{ display: "flex", gap: 10, justifyContent: "center", alignItems: "flex-start" }}>
              <CoordPill coordMode={coordMode} setCoordMode={setCoordMode} />
              <div style={{ maxWidth: 580, flex: 1 }}>
                {disc}
                {points.length === 1 ? (
                  <div style={{ marginTop: 10, background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 11, padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 42, height: 42, borderRadius: 8, background: labToHex(points[0].L, points[0].a, points[0].b), border: `2px solid ${PCOLS[0]}`, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: PCOLS[0], marginBottom: 5 }}>
                          {points[0].name || PLBLS[0]}
                          <span style={{ fontSize: 9, fontFamily: "monospace", color: "var(--color-text-secondary)", marginLeft: 8, fontWeight: 400 }}>{labToHex(points[0].L, points[0].a, points[0].b).toUpperCase()}</span>
                        </div>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {[["L*", points[0].L, "#888"],["a*", Math.round(points[0].a), "#c0392b"],["b*", Math.round(points[0].b), "#e6ac00"],
                            ["C*", Math.sqrt(points[0].a**2+points[0].b**2).toFixed(1), "#1D9E75"],
                            ["h°", (((Math.atan2(points[0].b,points[0].a)*180/Math.PI)+360)%360).toFixed(1)+"°", "#185FA5"]
                          ].map(([k,v,c]) => (
                            <div key={k} style={{ background: "var(--color-background-secondary)", borderRadius: 5, padding: "2px 7px", fontSize: 10 }}>
                              <span style={{ color: "var(--color-text-secondary)", marginRight: 2 }}>{k}</span>
                              <span style={{ fontWeight: 700, color: c, fontFamily: "monospace" }}>{v}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : points.length >= 2 ? (
                  <div style={{ marginTop: 10 }}><DeltaPanel points={points} /></div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "explorer" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 11, padding: 14 }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: "var(--color-text-secondary)", letterSpacing: ".07em", textTransform: "uppercase", marginBottom: 12 }}>Point ① courant</div>
            {points.length > 0 ? <>
              <div style={{ height: 60, borderRadius: 7, background: labToHex(points[0].L, points[0].a, points[0].b), marginBottom: 10, border: "0.5px solid rgba(0,0,0,0.07)" }} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 5, marginBottom: 10 }}>
                {[["L*",points[0].L,"#888"],["a*",Math.round(points[0].a),"#c0392b"],["b*",Math.round(points[0].b),"#e6ac00"],
                  ["C*",Math.sqrt(points[0].a**2+points[0].b**2).toFixed(1),"#1D9E75"],
                  ["h°",(((Math.atan2(points[0].b,points[0].a)*180/Math.PI)+360)%360).toFixed(1)+"°","#185FA5"],
                  ["HEX",labToHex(points[0].L,points[0].a,points[0].b).toUpperCase(),"#888"]
                ].map(([k,v,c]) => (
                  <div key={k} style={{ background: "var(--color-background-secondary)", borderRadius: 6, padding: "5px 3px", textAlign: "center" }}>
                    <div style={{ fontSize: 8, color: "var(--color-text-secondary)", marginBottom: 2, letterSpacing: ".04em" }}>{k}</div>
                    <div style={{ fontSize: k==="HEX"?7:12, fontWeight: 700, fontFamily: "monospace", color: c }}>{v}</div>
                  </div>
                ))}
              </div>
            </> : <div style={{ textAlign: "center", fontSize: 11, color: "var(--color-text-secondary)", padding: "16px 0" }}>Ajoutez un point depuis Plan a*b*</div>}
          </div>
          <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 11, padding: 14 }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: "var(--color-text-secondary)", letterSpacing: ".07em", textTransform: "uppercase", marginBottom: 12 }}>Contrôles (point ①)</div>
            {points.length > 0 ? <>
              <Slider label="L*" color="#888" min={0} max={100} value={points[0].L}
                onChange={v => setPoints(pts => pts.map((p,i) => i===0?{...p,L:v}:p))} />
              <Slider label="a*  rouge(+) / vert(−)" color="#c0392b" min={-ARANGE} max={ARANGE} value={Math.round(points[0].a)}
                onChange={v => setPoints(pts => pts.map((p,i) => i===0?{...p,a:v}:p))} />
              <Slider label="b*  jaune(+) / bleu(−)" color="#e6ac00" min={-ARANGE} max={ARANGE} value={Math.round(points[0].b)}
                onChange={v => setPoints(pts => pts.map((p,i) => i===0?{...p,b:v}:p))} />
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 9, fontWeight: 800, color: "var(--color-text-secondary)", letterSpacing: ".07em", textTransform: "uppercase", marginBottom: 7 }}>Préréglages</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {[["Rouge vif",50,72,38],["Vert herbe",72,-45,51],["Bleu nuit",32,15,-50],
                    ["Jaune soleil",85,-5,80],["Rouge profond",27,50,36],["Neutre",50,0,0]].map(([name,L,a,b]) => (
                    <button key={name} onClick={() => setPoints(pts => pts.map((p,i) => i===0?{...p,L,a,b}:p))}
                      style={{ fontSize: 10, padding: "3px 8px", cursor: "pointer", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-secondary)", borderRadius: 5, display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: labToHex(L,a,b), flexShrink: 0 }} />{name}
                    </button>
                  ))}
                </div>
              </div>
            </> : null}
          </div>
        </div>
      )}

      {tab === "theory" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 11, padding: 14 }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: "var(--color-text-secondary)", letterSpacing: ".07em", textTransform: "uppercase", marginBottom: 12 }}>Historique CIELAB</div>
            {[["1931 — CIE XYZ","Premières valeurs tristimulus standardisées. Précis mais sans corrélation perceptive."],
              ["1905–1942 — Munsell & MacAdam","Atlas perceptif + ellipses MacAdam : non-uniformité visuelle de CIE31."],
              ["1976 — CIELAB","Transformation non-linéaire de XYZ. ΔE ≈ écart visuel perçu."]].map(([t,d]) => (
              <div key={t} style={{ padding: "8px 10px", background: "var(--color-background-secondary)", borderRadius: 6, marginBottom: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 2 }}>{t}</div>
                <div style={{ fontSize: 10, color: "var(--color-text-secondary)", lineHeight: 1.6 }}>{d}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 11, padding: 14 }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: "var(--color-text-secondary)", letterSpacing: ".07em", textTransform: "uppercase", marginBottom: 10 }}>Transformation XYZ → L*a*b*</div>
              <div style={{ fontFamily: "monospace", fontSize: 10, background: "var(--color-background-secondary)", padding: "9px 11px", borderRadius: 6, lineHeight: 2 }}>
                f(t) = t^(1/3) si t {">"} 0.008856<br />
                f(t) = 7.787·t + 16/116 sinon<br /><br />
                <span style={{ color: "#888" }}>L* = 116·f(Y/Yn) − 16</span><br />
                <span style={{ color: "#c0392b" }}>a* = 500·[f(X/Xn) − f(Y/Yn)]</span><br />
                <span style={{ color: "#e6ac00" }}>b* = 200·[f(Y/Yn) − f(Z/Zn)]</span>
              </div>
              <div style={{ marginTop: 7, fontSize: 10, color: "var(--color-text-secondary)" }}>D65/2° : Xn=95.04 · Yn=100 · Zn=108.88</div>
            </div>
            <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 11, padding: 14 }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: "var(--color-text-secondary)", letterSpacing: ".07em", textTransform: "uppercase", marginBottom: 10 }}>Formules clés</div>
              <div style={{ fontFamily: "monospace", fontSize: 10, background: "var(--color-background-secondary)", padding: "9px 11px", borderRadius: 6, lineHeight: 2 }}>
                <span style={{ color: "#1D9E75" }}>C* = √(a*² + b*²)  → saturation</span><br />
                <span style={{ color: "#185FA5" }}>h  = arctan(b*/a*) → teinte (0–360°)</span><br />
                <span style={{ color: "#E24B4A" }}>ΔE = √(ΔL*² + Δa*² + Δb*²)</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
