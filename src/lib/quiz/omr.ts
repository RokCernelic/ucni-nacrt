/**
 * Branje pobarvanih krogcev s fotografije okvirja z odgovori (natisnjen kviz).
 * Čiste funkcije brez DOM-a (preizkusljive v Node):
 *  1) QR koda (jsQR) da učenca in grob položaj okvirja,
 *  2) iz nje napovemo, kje so štirje črni kvadratki, in jih natančno poiščemo,
 *  3) perspektivna preslikava mm → piksli, 4) temnost vsakega krogca.
 */
import jsQR from 'jsqr';
import { FRAME, type FrameGeometry } from './printSheet';

export interface Gray { w: number; h: number; d: Uint8Array }
export type Pt = [number, number];

export function toGray(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Gray {
  const d = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < d.length; i++, j += 4) d[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
  return { w, h, d };
}

/** Perspektivna preslikava iz 4 parov točk (src → dst); vrne 3×3 matriko po vrsticah. */
export function homography(src: Pt[], dst: Pt[]): number[] {
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  // Gaussova eliminacija (8 neznank)
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    const div = A[c][c] || 1e-12;
    for (let k = c; k < 9; k++) A[c][k] /= div;
    for (let r = 0; r < 8; r++) if (r !== c) { const f = A[r][c]; for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k]; }
  }
  return [A[0][8], A[1][8], A[2][8], A[3][8], A[4][8], A[5][8], A[6][8], A[7][8], 1];
}

export function project(H: number[], x: number, y: number): Pt {
  const z = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / z, (H[3] * x + H[4] * y + H[5]) / z];
}

/** Povprečna svetlost v krogu (polmer v pikslih). */
export function meanDisk(g: Gray, cx: number, cy: number, r: number): number {
  let s = 0, n = 0;
  const r2 = r * r;
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(g.h - 1, Math.ceil(cy + r)); y++) {
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(g.w - 1, Math.ceil(cx + r)); x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= r2) { s += g.d[y * g.w + x]; n++; }
    }
  }
  return n ? s / n : 255;
}

/**
 * Poišče črn kvadratek v okolici napovedanega središča: največja temna gruča v oknu,
 * ki je velika približno kot kvadratek. Vrne težišče ali null.
 */
export function findMarkNear(g: Gray, px: number, py: number, win: number, side: number): Pt | null {
  const x0 = Math.max(0, Math.floor(px - win)), x1 = Math.min(g.w - 1, Math.ceil(px + win));
  const y0 = Math.max(0, Math.floor(py - win)), y1 = Math.min(g.h - 1, Math.ceil(py + win));
  if (x1 <= x0 || y1 <= y0) return null;
  const W = x1 - x0 + 1, Hh = y1 - y0 + 1;
  // prag: sredina med temnim in svetlim v oknu
  let lo = 255, hi = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const v = g.d[y * g.w + x]; if (v < lo) lo = v; if (v > hi) hi = v; }
  if (hi - lo < 50) return null;
  const t = (lo + hi) / 2;
  const seen = new Uint8Array(W * Hh);
  const area = side * side;
  let best: { cx: number; cy: number; score: number } | null = null;
  const stack: number[] = [];
  for (let sy = 0; sy < Hh; sy++) for (let sx = 0; sx < W; sx++) {
    const si = sy * W + sx;
    if (seen[si] || g.d[(sy + y0) * g.w + sx + x0] >= t) continue;
    let n = 0, mx = 0, my = 0, minx = sx, maxx = sx, miny = sy, maxy = sy;
    seen[si] = 1; stack.push(si);
    while (stack.length) {
      const k = stack.pop()!, kx = k % W, ky = (k - kx) / W;
      n++; mx += kx; my += ky;
      if (kx < minx) minx = kx; if (kx > maxx) maxx = kx; if (ky < miny) miny = ky; if (ky > maxy) maxy = ky;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = kx + dx, ny = ky + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= Hh) continue;
        const ni = ny * W + nx;
        if (!seen[ni] && g.d[(ny + y0) * g.w + nx + x0] < t) { seen[ni] = 1; stack.push(ni); }
      }
    }
    const bw = maxx - minx + 1, bh = maxy - miny + 1;
    if (n < area * 0.35 || n > area * 2.8) continue;            // ni velikosti kvadratka
    if (bw > side * 2.2 || bh > side * 2.2) continue;            // podolgovato / del črte
    if (n / (bw * bh) < 0.45) continue;                          // ni poln lik
    const cx = mx / n + x0, cy = my / n + y0;
    const score = Math.hypot(cx - px, cy - py) / win + Math.abs(Math.log(n / area));
    if (!best || score < best.score) best = { cx, cy, score };
  }
  return best ? [best.cx, best.cy] : null;
}

