import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";

const SPECTRUM_LOCUS = [
  { nm: 380, x: 0.1741, y: 0.0050 },
  { nm: 390, x: 0.1740, y: 0.0042 },
  { nm: 400, x: 0.1733, y: 0.0048 },
  { nm: 410, x: 0.1726, y: 0.0069 },
  { nm: 420, x: 0.1714, y: 0.0119 },
  { nm: 430, x: 0.1689, y: 0.0208 },
  { nm: 440, x: 0.1644, y: 0.0109 },
  { nm: 450, x: 0.1566, y: 0.0177 },
  { nm: 460, x: 0.1440, y: 0.0297 },
  { nm: 470, x: 0.1241, y: 0.0578 },
  { nm: 475, x: 0.1096, y: 0.0868 },
  { nm: 480, x: 0.0913, y: 0.1327 },
  { nm: 485, x: 0.0687, y: 0.2007 },
  { nm: 490, x: 0.0454, y: 0.2950 },
  { nm: 495, x: 0.0235, y: 0.4127 },
  { nm: 500, x: 0.0082, y: 0.5384 },
  { nm: 505, x: 0.0039, y: 0.6548 },
  { nm: 510, x: 0.0139, y: 0.7502 },
  { nm: 515, x: 0.0389, y: 0.7955 },
  { nm: 520, x: 0.0743, y: 0.8338 },
  { nm: 530, x: 0.1547, y: 0.8059 },
  { nm: 540, x: 0.2296, y: 0.7543 },
  { nm: 550, x: 0.3016, y: 0.6923 },
  { nm: 560, x: 0.3731, y: 0.6245 },
  { nm: 570, x: 0.4441, y: 0.5547 },
  { nm: 580, x: 0.5125, y: 0.4866 },
  { nm: 590, x: 0.5752, y: 0.4242 },
  { nm: 600, x: 0.6270, y: 0.3725 },
  { nm: 610, x: 0.6658, y: 0.3340 },
  { nm: 620, x: 0.6915, y: 0.3083 },
  { nm: 630, x: 0.7006, y: 0.2993 },
  { nm: 640, x: 0.7170, y: 0.2830 },
  { nm: 650, x: 0.7260, y: 0.2740 },
  { nm: 660, x: 0.7300, y: 0.2700 },
  { nm: 670, x: 0.7347, y: 0.2653 },
  { nm: 700, x: 0.7347, y: 0.2653 },
  { nm: 780, x: 0.7347, y: 0.2653 },
];


const ILLUMINANTS = {
  D65: { x: 0.3127, y: 0.3290, label: "D65 (Lumière du jour)" },
  A:   { x: 0.4476, y: 0.4074, label: "A (Lampe incandescente)" },
  C:   { x: 0.3101, y: 0.3162, label: "C (Lumière naturelle moyenne)" },
  E:   { x: 0.3333, y: 0.3333, label: "E (Blanc égal)" },
};

const PRIMARY_SETS = {
  sRGB: {
    r: { x: 0.6400, y: 0.3300 }, g: { x: 0.3000, y: 0.6000 }, b: { x: 0.1500, y: 0.0600 },
    label: "sRGB / HDTV"
  },
  AdobeRGB: {
    r: { x: 0.6400, y: 0.3300 }, g: { x: 0.2100, y: 0.7100 }, b: { x: 0.1500, y: 0.0600 },
    label: "Adobe RGB"
  },
  DCI_P3: {
    r: { x: 0.6800, y: 0.3200 }, g: { x: 0.2650, y: 0.6900 }, b: { x: 0.1500, y: 0.0600 },
    label: "DCI-P3 (Cinéma)"
  },
};

function nmToRGB(nm) {
  let r = 0, g = 0, b = 0;
  if (nm >= 380 && nm < 440) { r = -(nm - 440) / 60; b = 1; }
  else if (nm >= 440 && nm < 490) { g = (nm - 440) / 50; b = 1; }
  else if (nm >= 490 && nm < 510) { g = 1; b = -(nm - 510) / 20; }
  else if (nm >= 510 && nm < 580) { r = (nm - 510) / 70; g = 1; }
  else if (nm >= 580 && nm < 645) { r = 1; g = -(nm - 645) / 65; }
  else if (nm >= 645 && nm <= 780) { r = 1; }
  let factor = 1;
  if (nm >= 380 && nm < 420) factor = 0.3 + 0.7 * (nm - 380) / 40;
  else if (nm > 700 && nm <= 780) factor = 0.3 + 0.7 * (780 - nm) / 80;
  r = Math.round(Math.pow(Math.max(r * factor, 0), 0.8) * 255);
  g = Math.round(Math.pow(Math.max(g * factor, 0), 0.8) * 255);
  b = Math.round(Math.pow(Math.max(b * factor, 0), 0.8) * 255);
  return `rgb(${r},${g},${b})`;
}

const W = 620, H = 620;
const PAD = { l: 44, r: 24, t: 24, b: 44 };
const PW = W - PAD.l - PAD.r;
const PH = H - PAD.t - PAD.b;

function toC(x, y) {
  const cx = PAD.l + x * PW / 0.85;
  const cy = PAD.t + (1 - y / 0.85) * PH;
  return [cx, cy];
}

