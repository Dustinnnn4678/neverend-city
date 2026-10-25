import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const CELL_W = 3.2, CELL_H = 3.8, TILE = 8;
const TW = CELL_W * TILE, TH = CELL_H * TILE;
const FACADE = new Set(['glass', 'concrete', 'brick', 'siding', 'shop', 'metal']);
const COLORED = new Set(['paint', 'paint2', 'sign']);

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const snapH = v => Math.max(CELL_H, Math.round(v / CELL_H) * CELL_H);
const snapW = v => Math.max(CELL_W, Math.round(v / CELL_W) * CELL_W);

/* ---------- materials ---------- */
function canvasOf(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
const rnd = (a, b) => a + Math.random() * (b - a);

function makeFacade(kind, renderer) {
  const S = 1024, N = TILE, c = S / N;
  const A = canvasOf(S), E = canvasOf(S), R = canvasOf(S);
  const a = A.getContext('2d'), e = E.getContext('2d'), r = R.getContext('2d');
  e.fillStyle = '#000'; e.fillRect(0, 0, S, S);
  const litP = { glass: 0.3, concrete: 0.26, brick: 0.26, siding: 0.34, shop: 0.9, metal: 0.4 }[kind];
  for (let row = 0; row < N; row++) for (let col = 0; col < N; col++) {
    const x = col * c, y = row * c; let px, py, pw, ph;
    if (kind === 'glass') {
      px = x + 5; py = y + 5; pw = c - 10; ph = c - 10;
      a.fillStyle = '#2a2f36'; a.fillRect(x, y, c, c); r.fillStyle = 'rgb(255,215,60)'; r.fillRect(x, y, c, c);
      const t = Math.random(), base = t < .15 ? [78, 122, 156] : t < .6 ? [40, 64, 88] : [56, 88, 116];
      const g = a.createLinearGradient(px, py, px + pw, py + ph);
      g.addColorStop(0, `rgb(${base.map(v => v * 1.3 | 0)})`); g.addColorStop(1, `rgb(${base.map(v => v * 0.75 | 0)})`);
      a.fillStyle = g; a.fillRect(px, py, pw, ph); r.fillStyle = 'rgb(255,20,235)'; r.fillRect(px, py, pw, ph);
    } else {
      const wall = { concrete: '#b4aea3', brick: '#7b4234', siding: '#f1eee8', shop: '#cfc6b4', metal: '#9ea3a8' }[kind];
      a.fillStyle = wall; a.fillRect(x, y, c, c);
      r.fillStyle = kind === 'metal' ? 'rgb(255,120,170)' : 'rgb(255,215,0)'; r.fillRect(x, y, c, c);
      if (kind === 'brick') { a.fillStyle = 'rgba(40,18,12,.35)'; for (let k = 0; k < c; k += 8) a.fillRect(x, y + k, c, 1.5);
        for (let k = 0; k < c; k += 8) for (let m = (k / 8 % 2) * 12; m < c; m += 24) a.fillRect(x + m, y + k, 1.5, 8); }
      if (kind === 'siding') { a.fillStyle = 'rgba(80,70,60,.16)'; for (let k = 0; k < c; k += 9) a.fillRect(x, y + k, c, 1.5); }
      if (kind === 'metal') { a.fillStyle = 'rgba(40,44,50,.28)'; for (let k = 0; k < c; k += 10) a.fillRect(x + k, y, 2, c); }
      for (let k = 0; k < 30; k++) { a.fillStyle = `rgba(${kind === 'brick' ? '60,25,15' : '90,86,78'},${rnd(.03, .1)})`; a.fillRect(x + rnd(0, c), y + rnd(0, c), rnd(2, 9), rnd(2, 9)); }
      if (kind === 'shop') { px = x + c * .08; py = y + c * .14; pw = c * .84; ph = c * .62; a.fillStyle = '#25282c'; a.fillRect(px - 4, py - 4, pw + 8, ph + 8); }
      else if (kind === 'metal') { px = x + c * .1; py = y + c * .08; pw = c * .8; ph = c * .2; }
      else if (kind === 'siding') { px = x + c * .26; py = y + c * .2; pw = c * .48; ph = c * .56; a.fillStyle = '#ffffff'; a.fillRect(px - 6, py - 6, pw + 12, ph + 12); }
      else { const br = kind === 'brick'; px = x + c * (br ? .22 : .2); py = y + c * (br ? .2 : .16); pw = c * (br ? .56 : .6); ph = c * (br ? .58 : .62);
        a.fillStyle = br ? '#e6e1d6' : '#d6d0c4'; a.fillRect(px - 5, py - 5, pw + 10, ph + 10 + (br ? 0 : 5)); }
      a.fillStyle = kind === 'shop' ? '#1d2a33' : '#18222e'; a.fillRect(px, py, pw, ph);
      a.fillStyle = 'rgba(255,255,255,.07)'; a.fillRect(px, py, pw * .45, ph);
      r.fillStyle = 'rgb(255,30,190)'; r.fillRect(px, py, pw, ph);
    }
    if (Math.random() < litP) {
      const ct = Math.random(), col3 = kind === 'shop' ? [255, 226, 170] : ct < .7 ? [255, 205, 140] : ct < .88 ? [205, 225, 255] : [255, 170, 140], k = rnd(.4, 1);
      e.fillStyle = `rgb(${col3.map(v => v * k | 0)})`; e.fillRect(px, py, pw, ph);
    }
  }
  const mk = (cv, srgb) => { const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  return new THREE.MeshStandardMaterial({ map: mk(A, true), emissiveMap: mk(E, true), emissive: 0xffffff, emissiveIntensity: 0, roughnessMap: mk(R), metalnessMap: mk(R), roughness: 1, metalness: 1 });
}

function shingleMaterial(renderer) {
  const c = canvasOf(256), g = c.getContext('2d');
  g.fillStyle = '#4a4442'; g.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 16; row++) for (let col = 0; col < 8; col++) {
    const x = col * 32 + (row % 2) * 16 - 16, y = row * 16, t = rnd(-14, 14);
    g.fillStyle = `rgb(${72 + t},${66 + t},${62 + t})`; g.fillRect(x + 1, y + 1, 30, 14);
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.92, metalness: 0 });
}