/**
 * Poišče štiri črne kvadratke okvirja brez QR kode: polni liki z obliko kvadrata
 * (delež točk zunaj kroga enake ploščine: kvadrat ≈ 0,12–0,2, krog ≈ 0 — tako se ločijo od pobarvanih krogcev),
 * nato izbere četverico, ki tvori največji izbočen štirikotnik s podobno velikimi oglišči.
 * Vrne oglišča po obodu (v sliki: zgoraj levo, zgoraj desno, spodaj desno, spodaj levo) ali null;
 * kateri rob je zares zgoraj (list je lahko obrnjen), odloči šele QR koda.
 */
export function findFrameMarks(g: Gray): Pt[] | null {
  const { w, h, d } = g;
  // prilagodljiv prag (integralna slika): temno = bistveno temnejše od okolice
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += d[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; } }
  const R = Math.max(15, Math.round(w / 14));
  const dark = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - R), y1 = Math.min(h, y + R + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - R), x1 = Math.min(w, x + R + 1);
      const sum = I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0];
      const mean = sum / ((x1 - x0) * (y1 - y0));
      dark[y * w + x] = d[y * w + x] < mean * 0.7 && d[y * w + x] < 140 ? 1 : 0;
    }
  }
  // povezane gruče
  const label = new Int32Array(w * h).fill(-1);
  const stats: { n: number; sx: number; sy: number; minx: number; maxx: number; miny: number; maxy: number; md: number }[] = [];
  const stack: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (!dark[i] || label[i] >= 0) continue;
    const id = stats.length;
    const st = { n: 0, sx: 0, sy: 0, minx: w, maxx: 0, miny: h, maxy: 0, md: 0 };
    label[i] = id; stack.push(i);
    while (stack.length) {
      const k = stack.pop()!, kx = k % w, ky = (k - kx) / w;
      st.n++; st.sx += kx; st.sy += ky;
      if (kx < st.minx) st.minx = kx; if (kx > st.maxx) st.maxx = kx; if (ky < st.miny) st.miny = ky; if (ky > st.maxy) st.maxy = ky;
      if (kx > 0 && dark[k - 1] && label[k - 1] < 0) { label[k - 1] = id; stack.push(k - 1); }
      if (kx < w - 1 && dark[k + 1] && label[k + 1] < 0) { label[k + 1] = id; stack.push(k + 1); }
      if (ky > 0 && dark[k - w] && label[k - w] < 0) { label[k - w] = id; stack.push(k - w); }
      if (ky < h - 1 && dark[k + w] && label[k + w] < 0) { label[k + w] = id; stack.push(k + w); }
    }
    stats.push(st);
  }
  const minN = Math.max(30, (w / 160) ** 2);
  const big = stats.map((s2, id) => ({ ...s2, id })).filter(s2 => s2.n >= minN && (s2.maxx - s2.minx + 1) * (s2.maxy - s2.miny + 1) < s2.n * 3);
  if (big.length < 4) return null;
  const bigIds = new Map(big.map((b, k) => [b.id, k]));
  for (let i = 0; i < w * h; i++) {
    const k = label[i] >= 0 ? bigIds.get(label[i]) : undefined;
    if (k === undefined) continue;
    const b = big[k], x = i % w, y = (i - x) / w;
    const dx = x - b.sx / b.n, dy = y - b.sy / b.n;
    if (dx * dx + dy * dy > b.n / Math.PI) b.md++; // točke zunaj kroga enake ploščine
  }
  const squares = big
    .map(b => ({ x: b.sx / b.n, y: b.sy / b.n, n: b.n, k: b.md / b.n }))
    .filter(b => b.k > 0.04 && b.k < 0.22)
    // kvadratek stoji sam (okoli je belo) — črke v besedilu imajo sosede
    .filter(b => {
      const side = Math.sqrt(b.n), r0 = side * 0.95, r1 = side * 1.7;
      let all = 0, dk = 0;
      for (let y = Math.max(0, Math.floor(b.y - r1)); y <= Math.min(h - 1, Math.ceil(b.y + r1)); y += 1) {
        for (let x = Math.max(0, Math.floor(b.x - r1)); x <= Math.min(w - 1, Math.ceil(b.x + r1)); x += 1) {
          const dd = Math.hypot(x - b.x, y - b.y);
          if (dd < r0 || dd > r1) continue;
          all++; if (dark[y * w + x]) dk++;
        }
      }
      return all > 0 && dk / all < 0.12;
    })
    .sort((a, b) => b.n - a.n)
    .slice(0, 14);
  if (squares.length < 4) return null;
  let best: { pts: Pt[]; score: number } | null = null;
  const m = squares.length;
  for (let a = 0; a < m; a++) for (let b = a + 1; b < m; b++) for (let c = b + 1; c < m; c++) for (let e = c + 1; e < m; e++) {
    const q = [squares[a], squares[b], squares[c], squares[e]];
    const ns = q.map(p => p.n);
    if (Math.max(...ns) > Math.min(...ns) * 4) continue; // perspektiva: bližnji kvadratek je večji
    const tl = q.reduce((p, r) => (r.x + r.y < p.x + p.y ? r : p));
    const br = q.reduce((p, r) => (r.x + r.y > p.x + p.y ? r : p));
    const tr = q.reduce((p, r) => (r.x - r.y > p.x - p.y ? r : p));
    const bl = q.reduce((p, r) => (r.y - r.x > p.y - p.x ? r : p));
    if (new Set([tl, tr, bl, br]).size < 4) continue;
    const P: Pt[] = [[tl.x, tl.y], [tr.x, tr.y], [br.x, br.y], [bl.x, bl.y]];
    // izbočenost in ploščina štirikotnika
    let sign = 0, ok = true, area = 0;
    for (let i = 0; i < 4; i++) {
      const [x1, y1] = P[i], [x2, y2] = P[(i + 1) % 4], [x3, y3] = P[(i + 2) % 4];
      const cr = (x2 - x1) * (y3 - y2) - (y2 - y1) * (x3 - x2);
      if (sign === 0) sign = Math.sign(cr); else if (Math.sign(cr) !== sign) ok = false;
      area += x1 * y2 - x2 * y1;
    }
    if (!ok) continue;
    // nasprotni robovi približno enako dolgi (zmerna perspektiva)
    const len = P.map((p, i) => Math.hypot(P[(i + 1) % 4][0] - p[0], P[(i + 1) % 4][1] - p[1]));
    const rat = (a2: number, b2: number) => Math.max(a2, b2) / Math.max(1e-6, Math.min(a2, b2));
    if (rat(len[0], len[2]) > 1.6 || rat(len[1], len[3]) > 1.6) continue;
    area = Math.abs(area) / 2;
    const side = Math.sqrt(ns.reduce((s2, v) => s2 + v, 0) / 4);
    const longest = Math.max(...P.map((p, i) => Math.hypot(P[(i + 1) % 4][0] - p[0], P[(i + 1) % 4][1] - p[1])));
    if (longest < side * 12) continue; // okvir je širok vsaj ~12 kvadratkov
    const score = area;
    if (!best || score > best.score) best = { pts: P, score };
  }
  return best?.pts ?? null;
}