const ChromaticityDiagram = forwardRef(function ChromaticityDiagram({ illuminant, onHover, userPoints = [], onAddPoint, onMovePoint }, ref) {
  const canvasRef = useRef(null);
  const [hovered, setHovered] = useState(null);
  useImperativeHandle(ref, () => ({ getCanvas: () => canvasRef.current }));
  // Viewport in chromaticity coords: [xMin, yMin, xMax, yMax]
  const [view, setView] = useState([0, 0, 0.85, 0.85]);
  const viewRef = useRef([0, 0, 0.85, 0.85]);
  const [mode, setMode] = useState("point"); // "point" | "pan"
  const modeRef = useRef("point");
  const switchMode = (m) => { modeRef.current = m; setMode(m); };
  const panStartRef = useRef(null);
  const dragPointRef = useRef(null); // { id } of point being dragged in "move" mode

  // Convert chromaticity (x,y) → canvas pixel using current view
  const toCv = useCallback((x, y, v) => {
    const [x0, y0, x1, y1] = v;
    const cx = PAD.l + (x - x0) / (x1 - x0) * (W - PAD.l - PAD.r);
    const cy = PAD.t + (1 - (y - y0) / (y1 - y0)) * (H - PAD.t - PAD.b);
    return [cx, cy];
  }, []);

  const draw = useCallback((v) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, W, H);
    const [vx0, vy0, vx1, vy1] = v;
    // Local toCanvas using current viewport
    const toC = (x, y) => {
      const cx = PAD.l + (x - vx0) / (vx1 - vx0) * (W - PAD.l - PAD.r);
      const cy = PAD.t + (1 - (y - vy0) / (vy1 - vy0)) * (H - PAD.t - PAD.b);
      return [cx, cy];
    };

    // Build spectrum locus path
    const locusPath = new Path2D();
    SPECTRUM_LOCUS.forEach(({ x, y }, i) => {
      const [cx, cy] = toC(x, y);
      i === 0 ? locusPath.moveTo(cx, cy) : locusPath.lineTo(cx, cy);
    });
    locusPath.closePath();

    // Render into offscreen canvas first (putImageData ignores clip regions)
    const off = document.createElement("canvas");
    off.width = W; off.height = H;
    const octx = off.getContext("2d");
    const imgData = octx.createImageData(W, H);
    const pdata = imgData.data;
    const gam = (v) => {
      const c = Math.max(0, Math.min(1, v));
      return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1/2.4) - 0.055;
    };
    const drawW = W - PAD.l - PAD.r, drawH = H - PAD.t - PAD.b;
    for (let py = 0; py < H; py++) {
      for (let px = 0; px < W; px++) {
        const chrx = vx0 + (px - PAD.l) / drawW * (vx1 - vx0);
        const chry = vy0 + (1 - (py - PAD.t) / drawH) * (vy1 - vy0);
        if (chrx < 0 || chry < 0.001 || chrx + chry > 1) continue;
        const X = chrx / chry;
        const Z = (1 - chrx - chry) / chry;
        let r =  3.2406 * X - 1.5372 - 0.4986 * Z;
        let g = -0.9689 * X + 1.8758 + 0.0415 * Z;
        let b2 = 0.0557 * X - 0.2040 + 1.0570 * Z;
        const mx = Math.max(r, g, b2, 0.001);
        r /= mx; g /= mx; b2 /= mx;
        const ii = (py * W + px) * 4;
        pdata[ii]   = Math.round(gam(r) * 255);
        pdata[ii+1] = Math.round(gam(g) * 255);
        pdata[ii+2] = Math.round(gam(b2) * 255);
        pdata[ii+3] = 255;
      }
    }
    octx.putImageData(imgData, 0, 0);

    // Now clip to locus and draw offscreen onto main canvas
    ctx.save();
    ctx.clip(locusPath);
    ctx.drawImage(off, 0, 0);
    ctx.restore();

    // Draw grid OVER the colors so it's always visible
    ctx.lineWidth = 0.5;
    for (let v = 0; v <= 0.85; v += 0.05) {
      const isMajor = Math.round(v * 100) % 10 === 0;
      ctx.setLineDash(isMajor ? [] : [4, 4]);
      ctx.strokeStyle = isMajor ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0.18)";
      const [x0, y0] = toC(0, v);
      const [x1] = toC(0.85, v);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); ctx.stroke();
      const [ax, ay] = toC(v, 0);
      const [, ay1] = toC(v, 0.85);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax, ay1); ctx.stroke();
    }
    ctx.setLineDash([]);

    // Stroke the locus outline
    ctx.beginPath();
    SPECTRUM_LOCUS.forEach(({ x, y }, i) => {
      const [cx, cy] = toC(x, y);
      i === 0 ? ctx.moveTo(cx, cy) : ctx.lineTo(cx, cy);
    });
    ctx.closePath();
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    if (illuminant && ILLUMINANTS[illuminant]) {
      const ill = ILLUMINANTS[illuminant];
      const [cx, cy] = toC(ill.x, ill.y);
      ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(30,30,30,0.9)"; ctx.fill();
      ctx.strokeStyle = "white"; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.font = "bold 11px sans-serif";
      ctx.fillStyle = "rgba(30,30,30,0.9)";
      ctx.fillText(illuminant, cx + 9, cy - 4);
    }

    userPoints.forEach((pt, idx) => {
      const [cx, cy] = toC(pt.x, pt.y);
      // Draw saturation line if active
      if (pt.showSat && illuminant && ILLUMINANTS[illuminant]) {
        const ill = ILLUMINANTS[illuminant];
        const [ix, iy] = toC(ill.x, ill.y);
        // Find intersection of ray from illuminant through pt with spectrum locus
        const dx = pt.x - ill.x, dy = pt.y - ill.y;
        let bestT = Infinity, bx = pt.x, by = pt.y;
        const locus = SPECTRUM_LOCUS;
        for (let k = 0; k < locus.length - 1; k++) {
          const ax = locus[k].x, ay = locus[k].y;
          const bx2 = locus[k+1].x, by2 = locus[k+1].y;
          const ex = bx2 - ax, ey = by2 - ay;
          const denom = dx * ey - dy * ex;
          if (Math.abs(denom) < 1e-10) continue;
          const t = ((ax - ill.x) * ey - (ay - ill.y) * ex) / denom;
          const s = ((ax - ill.x) * dy - (ay - ill.y) * dx) / denom;
          if (t > 0.001 && s >= 0 && s <= 1 && t < bestT) { bestT = t; bx = ill.x + t * dx; by = ill.y + t * dy; }
        }
        // Also check closing line (locus[last] -> locus[0])
        {
          const ax = locus[locus.length-1].x, ay = locus[locus.length-1].y;
          const bx2 = locus[0].x, by2 = locus[0].y;
          const ex = bx2 - ax, ey = by2 - ay;
          const denom = dx * ey - dy * ex;
          if (Math.abs(denom) > 1e-10) {
            const t = ((ax - ill.x) * ey - (ay - ill.y) * ex) / denom;
            const s = ((ax - ill.x) * dy - (ay - ill.y) * dx) / denom;
            if (t > 0.001 && s >= 0 && s <= 1 && t < bestT) { bestT = t; bx = ill.x + t * dx; by = ill.y + t * dy; }
          }
        }
        const [ex2, ey2] = toC(bx, by);
        ctx.beginPath(); ctx.moveTo(ix, iy); ctx.lineTo(ex2, ey2);
        ctx.strokeStyle = "rgba(20,20,20,0.55)"; ctx.lineWidth = 1; ctx.setLineDash([4,3]); ctx.stroke();
        ctx.setLineDash([]);
        // Dot at locus intersection
        ctx.beginPath(); ctx.arc(ex2, ey2, 4, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(20,20,20,0.7)"; ctx.fill();
      }
      // Circle (empty — no number inside)
      ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(20,20,20,0.85)"; ctx.fill();
      ctx.strokeStyle = "white"; ctx.lineWidth = 1.5; ctx.stroke();
      // Label outside (name or #i)
      const label = pt.name ? pt.name : ("#" + (idx + 1));
      ctx.font = "bold 11px sans-serif";
      ctx.fillStyle = "rgba(20,20,20,0.9)";
      ctx.textAlign = "center"; ctx.textBaseline = "bottom";
      ctx.fillText(label, cx, cy - 9);
      ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    });



    if (hovered) {
      const [cx, cy] = toC(hovered.x, hovered.y);
      ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.fill();
    }

    ctx.fillStyle = "rgba(30,30,30,0.9)";
    ctx.font = "bold 11px sans-serif";
    for (let v = 0; v <= 0.8; v += 0.1) {
      const [x0, y0] = toC(0, v);
      ctx.fillText(v.toFixed(1), x0 - 34, y0 + 4);
      const [ax, ay] = toC(v, 0);
      ctx.fillText(v.toFixed(1), ax - 8, ay + 16);
    }
    ctx.fillStyle = "rgba(30,30,30,0.9)";
    ctx.font = "bold 13px sans-serif";
    ctx.fillText("x", W / 2, H - 4);
    ctx.save(); ctx.translate(12, H / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText("y", 0, 0); ctx.restore();

    // Wavelength tick marks and labels every 10nm
    const LABEL_NMS = new Set([
      380, 430, 460, 470,
      480, 485, 490, 495, 500, 505, 510, 515, 520,
      530, 540, 550, 560, 570, 580, 590, 600, 610, 620, 630, 640, 650, 660, 670, 700
    ]);
    const labeled = SPECTRUM_LOCUS.filter(p => LABEL_NMS.has(p.nm));
    labeled.forEach(({ nm, x, y }, i) => {
      const [cx, cy] = toC(x, y);
      // Compute outward normal from locus by looking at neighbors
      const prev = labeled[i - 1] || labeled[i];
      const next = labeled[i + 1] || labeled[i];
      const [px2, py2] = toC(prev.x, prev.y);
      const [nx2, ny2] = toC(next.x, next.y);
      const dx = nx2 - px2, dy = ny2 - py2;
      const len = Math.sqrt(dx*dx + dy*dy) || 1;
      // outward normal (perpendicular, pointing away from locus interior)
      let nx = dy / len, ny = -dx / len;
      // flip if pointing inward (toward center ~0.33,0.33)
      const [ccx, ccy] = toC(0.33, 0.33);
      if ((cx + nx * 10 - ccx) * (cx - ccx) + (cy + ny * 10 - ccy) * (cy - ccy) < 0) {
        nx = -nx; ny = -ny;
      }
      // tick mark
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + nx * 6, cy + ny * 6);
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.lineWidth = 1;
      ctx.stroke();
      // label
      ctx.font = "bold 9.5px sans-serif";
      ctx.fillStyle = "rgba(10,10,10,0.9)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(nm, cx + nx * 16, cy + ny * 16);
    });
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";


  }, [illuminant, hovered, userPoints, toCv]);

  useEffect(() => { draw(viewRef.current); }, [draw]);

  const getXY = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const scale = W / rect.width;
    const cpx = (e.clientX - rect.left) * scale;
    const cpy = (e.clientY - rect.top) * scale;
    const [vx0, vy0, vx1, vy1] = viewRef.current;
    const drawW = W - PAD.l - PAD.r, drawH = H - PAD.t - PAD.b;
    const x = vx0 + (cpx - PAD.l) / drawW * (vx1 - vx0);
    const y = vy0 + (1 - (cpy - PAD.t) / drawH) * (vy1 - vy0);
    return { x: +x.toFixed(4), y: +y.toFixed(4), valid: x >= 0 && x <= 0.85 && y >= 0 && y <= 0.85 };
  };

  const handleMouseMove = (e) => {
    if (modeRef.current === "pan" && panStartRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const scale = W / rect.width;
      const cpx = (e.clientX - rect.left) * scale;
      const cpy = (e.clientY - rect.top) * scale;
      const [vx0, vy0, vx1, vy1] = viewRef.current;
      const drawW = W - PAD.l - PAD.r, drawH = H - PAD.t - PAD.b;
      const dx = -(cpx - panStartRef.current.cpx) / drawW * (vx1 - vx0);
      const dy =  (cpy - panStartRef.current.cpy) / drawH * (vy1 - vy0);
      const nv = [panStartRef.current.vx0 + dx, panStartRef.current.vy0 + dy,
                  panStartRef.current.vx1 + dx, panStartRef.current.vy1 + dy];
      viewRef.current = nv;
      setView(nv);
      draw(nv);
      return;
    }
    if (modeRef.current === "move" && dragPointRef.current) {
      const { x, y, valid } = getXY(e);
      if (valid) {
        onMovePoint && onMovePoint(dragPointRef.current, x, y);
      }
      return;
    }
    const { x, y, valid } = getXY(e);
    if (valid) { setHovered({ x, y }); onHover && onHover({ x, y }); }
    else { setHovered(null); onHover && onHover(null); }
  };

  const handleMouseDown = (e) => {
    if (modeRef.current === "pan") {
      const rect = canvasRef.current.getBoundingClientRect();
      const scale = W / rect.width;
      const [vx0, vy0, vx1, vy1] = viewRef.current;
      panStartRef.current = {
        cpx: (e.clientX - rect.left) * scale,
        cpy: (e.clientY - rect.top) * scale,
        vx0, vy0, vx1, vy1
      };
      return;
    }
    if (modeRef.current === "move") {
      // Find which user point (if any) is near the click
      const { x, y } = getXY(e);
      if (!userPoints || userPoints.length === 0) return;
      const [vx0,,vx1,] = viewRef.current;
      const viewSpan = vx1 - vx0;
      const threshold = viewSpan * 0.025; // ~2.5% of viewport width
      let closest = null, bestD = Infinity;
      userPoints.forEach(pt => {
        const d = Math.sqrt((pt.x - x) ** 2 + (pt.y - y) ** 2);
        if (d < threshold && d < bestD) { bestD = d; closest = pt.id; }
      });
      if (closest) dragPointRef.current = closest;
    }
  };

  const handleMouseUp = () => {
    panStartRef.current = null;
    dragPointRef.current = null;
  };

  const handleClick = (e) => {
    if (modeRef.current === "pan" || modeRef.current === "move") return;
    const { x, y, valid } = getXY(e);
    if (valid) onAddPoint && onAddPoint({ x, y });
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const scale = W / rect.width;
    const cpx = (e.clientX - rect.left) * scale;
    const cpy = (e.clientY - rect.top) * scale;
    const [vx0, vy0, vx1, vy1] = viewRef.current;
    const drawW = W - PAD.l - PAD.r, drawH = H - PAD.t - PAD.b;
    // Mouse position in chromaticity coords
    const mx = vx0 + (cpx - PAD.l) / drawW * (vx1 - vx0);
    const my = vy0 + (1 - (cpy - PAD.t) / drawH) * (vy1 - vy0);
    const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
    const nx0 = mx + (vx0 - mx) * factor;
    const ny0 = my + (vy0 - my) * factor;
    const nx1 = mx + (vx1 - mx) * factor;
    const ny1 = my + (vy1 - my) * factor;
    // Clamp
    const span = Math.min(nx1 - nx0, ny1 - ny0);
    if (span < 0.03 || span > 1.2) return;
    const nv = [nx0, ny0, nx1, ny1];
    viewRef.current = nv;
    setView(nv);
    draw(nv);
  };

  const resetZoom = () => {
    const nv = [0, 0, 0.85, 0.85];
    viewRef.current = nv;
    setView(nv);
    draw(nv);
  };
  const isZoomed = view[1] > 0.001 || view[0] > 0.001 || view[2] < 0.84 || view[3] < 0.84;

  const btnBase = { background: "white", border: "0.5px solid rgba(0,0,0,0.2)", borderRadius: 6, width: 28, height: 28, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 };
  const btnActive = { ...btnBase, background: "rgba(20,20,20,0.1)", border: "1px solid rgba(0,0,0,0.35)" };

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
      <div style={{ position: "relative", flex: 1 }}>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          style={{ width: "100%", height: "auto", borderRadius: 8, cursor: mode === "pan" ? (panStartRef.current ? "grabbing" : "grab") : mode === "move" ? (dragPointRef.current ? "grabbing" : "crosshair") : "crosshair", display: "block" }}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => { panStartRef.current = null; setHovered(null); onHover && onHover(null); }}
          onClick={handleClick}
          onWheel={handleWheel}
        />
        {isZoomed && (
          <button
            onClick={resetZoom}
            style={{ position: "absolute", top: 8, left: 8, background: "rgba(255,255,255,0.9)", border: "0.5px solid rgba(0,0,0,0.25)", borderRadius: 5, padding: "3px 8px", fontSize: 11, cursor: "pointer", color: "rgba(20,20,20,0.85)", fontWeight: 500 }}
          >↺ Zoom</button>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingTop: 4 }}>
        <button title="Ajouter un point" onClick={() => switchMode("point")} style={mode === "point" ? btnActive : btnBase}>✦</button>
        <button title="Déplacer le graphique" onClick={() => switchMode("pan")} style={mode === "pan" ? btnActive : btnBase}>✋</button>
        <button title="Déplacer un point" onClick={() => switchMode("move")} style={mode === "move" ? btnActive : btnBase}>⇱</button>
      </div>
    </div>
  );
});

