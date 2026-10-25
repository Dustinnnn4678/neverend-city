import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { P, RIVER_BX, HIGHWAY_BZ, RAIL_BZ, INFRA_AT, SITES } from './city-gen.js';

export const RIVER_X = RIVER_BX * P, HZ = HIGHWAY_BZ * P, RZ = RAIL_BZ * P;
export const RIVER_HALF = 22;                                    // half width of the river valley (m)
export const AIRPORT = { x0: 10 * P - 24, x1: 13 * P + 24, z0: -P - 24, z1: P + 24 };
export const HARBOR = { x0: -6 * P - 24, x1: -4 * P + 24, z0: 2 * P - 24, z1: 3 * P + 24 };
const inside = (r, x, z) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
export function excludedFromRoads(x, z, n) { return (n >= SITES.airport.at && inside(AIRPORT, x, z)) || (n >= SITES.harbor.at && inside(HARBOR, x, z)); }
export const riverCurve = z => RIVER_X + 6 * Math.sin(z / 90);

const cv = (w, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const rnd = (a, b) => a + Math.random() * (b - a);
const nonIdx = g => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) n.deleteAttribute(k); return n; };
const colorize = (g, hex) => { const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) c.toArray(a, i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
class Bag {
  constructor() { this.l = []; }
  box(w, h, d, x, y0, z, c) { this.l.push(colorize(new THREE.BoxGeometry(w, h, d).translate(x, y0 + h / 2, z), c)); return this; }
  cyl(rt, rb, h, x, y0, z, c, seg = 16) { this.l.push(colorize(new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y0 + h / 2, z), c)); return this; }
  geo() { return this.l.length ? mergeGeometries(this.l.map(nonIdx)) : null; }
}
function mesh(geo, mat, shadow = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = true; return m; }
function inst(geo, mat, n) { const m = new THREE.InstancedMesh(geo, mat, n); m.frustumCulled = false; return m; }
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), tmpE = new THREE.Euler();
function put(m, i, x, y, z, yaw = 0, sx = 1, sy = 1, sz = 1, pitch = 0) { tmpE.set(pitch, yaw, 0, 'YXZ'); tmpQ.setFromEuler(tmpE); tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(sx, sy, sz)); m.setMatrixAt(i, tmpM); }

/* ---------- cached textures ---------- */
const TEX = {};
function tex(c, rep) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }
function speckle(g, w, h, k = 1) { for (let i = 0; i < w * h / 30 * k; i++) { g.fillStyle = `rgba(${Math.random() < .5 ? '0,0,0' : '255,255,255'},${rnd(.02, .08)})`; g.fillRect(Math.random() * w, Math.random() * h, rnd(1, 3), rnd(1, 3)); } }
function textures() {
  if (TEX.ready) return TEX; TEX.ready = true;
  let c = cv(1024, 256), g = c.getContext('2d'); g.fillStyle = '#2c2e32'; g.fillRect(0, 0, 1024, 256); speckle(g, 1024, 256, 1.2);   // highway: 40m x 22m tile (25.6px/m)
  g.fillStyle = '#d9b53a'; g.fillRect(0, 128 - 9, 1024, 4); g.fillRect(0, 128 + 5, 1024, 4); g.fillStyle = '#e4e6ea';
  for (const y of [128 - 71, 128 + 71]) for (let x = 0; x < 1024; x += 154) g.fillRect(x, y - 2, 77, 4);
  g.fillRect(0, 10, 1024, 5); g.fillRect(0, 241, 1024, 5); TEX.highway = tex(c, true);
  c = cv(128, 256); g = c.getContext('2d'); g.fillStyle = '#7d7a74'; g.fillRect(0, 0, 128, 256); speckle(g, 128, 256, 2);   // rail: 10m x 8m... tile 10m wide (128px) x 20m long
  g.fillStyle = '#4a3a2e'; for (let y = 0; y < 256; y += 10) { g.fillRect(14, y, 100, 5); }
  g.fillStyle = '#c4c8cf'; for (const x of [28, 40, 88, 100]) g.fillRect(x, 0, 3, 256); TEX.rail = tex(c, true);
  c = cv(2048, 256); g = c.getContext('2d'); g.fillStyle = '#303236'; g.fillRect(0, 0, 2048, 256); speckle(g, 2048, 256, 1.5);   // runway 200m x 24m
  g.fillStyle = '#e8eaee'; for (let x = 150; x < 1900; x += 150) g.fillRect(x, 124, 90, 8); g.fillRect(0, 6, 2048, 4); g.fillRect(0, 246, 2048, 4);
  for (const x of [20, 1960]) for (let y = 30; y < 230; y += 22) g.fillRect(x, y, 56, 12); TEX.runway = tex(c);
  c = cv(256); g = c.getContext('2d'); g.fillStyle = '#6f6c66'; g.fillRect(0, 0, 256, 256); speckle(g, 256, 256, 2); g.strokeStyle = 'rgba(40,40,40,.4)'; for (let i = 0; i < 256; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); } TEX.apron = tex(c, true);
  c = cv(256, 128); g = c.getContext('2d'); g.fillStyle = '#8c8a84'; g.fillRect(0, 0, 256, 128); for (let y = 0; y < 128; y += 16) for (let x = (y / 16 % 2) * 16; x < 256; x += 32) { g.fillStyle = `rgb(${130 + rnd(-14, 14)},${126 + rnd(-14, 14)},${118 + rnd(-14, 14)})`; g.fillRect(x + 1, y + 1, 30, 14); } TEX.stone = tex(c, true);
  c = cv(256); g = c.getContext('2d'); g.fillStyle = '#808080'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 260; i++) { g.strokeStyle = `rgba(${Math.random() < .5 ? '255,255,255' : '0,0,0'},.12)`; g.lineWidth = rnd(2, 6); g.beginPath(); const x = rnd(0, 256), y = rnd(0, 256); g.moveTo(x, y); g.quadraticCurveTo(x + rnd(-30, 30), y + rnd(-20, 20), x + rnd(-50, 50), y + rnd(-6, 6)); g.stroke(); } TEX.ripple = (() => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })();
  c = cv(256); g = c.getContext('2d'); g.fillStyle = '#b9a67e'; g.fillRect(0, 0, 256, 256); speckle(g, 256, 256, 3); TEX.sand = tex(c, true);
  return TEX;
}