/** Ocena višine okvirja (mm) iz najdenih kvadratkov, ko vrstic še ne poznamo. */
export function estimateFrameH(marks: Pt[], frameW: number, markOffset: number): number {
  const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const wPx = (dist(marks[0], marks[1]) + dist(marks[2], marks[3])) / 2;
  const hPx = (dist(marks[0], marks[2]) + dist(marks[1], marks[3])) / 2;
  return (hPx / wPx) * (frameW - 2 * markOffset) + 2 * markOffset;
}

export interface QrCorners { topLeft: Pt; topRight: Pt; bottomLeft: Pt; bottomRight: Pt }

export interface CellReading { n: number; multi: boolean; fills: number[]; chosen: number[]; uncertain: boolean }
export interface SheetReading { H: number[]; cells: CellReading[]; marks: Pt[] }

const FILLED = 0.42;
const UNSURE = 0.22;

/** Prebere krogce, ko poznamo geometrijo okvirja in položaj QR kode v sliki. */
export function readSheet(g: Gray, geom: FrameGeometry, qr: QrCorners): SheetReading | null {
  if (!geom.qr) return null;
  const q = geom.qr;
  const H0 = homography(
    [[q.x, q.y], [q.x + q.size, q.y], [q.x, q.y + q.size], [q.x + q.size, q.y + q.size]],
    [qr.topLeft, qr.topRight, qr.bottomLeft, qr.bottomRight],
  );
  const pxPerMm = Math.hypot(qr.topRight[0] - qr.topLeft[0], qr.topRight[1] - qr.topLeft[1]) / q.size;
  const side = 4 * pxPerMm;
  const marks: Pt[] = [];
  for (const [mx, my] of geom.marks) {
    const [px, py] = project(H0, mx, my);
    const found = findMarkNear(g, px, py, Math.max(side * 2.5, 12 * pxPerMm), side);
    if (!found) return null;
    marks.push(found);
  }
  return readWithMarks(g, geom, marks, pxPerMm);
}