export function makeMaterials(renderer) {
  const m = {};
  for (const k of FACADE) m[k] = makeFacade(k, renderer);
  m.roof = shingleMaterial(renderer);
  m.paint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, metalness: 0.05 });
  m.paint2 = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.05, side: THREE.DoubleSide });
  m.sign = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: true });
  m.sign.color = new THREE.Color(1.6, 1.6, 1.6);
  return m;
}

/* ---------- geometry builder ---------- */
class Builder {
  constructor() { this.by = {}; this.topY = 0; }
  push(mat, g, color) {
    if (COLORED.has(mat)) {
      const col = new THREE.Color(color ?? '#ffffff'), n = g.attributes.position.count, arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) col.toArray(arr, i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    }
    (this.by[mat] ||= []).push(g);
    g.computeBoundingBox(); this.topY = Math.max(this.topY, g.boundingBox.max.y);
  }
  box(mat, w, h, d, o = {}) {
    const { x = 0, y0 = 0, z = 0, color, ou = 0, ov = 0, rot = 0 } = o;
    const g = new THREE.BoxGeometry(w, h, d); if (rot) g.rotateY(rot); g.translate(x, y0 + h / 2, z);
    const p = g.attributes.position, uv = g.attributes.uv, fac = FACADE.has(mat);
    for (let i = 0; i < p.count; i++) {
      const f = i >> 2;
      if (!fac || f === 2 || f === 3) { uv.setXY(i, 0.0008, 0.0008); continue; }
      uv.setXY(i, (f < 2 ? p.getZ(i) : p.getX(i)) / TW + ou, p.getY(i) / TH + ov);
    }
    this.push(mat, g, color); return this;
  }
  cyl(mat, rt, rb, h, o = {}) {
    const { x = 0, y0 = 0, z = 0, color, seg = 24, ou = 0, ov = 0 } = o;
    const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1); g.translate(x, y0 + h / 2, z);
    const p = g.attributes.position, uv = g.attributes.uv, fac = FACADE.has(mat), cells = Math.max(6, Math.round(2 * Math.PI * Math.max(rt, rb) / CELL_W)), side = (seg + 1) * 2;
    for (let i = 0; i < p.count; i++) {
      if (fac && i < side) uv.setXY(i, uv.getX(i) * cells / TILE + ou, p.getY(i) / TH + ov); else uv.setXY(i, 0.0008, 0.0008);
    }
    this.push(mat, g, color); return this;
  }
  lathe(pts, color, o = {}) {
    const { seg = 48, mat = 'paint2' } = o, g = new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg);
    this.push(mat, g, color); return this;
  }
  tube(curve, radius, color, o = {}) {
    const g = new THREE.TubeGeometry(curve, o.seg || 240, radius, 6, true); this.push('paint', g, color); return this;
  }
  torus(r, tube, y0, color, o = {}) {
    const g = new THREE.TorusGeometry(r, tube, 8, 48).rotateX(Math.PI / 2).translate(o.x || 0, y0, o.z || 0); this.push(o.mat || 'sign', g, color); return this;
  }
  /* gable roof, ridge along z (or x), plus painted gable ends */
  gable(w, d, h, y0, o = {}) {
    const { x = 0, z = 0, alongX = false, color = '#e8e4da', oh = 0.5 } = o, hw = w / 2 + oh, hd = d / 2 + oh, top = y0 + h;
    const rot = (px, py, pz) => alongX ? [pz + x, py, -px + z] : [px + x, py, pz + z];
    const tri = (pts) => pts.flatMap(p => rot(...p));
    const roofPts = [
      [-hw, y0, -hd], [-hw, y0, hd], [0, top, hd], [-hw, y0, -hd], [0, top, hd], [0, top, -hd],
      [hw, y0, hd], [hw, y0, -hd], [0, top, -hd], [hw, y0, hd], [0, top, -hd], [0, top, hd]];
    const rg = new THREE.BufferGeometry(), rp = new Float32Array(tri(roofPts)), ruv = new Float32Array(roofPts.length * 2);
    roofPts.forEach((p, i) => { ruv[i * 2] = p[2] / 4 + 0.37; ruv[i * 2 + 1] = Math.hypot(hw - Math.abs(p[0]), p[1] - y0) / 4; });
    rg.setAttribute('position', new THREE.BufferAttribute(rp, 3)); rg.setAttribute('uv', new THREE.BufferAttribute(ruv, 2)); rg.computeVertexNormals();
    this.push('roof', rg);
    const dz = d / 2, gp = [[-w / 2, y0, dz], [w / 2, y0, dz], [0, top, dz], [w / 2, y0, -dz], [-w / 2, y0, -dz], [0, top, -dz]];
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tri(gp)), 3));
    gg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(12), 2)); gg.computeVertexNormals();
    this.push('paint', gg, color); return this;
  }
  finish() {
    const parts = {};
    for (const [mat, geos] of Object.entries(this.by)) {
      const list = geos.map(g => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) n.deleteAttribute(k); return n; });
      parts[mat] = mergeGeometries(list); geos.forEach(g => g.dispose());
    }
    return { parts, topY: this.topY };
  }
}

/* ---------- building models (local frame: front faces +z, footprint within ~12 x 12) ---------- */
const PAINT = { white: '#ececea', red: '#b3322c', blue: '#2f5fa8', yellow: '#e6b93a', gray: '#707479', dark: '#202327', green: '#3f8a52', cream: '#e8dcc0' };