// CIE 1976 (u',v') conversions
function xyToUV(x, y) {
  const denom = -2 * x + 12 * y + 3;
  return { u: 4 * x / denom, v: 9 * y / denom };
}
function uvToXY(u, v) {
  const denom = 6 * u - 16 * v + 12;
  return { x: 9 * u / denom, y: 4 * v / denom };
}

// Δu'v' distance
function deltaUV(x1, y1, x2, y2) {
  const p1 = xyToUV(x1, y1);
  const p2 = xyToUV(x2, y2);
  return Math.sqrt((p2.u - p1.u) ** 2 + (p2.v - p1.v) ** 2);
}

// SDCM step
function sdcmStep(x1, y1, x2, y2) {
  return deltaUV(x1, y1, x2, y2) / 0.0011;
}

// Returns intersection parameter t and segment index for a ray from (ox,oy) in direction (dx,dy)
function rayLocus(ox, oy, dx, dy, minT = 0.001) {
  const locus = SPECTRUM_LOCUS;
  let bestT = Infinity, bestS = 0, bestK = -1;
  const segs = locus.length;
  for (let k = 0; k < segs; k++) {
    const a = locus[k], b = locus[(k + 1) % segs];
    const ex = b.x - a.x, ey = b.y - a.y;
    const denom = dx * ey - dy * ex;
    if (Math.abs(denom) < 1e-10) continue;
    const t = ((a.x - ox) * ey - (a.y - oy) * ex) / denom;
    const s = ((a.x - ox) * dy - (a.y - oy) * dx) / denom;
    if (t > minT && s >= 0 && s <= 1 && t < bestT) { bestT = t; bestS = s; bestK = k; }
  }
  return { t: bestT, s: bestS, k: bestK };
}