/** Prebere krogce, ko so štirje kvadratki že najdeni (v vrstnem redu kot geom.marks). */
export function readWithMarks(g: Gray, geom: FrameGeometry, marks: Pt[], pxPerMmHint?: number): SheetReading {
  const H = homography(geom.marks, marks);
  const pxPerMm = pxPerMmHint ?? Math.hypot(marks[1][0] - marks[0][0], marks[1][1] - marks[0][1]) / (geom.marks[1][0] - geom.marks[0][0]);
  const side = 4 * pxPerMm;
  // referenci: črna (kvadratki) in bela (prazen rob okvirja levo od vrstic)
  const black = marks.reduce((s, m) => s + meanDisk(g, m[0], m[1], side * 0.25), 0) / 4;
  const whites: number[] = [];
  for (let r = 0; r < geom.rows; r++) {
    const [wx, wy] = project(H, 5.5, 11.5 + (r + 0.5) * 6.8);
    whites.push(meanDisk(g, wx, wy, pxPerMm * 1));
  }
  whites.sort((a, b) => a - b);
  const white = whites[Math.floor(whites.length / 2)] ?? 255;
  const span = Math.max(30, white - black);

  const cells: CellReading[] = geom.cells.map(c => {
    const fills = c.bubbles.map(b => {
      const [cx, cy] = project(H, b.cx, b.cy);
      return Math.max(0, Math.min(1, (white - meanDisk(g, cx, cy, geom.bub * 0.33 * pxPerMm)) / span));
    });
    // primerjava z najsvetlejšim krogcem v vrstici (črke, svinčnik, senca)
    const base = fills.length >= 3 ? Math.min(...fills) : 0;
    const chosen = fills.map((f, i) => (f >= FILLED && f - base >= FILLED * 0.75 ? i : -1)).filter(i => i >= 0);
    const uncertain = fills.some((f, i) => !chosen.includes(i) && f - base >= UNSURE) || (!c.multi && chosen.length > 1);
    return { n: c.n, multi: c.multi, fills, chosen, uncertain };
  });
  return { H, cells, marks };
}


export interface Located { token: string; marks: Pt[] | null; qr: QrCorners | null }