const BUILD = {
  house(b, r) {
    const style = pick(r, ['gable', 'gable', 'gable', 'modern', 'victorian', 'cottage', 'mansion']), ou0 = Math.floor(r() * 8) / 8;
    if (style === 'modern') {
      b.box('siding', 9.6, CELL_H, 8, { x: -0.6, ou: ou0 }).box('siding', 6.4, CELL_H, 6.4, { x: 1, y0: CELL_H, z: -0.8, ou: ou0 }).box('glass', 5.6, 3.2, 0.3, { x: -1.6, y0: 0.3, z: 4.1 });
      b.box('paint', 10.2, 0.35, 8.6, { x: -0.6, y0: CELL_H, color: PAINT.dark }).box('paint', 7, 0.35, 7, { x: 1, y0: CELL_H * 2, z: -0.8, color: PAINT.dark }).box('paint', 3.2, 0.3, 2.4, { x: 3.4, y0: 3.1, z: 5.2, color: PAINT.gray });
      return;
    }
    if (style === 'victorian') {
      b.box('siding', 8, CELL_H * 2, 8, { x: 1, ou: ou0 }).gable(8, 8, 3.4, CELL_H * 2, { x: 1, color: '#f4efe4' }).cyl('siding', 1.7, 1.7, CELL_H * 2 + 1.5, { x: -3.2, z: 3.2, seg: 12, ou: ou0 }).cyl('roof', 0, 2.3, 3.4, { x: -3.2, z: 3.2, y0: CELL_H * 2 + 1.5, seg: 12 });
      b.box('paint', 4, 0.35, 1.8, { x: 1.4, z: 4.9, color: PAINT.white }).box('paint', 1.1, 2.1, 0.12, { x: 1.4, z: 4.05, color: '#7a2c28' }); return;
    }
    if (style === 'cottage') {
      b.box('siding', 6.4, CELL_H, 6.4, { ou: ou0 }).gable(6.4, 6.4, 3.8, CELL_H, { alongX: r() < 0.5, color: '#e9dcc3' }).box('brick', 0.9, 3, 0.9, { x: 2, y0: CELL_H + 1, z: 0 }).box('paint', 1.1, 2.1, 0.12, { z: 3.25, color: '#2c4a6e' });
      b.box('paint', 2.6, 0.3, 1.4, { z: 3.9, color: PAINT.cream }); return;
    }
    if (style === 'mansion') {
      b.box('siding', 8, CELL_H * 2, 8, { ou: ou0 }).gable(8, 8, 3.2, CELL_H * 2, { alongX: true }).box('siding', 3.2, CELL_H, 6, { x: -5.6, z: -0.5, ou: ou0 }).box('siding', 3.2, CELL_H, 6, { x: 5.6, z: -0.5, ou: ou0 });
      b.box('paint', 3.4, 0.3, 6.2, { x: -5.6, y0: CELL_H, z: -0.5, color: PAINT.gray }).box('paint', 3.4, 0.3, 6.2, { x: 5.6, y0: CELL_H, z: -0.5, color: PAINT.gray });
      for (const x of [-2.4, -0.8, 0.8, 2.4]) b.cyl('paint', 0.28, 0.28, 6.6, { x, z: 4.9, seg: 10, color: PAINT.white });
      b.box('paint', 7.2, 0.5, 2.4, { y0: 6.6, z: 4.9, color: PAINT.white }).box('paint', 1.4, 2.4, 0.12, { z: 4.05, color: '#4a2a22' }); return;
    }
    const garage = r() < 0.4, w = garage ? 6.4 : pick(r, [6.4, 9.6]), d = pick(r, [6.4, 8, 9.6]), fl = r() < 0.35 ? 2 : 1, H = CELL_H * fl, ox = garage ? -1.6 : 0;
    const ou = Math.floor(r() * 8) / 8;
    b.box('siding', w, H, d, { x: ox, ou }).gable(w, d, 2.4 + r() * 1.2, H, { x: ox, alongX: w < d ? false : r() < 0.5 });
    b.box('paint', 1.1, 2.1, 0.12, { x: ox, z: d / 2 + 0.05, color: pick(r, ['#6b3f2a', '#a8322b', '#2c4a6e']) });
    b.box('paint', 3, 0.35, 1.6, { x: ox, z: d / 2 + 0.8, color: PAINT.white });
    if (garage) { b.box('siding', 3.2, 3, d * 0.8, { x: w / 2 + 1.6 - 1.6 + 0.0, z: -d * 0.1, ou }).box('paint', 2.6, 2.4, 0.1, { x: w / 2, z: d * 0.3 + 0.05, color: PAINT.white }); b.box('paint', 3.4, 0.25, d * 0.8 + 0.3, { x: w / 2, y0: 3, z: -d * 0.1, color: PAINT.gray }); }
    if (r() < 0.6) b.box('brick', 0.8, 2.2, 0.8, { x: ox - w / 3, y0: H + 0.9, z: 0, ou: 0 });
  },
  store(b) {
    b.box('shop', 9.6, CELL_H, 8).box('paint', 10, 0.4, 8.4, { y0: CELL_H, color: PAINT.gray });
    b.box('paint', 9.6, 0.25, 1.8, { y0: 2.8, z: 4.9, color: PAINT.red }).box('sign', 6, 1.1, 0.15, { y0: CELL_H + 0.5, z: 4.1, color: '#ffd36b' });
    b.box('paint', 1.2, 1, 1.2, { x: 4.2, z: 5.6, color: '#7a5a3a' });
  },
  gas(b) {
    b.box('paint', 10.4, 0.5, 7, { y0: 4.6, z: 1.2, color: PAINT.white }).box('paint', 10.5, 0.3, 7.1, { y0: 4.5, z: 1.2, color: PAINT.red });
    for (const [x, z] of [[-4, -1.8], [4, -1.8], [-4, 4.2], [4, 4.2]]) b.box('paint', 0.4, 4.6, 0.4, { x, z, color: PAINT.gray });
    for (const x of [-2, 2]) b.box('paint', 0.9, 1.6, 0.6, { x, z: 1.2, color: PAINT.red }).box('sign', 0.5, 0.35, 0.05, { x, y0: 1.1, z: 1.52, color: '#9be9ff' });
    b.box('shop', 6.4, CELL_H, 3.6, { z: -4.8 }).box('paint', 6.8, 0.3, 4, { y0: CELL_H, z: -4.8, color: PAINT.gray });
    b.box('paint', 0.3, 7, 0.3, { x: 5.2, z: 5.2, color: PAINT.gray }).box('sign', 1.8, 2.4, 0.25, { x: 5.2, y0: 5.4, z: 5.2, color: '#ff4a3d' });
  },
  shop(b, r) {
    const w = 12.8, d = 8, up = 1 + Math.floor(r() * 2), mat = r() < 0.5 ? 'brick' : 'concrete', ou = Math.floor(r() * 8) / 8;
    b.box('shop', w, CELL_H, d).box(mat, w, CELL_H * up, d, { y0: CELL_H, ou }).box('paint', w + 0.3, 0.4, d + 0.3, { y0: CELL_H * (up + 1), color: PAINT.gray });
    for (let k = 0; k < 3; k++) { const x = -4.27 + k * 4.27; b.box('paint', 4, 0.25, 1.6, { x, y0: 2.7, z: d / 2 + 0.8, color: pick(r, ['#b3322c', '#2f6aa8', '#2d7a4f', '#c47a2a', '#6a3a8a']) }); b.box('sign', 3, 0.7, 0.12, { x, y0: 3.15, z: d / 2 + 0.2, color: pick(r, ['#ffd36b', '#9be9ff', '#ff8fb1', '#b6ff9b']) }); }
  },
  diner(b, r) {
    b.box('shop', 9.6, CELL_H, 6.4, { z: -1 }).box('paint', 9.8, 0.35, 6.6, { y0: CELL_H, z: -1, color: '#c9ccd0' }).box('paint', 9.7, 0.4, 6.5, { y0: 2.7, z: -1, color: PAINT.red });
    b.box('paint', 0.3, 6, 0.3, { x: -4.4, z: 3.4, color: PAINT.gray }).box('sign', 3.4, 1.6, 0.25, { x: -4.4, y0: 6, z: 3.4, color: '#ff5b6b' }).box('sign', 3, 0.5, 0.1, { x: 0, y0: 3.3, z: 2.3, color: '#ffe08a' });
  },
  school(b, r) {
    b.box('brick', 12, CELL_H * 2, 6.4, { z: -2.8 }).box('concrete', 6.4, 5.7, 4.4, { x: 2.8, z: 3.2 }).box('paint', 12.2, 0.4, 6.6, { y0: CELL_H * 2, z: -2.8, color: PAINT.gray });
    b.box('paint', 0.12, 9, 0.12, { x: -5.2, z: 4.4, color: PAINT.white }).box('sign', 1.4, 0.9, 0.05, { x: -4.5, y0: 8, z: 4.4, color: '#e03a3a' });
    b.box('sign', 4, 0.8, 0.15, { x: -2, y0: 5.6, z: 0.5, color: '#9be9ff' });
  },
  church(b, r) {
    b.box('brick', 6.4, 5.7, 9.6, { z: -0.8 }).gable(6.4, 9.6, 3.6, 5.7, { z: -0.8 }).box('brick', 2.8, 11, 2.8, { x: 0, z: 4.6 });
    b.cyl('roof', 0, 2.2, 4, { y0: 11, z: 4.6, seg: 4, x: 0 }); b.box('sign', 0.2, 1.4, 0.1, { y0: 14.6, z: 4.6, x: 0, color: '#ffe9a8' });
  },
  library(b) { b.box('concrete', 12, CELL_H * 2, 8).box('glass', 8, CELL_H, 0.6, { z: 4.1 }).box('paint', 12.4, 0.4, 8.4, { y0: CELL_H * 2, color: PAINT.gray }).box('sign', 5, 0.8, 0.15, { y0: CELL_H * 2 - 0.9, z: 4.2, color: '#d9e8ff' }); },
  fire(b) {
    b.box('brick', 12, CELL_H * 2, 9.6).box('brick', 2.6, 13, 2.6, { x: 4.6, z: -3.2 }).box('paint', 12.3, 0.4, 9.9, { y0: CELL_H * 2, color: PAINT.gray });
    for (const x of [-3.4, 0.4]) b.box('paint', 3.2, 3.2, 0.15, { x, z: 4.85, color: PAINT.red });
    b.box('sign', 3.2, 0.7, 0.15, { x: -1.5, y0: 5.4, z: 4.9, color: '#ffe08a' });
  },
  police(b) {
    b.box('concrete', 12, CELL_H * 2, 9.2).box('paint', 12.1, 0.9, 9.3, { y0: 3.2, color: PAINT.blue }).box('paint', 12.3, 0.4, 9.5, { y0: CELL_H * 2, color: PAINT.gray });
    b.box('sign', 4, 0.9, 0.15, { x: -2.5, y0: 5.4, z: 4.7, color: '#6fb8ff' }).box('paint', 0.12, 9, 0.12, { x: 5, z: 5, color: PAINT.white }).box('sign', 1.4, 0.9, 0.05, { x: 5.7, y0: 8, z: 5, color: '#4a7fe0' });
  },
  clinic(b) {
    b.box('concrete', 12, CELL_H * 2, 8.4).box('paint', 5, 0.3, 2, { y0: 3.1, z: 5.2, color: PAINT.white }).box('paint', 12.3, 0.4, 8.7, { y0: CELL_H * 2, color: PAINT.gray });
    b.box('sign', 0.7, 2.4, 0.2, { x: 5, y0: 4.2, z: 4.4, color: '#4cdf8a' }).box('sign', 2.4, 0.7, 0.2, { x: 5, y0: 5.05, z: 4.4, color: '#4cdf8a' });
  },
  post(b) { b.box('brick', 9.6, CELL_H, 8).box('paint', 10, 0.4, 8.4, { y0: CELL_H, color: PAINT.gray }).box('sign', 5, 0.9, 0.15, { y0: CELL_H + 0.5, z: 4.1, color: '#6fb8ff' }).box('paint', 0.9, 1.3, 0.9, { x: 4.8, z: 5.4, color: PAINT.blue }); },
  apartment(b, r) {
    const fl = 5 + Math.floor(r() * 4), H = CELL_H * fl, mat = r() < 0.6 ? 'brick' : 'concrete', ou = Math.floor(r() * 8) / 8;
    b.box(mat, 12.8, H, 9.6, { ou }).box('paint', 13, 0.5, 9.8, { y0: H, color: PAINT.gray }).box('paint', 4, 3, 3, { x: -2, y0: H + 0.5, z: -1.5, color: PAINT.gray });
    b.cyl('paint', 1.1, 1.1, 2.4, { x: 4, y0: H + 0.5, z: 2, color: '#6b4f36', seg: 12 }).cyl('paint', 0, 1.3, 0.8, { x: 4, y0: H + 2.9, z: 2, color: '#4a3a2a', seg: 12 });
    b.box('paint', 4.2, 0.3, 2.2, { y0: 3.1, z: 5.8, color: PAINT.dark }).box('sign', 2.4, 0.5, 0.1, { y0: 3.5, z: 4.9, color: '#ffe9a8' });
    if (r() < 0.5) b.box(mat, 9.6, CELL_H * 2, 6.4, { y0: H + 0.5, z: -1.5 - 0.5 + 0, ou }).box('paint', 9.8, 0.4, 6.6, { y0: H + 0.5 + CELL_H * 2, z: -2, color: PAINT.gray });
  },
  townhome(b, r) {
    const ou = Math.floor(r() * 8) / 8, fl = 3;
    for (let k = 0; k < 3; k++) { const x = -4.27 + k * 4.27, col = pick(r, ['#8a4a3a', '#3a5a7a', '#6a6a4a', '#7a3a4a']);
      b.box('brick', 4.2, CELL_H * fl, 9.6, { x, ou: ou + k * 0.125 }).box('paint', 4.3, 0.5, 9.7, { x, y0: CELL_H * fl, color: PAINT.gray });
      b.box('paint', 1.1, 2.1, 0.12, { x, z: 4.85, color: col }).box('paint', 2, 0.3, 1.4, { x, z: 5.5, color: PAINT.cream }); }
  },
  warehouse(b, r) {
    const ou = Math.floor(r() * 8) / 8;
    b.box('metal', 12, 6.9, 12, { ou }).box('paint', 12.2, 0.4, 12.2, { y0: 6.9, color: PAINT.gray }).box('paint', 3.2, 0.1, 3.2, { x: 3, y0: 7.3, z: -2, color: PAINT.dark });
    for (const x of [-3.2, 1.2]) b.box('paint', 3.4, 3.4, 0.15, { x, z: 6.05, color: '#4a5662' });
    b.box('sign', 1.2, 0.5, 0.1, { x: -3.2, y0: 3.7, z: 6.2, color: '#ffb94a' });
  },
  watertower(b) {
    for (const [x, z] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) b.box('paint', 0.35, 12, 0.35, { x, z, color: PAINT.gray });
    b.cyl('paint', 3.4, 3.4, 5.5, { y0: 12, color: '#c9ccd0' }).cyl('paint', 0, 3.4, 2.4, { y0: 17.5, color: PAINT.gray });
  },
  park(b, r) {
    if (r() < 0.45) {
      b.cyl('paint', 3.6, 3.6, 0.6, { seg: 28, color: '#9aa0a6' }).cyl('paint', 3.2, 3.2, 0.1, { y0: 0.55, seg: 28, color: '#4aa3d8' }).cyl('paint', 0.5, 0.7, 2.2, { seg: 12, color: '#b5bac0' }).cyl('paint', 1.5, 0.4, 0.5, { y0: 2.0, seg: 16, color: '#9aa0a6' }).cyl('paint', 0.9, 0.9, 0.1, { y0: 2.45, seg: 16, color: '#7fc4ee' });
      b.box('paint', 0.5, 2.4, 0.5, { x: -5.2, z: 4.6, color: '#7a5a3a' }); return;
    }
    b.box('paint', 0.3, 2.6, 0.3, { x: -4, z: -4, color: PAINT.gray }).box('paint', 0.3, 2.6, 0.3, { x: -1.6, z: -4, color: PAINT.gray }).box('paint', 2.7, 0.2, 0.3, { x: -2.8, y0: 2.6, z: -4, color: PAINT.red });
    b.box('paint', 0.3, 0.1, 0.3, { x: -2.8, y0: 0.6, z: -4, color: PAINT.dark });
    b.box('paint', 1.6, 0.25, 3, { x: 4, z: -3, color: PAINT.yellow }).box('paint', 1.6, 1.6, 0.25, { x: 4, y0: 0.25, z: -4.5, color: PAINT.blue });
    for (const [x, z] of [[-4, 4], [-4, 6], [-2, 4], [-2, 6]]) b.box('paint', 0.25, 2.8, 0.25, { x, z: z - 1, color: PAINT.white });
    b.gable(4.6, 4.6, 1.4, 2.8, { x: -3, z: 4, color: PAINT.white });
  },
  green() {},
  windmill(b) {
    b.cyl('brick', 2.2, 3.4, 11, { seg: 16 }).cyl('roof', 0, 3.0, 3.2, { y0: 11, seg: 16 }).cyl('paint', 3.5, 3.5, 0.3, { y0: 5, seg: 16, color: PAINT.gray });
    b.box('paint', 1.2, 2.2, 0.15, { z: 3.35, color: '#4a2a22' }).box('paint', 0.9, 0.9, 1.4, { y0: 10.5, z: 2.3, color: PAINT.dark }).box('siding', 4, CELL_H, 4, { x: 4.5, z: -3.5 }).gable(4, 4, 1.8, CELL_H, { x: 4.5, z: -3.5 });
    return { hub: [0, 11, 3.2] };
  },
  clocktower(b) {
    b.box('brick', 12, 5.7, 8).box('paint', 12.3, 0.4, 8.3, { y0: 5.7, color: PAINT.gray }).box('brick', 5.2, 19, 5.2, { y0: 5.7 });
    for (const [x, z, w, d] of [[0, 2.7, 3.2, 0.2], [0, -2.7, 3.2, 0.2], [2.7, 0, 0.2, 3.2], [-2.7, 0, 0.2, 3.2]]) b.box('sign', w, 3.2, d, { x, z, y0: 17, color: '#fff3c9' });
    b.cyl('roof', 0, 4.0, 5, { y0: 24.7, seg: 4 }).cyl('paint', 0.1, 0.2, 3, { y0: 29.7, seg: 6, color: '#d9b53a' }).box('paint', 5.6, 0.5, 5.6, { y0: 24.2, color: PAINT.gray });
  },
  cityhall(b) {
    b.box('concrete', 12, CELL_H * 2, 9).box('paint', 9.6, 0.6, 2.2, { z: 5.3, color: PAINT.gray }).box('paint', 9.8, 0.6, 2.8, { y0: 6.9, z: 5.0, color: PAINT.white });
    for (const x of [-4, -1.4, 1.4, 4]) b.cyl('paint', 0.38, 0.38, 6.3, { x, z: 5.4, y0: 0.6, seg: 10, color: PAINT.white });
    b.box('paint', 12.3, 0.4, 9.3, { y0: CELL_H * 2, color: PAINT.gray }).cyl('paint', 3.4, 3.4, 2.2, { y0: CELL_H * 2 + 0.4, z: -1, seg: 20, color: PAINT.white });
    b.cyl('paint', 0.4, 3.3, 3.4, { y0: CELL_H * 2 + 2.6, z: -1, seg: 20, color: '#d9b53a' }).cyl('paint', 0.1, 0.1, 3, { y0: CELL_H * 2 + 6, z: -1, seg: 6, color: PAINT.white });
    b.box('sign', 5, 0.7, 0.15, { y0: 5.9, z: 4.7, color: '#ffe9a8' });
  },
  cinema(b, r) {
    b.box('concrete', 12, 7.6, 9).box('paint', 12.3, 0.4, 9.3, { y0: 7.6, color: PAINT.gray }).box('sign', 9, 1.4, 0.3, { y0: 3.9, z: 4.75, color: '#ff5b8f' });
    b.box('sign', 1.6, 7.4, 0.3, { x: -5.4, y0: 3, z: 4.9, color: '#6fb8ff' }).box('paint', 9.6, 0.3, 2.2, { y0: 3.2, z: 5.5, color: PAINT.dark });
    for (const x of [-3.6, -1.2, 1.2, 3.6]) b.box('sign', 1.6, 2.3, 0.1, { x, y0: 0.9, z: 4.55, color: pick(r, ['#ffcf5b', '#8bff9b', '#ff8a6b', '#b79bff']) });
  },
  bank(b) {
    b.box('concrete', 9.6, 5.7, 8).box('paint', 10.2, 0.6, 2.6, { y0: 5.2, z: 4.6, color: PAINT.white }).gable(9.6, 2.6, 1.8, 5.8, { z: 4.6, oh: 0.2, color: '#e8e4da' });
    for (const x of [-3.6, -1.2, 1.2, 3.6]) b.cyl('paint', 0.34, 0.34, 4.8, { x, z: 5.4, y0: 0.4, seg: 10, color: PAINT.white });
    b.box('paint', 9.8, 0.4, 2.8, { z: 5.2, color: PAINT.gray }).box('sign', 3.2, 0.6, 0.12, { y0: 6.4, z: 3.5, color: '#ffd36b' });
  },
  hotel(b, r) {
    const H = CELL_H * (9 + Math.floor(r() * 4)), ou = Math.floor(r() * 8) / 8;
    b.box('shop', 12, CELL_H, 12).box('concrete', 9.6, H, 9.6, { y0: CELL_H, ou }).box('paint', 12.4, 0.4, 12.4, { y0: CELL_H, color: PAINT.gray }).box('paint', 6, 0.35, 2.6, { y0: 3.1, z: 7.2, color: PAINT.red });
    b.box('sign', 6.5, 1.6, 0.3, { y0: CELL_H + H + 0.5, z: 4.9, color: '#ff8fb1' }).box('paint', 3, 2.6, 3, { x: 2, y0: CELL_H + H, z: -1, color: PAINT.gray });
  },
  observation(b) {
    b.cyl('concrete', 1.4, 2.4, 52, { seg: 16 }).cyl('glass', 7.4, 4.2, 4, { y0: 52, seg: 28 }).cyl('sign', 7.55, 7.55, 0.35, { y0: 56, seg: 28, color: '#6fe3ff' });
    b.cyl('paint', 3.2, 3.2, 3, { y0: 56.35, seg: 20, color: PAINT.gray }).cyl('paint', 0.3, 0.5, 15, { y0: 59.4, seg: 6, color: PAINT.gray }).cyl('paint', 3.8, 3.8, 0.5, { y0: 0, seg: 20, color: PAINT.gray });
    return { glow: true };
  },
  skyscraper(b, r, s) { return BUILD.office(b, r, s, 150 + r() * 170); },
  stadium(b, r) {
    b.lathe([[23, 0], [23, 13], [21.5, 14.6], [21, 14.6]], '#b9bdc6').lathe([[21, 14.5], [19, 12.4], [17, 9.4], [15, 6.4], [13, 3.4], [11.6, 1.4]], '#c0392b');
    b.lathe([[23.3, 13], [23.3, 14.2], [15.5, 16.2], [15.5, 15.4]], '#eceef2').cyl('paint', 11.6, 11.6, 0.3, { seg: 40, color: '#3f9a4a' }).box('sign', 8, 0.05, 0.4, { y0: 0.36, color: '#ffffff' }).box('sign', 0.4, 0.05, 16, { y0: 0.36, color: '#ffffff' });
    for (const [x, z] of [[-20, -20], [20, -20], [-20, 20], [20, 20]]) b.box('paint', 0.9, 32, 0.9, { x, z, color: PAINT.gray }).box('sign', 4.4, 2.6, 0.6, { x, z, y0: 32, color: '#ffffff' });
    b.box('sign', 10, 1.4, 0.3, { y0: 9, z: 23.4, color: '#6fb8ff' });
  },
  campus(b, r) {
    const ou = Math.floor(r() * 8) / 8;
    b.box('brick', 16, CELL_H * 3, 11, { x: -14, z: -14, ou }).box('brick', 16, CELL_H * 3, 11, { x: 14, z: -14, ou }).box('brick', 16, CELL_H * 3, 11, { x: -14, z: 14, ou });
    b.box('concrete', 14, CELL_H * 2, 14, { x: 14, z: 14 }).cyl('paint', 4.4, 4.4, 2, { x: 14, z: 14, y0: CELL_H * 2, seg: 20, color: PAINT.white }).cyl('paint', 0.5, 4.2, 3.2, { x: 14, z: 14, y0: CELL_H * 2 + 2, seg: 20, color: '#d9b53a' });
    for (const x of [-14, 14]) b.box('paint', 16.4, 0.5, 11.4, { x, z: -14, y0: CELL_H * 3, color: PAINT.gray });
    b.box('paint', 16.4, 0.5, 11.4, { x: -14, z: 14, y0: CELL_H * 3, color: PAINT.gray }).box('brick', 3, 16, 3, { z: -22 }).box('sign', 2, 2, 0.2, { z: -20.4, y0: 11, color: '#fff3c9' });
    b.cyl('paint', 3.2, 3.2, 0.6, { seg: 24, color: '#9aa0a6' }).cyl('paint', 2.8, 2.8, 0.1, { y0: 0.55, seg: 24, color: '#4aa3d8' }).box('paint', 40, 0.1, 3, { y0: 0.05, color: '#c9bd9b' }).box('paint', 3, 0.1, 40, { y0: 0.05, color: '#c9bd9b' });
  },
  amusement(b, r) {
    for (const x of [-13.5, -6.5]) b.box('paint', 1.2, 17, 1.2, { x, z: -6, color: '#c8ccd2' });
    b.box('paint', 0.5, 0.5, 14, { x: -10, y0: 16.8, z: -6, color: '#c8ccd2' }).box('paint', 3, 0.5, 2, { x: -10, z: -6, color: '#7a7f86' });
    const pts = []; for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; pts.push(new THREE.Vector3(10 + 11 * Math.cos(a), 6 + 4.5 * Math.sin(a * 3) + 3 * Math.sin(a * 2 + 1), 8 + 9 * Math.sin(a))); }
    b.tube(new THREE.CatmullRomCurve3(pts, true), 0.35, '#d9433a');
    for (let k = 0; k < 24; k += 2) { const p = pts[k]; b.box('paint', 0.35, p.y, 0.35, { x: p.x, z: p.z, color: PAINT.gray }); }
    b.cyl('paint', 3.4, 3.4, 0.5, { x: -12, z: 12, seg: 20, color: PAINT.cream }).cyl('paint', 0, 4.2, 2.2, { x: -12, z: 12, y0: 3.6, seg: 20, color: '#e8c14a' }).cyl('paint', 0.2, 0.2, 3.2, { x: -12, z: 12, y0: 0.5, seg: 6, color: PAINT.white });
    b.cyl('paint', 3.6, 3.6, 3, { x: 4, z: -18, seg: 14, color: '#3a6fd0' }).cyl('paint', 0, 3.8, 3.6, { x: 4, z: -18, y0: 3, seg: 14, color: '#d63a5a' }).cyl('paint', 3, 3, 2.6, { x: -2, z: 4, seg: 14, color: '#e8c14a' }).cyl('paint', 0, 3.3, 3.2, { x: -2, z: 4, y0: 2.6, seg: 14, color: '#3a8a5a' });
    b.box('paint', 0.8, 8, 0.8, { x: -3.5, z: 22, color: PAINT.red }).box('paint', 0.8, 8, 0.8, { x: 3.5, z: 22, color: PAINT.red }).box('sign', 8.4, 2, 0.5, { y0: 8, z: 22, color: '#ff5bd6' });
    return { hub: [-10, 17, -6], wheel: true };
  },
  megatower(b, r) {
    b.box('concrete', 30, CELL_H * 2, 30).box('glass', 20, CELL_H * 40, 20, { y0: CELL_H * 2 }).box('glass', 15, CELL_H * 20, 15, { y0: CELL_H * 42 }).box('glass', 10, CELL_H * 12, 10, { y0: CELL_H * 62 });
    for (const y of [60, 130, 200, 262]) b.box('sign', y > 200 ? 10.3 : y > 130 ? 15.3 : 20.3, 0.7, y > 200 ? 10.3 : y > 130 ? 15.3 : 20.3, { y0: y, color: '#9be0ff' });
    b.cyl('paint', 0.3, 1.1, 70, { y0: CELL_H * 74, seg: 8, color: PAINT.gray }).box('paint', 6, 2, 6, { y0: CELL_H * 74 - 2, color: PAINT.gray });
    return { glow: true };
  },
  monument(b, r) {
    b.box('paint', 44, 0.4, 44, { color: '#d3ccba' }).box('paint', 14, 1.2, 14, { y0: 0.4, color: '#e8e4da' }).cyl('concrete', 1.6, 4.4, 54, { y0: 1.6, seg: 4 }).cyl('paint', 0, 1.7, 5, { y0: 55.6, seg: 4, color: '#d9b53a' });
    b.torus(7, 0.28, 66, '#ffe9a8'); b.torus(5, 0.2, 70, '#9be0ff');
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2, x = Math.cos(a) * 13, z = Math.sin(a) * 13; b.box('paint', 1.2, 7, 1.2, { x, z, color: PAINT.white }).box('sign', 0.8, 0.8, 0.8, { x, z, y0: 7, color: '#ffe9a8' }); }
    for (let k = 0; k < 20; k++) { const a = k / 20 * Math.PI * 2, x = Math.cos(a) * 18, z = Math.sin(a) * 18; b.cyl('paint', 0.35, 0.5, 1.7, { x, z, seg: 8, color: '#c9a23a' }).cyl('paint', 0.28, 0.28, 0.5, { x, z, y0: 1.7, seg: 8, color: '#c9a23a' }); }
    b.box('sign', 8, 1.4, 0.3, { y0: 1.8, z: 7.2, color: '#ffe9a8' });
    return { glow: true };
  },
  office(b, r, s, Hover) {
    const dC = s.dC, H = snapH(Hover || clampN(34 + 200 * Math.exp(-dC / 75) * (0.35 + 0.65 * r()), 30, 250));
    const mat = H > 60 ? (r() < 0.82 ? 'glass' : 'concrete') : (r() < 0.5 ? 'glass' : 'concrete'), ou = Math.floor(r() * 8) / 8, ov = Math.floor(r() * 8) / 8;
    const w = pick(r, [9.6, 12.8]), d = pick(r, [9.6, 12.8]), arch = pick(r, ['slab', 'setback', 'cyl', 'crown', 'twist', 'tri', 'hex']);
    let top = H;
    if (arch === 'twist') { const stacks = Math.max(4, Math.round(H / (CELL_H * 3))), hh = snapH(H / stacks); for (let k = 0; k < stacks; k++) b.box(mat, w - 1.6, hh, d - 1.6, { y0: k * hh, rot: k * 0.1, ou, ov }); top = stacks * hh; }
    else if (arch === 'tri') { b.cyl(mat, 7.4, 7.4, H, { seg: 3, ou, ov }); }
    else if (arch === 'hex') { b.cyl(mat, 6.2, 6.2, H, { seg: 6, ou, ov }); b.cyl(mat, 4, 4, snapH(H * 0.12), { y0: H, seg: 6, ou, ov }); top = H + snapH(H * 0.12); }
    else if (arch === 'slab') b.box(mat, w, H, d, { ou, ov });
    else if (arch === 'crown') { const h1 = snapH(H * 0.9); b.box(mat, w, h1, d, { ou, ov }).box(mat, w - 3.2, snapH(H * 0.1), d - 3.2, { y0: h1, ou, ov }); top = h1 + snapH(H * 0.1); }
    else if (arch === 'setback') { const h1 = snapH(H * 0.6), h2 = snapH(H * 0.28), h3 = snapH(H * 0.12); b.box(mat, w, h1, d, { ou, ov }).box(mat, w - 3.2, h2, d - 3.2, { y0: h1, ou, ov }).box(mat, Math.max(3.2, w - 6.4), h3, Math.max(3.2, d - 6.4), { y0: h1 + h2, ou, ov }); top = h1 + h2 + h3; }
    else { const rr = Math.min(w, d) / 2, h1 = snapH(H * 0.86), h2 = snapH(H * 0.14); b.cyl(mat, rr, rr, h1, { ou, ov, seg: 40 }).cyl(mat, rr * 0.62, rr * 0.62, h2, { y0: h1, ou, ov, seg: 40 }); top = h1 + h2; }
    b.box('paint', 2.4, 3, 2.4, { y0: top, color: PAINT.gray }); top += 3;
    if (H > 90) { const ah = 12 + r() * 26; b.cyl('paint', 0.25, 0.45, ah, { y0: top, seg: 6, color: PAINT.gray }); top += ah; }
    b.box('paint', 5, 0.3, 2.4, { y0: 3.4, z: d / 2 + 1.2, color: PAINT.dark });
    return { glow: H > 110 };
  },
  mall(b, r) {
    b.box('concrete', 28, 7.6, 11).box('glass', 9, 7.6, 0.8, { z: 5.8 }).box('paint', 28.4, 0.5, 11.4, { y0: 7.6, color: PAINT.gray });
    b.box('sign', 12, 1.8, 0.2, { y0: 5.2, z: 6.3, color: '#ffd36b' }).box('paint', 6, 2.4, 4, { x: -8, y0: 8.1, z: -2, color: PAINT.gray }).box('paint', 6, 2.4, 4, { x: 8, y0: 8.1, z: -2, color: PAINT.gray });
    for (const x of [-12, 12]) b.box('paint', 4.4, 0.35, 2.4, { x, y0: 3.4, z: 6.4, color: PAINT.dark });
  },
  hospital(b, r) {
    b.box('concrete', 24, CELL_H * 5, 10).box('concrete', 10, CELL_H * 7, 10, { x: 6 }).box('paint', 24.4, 0.5, 10.4, { y0: CELL_H * 5, color: PAINT.gray });
    b.box('paint', 10.4, 0.5, 10.4, { x: 6, y0: CELL_H * 7, color: PAINT.gray }).box('sign', 0.9, 3.2, 0.3, { x: -8, y0: 7, z: 5.2, color: '#ff5b5b' }).box('sign', 3.2, 0.9, 0.3, { x: -8, y0: 8.15, z: 5.2, color: '#ff5b5b' });
    b.cyl('paint', 3.4, 3.4, 0.25, { x: -7, y0: CELL_H * 5 + 0.5, color: '#3a3f46', seg: 32 }).box('sign', 2.4, 0.1, 0.5, { x: -7, y0: CELL_H * 5 + 0.8, color: '#ffffff' });
    b.box('paint', 5, 0.3, 3, { y0: 3.4, z: 6.4, x: -3, color: PAINT.white });
  },
  garage(b, r) {
    b.box('paint', 11, 19.4, 11, { color: '#15171a' });
    for (let k = 0; k < 6; k++) b.box('concrete', 12, 1.2, 12, { y0: 1.8 + k * 3.2, ou: k * 0.125 });
    for (const [x, z] of [[-5.6, -5.6], [5.6, -5.6], [-5.6, 5.6], [5.6, 5.6]]) b.box('concrete', 0.8, 20.4, 0.8, { x, z });
    b.box('sign', 5, 1, 0.15, { y0: 20.8, z: 6.1, color: '#6fb8ff' });
  },
};
const clampN = (v, a, bnd) => Math.min(bnd, Math.max(a, v));

const cache = new Map();
export function getModel(s) {
  const bucket = s.type === 'office' ? Math.min(14, Math.floor((s.dC || 0) / 22)) : s.type === 'skyscraper' ? s.variant % 16 : s.variant % 6;
  const key = s.type + ':' + bucket + ':' + (s.type === 'office' ? s.variant % 5 : 0);
  let m = cache.get(key);
  if (!m) {
    const b = new Builder(), r = mulberry32(key.split('').reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) | 0, 7)), extra = BUILD[s.type](b, r, s) || {};
    m = { key, ...b.finish(), glow: !!extra.glow, hub: extra.hub }; cache.set(key, m);
  }
  return m;
}
export { PAINT };