/* ---------- vehicles ---------- */
export function makeAirliner(tail = '#d9433a') {
  const g = new THREE.Group(), white = new THREE.MeshStandardMaterial({ color: 0xe8ecf2, roughness: 0.35, metalness: 0.5 }), col = new THREE.MeshStandardMaterial({ color: tail, roughness: 0.4 });
  const add = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  add(new THREE.CylinderGeometry(1.6, 1.4, 26, 14).rotateZ(Math.PI / 2), white); add(new THREE.SphereGeometry(1.6, 14, 10), white, 13, 0, 0); add(new THREE.CylinderGeometry(1.4, 0.4, 5, 12).rotateZ(Math.PI / 2), white, -15, 0.5, 0);
  add(new THREE.BoxGeometry(5, 0.3, 26), white, -1, -0.3, 0); add(new THREE.BoxGeometry(3, 0.25, 9), white, -11, 0.2, 0); add(new THREE.BoxGeometry(3.6, 4.6, 0.3), col, -11.5, 2.6, 0);
  for (const z of [-5.5, 5.5]) add(new THREE.CylinderGeometry(0.8, 0.8, 3, 10).rotateZ(Math.PI / 2), white, 1.5, -1.2, z);
  g.userData.strobe = add(new THREE.SphereGeometry(0.45, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 4, 4) }), -13, 1, 0);
  add(new THREE.SphereGeometry(0.4, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 3, 0.4) }), -1, -0.2, 13); add(new THREE.SphereGeometry(0.4, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.15, 0.1) }), -1, -0.2, -13);
  g.rotation.order = 'YZX'; g.scale.setScalar(1.35); return g;
}
function makeBoat(kind, hull, accent) {
  const g = new THREE.Group(), M = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55 }), add = (geo, c, x, y, z) => { const m = new THREE.Mesh(geo, M(c)); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  if (kind === 'ship') { add(new THREE.BoxGeometry(26, 4, 7), hull, 0, 1.4, 0); add(new THREE.BoxGeometry(5, 5, 5.5), '#eceef2', -8, 5.4, 0); add(new THREE.CylinderGeometry(1, 1.2, 3.4, 10), accent, -9.5, 9.4, 0); add(new THREE.BoxGeometry(14, 2.6, 6), accent, 4, 4.7, 0); add(new THREE.CylinderGeometry(0, 3.4, 4, 3).rotateZ(-Math.PI / 2), hull, 15, 1.4, 0); }
  else { add(new THREE.BoxGeometry(8, 1.2, 2.6), hull, 0, 0.5, 0); add(new THREE.CylinderGeometry(0, 1.3, 2.2, 3).rotateZ(-Math.PI / 2), hull, 5, 0.5, 0); add(new THREE.CylinderGeometry(0.08, 0.08, 9, 6), '#d8d8d8', 0, 5, 0); const s = add(new THREE.BoxGeometry(0.06, 7, 3.4), '#f4f1ea', -0.4, 4.6, 0); s.rotation.x = 0; add(new THREE.BoxGeometry(2.4, 1, 1.6), accent, -2, 1.6, 0); }
  return g;
}