/** Izreže pravokotnik (RGBA) in ga da jsQR; koordinate vrne v celotni sliki. */
function decodeRegion(rgba: Uint8ClampedArray, w: number, h: number, x0: number, y0: number, x1: number, y1: number) {
  x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(w, Math.ceil(x1)); y1 = Math.min(h, Math.ceil(y1));
  const cw = x1 - x0, ch = y1 - y0;
  if (cw < 30 || ch < 30) return null;
  const out = new Uint8ClampedArray(cw * ch * 4);
  for (let y = 0; y < ch; y++) out.set(rgba.subarray(((y + y0) * w + x0) * 4, ((y + y0) * w + x1) * 4), y * cw * 4);
  const c = jsQR(out, cw, ch, { inversionAttempts: 'dontInvert' });
  if (!c) return null;
  const P = (p: { x: number; y: number }): Pt => [p.x + x0, p.y + y0];
  const L = c.location;
  return { data: c.data, qr: { topLeft: P(L.topLeftCorner), topRight: P(L.topRightCorner), bottomLeft: P(L.bottomLeftCorner), bottomRight: P(L.bottomRightCorner) } };
}

/**
 * 1. korak skeniranja: najde okvir (kvadratke) in prebere QR kodo v njem.
 * QR je vedno zgoraj desno v okvirju (neodvisno od števila vrstic), zato ga izrežemo
 * natančno — pobarvani krogci v okolici sicer zmedejo iskalnik QR kode.
 */
export function locate(rgba: Uint8ClampedArray, w: number, h: number, g: Gray = toGray(rgba, w, h)): Located | null {
  const quad = findFrameMarks(g);
  let marks: Pt[] | null = null;
  if (quad) {
    const off = FRAME.markInset + FRAME.mark / 2;
    const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    // list je lahko zasukan: zgornji rob je eden od dveh daljših robov; poskusi obe smeri
    for (let i = 0; i < 4; i++) {
      const tl = quad[i], tr = quad[(i + 1) % 4], br = quad[(i + 2) % 4], bl = quad[(i + 3) % 4];
      if (dist(tl, tr) < dist(tl, bl)) continue;
      const m: Pt[] = [tl, tr, bl, br];
      const fh = estimateFrameH(m, FRAME.w, off);
      const mm: Pt[] = [[off, off], [FRAME.w - off, off], [off, fh - off], [FRAME.w - off, fh - off]];
      const H = homography(mm, m);
      const qx = FRAME.w - FRAME.padX - FRAME.qr, qy = FRAME.rowY0, s = FRAME.qr, pad = 4;
      const pts = [[qx - pad, qy - pad], [qx + s + pad, qy - pad], [qx - pad, qy + s + pad], [qx + s + pad, qy + s + pad]].map(([x, y]) => project(H, x, y));
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
      const r = decodeRegion(rgba, w, h, Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
      if (r) return { token: r.data, marks: m, qr: r.qr };
      marks ??= m;
    }
  }
  const c = jsQR(rgba, w, h, { inversionAttempts: 'dontInvert' });
  if (!c) return null;
  const P = (p: { x: number; y: number }): Pt => [p.x, p.y];
  const L = c.location;
  return { token: c.data, marks, qr: { topLeft: P(L.topLeftCorner), topRight: P(L.topRightCorner), bottomLeft: P(L.bottomLeftCorner), bottomRight: P(L.bottomRightCorner) } };
}

/** 2. korak: ko poznamo razpored lista (iz seje), prebere krogce. */
export function readLocated(g: Gray, geom: FrameGeometry, loc: Located): SheetReading | null {
  if (loc.marks) {
    // preveri, da se najdeni kvadratki ujemajo z razmerjem stranic okvirja
    const off = FRAME.markInset + FRAME.mark / 2;
    const est = estimateFrameH(loc.marks, FRAME.w, off);
    if (Math.abs(est - geom.h) < Math.max(6, geom.h * 0.18)) return readWithMarks(g, geom, loc.marks);
  }
  return loc.qr ? readSheet(g, geom, loc.qr) : null;
}