// Interpolate dominant wavelength at a locus segment hit
function segmentWavelength(k, s) {
  const locus = SPECTRUM_LOCUS;
  const a = locus[k], b = locus[(k + 1) % locus.length];
  // Closing segment (purple line) has no real wavelength
  const lastReal = locus.length - 3; // last nm=700 index before 780 phantom points
  if (k >= locus.length - 1) return null; // closing line = purples
  // Check if either endpoint is a "phantom" point (nm >= 700 closing segment)
  if (a.nm >= 700 && b.nm >= 380 && b.nm <= 400) return null;
  if (a.nm >= 700 || b.nm > 700) return null;
  return a.nm + s * (b.nm - a.nm);
}

function computeSaturation(pt, illuminantKey) {
  if (!illuminantKey || !ILLUMINANTS[illuminantKey]) return null;
  const ill = ILLUMINANTS[illuminantKey];
  const dx = pt.x - ill.x, dy = pt.y - ill.y;
  const d1 = Math.sqrt(dx * dx + dy * dy);

  // Forward ray: illuminant → pt → locus
  const fwd = rayLocus(ill.x, ill.y, dx, dy);
  if (!isFinite(fwd.t)) return null;
  const d_total = fwd.t * d1; // t is in units of |(dx,dy)|=d1
  const d2 = Math.max(0, d_total - d1);
  const sat = d1 / d_total * 100;

  // Try dominant wavelength from forward intersection
  let domWl = null;
  let complementary = false;
  const fwdWl = segmentWavelength(fwd.k, fwd.s);
  if (fwdWl !== null) {
    domWl = fwdWl;
  } else {
    // Forward hit the purple line → use complementary (backward ray)
    const bwd = rayLocus(ill.x, ill.y, -dx, -dy);
    if (isFinite(bwd.t)) {
      const bwdWl = segmentWavelength(bwd.k, bwd.s);
      if (bwdWl !== null) { domWl = bwdWl; complementary = true; }
    }
  }

  return {
    d1: d1.toFixed(5),
    d2: d2.toFixed(5),
    sat: sat.toFixed(1),
    domWl: domWl !== null ? Math.round(domWl) : null,
    complementary,
  };
}