/* ---------- build everything for a given city size ---------- */
export function buildInfra(n, ctx) {
  const T = textures(), group = new THREE.Group(), updaters = [], X = (ctx.R + 6) * P, R = ctx.R, M = ctx.materials;
  const paintBag = new Bag(), signBag = new Bag(), flat = (w, d) => new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2);
  const decalMat = (map, o = {}) => new THREE.MeshStandardMaterial({ map, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, ...o });
  const stoneMat = new THREE.MeshStandardMaterial({ map: T.stone, roughness: 0.9, side: THREE.DoubleSide });

  if (n >= INFRA_AT) {
    /* ===== river valley with curving water, retaining walls and bridges ===== */
    const Z = 2400, step = 12, pos = [], uv = [], idx = [];
    for (let z = -Z, i = 0; z <= Z; z += step, i++) { const cx = riverCurve(z), w = 25 + 5 * Math.sin(z / 57 + 1); pos.push(cx - w / 2, -1.6, z, cx + w / 2, -1.6, z); uv.push(0, z / 24, 1, z / 24); if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } }
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); wg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); wg.setIndex(idx); wg.computeVertexNormals();
    const bump = T.ripple.clone(); bump.needsUpdate = true; bump.repeat.set(1.5, 1);
    const water = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ color: 0x2a7298, roughness: 0.05, metalness: 0.15, bumpMap: bump, bumpScale: 2.2, envMapIntensity: 1.4 })); water.receiveShadow = true; group.add(water);
    updaters.push((t, dt) => { bump.offset.y -= dt * 0.025; bump.offset.x = Math.sin(t * 0.2) * 0.03; });
    const wallTex = T.stone.clone(); wallTex.needsUpdate = true; wallTex.repeat.set(Z / 8, 0.4);
    for (const s of [-1, 1]) { const wall = new THREE.Mesh(new THREE.PlaneGeometry(2 * Z, 3), new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9, side: THREE.DoubleSide })); wall.rotation.y = Math.PI / 2; wall.position.set(RIVER_X + s * RIVER_HALF, -1.5, 0); wall.receiveShadow = true; group.add(wall); }
    for (const s of [-1, 1]) paintBag.box(0.5, 0.9, 2 * Z, RIVER_X + s * (RIVER_HALF + 0.4), 0, 0, '#9a9da2');
    /* bridges at every cross road and the rail line */
    const bz = []; for (let k = -R - 1; k <= R; k++) bz.push(k * P + P / 2); bz.push(RZ);
    const decks = inst(new THREE.BoxGeometry(2 * RIVER_HALF + 4, 1.2, 12), new THREE.MeshStandardMaterial({ color: 0x8d9095, roughness: 0.85 }), bz.length), piers = inst(new THREE.CylinderGeometry(1.1, 1.3, 1, 12), new THREE.MeshStandardMaterial({ color: 0x8d9095, roughness: 0.85 }), bz.length * 3), rails = inst(new THREE.BoxGeometry(2 * RIVER_HALF + 4, 0.9, 0.25), new THREE.MeshStandardMaterial({ color: 0xa4a7ac, roughness: 0.8 }), bz.length * 2);
    bz.forEach((z, i) => { put(decks, i, RIVER_X, -0.6, z); for (let k = 0; k < 3; k++) put(piers, i * 3 + k, RIVER_X + (k - 1) * 15, -2.2, z, 0, 1, 2.2, 1); put(rails, i * 2, RIVER_X, 0.45, z - 5.9); put(rails, i * 2 + 1, RIVER_X, 0.45, z + 5.9); });
    decks.castShadow = piers.castShadow = true; group.add(decks, piers, rails);

    /* ===== elevated highway with on-ramps and fast traffic ===== */
    const hw = mesh(flat(2 * X, 22), decalMat(T.highway.clone(), { roughness: 0.85 }), false); hw.material.map.repeat.set(2 * X / 40, 1); hw.material.map.needsUpdate = true; hw.position.set(0, 6.26, HZ); group.add(hw);
    paintBag.box(2 * X, 0.7, 22, 0, 5.5, HZ, '#8d9095').box(2 * X, 0.9, 0.5, 0, 6.2, HZ - 10.7, '#b6b9be').box(2 * X, 0.9, 0.5, 0, 6.2, HZ + 10.7, '#b6b9be');
    const pc = Math.floor(2 * X / 24), pier = inst(new THREE.BoxGeometry(3, 1, 3).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0x8d9095, roughness: 0.85 }), pc), cap = inst(new THREE.BoxGeometry(16, 1.1, 3), new THREE.MeshStandardMaterial({ color: 0x8d9095, roughness: 0.85 }), pc);
    for (let i = 0; i < pc; i++) { const x = -X + (i + 0.5) * 24, deep = Math.abs(x - RIVER_X) < RIVER_HALF + 2 ? 3 : 0; put(pier, i, x, -deep, HZ, 0, 1, 5.3 + deep, 1); put(cap, i, x, 4.9, HZ); }
    pier.castShadow = cap.castShadow = true; group.add(pier, cap);
    const lampC = Math.floor(2 * X / 24) * 2, lampPole = inst(new THREE.CylinderGeometry(0.12, 0.16, 8, 6).translate(0, 4, 0), new THREE.MeshStandardMaterial({ color: 0x23262b, metalness: 0.6, roughness: 0.5 }), lampC), lampHead = inst(new THREE.SphereGeometry(0.5, 10, 8), ctx.lampMat, lampC);
    for (let i = 0; i < lampC / 2; i++) for (const s of [-1, 1]) { const k = i * 2 + (s > 0 ? 1 : 0), x = -X + (i + 0.5) * 24 + 12; put(lampPole, k, x, 6.6, HZ + s * 10.4); put(lampHead, k, x, 14.7, HZ + s * 10.4); }
    group.add(lampPole, lampHead);
    const ks = []; for (let k = -R; k <= R; k++) if (k % 3 === 0) ks.push(k);
    const ramps = inst(new THREE.BoxGeometry(7, 0.6, 1), new THREE.MeshStandardMaterial({ color: 0x2c2e32, roughness: 0.9 }), ks.length * 2), ang = Math.atan2(6.2, 19), len = Math.hypot(19, 6.2);
    ks.forEach((k, i) => { const x = k * P + P / 2 + 12; put(ramps, i * 2, x, 3.1, HZ + 20.5, 0, 1, 1, len, ang); put(ramps, i * 2 + 1, x, 3.1, HZ - 20.5, 0, 1, 1, len, -ang); });
    ramps.receiveShadow = true; group.add(ramps);
    const hc = Math.min(70, 12 + Math.floor(R * 6)), hbody = inst(ctx.carGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.6 }), hc), hl = inst(new THREE.BoxGeometry(0.45, 0.3, 0.12), new THREE.MeshBasicMaterial({ color: 0xffffff }), hc * 2), cars = [], pal = ['#d9dce2', '#14161a', '#8a1c1c', '#26446e', '#8e9298', '#e8e3d4', '#c9a227'];
    for (let i = 0; i < hc; i++) { const dir = i % 2 ? 1 : -1, lane = (Math.floor(i / 2) % 2 ? 7.2 : 2.8) * dir; cars.push({ s: Math.random() * 2 * X - X, v: (20 + Math.random() * 12) * dir, z: HZ + lane, dir }); hbody.setColorAt(i, new THREE.Color(pal[i % pal.length])); hl.setColorAt(i * 2, new THREE.Color(2.4, 2.3, 2)); hl.setColorAt(i * 2 + 1, new THREE.Color(2.4, 0.12, 0.08)); }
    hbody.instanceColor.needsUpdate = hl.instanceColor.needsUpdate = true; hbody.castShadow = true; group.add(hbody, hl);
    updaters.push((t, dt) => { cars.forEach((c, i) => { c.s += c.v * dt; if (c.s > X) c.s -= 2 * X; else if (c.s < -X) c.s += 2 * X; const yaw = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2; put(hbody, i, c.s, 6.3, c.z, yaw); put(hl, i * 2, c.s + c.dir * 2.15, 6.95, c.z, yaw); put(hl, i * 2 + 1, c.s - c.dir * 2.15, 6.95, c.z, yaw); }); hbody.instanceMatrix.needsUpdate = hl.instanceMatrix.needsUpdate = true; });

    /* ===== rail line, station and train ===== */
    const rt = mesh(flat(2 * X, 10), decalMat(T.rail.clone()), false); rt.material.map.repeat.set(2 * X / 20, 1); rt.material.map.needsUpdate = true; rt.rotation.y = 0; rt.position.set(0, 0.11, RZ);
    // texture rails run along the tile's v axis; rotate the plane so they run along x
    rt.geometry.dispose(); rt.geometry = new THREE.PlaneGeometry(10, 2 * X).rotateX(-Math.PI / 2).rotateY(Math.PI / 2); rt.material.map.repeat.set(1, 2 * X / 20); group.add(rt);
    paintBag.box(40, 0.9, 5, 0, 0, RZ + 7.5, '#bdb9ae').box(40, 0.3, 6.4, 0, 4.2, RZ + 7.5, '#d8dadf').box(26, 6.5, 9, 0, 0, RZ + 16, '#c9c4b5').box(27, 0.5, 10, 0, 6.5, RZ + 16, '#6a6e75').box(40, 0.9, 5, 0, 0, RZ - 7.5, '#bdb9ae');
    for (const x of [-18, -9, 0, 9, 18]) for (const dz of [5.2, 9.8]) paintBag.box(0.3, 4.2, 0.3, x, 0, RZ + dz, '#4a4e55');
    signBag.box(8, 1.4, 0.3, 0, 4.6, RZ + 11.2, '#9be0ff').box(2.4, 2.4, 0.3, 8, 7, RZ + 11.3, '#fff3c9');
    const carGeo = (() => { const b = new Bag(); b.box(12, 3.2, 3, 0, 0.6, 0, '#d4d8de').box(11.6, 0.9, 3.06, 0, 1.9, 0, '#1c2a38').box(12, 0.4, 3, 0, 3.8, 0, '#4a5560').box(12, 0.35, 3.05, 0, 0.9, 0, '#2f6aa8'); return b.geo(); })();
    const trains = [{ dir: 1, z: RZ - 2.6, off: 0 }, { dir: -1, z: RZ + 2.6, off: 600 }], carriages = inst(carGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.55 }), trains.length * 6); carriages.castShadow = true; group.add(carriages);
    updaters.push((t) => { trains.forEach((tr, ti) => { const head = (((t * 22 + tr.off) % (2 * X)) + 2 * X) % (2 * X) - X; for (let c = 0; c < 6; c++) { let x = tr.dir > 0 ? head - c * 13 : -head + c * 13; put(carriages, ti * 6 + c, x, 0.2, tr.z, tr.dir > 0 ? 0 : Math.PI); } }); carriages.instanceMatrix.needsUpdate = true; });
  }

  if (n >= SITES.airport.at) {
    /* ===== airport: runway, taxiway, terminal, tower, hangars, lights, planes taking off and landing ===== */
    const ax = (AIRPORT.x0 + AIRPORT.x1) / 2, RW0 = ax - 96, RW1 = ax + 96;
    const rw = mesh(flat(200, 24), decalMat(T.runway), false); rw.position.set(ax, 0.12, 0); group.add(rw);
    const ap = decalMat(T.apron.clone()); ap.map.repeat.set(10, 3); ap.map.needsUpdate = true;
    for (const [w, d, x, z] of [[190, 9, ax, 40], [9, 40, ax - 70, 20], [9, 40, ax, 20], [9, 40, ax + 70, 20], [150, 40, ax, 70]]) { const m = mesh(flat(w, d), ap, false); m.position.set(x, 0.1, z); group.add(m); }
    paintBag.box(80, 9, 14, ax, 0, 78, '#cfd3d8').box(80, 1, 17, ax, 9, 78, '#8f949b').box(80, 4.4, 0.5, ax, 1.2, 70.8, '#26394a');
    for (const dx of [-24, 0, 24]) paintBag.box(3, 3, 14, ax + dx, 3.5, 66, '#b8bcc4');
    paintBag.cyl(2.6, 3.2, 32, ax - 70, 0, 70, '#d9dbe0', 16).cyl(5, 4, 5.5, ax - 70, 32, 70, '#27425a', 16).cyl(5.5, 5.5, 0.8, ax - 70, 37.5, 70, '#8f949b', 16);
    for (const dx of [38, 62, 86]) paintBag.box(24, 9, 20, ax + dx - 8, 0, 72, '#8e949c').box(24.4, 0.6, 20.4, ax + dx - 8, 9, 72, '#6a6f77');
    for (const [dx, dz] of [[-60, -58], [-48, -58], [-36, -58]]) paintBag.cyl(6, 6, 9, ax + dx, 0, dz, '#e4e6ea', 20);
    signBag.box(24, 2.4, 0.4, ax, 10.5, 70.2, '#7fd0ff');
    const rl = inst(new THREE.SphereGeometry(0.45, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), 34 * 2); let k = 0;
    for (let x = RW0; x <= RW1; x += 12) for (const s of [-1, 1]) { put(rl, k++, x, 0.35, s * 12.8); } rl.count = k; group.add(rl);
    const rwMat = rl.material; updaters.push(() => { const f = ctx.getWindowF(); rwMat.color.setRGB(0.9, 0.95, 1).multiplyScalar(0.25 + 4 * f); });
    const parked = [[-24, 62, '#2f6aa8'], [0, 62, '#d9433a'], [24, 62, '#3a8a5a']].map(([dx, z, c]) => { const p = makeAirliner(c); p.rotation.y = -Math.PI / 2; p.position.set(ax + dx, 2.4, z); group.add(p); return p; });
    void parked;
    const dep = makeAirliner('#e8a52a'), arr = makeAirliner('#7a4fd0'); group.add(dep, arr);
    updaters.push((t) => {
      const a = t % 80; dep.visible = a < 52;
      if (a < 10) { dep.position.set(RW0 + 192 * (a / 10) ** 2, 2.5, 0); dep.rotation.set(0, 0, a > 8 ? 0.15 : 0); }
      else if (a < 52) { const u = a - 10, dx = 60; dep.position.set(RW1 + u * dx, 2.5 + 9 * u + 0.12 * u * u, 0); dep.rotation.set(0, 0, Math.atan2(9 + 0.24 * u, dx)); }
      const l = (t + 40) % 80; arr.visible = l < 36;
      if (l < 22) { const f = l / 22; arr.position.set(1700 - (1700 - (RW1 - 6)) * f, 2.5 + 240 * (1 - f) ** 1.3, 0); arr.rotation.set(0, Math.PI, -0.1 * (1 - f)); }
      else if (l < 36) { const u = (l - 22) / 14; arr.position.set(RW1 - 6 - 180 * (1 - (1 - u) ** 2), 2.5, 0); arr.rotation.set(0, Math.PI, 0); }
      dep.userData.strobe.visible = arr.userData.strobe.visible = Math.sin(t * 9) > 0.6;
    });
    addAirportLife(group, updaters, ctx, ax);
  }

  if (n >= SITES.harbor.at) {
    /* ===== harbor: water basin, quays, piers, containers, cranes, moving boats ===== */
    const hx = (HARBOR.x0 + HARBOR.x1) / 2, hz = (HARBOR.z0 + HARBOR.z1) / 2, wx0 = HARBOR.x0 + 14, wx1 = HARBOR.x1 - 14, wz0 = HARBOR.z0 + 30, wz1 = HARBOR.z1 - 14;
    const bw = bump => new THREE.MeshStandardMaterial({ color: 0x2a7298, roughness: 0.05, metalness: 0.15, bumpMap: bump, bumpScale: 2.2, envMapIntensity: 1.4 });
    const hb = T.ripple.clone(); hb.needsUpdate = true; hb.repeat.set(6, 4);
    const sea = mesh(flat(wx1 - wx0, wz1 - wz0), bw(hb), false); sea.position.set((wx0 + wx1) / 2, 0.16, (wz0 + wz1) / 2); group.add(sea);
    updaters.push((t, dt) => { hb.offset.x += dt * 0.012; hb.offset.y += dt * 0.008; });
    paintBag.box(wx1 - wx0 + 4, 1.2, 2, hx, 0, wz0 - 1, '#b7b4aa').box(wx1 - wx0 + 4, 1.2, 2, hx, 0, wz1 + 1, '#b7b4aa').box(2, 1.2, wz1 - wz0, wx0 - 1, 0, (wz0 + wz1) / 2, '#b7b4aa').box(2, 1.2, wz1 - wz0, wx1 + 1, 0, (wz0 + wz1) / 2, '#b7b4aa');
    for (const x of [hx - 40, hx, hx + 40]) paintBag.box(8, 1.1, 46, x, 0, wz0 + 23, '#b7b4aa');
    const cols = ['#c0392b', '#2f6aa8', '#e8a52a', '#3a8a5a', '#8e9298', '#7a4fd0'], conts = inst(new THREE.BoxGeometry(12, 2.6, 2.5), new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.4 }), 150); let ci = 0;
    for (let r = 0; r < 5; r++) for (let c = 0; c < 6; c++) for (let h = 0; h < 2 + ((r + c) % 2); h++) { if (ci >= 150) break; put(conts, ci, wx0 + 14 + c * 14, 1.3 + h * 2.62, HARBOR.z0 + 4 + r * 3, 0); conts.setColorAt(ci, new THREE.Color(cols[(r * 3 + c * 5 + h) % cols.length])); ci++; }
    conts.count = ci; conts.instanceColor.needsUpdate = true; conts.castShadow = true; group.add(conts);
    for (const x of [hx - 60, hx + 20]) { paintBag.box(1, 28, 1, x - 8, 0, wz1 + 4, '#d9a32a').box(1, 28, 1, x + 8, 0, wz1 + 4, '#d9a32a').box(18, 1.4, 1.4, x, 26, wz1 + 4, '#d9a32a').box(1.4, 1.4, 30, x, 27, wz1 - 10, '#d9a32a'); }
    paintBag.box(46, 9, 18, hx - 50, 0, HARBOR.z1 + 16 - 40, '#8e949c');
    const boats = [];
    for (const [kind, hull, acc, rx, rz, spd, ph] of [['ship', '#7a2b2b', '#e8e8ec', 0.34, 0.28, 3.2, 0], ['ship', '#1f3f66', '#e8a52a', 0.22, 0.2, 2.6, 2.1], ['sail', '#f4f1ea', '#d9433a', 0.42, 0.34, 4.5, 4.4], ['sail', '#1d2630', '#3a8a5a', 0.3, 0.3, 4, 1.2], ['sail', '#d9433a', '#2f6aa8', 0.38, 0.22, 5, 3.3]]) {
      const b = makeBoat(kind, hull, acc); group.add(b); boats.push({ b, rx: (wx1 - wx0) * rx, rz: (wz1 - wz0 - 50) * rz, spd, ph, cx: hx, cz: wz0 + 62 + (wz1 - wz0 - 62) / 2 });
    }
    updaters.push((t) => boats.forEach(o => { const a = t * o.spd / 90 + o.ph, x = o.cx + Math.cos(a) * o.rx, z = o.cz + Math.sin(a) * o.rz; o.b.position.set(x, 0.3, z); o.b.rotation.y = Math.atan2(-Math.cos(a) * o.rz, -Math.sin(a) * o.rx); o.b.rotation.z = Math.sin(t * 1.3 + o.ph) * 0.02; }));
    addHarborLife(group, updaters, ctx, { hx, hz, wx0, wx1, wz0, wz1 });
  }

  const pg = paintBag.geo(); if (pg) group.add(mesh(pg, M.paint));
  const sg = signBag.geo(); if (sg) group.add(mesh(sg, M.sign, false));
  return { group, update: (t, dt) => updaters.forEach(u => u(t, dt)) };
}

/* ---------- ground life: vehicles, people and moving machinery ---------- */
const flatG = (w, d) => new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2);
function loopPath(pts) {
  const lens = pts.map((p, i) => { const q = pts[(i + 1) % pts.length]; return Math.hypot(q[0] - p[0], q[1] - p[1]); }), tot = lens.reduce((a, b) => a + b, 0);
  return { tot, at(d) { d = ((d % tot) + tot) % tot; let k = 0; while (d > lens[k]) { d -= lens[k]; k++; } const p = pts[k], q = pts[(k + 1) % pts.length], f = d / lens[k]; return [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, Math.atan2(q[0] - p[0], q[1] - p[1])]; } };
}
function horiz(rad, len, r, x, y0, z, c, l) { l.push(colorize(new THREE.CylinderGeometry(r, r, len, 14).rotateX(Math.PI / 2).translate(x, y0 + r, z), c)); }
const VEH = (() => {
  const mk = f => { const b = new Bag(); f(b); return b.geo(); }, out = {};
  out.tug = mk(b => { b.box(1.9, 1.1, 2.6, 0, 0.4, 0, '#e8a52a').box(1.7, 0.9, 1.3, 0, 1.4, -0.4, '#2b3440').box(0.3, 0.3, 0.6, 0, 0.3, -1.5, '#4a4e55'); });
  out.cart = mk(b => { b.box(2.3, 0.35, 3.6, 0, 0.45, 0, '#8e949c').box(2.1, 1.2, 3.2, 0, 0.8, 0, '#c8ccd2').box(2.2, 0.15, 3.4, 0, 2.0, 0, '#d9433a'); });
  out.fuel = mk(b => { b.box(2.4, 1.6, 2.4, 0, 0.5, 3, '#e8e8ec').box(2.0, 0.9, 1.3, 0, 1.6, 3.6, '#2b3440').box(2.4, 0.5, 6.6, 0, 0.3, -1, '#4a4e55'); horiz(0, 6.2, 1.15, 0, 0.9, -1.2, '#d9433a', b.l); });
  out.bus = mk(b => { b.box(2.7, 2.7, 9.4, 0, 0.5, 0, '#f1f1ee').box(2.75, 1.0, 8.2, 0, 1.5, 0, '#1d2630').box(2.7, 0.4, 9.4, 0, 1.0, 0, '#2f6aa8'); });
  out.catering = mk(b => { b.box(2.5, 1.5, 2.2, 0, 0.5, 3, '#e8e8ec').box(2.2, 0.9, 1.2, 0, 1.6, 3.5, '#2b3440').box(2.8, 3.2, 5.2, 0, 1.2, -0.6, '#ffffff').box(2.9, 0.4, 5.3, 0, 3.5, -0.6, '#2f6aa8'); });
  out.truck = mk(b => { b.box(2.5, 2.2, 2.4, 0, 0.6, 5.6, '#2f6aa8').box(2.2, 0.8, 1.2, 0, 2.0, 6.1, '#1d2630').box(2.4, 0.4, 9, 0, 0.5, -0.4, '#4a4e55').box(2.5, 2.6, 8.4, 0, 0.9, -0.6, '#c0392b'); });
  out.fork = mk(b => { b.box(1.4, 1.2, 2, 0, 0.3, 0, '#e8a52a').box(1.2, 1.2, 0.2, 0, 1.4, 0.8, '#2b3440').box(0.1, 1.8, 0.1, -0.4, 0.2, 1.4, '#4a4e55').box(0.1, 1.8, 0.1, 0.4, 0.2, 1.4, '#4a4e55').box(0.15, 0.1, 1.2, -0.4, 0.3, 2.0, '#4a4e55').box(0.15, 0.1, 1.2, 0.4, 0.3, 2.0, '#4a4e55'); });
  return out;
})();
const vehMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.3 });
/* agents: [{ kind, path, speed, off }] -> returns an update(t) function */
function driveAgents(group, agents) {
  const by = {}; agents.forEach(a => (by[a.kind] ||= []).push(a));
  const meshes = Object.entries(by).map(([kind, list]) => { const m = inst(VEH[kind], vehMat, list.length); m.castShadow = true; group.add(m); return { m, list }; });
  return t => { for (const { m, list } of meshes) { list.forEach((a, i) => { const [x, z, yaw] = a.path.at(t * a.speed + a.off); put(m, i, x, 0.02, z, yaw); }); m.instanceMatrix.needsUpdate = true; } };
}
const bodyGeo = new THREE.CapsuleGeometry(0.21, 0.55, 4, 8).translate(0, 1.0, 0), headG = new THREE.SphereGeometry(0.14, 10, 8).translate(0, 1.55, 0);
function crowd(group, count, shirts) {
  const mat = () => new THREE.MeshStandardMaterial({ roughness: 0.7 }), body = inst(bodyGeo, mat(), count), head = inst(headG, mat(), count), skins = ['#f1c9a5', '#d9a679', '#a97551', '#6b4a33'];
  for (let i = 0; i < count; i++) { body.setColorAt(i, new THREE.Color(shirts[i % shirts.length])); head.setColorAt(i, new THREE.Color(skins[(i * 7) % 4])); }
  body.instanceColor.needsUpdate = head.instanceColor.needsUpdate = true; body.castShadow = true; group.add(body, head);
  return { set(i, x, y, z, yaw) { put(body, i, x, y, z, yaw); put(head, i, x, y, z, yaw); }, flush() { body.instanceMatrix.needsUpdate = head.instanceMatrix.needsUpdate = true; } };
}
function serviceRoad(group, w, d, x, z) { const m = new THREE.Mesh(flatG(w, d), new THREE.MeshStandardMaterial({ color: 0x3b3d42, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })); m.position.set(x, 0.1, z); m.receiveShadow = true; group.add(m); }