export default function App() {
  const [illuminant, setIlluminant] = useState("D65");
  const [hovered, setHovered] = useState(null);
  const [tab, setTab] = useState("diagram");
  const [userPoints, setUserPoints] = useState([]);
  const diagramRef = useRef(null);
  const toggleSat = (id) => setUserPoints(prev => prev.map(p => p.id === id ? { ...p, showSat: !p.showSat } : p));
  const setPointName = (id, name) => setUserPoints(prev => prev.map(p => p.id === id ? { ...p, name } : p));


  const tabs = [
    { id: "diagram", label: "Diagramme de chromaticité" },
    { id: "info", label: "À propos" },
  ];

  const exportPNG = () => {
    const diagCanvas = diagramRef.current?.getCanvas();
    if (!diagCanvas) return;

    // High-DPI: scale up diagram canvas 3× for crisp export
    const SCALE = 3;
    const DW = diagCanvas.width * SCALE, DH = diagCanvas.height * SCALE;
    const PAD = 36 * SCALE, COL = 340 * SCALE, ROWH = 22 * SCALE, FONT = 14 * SCALE;
    const date = new Date().toLocaleDateString("fr-FR", { day:"2-digit", month:"long", year:"numeric" });

    // Header height
    const HEADER = 80 * SCALE;
    // Points section height
    let pointsH = 50 * SCALE;
    userPoints.forEach(pt => {
      pointsH += ROWH * 2 + 10 * SCALE;
      if (pt.showSat && illuminant) {
        const s = computeSaturation(pt, illuminant);
        if (s) pointsH += ROWH * 3 + 6 * SCALE;
      }
    });
    const totalH = Math.max(DH + HEADER + PAD * 2, pointsH + HEADER + PAD * 2);
    const totalW = DW + PAD * 3 + COL;

    const out = document.createElement("canvas");
    out.width = totalW;
    out.height = totalH;
    const ctx = out.getContext("2d");

    // White background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, totalW, totalH);

    // Header
    ctx.fillStyle = "#111111";
    ctx.font = `bold ${20 * SCALE}px sans-serif`;
    ctx.fillText("Espace colorimétrique CIE 1931", PAD, PAD + 22 * SCALE);
    ctx.fillStyle = "#555555";
    ctx.font = `${13 * SCALE}px sans-serif`;
    ctx.fillText("Diagramme de chromaticité xy · Observateur 2° · Illuminant : " + (illuminant || "Aucun"), PAD, PAD + 42 * SCALE);
    ctx.fillStyle = "#999999";
    ctx.font = `${11 * SCALE}px sans-serif`;
    ctx.fillText("Exporté le " + date, PAD, PAD + 60 * SCALE);

    // Diagram — drawn scaled up
    ctx.drawImage(diagCanvas, 0, 0, diagCanvas.width, diagCanvas.height, PAD, HEADER + PAD, DW, DH);
    ctx.strokeStyle = "#cccccc";
    ctx.lineWidth = SCALE;
    ctx.strokeRect(PAD, HEADER + PAD, DW, DH);

    // Vertical separator
    const sepX = PAD * 2 + DW;
    ctx.strokeStyle = "#e0e0e0";
    ctx.lineWidth = SCALE;
    ctx.beginPath(); ctx.moveTo(sepX, HEADER + PAD); ctx.lineTo(sepX, totalH - PAD); ctx.stroke();

    // Points column
    const colX = sepX + PAD;
    let y = HEADER + PAD + 10 * SCALE;

    ctx.fillStyle = "#111111";
    ctx.font = `bold ${15 * SCALE}px sans-serif`;
    ctx.fillText("Points ajoutés", colX, y);
    y += 28 * SCALE;

    if (userPoints.length === 0) {
      ctx.fillStyle = "#aaaaaa";
      ctx.font = `italic ${13 * SCALE}px sans-serif`;
      ctx.fillText("Aucun point", colX, y);
    } else {
      userPoints.forEach((pt, i) => {
        const label = pt.name || ("#" + (i + 1));
        ctx.fillStyle = "#111111";
        ctx.font = `bold ${14 * SCALE}px sans-serif`;
        ctx.fillText(label, colX, y); y += ROWH;

        ctx.fillStyle = "#333333";
        ctx.font = `${13 * SCALE}px sans-serif`;
        ctx.fillText("x = " + pt.x.toFixed(4) + "   y = " + pt.y.toFixed(4), colX, y); y += ROWH;

        if (pt.showSat && illuminant) {
          const s = computeSaturation(pt, illuminant);
          if (s) {
            ctx.fillStyle = "#555555";
            ctx.font = `${12 * SCALE}px sans-serif`;
            ctx.fillText("d₁ = " + s.d1 + "   d₂ = " + s.d2, colX, y); y += ROWH - 2 * SCALE;
            ctx.fillText("Saturation : " + s.sat + "%", colX, y); y += ROWH - 2 * SCALE;
            if (s.domWl !== null) {
              ctx.fillText((s.complementary ? "λ compl. : " : "λ dom. : ") + s.domWl + " nm" + (s.complementary ? " (pourpre)" : ""), colX, y); y += ROWH - 2 * SCALE;
            }
          }
        }

        // Separator line
        ctx.strokeStyle = "#eeeeee";
        ctx.lineWidth = SCALE;
        ctx.beginPath(); ctx.moveTo(colX, y + 5 * SCALE); ctx.lineTo(colX + COL - PAD, y + 5 * SCALE); ctx.stroke();
        y += 16 * SCALE;
      });
    }

    // Footer
    ctx.fillStyle = "#bbbbbb";
    ctx.font = `${11 * SCALE}px sans-serif`;
    ctx.fillText("CIE 1931 · CIE 015:2018 · Observateur standard 2°", PAD, totalH - 12 * SCALE);

    // Download as PNG
    out.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "cie1931_chromaticite.png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, "image/png");
  };

  return (
    <div style={{ fontFamily: "var(--font-sans, sans-serif)", color: "var(--color-text-primary)", maxWidth: 860, margin: "0 auto", padding: "1rem 0" }}>
      <div style={{ marginBottom: "1.25rem" }}>
        <h2 style={{ fontSize: 20, fontWeight: 500, margin: "0 0 4px" }}>Espace colorimétrique CIE 1931</h2>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0 }}>
          Diagramme de chromaticité xy · Observateur standard 2°
        </p>
      </div>

      <div style={{ display: "flex", gap: 0, marginBottom: "1rem", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              background: "none", border: "none", padding: "8px 16px", cursor: "pointer",
              fontSize: 13, fontWeight: tab === t.id ? 500 : 400,
              color: tab === t.id ? "var(--color-text-primary)" : "var(--color-text-secondary)",
              borderBottom: tab === t.id ? "2px solid var(--color-text-primary)" : "2px solid transparent",
              marginBottom: -1,
            }}
          >{t.label}</button>
        ))}
        <button
          onClick={exportPNG}
          style={{
            marginLeft: "auto", background: "none", border: "0.5px solid var(--color-border-secondary)",
            padding: "6px 14px", cursor: "pointer", fontSize: 12, fontWeight: 500,
            color: "var(--color-text-primary)", borderRadius: 5, display: "flex", alignItems: "center", gap: 5,
            marginBottom: 4
          }}
        >⬇ Exporter</button>
      </div>

      {tab === "diagram" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: "0.75rem", alignItems: "start" }}>
            <div style={{ background: "white", borderRadius: 8, overflow: "hidden" }}>
              <ChromaticityDiagram
                ref={diagramRef}
                illuminant={illuminant}
                onHover={setHovered}
                userPoints={userPoints}
                onAddPoint={(p) => setUserPoints(prev => [...prev, { ...p, id: Date.now(), name: "" }])}
                onMovePoint={(id, x, y) => setUserPoints(prev => prev.map(p => p.id === id ? { ...p, x, y } : p))}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 130 }}>
              <div style={{ background: "var(--color-background-secondary)", borderRadius: 8, padding: "12px 14px" }}>
                <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: "0 0 6px", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>Curseur (nm)</p>
                {hovered ? (
                  <>
                    <p style={{ fontSize: 20, fontWeight: 500, margin: "0 0 2px" }}>x = {hovered.x.toFixed(4)}</p>
                    <p style={{ fontSize: 20, fontWeight: 500, margin: 0 }}>y = {hovered.y.toFixed(4)}</p>
                  </>
                ) : (
                  <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0 }}>Survolez le diagramme</p>
                )}
              </div>

              <div>
                <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: "0 0 8px", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>Illuminant</p>
                {Object.entries(ILLUMINANTS).map(([k, v]) => (
                  <label key={k} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, cursor: "pointer", fontSize: 12 }}>
                    <input type="radio" name="ill" checked={illuminant === k} onChange={() => setIlluminant(k)} />
                    {k}
                  </label>
                ))}
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12 }}>
                  <input type="radio" name="ill" checked={!illuminant} onChange={() => setIlluminant("")} />
                  Aucun
                </label>
              </div>

            </div>
          </div>

          {illuminant && ILLUMINANTS[illuminant] && (
            <div style={{ marginTop: 8, padding: "8px 12px", background: "var(--color-background-secondary)", borderRadius: 6, fontSize: 12, color: "var(--color-text-secondary)" }}>
              <strong style={{ color: "var(--color-text-primary)" }}>{illuminant}</strong> — {ILLUMINANTS[illuminant].label} · x = {ILLUMINANTS[illuminant].x.toFixed(4)}, y = {ILLUMINANTS[illuminant].y.toFixed(4)}
            </div>
          )}

          {/* Points panel below diagram */}
          <div style={{ marginTop: "1rem" }}>
            <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: "0 0 8px", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>Points ajoutés</p>
            {userPoints.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0 }}>Cliquez sur le diagramme pour ajouter un point</p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
                {userPoints.map((pt, i) => (
                  <div key={pt.id} style={{ background: "var(--color-background-primary)", border: pt.showSat ? "1px solid rgba(20,20,20,0.3)" : "0.5px solid var(--color-border-tertiary)", borderRadius: 6, padding: "6px 8px", fontSize: 11 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontWeight: 500, fontSize: 12, color: "var(--color-text-secondary)" }}>#{i + 1}</span>
                      <button onClick={() => setUserPoints(prev => prev.filter(p => p.id !== pt.id))} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "var(--color-text-secondary)", padding: "0 2px", lineHeight: 1 }}>×</button>
                    </div>
                    <input
                      type="text"
                      placeholder={"Point #" + (i + 1)}
                      value={pt.name || ""}
                      onChange={e => setPointName(pt.id, e.target.value)}
                      style={{ width: "100%", fontSize: 11, padding: "3px 6px", borderRadius: 4, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", boxSizing: "border-box", marginBottom: 4 }}
                    />
                    <div style={{ color: "var(--color-text-secondary)" }}>x = <span style={{ fontWeight: 500, color: "var(--color-text-primary)" }}>{pt.x.toFixed(4)}</span></div>
                    <div style={{ color: "var(--color-text-secondary)", marginBottom: 5 }}>y = <span style={{ fontWeight: 500, color: "var(--color-text-primary)" }}>{pt.y.toFixed(4)}</span></div>
                    <button
                      onClick={() => toggleSat(pt.id)}
                      style={{ width: "100%", fontSize: 10, fontWeight: 500, padding: "3px 0", borderRadius: 4, cursor: "pointer", border: "0.5px solid var(--color-border-secondary)", background: pt.showSat ? "rgba(20,20,20,0.08)" : "none", color: "var(--color-text-primary)" }}
                    >{pt.showSat ? "Masquer saturation" : "Saturation"}</button>
                    {pt.showSat && illuminant && (() => {
                      const s = computeSaturation(pt, illuminant);
                      if (!s) return null;
                      return (
                        <div style={{ marginTop: 5, paddingTop: 5, borderTop: "0.5px solid var(--color-border-tertiary)" }}>
                          <div style={{ color: "var(--color-text-secondary)", marginBottom: 2 }}>d₁ (ill→pt) = <span style={{ fontWeight: 500, color: "var(--color-text-primary)" }}>{s.d1}</span></div>
                          <div style={{ color: "var(--color-text-secondary)", marginBottom: 2 }}>d₂ (pt→locus) = <span style={{ fontWeight: 500, color: "var(--color-text-primary)" }}>{s.d2}</span></div>
                          <div style={{ marginTop: 4, padding: "3px 6px", background: "rgba(20,20,20,0.07)", borderRadius: 4, textAlign: "center" }}>
                            <span style={{ color: "var(--color-text-secondary)", fontSize: 10 }}>Saturation </span>
                            <span style={{ fontWeight: 500, fontSize: 13 }}>{s.sat}%</span>
                          </div>
                          {s.domWl !== null && (
                            <div style={{ marginTop: 4, padding: "3px 6px", background: "rgba(20,20,20,0.04)", borderRadius: 4, textAlign: "center", borderTop: "0.5px solid var(--color-border-tertiary)" }}>
                              <div style={{ color: "var(--color-text-secondary)", fontSize: 10, marginBottom: 1 }}>
                                {s.complementary ? "λ complémentaire" : "λ dominante"}
                              </div>
                              <span style={{ fontWeight: 500, fontSize: 13 }}>{s.domWl} nm</span>
                              {s.complementary && <span style={{ fontSize: 9, color: "var(--color-text-secondary)", display: "block" }}>(pourpre — opposé)</span>}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                  </div>
                ))}
                {userPoints.length > 1 && (
                  <div style={{ display: "flex", alignItems: "flex-start", paddingTop: 4 }}>
                    <button onClick={() => setUserPoints([])} style={{ fontSize: 11, color: "var(--color-text-secondary)", background: "none", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 4, padding: "4px 8px", cursor: "pointer" }}>Tout effacer</button>
                  </div>
                )}
              </div>
            )}
          </div>


        </div>
      )}

      {tab === "info" && (
        <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--color-text-secondary)" }}>
          <h3 style={{ fontSize: 15, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 8px" }}>Le modèle CIE 1931</h3>
          <p>L'espace colorimétrique CIE 1931 XYZ est fondé sur des expériences psychophysiques d'égalisation des couleurs à partir de trois primaires monochromatiques : 700 nm (rouge), 546,1 nm (vert) et 435,8 nm (bleu), frappant la fovéa sous un angle de 2°.</p>
          <p>Le diagramme de chromaticité xy est obtenu par projection : x = X/(X+Y+Z), y = Y/(X+Y+Z). Il représente la teinte et la saturation indépendamment de la luminance.</p>
          <p>Le <em>spectrum locus</em> est la courbe enveloppant le diagramme, sur laquelle se trouvent toutes les couleurs monochromatiques. Les couleurs réelles d'un écran sont contenues dans un triangle (gamut) dont les sommets sont les primaires R, G, B.</p>
          <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: 12, marginTop: 8, fontSize: 12 }}>
            <p style={{ margin: "0 0 4px" }}><strong style={{ color: "var(--color-text-primary)" }}>Source :</strong> Mathieu Hébert, « Mesurer les couleurs », <em>Photoniques</em>, 2021, 106, pp.44–47</p>
            <p style={{ margin: 0 }}><strong style={{ color: "var(--color-text-primary)" }}>Données :</strong> CIE 015:2018, fonctions d'égalisation 2° CIE 1931</p>
          </div>
        </div>
      )}
    </div>
  );
}