function addAirportLife(group, updaters, ctx, ax) {
  serviceRoad(group, 176, 9, ax, 47);
  const road = loopPath([[ax - 85, 49], [ax + 85, 49], [ax + 85, 45], [ax - 85, 45]]), agents = [];
  for (const [train, off] of [[0, 20], [1, 190]]) { agents.push({ kind: 'tug', path: road, speed: 6, off }); for (let k = 1; k <= 3; k++) agents.push({ kind: 'cart', path: road, speed: 6, off: off - k * 4.6 }); void train; }
  agents.push({ kind: 'fuel', path: road, speed: 4.5, off: 120 }, { kind: 'catering', path: road, speed: 3.5, off: 260 }, { kind: 'bus', path: road, speed: 7, off: 60 }, { kind: 'bus', path: road, speed: 7, off: 230 });
  const drive = driveAgents(group, agents);
  /* ground crew around the parked planes, and passengers crossing in front of the terminal */
  const crew = crowd(group, 18, ['#ff7a1a', '#ffd23a', '#ff7a1a', '#e8e8ec']), walkRoad = loopPath([[ax - 36, 69.2], [ax + 36, 69.2], [ax + 36, 70.4], [ax - 36, 70.4]]);
  const spots = []; for (const dx of [-24, 0, 24]) spots.push([ax + dx - 7, 55], [ax + dx + 7, 55], [ax + dx - 12, 62], [ax + dx + 12, 62]);
  /* rotating radar on the control tower */
  const radar = inst(new Bag().box(5.2, 0.4, 0.9, 0, 0, 0, '#cfd3d8').box(0.4, 1.4, 0.4, 0, -1.4, 0, '#8f949b').box(1.2, 0.8, 0.5, 2.2, 0.3, 0, '#d9433a').geo(), vehMat, 1); radar.castShadow = true; group.add(radar);
  updaters.push((t) => {
    drive(t);
    for (let i = 0; i < 18; i++) {
      if (i < 12) { const s = spots[i]; crew.set(i, s[0] + Math.sin(t * 0.5 + i) * 0.6, Math.abs(Math.sin(t * 2 + i)) * 0.03, s[1] + Math.cos(t * 0.4 + i * 2) * 0.5, Math.sin(t * 0.3 + i) * 1.4); }
      else { const [x, z, yaw] = walkRoad.at(t * 1.2 + (i - 12) * 22); crew.set(i, x, Math.abs(Math.sin(t * 6 + i)) * 0.05, z, yaw); }
    }
    crew.flush(); put(radar, 0, ax - 70, 40.6, 70, t * 2.4); radar.instanceMatrix.needsUpdate = true;
  });
}

function addHarborLife(group, updaters, ctx, h) {
  const { hx, wx0, wx1, wz1 } = h, x0 = wx0 - 4, x1 = wx1 + 4;
  serviceRoad(group, x1 - x0, 9, hx, 119);
  const road = loopPath([[x0 + 4, 121], [x1 - 4, 121], [x1 - 4, 117], [x0 + 4, 117]]), yard = loopPath([[x0 + 16, 115.6], [x0 + 70, 115.6], [x0 + 70, 114.4], [x0 + 16, 114.4]]), agents = [];
  for (const [sp, off] of [[6, 0], [7.5, 120], [5, 250]]) agents.push({ kind: 'truck', path: road, speed: sp, off });
  agents.push({ kind: 'fork', path: yard, speed: 3, off: 0 }, { kind: 'fork', path: yard, speed: 3.4, off: 60 });
  const drive = driveAgents(group, agents);
  /* dock workers walking the quay edges */
  const workers = crowd(group, 14, ['#ff7a1a', '#ffd23a', '#ff7a1a', '#3b6fb0']), quayN = loopPath([[x0 + 8, 124.6], [x1 - 8, 124.6], [x1 - 8, 125.4], [x0 + 8, 125.4]]), quayS = loopPath([[x0 + 30, wz1 + 7.2], [x1 - 30, wz1 + 7.2], [x1 - 30, wz1 + 8.2], [x0 + 30, wz1 + 8.2]]);
  /* crane trolleys carrying containers back and forth */
  const cranes = [hx - 60, hx + 20], trolley = inst(new Bag().box(2.4, 1.2, 2.4, 0, 0, 0, '#2b3440').geo(), vehMat, 2), cable = inst(new THREE.BoxGeometry(0.12, 1, 0.12).translate(0, -0.5, 0), new THREE.MeshStandardMaterial({ color: 0x1d2023 }), 2), box = inst(new THREE.BoxGeometry(2.5, 2.6, 12).translate(0, -1.3, 0), new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.4 }), 2);
  box.setColorAt(0, new THREE.Color('#2f6aa8')); box.setColorAt(1, new THREE.Color('#d9433a')); box.instanceColor.needsUpdate = true; group.add(trolley, cable, box);
  /* quay lamps */
  const lampPos = []; for (let x = x0 + 12; x < x1 - 8; x += 16) lampPos.push([x, 126.8]);
  const poles = inst(new THREE.CylinderGeometry(0.12, 0.16, 8, 6).translate(0, 4, 0), new THREE.MeshStandardMaterial({ color: 0x23262b, metalness: 0.6, roughness: 0.5 }), lampPos.length), heads = inst(new THREE.SphereGeometry(0.5, 10, 8), ctx.lampMat, lampPos.length);
  lampPos.forEach((p, i) => { put(poles, i, p[0], 0.2, p[1]); put(heads, i, p[0], 8.4, p[1]); }); group.add(poles, heads);
  /* seagulls circling the harbor */
  const gullGeo = new Bag(); const wl = new THREE.BoxGeometry(1.5, 0.06, 0.5).translate(-0.75, 0, 0).rotateZ(0.3), wr = new THREE.BoxGeometry(1.5, 0.06, 0.5).translate(0.75, 0, 0).rotateZ(-0.3); gullGeo.l.push(colorize(wl, '#f4f4f2'), colorize(wr, '#f4f4f2'), colorize(new THREE.BoxGeometry(0.3, 0.2, 0.9), '#ffffff'));
  const gulls = inst(gullGeo.geo(), vehMat, 12), cz = (h.wz0 + wz1) / 2;
  updaters.push((t) => {
    drive(t);
    for (let i = 0; i < 14; i++) { const [x, z, yaw] = (i < 9 ? quayN : quayS).at(t * 1.1 + i * 31); workers.set(i, x, Math.abs(Math.sin(t * 6 + i)) * 0.05, z, yaw); } workers.flush();
    cranes.forEach((x, i) => { const u = (t * 0.045 + i * 0.4) % 1, z = wz1 + 4 - 12 + 11 * Math.cos(u * Math.PI * 2), y = 8 + 7 * (0.5 + 0.5 * Math.sin(u * Math.PI * 4)); put(trolley, i, x, 25.4, z); put(cable, i, x, 25, z, 0, 1, 25 - y, 1); put(box, i, x, y, z); });
    trolley.instanceMatrix.needsUpdate = cable.instanceMatrix.needsUpdate = box.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < 12; i++) { const a = t * (0.25 + (i % 3) * 0.05) + i * 0.9, r = 22 + (i % 4) * 11, x = hx + Math.cos(a) * r * 1.5, z = cz + Math.sin(a) * r; put(gulls, i, x, 24 + (i % 5) * 4 + Math.sin(t * 0.7 + i) * 2, z, Math.atan2(-Math.sin(a) * 1.5, Math.cos(a)) + 0, 0.6 + 0.45 * Math.abs(Math.sin(t * 7 + i)), 1, 1, Math.sin(t * 3 + i) * 0.1); }
    gulls.instanceMatrix.needsUpdate = true;
  });
}
