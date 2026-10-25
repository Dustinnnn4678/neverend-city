import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { genCity, MILESTONES, nextMilestone, UNLOCK_INDEX, UNLOCK_POS, platformOf, blockSite, siteUnlocked, SITES, L, P, T } from './city-gen.js';
import { makeMaterials, getModel } from './models.js';
import { buildInfra, excludedFromRoads, AIRPORT, HARBOR, RIVER_X, RIVER_HALF } from './infra.js';
import { InteriorSystem, canEnter } from './interior.js';
import { store } from './store.js';
import { previewStage, statsStage, crateStage, shareStage, roofItem, labelTex } from './stages.js';
import { Visitor } from './visitor.js';
import { Remote, remoteConfigured } from './remote.js';
import { Explore } from './explore.js';
import { BUSINESSES, stageOf } from './economy.js';

/* ---------- basics ---------- */
const POLL_MS = 30000, DAY_SECONDS = 150, MAX_N = 100000;
const params = new URLSearchParams(location.search);
const isMobile = matchMedia('(pointer:coarse)').matches || innerWidth < 700;
const dev = params.has('dev') || ['localhost', '127.0.0.1'].includes(location.hostname);
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const easeOut = t => 1 - Math.pow(1 - t, 3), easeInOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const fmt = n => Math.round(n).toLocaleString();
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hash2(x, z) { let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + 777) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

/* ---------- renderer, scene, post ---------- */
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
let pixelRatio = Math.min(devicePixelRatio || 1, isMobile ? 1.75 : 2);
renderer.setPixelRatio(pixelRatio); renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const aniso = renderer.capabilities.getMaxAnisotropy();

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 3, 40000);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.fog = new THREE.FogExp2(0x9fbfe6, 0.0007);

const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: isMobile ? 2 : 4 }));
composer.setPixelRatio(pixelRatio); composer.setSize(innerWidth, innerHeight);
const renderPass = new RenderPass(scene, camera); composer.addPass(renderPass);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.4, 0.45, 0.9);
composer.addPass(bloom); composer.addPass(new OutputPass());

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.06; controls.enablePan = false;
controls.autoRotate = true; controls.autoRotateSpeed = 0.35; controls.maxPolarAngle = 1.5; controls.minDistance = 40;
let userTouched = false; controls.addEventListener('start', () => { userTouched = true; });

/* ---------- sky ---------- */
const sky = new Sky(); sky.scale.setScalar(20000); scene.add(sky);
const skyU = sky.material.uniforms; skyU.turbidity.value = 5; skyU.rayleigh.value = 1.4; skyU.mieCoefficient.value = 0.004; skyU.mieDirectionalG.value = 0.85;
const nightDome = new THREE.Mesh(new THREE.SphereGeometry(18000, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, transparent: true, depthWrite: false, fog: false, uniforms: { opacity: { value: 0 } },
  vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: 'varying vec3 vP; uniform float opacity; void main(){ float h = clamp(vP.y,0.,1.); vec3 c = mix(vec3(.075,.10,.19), vec3(.006,.012,.035), pow(h,.55)); gl_FragColor = vec4(c, opacity); }' }));
nightDome.renderOrder = 1; scene.add(nightDome);
const stars = (() => {
  const n = 3000, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), r = mulberry32(5), g = new THREE.BufferGeometry();
  for (let i = 0; i < n; i++) { const a = r() * Math.PI * 2, y = Math.pow(r(), 0.7) * 0.98 + 0.02, s = Math.sqrt(1 - y * y), b = 0.4 + r() * 0.6;
    pos.set([Math.cos(a) * s * 15000, y * 15000, Math.sin(a) * s * 15000], i * 3); col.set([b, b * (0.9 + r() * .1), b * (0.85 + r() * .15)], i * 3); }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ size: 2.1, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: false })); p.renderOrder = 2; scene.add(p); return p; })();
const moon = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 20, 128, 128, 126); grd.addColorStop(0, '#fffdf4'); grd.addColorStop(.9, '#e8e6dc'); grd.addColorStop(1, 'rgba(232,230,220,0)');
  g.fillStyle = grd; g.beginPath(); g.arc(128, 128, 126, 0, 7); g.fill(); const r = mulberry32(9); g.fillStyle = 'rgba(120,125,140,.22)';
  for (let i = 0; i < 14; i++) { const a = r() * 6.28, d = r() * 80; g.beginPath(); g.arc(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 8 + r() * 22, 0, 7); g.fill(); }
  const m = new THREE.Mesh(new THREE.CircleGeometry(300, 48), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, fog: false, color: new THREE.Color(2.2, 2.2, 2.3) }));
  m.renderOrder = 3; scene.add(m); return m; })();
const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.castShadow = true; sun.shadow.mapSize.setScalar(isMobile ? 2048 : 4096); sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.6; sun.shadow.camera.near = 10; sun.shadow.camera.far = 4000;
scene.add(sun, sun.target);
const moonLight = new THREE.DirectionalLight(0x7f9bd6, 0); scene.add(moonLight);
const hemi = new THREE.HemisphereLight(0x9ec5ff, 0x3a3128, 0.6); scene.add(hemi);

/* ---------- ground, pad and road textures ---------- */
const cv = (w, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const rnd = (a, b) => a + Math.random() * (b - a);
function grassFill(g, w, h, base = '#5b7b3d') {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < w * h / 22; i++) { g.fillStyle = `rgba(${Math.random() < .5 ? '30,60,20' : '140,170,80'},${rnd(.04, .16)})`; g.fillRect(Math.random() * w, Math.random() * h, rnd(1, 3), rnd(1, 4)); }
}
function noise(g, w, h, k = 1) { for (let i = 0; i < w * h / 30 * k; i++) { g.fillStyle = `rgba(${Math.random() < .5 ? '0,0,0' : '255,255,255'},${rnd(.02, .08)})`; g.fillRect(Math.random() * w, Math.random() * h, rnd(1, 3), rnd(1, 3)); } }
function tex(c, repeat) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; } return t; }
const decal = (map, extra = {}) => new THREE.MeshStandardMaterial({ map, roughness: 0.93, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, ...extra });

// Terrain is three pieces so the river valley can be carved: west, east and a middle strip that drops 3 m once the river unlocks.
const terrainParts = (() => {
  const c = cv(512), g = c.getContext('2d'); grassFill(g, 512, 512, '#587a3a'); const t = tex(c, true);
  const sc = cv(256), sg = sc.getContext('2d'); sg.fillStyle = '#b9a67e'; sg.fillRect(0, 0, 256, 256); noise(sg, 256, 256, 3); const sand = tex(sc, true);
  const grassMat = new THREE.MeshStandardMaterial({ map: t, roughness: 1 }), sandMat = new THREE.MeshStandardMaterial({ map: sand, roughness: 1 });
  const strip = (x0, x1, mat, z0 = -10000, z1 = 10000) => { const w = x1 - x0, d = z1 - z0, g2 = new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), uv = g2.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 32, uv.getY(i) * d / 32);
    const m = new THREE.Mesh(g2, mat); m.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2); m.receiveShadow = true; scene.add(m); return m; };
  strip(RIVER_X - RIVER_HALF, RIVER_X + RIVER_HALF, grassMat, 2400, 10000); strip(RIVER_X - RIVER_HALF, RIVER_X + RIVER_HALF, grassMat, -10000, -2400);
  return { west: strip(-10000, RIVER_X - RIVER_HALF, grassMat), east: strip(RIVER_X + RIVER_HALF, 10000, grassMat), mid: strip(RIVER_X - RIVER_HALF, RIVER_X + RIVER_HALF, grassMat, -2400, 2400), grassMat, sandMat };
})();
function updateTerrain(n) { const river = n >= 1000; terrainParts.mid.position.y = river ? -3 : 0; terrainParts.mid.material = river ? terrainParts.sandMat : terrainParts.grassMat; }

function padTexture(kind) {
  const S = 256, c = cv(S), g = c.getContext('2d'), k = S / L;
  if (kind === 'lawn' || kind === 'yard' || kind === 'park') grassFill(g, S, S, kind === 'park' ? '#4f7a38' : '#5f8040');
  if (kind === 'yard') { g.fillStyle = 'rgba(150,120,80,.55)'; g.fillRect(S / 2 - 9, S * .66, 18, S * .34); g.beginPath(); g.ellipse(S * .3, S * .84, 28, 14, 0, 0, 7); g.fill(); }
  if (kind === 'park') { g.strokeStyle = '#cdbd9a'; g.lineWidth = 7; g.beginPath(); g.moveTo(S / 2, S); g.lineTo(S / 2, S / 2); g.arc(S / 2, S / 2, 52, 0, 7); g.moveTo(0, S / 2); g.lineTo(S, S / 2); g.stroke(); }
  if (kind === 'parking') { g.fillStyle = '#34363a'; g.fillRect(0, 0, S, S); noise(g, S, S); g.fillStyle = '#d8dadf'; for (let x = 0.4 * k; x < S; x += 2.6 * k) { g.fillRect(x, S - 2.2 * k, 3, 2.2 * k); g.fillRect(x, 0, 3, 2.2 * k); } }
  if (kind === 'plaza') { g.fillStyle = '#9b9a96'; g.fillRect(0, 0, S, S); g.strokeStyle = 'rgba(60,60,58,.35)'; g.lineWidth = 1; for (let i = 0; i <= S; i += k * 1.5) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S); g.moveTo(0, i); g.lineTo(S, i); g.stroke(); } noise(g, S, S, .5); }
  if (kind === 'concrete') { g.fillStyle = '#7b7d80'; g.fillRect(0, 0, S, S); noise(g, S, S); g.strokeStyle = 'rgba(40,40,44,.4)'; g.beginPath(); g.moveTo(0, S / 2); g.lineTo(S, S / 2); g.moveTo(S / 2, 0); g.lineTo(S / 2, S); g.stroke(); }
  return tex(c);
}
const PAD_KINDS = ['lawn', 'yard', 'park', 'parking', 'plaza', 'concrete'];
const padMat = Object.fromEntries(PAD_KINDS.map(k => [k, decal(padTexture(k))]));
const baseMat = (() => { const S = 512, c = cv(S), g = c.getContext('2d'), k = S / (3 * L); grassFill(g, S, S, '#5c7e3e');
  g.fillStyle = '#979a9e'; const w = 2.3 * k; g.fillRect(0, 0, S, w); g.fillRect(0, S - w, S, w); g.fillRect(0, 0, w, S); g.fillRect(S - w, 0, w, S);
  g.strokeStyle = 'rgba(40,40,44,.35)'; g.lineWidth = 1; for (let i = 0; i < S; i += k * 2) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, w); g.moveTo(i, S - w); g.lineTo(i, S); g.moveTo(0, i); g.lineTo(w, i); g.moveTo(S - w, i); g.lineTo(S, i); g.stroke(); }
  g.fillStyle = '#5a5c60'; g.fillRect(0, w - 2, S, 2); g.fillRect(0, S - w, S, 2); g.fillRect(w - 2, 0, 2, S); g.fillRect(S - w, 0, 2, S);
  return decal(tex(c)); })();

function roadTextures() {
  const W = 256, H = 1024, k = W / 12, out = {};
  let c = cv(W, H), g = c.getContext('2d'); g.fillStyle = '#2b2d31'; g.fillRect(0, 0, W, H); noise(g, W, H, 1.5);
  g.fillStyle = '#d9b53a'; g.fillRect(W / 2 - 0.45 * k, 0, 0.18 * k, H); g.fillRect(W / 2 + 0.27 * k, 0, 0.18 * k, H);
  g.fillStyle = '#d8dadf'; g.fillRect(0.5 * k, 0, 0.2 * k, H); g.fillRect(W - 0.7 * k, 0, 0.2 * k, H); out.paved = decal(tex(c), { roughness: 0.88 });
  c = cv(W, H); g = c.getContext('2d'); g.fillStyle = '#8b7352'; g.fillRect(0, 0, W, H); noise(g, W, H, 2.5);
  g.fillStyle = 'rgba(60,45,30,.4)'; g.fillRect(W / 2 - 2.0 * k, 0, 0.7 * k, H); g.fillRect(W / 2 + 1.3 * k, 0, 0.7 * k, H);
  for (let i = 0; i < 200; i++) { g.fillStyle = `rgba(${Math.random() < .5 ? '90,70,50' : '150,125,90'},.25)`; g.beginPath(); g.arc(Math.random() * W, Math.random() * H, rnd(1, 4), 0, 7); g.fill(); }
  out.dirt = decal(tex(c), { roughness: 1 });
  const I = 256, ik = I / 12;
  c = cv(I); g = c.getContext('2d'); g.fillStyle = '#2b2d31'; g.fillRect(0, 0, I, I); noise(g, I, I, 1.5); out.inter = decal(tex(c), { roughness: 0.88 });
  g.fillStyle = '#d8dadf';
  for (let t = 0.6; t < 11.6; t += 1.0) { g.fillRect(t * ik, 0.3 * ik, 0.5 * ik, 1.8 * ik); g.fillRect(t * ik, I - 2.1 * ik, 0.5 * ik, 1.8 * ik); g.fillRect(0.3 * ik, t * ik, 1.8 * ik, 0.5 * ik); g.fillRect(I - 2.1 * ik, t * ik, 1.8 * ik, 0.5 * ik); }
  out.cross = decal(tex(c), { roughness: 0.88 });
  c = cv(I); g = c.getContext('2d'); g.fillStyle = '#8b7352'; g.fillRect(0, 0, I, I); noise(g, I, I, 2.5); out.interDirt = decal(tex(c), { roughness: 1 });
  return out;
}
const roadTex = roadTextures();
const materials = makeMaterials(renderer);

/* ---------- shared small geometries ---------- */
const flatPlane = (w, d) => new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2);
const colorize = (g, hex) => { const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) c.toArray(a, i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
const nonIdx = g => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) n.deleteAttribute(k); return n; };
const merge = list => mergeGeometries(list.map(nonIdx));
const makeTreeGeo = detail => {
  const parts = [colorize(new THREE.CylinderGeometry(0.2, 0.3, 3.2, 8).translate(0, 1.6, 0), '#5a4130')];
  for (const [x, y, z, r, c] of [[0, 4.6, 0, 2.2, '#3f7a34'], [1.0, 3.8, 0.5, 1.6, '#4a8a3c'], [-0.9, 3.7, -0.6, 1.5, '#37702f'], [0.2, 5.8, 0.1, 1.4, '#4c8f3f']]) {
    const g = new THREE.IcosahedronGeometry(r, detail); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const f = 1 + 0.12 * Math.sin(p.getX(i) * 3.1 + p.getZ(i) * 2.3) * Math.cos(p.getY(i) * 2.7); p.setXYZ(i, p.getX(i) * f, p.getY(i) * f, p.getZ(i) * f); }
    g.computeVertexNormals(); g.translate(x, y, z); parts.push(colorize(g, c));
  }
  return merge(parts); };
const treeGeoHi = makeTreeGeo(2), treeGeoLo = makeTreeGeo(0);
const hydGeo = merge([colorize(new THREE.CylinderGeometry(0.2, 0.24, 0.7, 8).translate(0, 0.35, 0), '#c0392b'), colorize(new THREE.SphereGeometry(0.22, 8, 6).translate(0, 0.75, 0), '#c0392b'), colorize(new THREE.BoxGeometry(0.5, 0.12, 0.12).translate(0, 0.5, 0), '#c0392b')]);
const stopGeo = merge([colorize(new THREE.BoxGeometry(3.2, 0.12, 1.4).translate(0, 2.6, 0), '#2d3238'), colorize(new THREE.BoxGeometry(3, 2.4, 0.06).translate(0, 1.35, -0.62), '#7fb4d6'), colorize(new THREE.BoxGeometry(1.6, 0.1, 0.45).translate(0, 0.5, -0.2), '#7a5a3a'), colorize(new THREE.BoxGeometry(0.8, 1.0, 0.1).translate(1.7, 1.9, 0.5), '#2f6aa8')]);
const boardGeo = colorize(new THREE.BoxGeometry(6.4, 3.2, 0.25).translate(0, 8.4, 0), '#ffffff'), boardPostGeo = new THREE.CylinderGeometry(0.18, 0.22, 7, 8).translate(0, 3.5, 0);
const headGeoLo = new THREE.SphereGeometry(0.45, 6, 4);
const wheelGeo = (() => {
  const parts = [colorize(new THREE.TorusGeometry(13, 0.3, 6, 40), '#e8e8ec'), colorize(new THREE.TorusGeometry(6.5, 0.2, 6, 28), '#cfd3d8'), colorize(new THREE.CylinderGeometry(0.9, 0.9, 1.2, 10).rotateX(Math.PI / 2), '#c0392b')];
  for (let k = 0; k < 6; k++) parts.push(colorize(new THREE.BoxGeometry(0.2, 26, 0.15).rotateZ(k * Math.PI / 6), '#cfd3d8'));
  const pal = ['#e8a52a', '#d9433a', '#2f6aa8', '#3a8a5a', '#b79bff', '#ff8fb1'];
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; parts.push(colorize(new THREE.BoxGeometry(1.7, 1.9, 1.7).translate(Math.cos(a) * 13, Math.sin(a) * 13 - 1.1, 0), pal[k % 6])); }
  return merge(parts); })();
const benchGeo = merge([colorize(new THREE.BoxGeometry(1.8, 0.1, 0.5).translate(0, 0.5, 0), '#7a5a3a'), colorize(new THREE.BoxGeometry(1.8, 0.5, 0.08).translate(0, 0.85, -0.22), '#7a5a3a'),
  colorize(new THREE.BoxGeometry(0.08, 0.5, 0.45).translate(-0.8, 0.25, 0), '#2a2d31'), colorize(new THREE.BoxGeometry(0.08, 0.5, 0.45).translate(0.8, 0.25, 0), '#2a2d31')]);
const carGeo = merge([colorize(new THREE.BoxGeometry(1.8, 0.9, 4.3).translate(0, 0.7, 0), '#ffffff'), colorize(new THREE.BoxGeometry(1.6, 0.6, 2.2).translate(0, 1.4, -0.2), '#2b3440')]);
const busGeo = merge([colorize(new THREE.BoxGeometry(2.5, 2.6, 11).translate(0, 1.7, 0), '#e8b52a'), colorize(new THREE.BoxGeometry(2.55, 0.9, 9.4).translate(0, 2.2, 0), '#1d2630'), colorize(new THREE.BoxGeometry(2.4, 0.15, 10.6).translate(0, 3.05, 0), '#f1f1ee')]);
const sailGeo = merge([colorize(new THREE.BoxGeometry(0.4, 11, 0.12), '#6b4f36'), colorize(new THREE.BoxGeometry(11, 0.4, 0.12), '#6b4f36'),
  ...[[0, 3.3], [0, -3.3], [3.3, 0], [-3.3, 0]].map(([x, y]) => colorize(new THREE.BoxGeometry(x ? 3.2 : 1.7, y ? 3.2 : 1.7, 0.06).translate(x ? x * 1.15 : 1.1, y ? y * 1.15 : 0, 0.1), '#efe9db'))]);
const poleGeo = new THREE.CylinderGeometry(0.12, 0.17, 9, 8).translate(0, 4.5, 0);
const tlPoleGeo = new THREE.CylinderGeometry(0.1, 0.12, 6.4, 8).translate(0, 3.2, 0);
const headGeo = new THREE.SphereGeometry(0.45, 14, 10), lampSphere = new THREE.SphereGeometry(0.28, 10, 8);

/* ---------- people (stylized, animated) ---------- */
const personParts = {
  body: new THREE.CapsuleGeometry(0.21, 0.55, 4, 8).translate(0, 1.12, 0), head: new THREE.SphereGeometry(0.14, 12, 8).translate(0, 1.66, 0),
  leg: new THREE.BoxGeometry(0.19, 0.86, 0.22).translate(0, -0.43, 0) };

/* ---------- world state ---------- */
const world = new THREE.Group(); scene.add(world);
let W = null;                                   // current built world
let live = { instagram: 150, youtube: 100, total: 250 };
let count = 0, shown = 0, devActive = params.has('count') || false, platformView = false, loadedOnce = false;
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpC = new THREE.Color(), UP = new THREE.Vector3(0, 1, 0);
const tmpM2 = new THREE.Matrix4(), tmpE = new THREE.Euler();
const PAD_OF = { house: s => s.i < 250 ? 'yard' : 'lawn', townhome: 'plaza', apartment: 'lawn', store: 'parking', gas: 'parking', shop: 'parking', diner: 'parking', mall: 'parking', garage: 'plaza', office: 'plaza',
  warehouse: 'concrete', watertower: 'concrete', school: 'lawn', church: 'lawn', library: 'plaza', fire: 'plaza', police: 'plaza', clinic: 'plaza', post: 'plaza', hospital: 'parking', park: 'park', green: 'lawn',
  windmill: 'lawn', clocktower: 'plaza', cityhall: 'plaza', cinema: 'parking', bank: 'plaza', hotel: 'plaza', observation: 'plaza',
  skyscraper: 'plaza', stadium: 'plaza', campus: 'lawn', amusement: 'plaza', megatower: 'plaza', monument: 'plaza', powerplant: 'concrete', celltower: 'concrete' };
const TOWER_TINT = ['#ffffff', '#9fd0ff', '#8fe0d0', '#ffd7a0', '#d8c8ff', '#ffb8b0', '#b5ffd0', '#c8d4e8'];
const PASTEL = ['#f4f1ea', '#ead9c0', '#d6e3ee', '#ecd0cd', '#d9e6d3', '#efe3b8', '#c9cfd6', '#d8c3a8'];
const lampMat = new THREE.MeshBasicMaterial({ color: 0x000000 }), tlMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const aviMat = new THREE.MeshBasicMaterial({ color: 0xff2010 });
const PLAT = { ig: new THREE.Color(1.0, 0.3, 0.75), yt: new THREE.Color(1.0, 0.22, 0.2) };

/* ---------- chunks: full detail near the camera, cheap stand-ins far away (keeps 100k structures smooth) ---------- */
const CHUNK = 6;                                  // blocks per chunk side
const proxyGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const PROXY_TINT = { house: '#d9c9a8', townhome: '#b98c70', shop: '#c8a98a', warehouse: '#8a8f96', park: '#4f7a38', green: '#4f7a38' };
const skipSites = ['river', 'highway', 'rail', 'airport', 'harbor'];

function disposeWorld() {
  if (!W) return;
  for (const o of [...world.children]) { world.remove(o); o.traverse(c => { if (c.isInstancedMesh) c.dispose(); }); }
  W = null;
}
function instanced(geo, mat, n, name) { const m = new THREE.InstancedMesh(geo, mat, n); m.name = name || ''; m.frustumCulled = false; world.add(m); return m; }
function setPos(mesh, i, x, y, z, yaw = 0, sc = 1, sy = sc) { tmpQ.setFromAxisAngle(UP, yaw); tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(sc, sy, sc)); mesh.setMatrixAt(i, tmpM); }

function placeStruct(s, sy) {
  tmpQ.setFromAxisAngle(UP, s.yaw * Math.PI / 2); tmpM.compose(tmpP.set(s.x, 0, s.z), tmpQ, tmpS.set(1, Math.max(sy, 1e-4), 1));
  for (const r of s.refs) { r.mesh.setMatrixAt(r.slot, tmpM); r.mesh.instanceMatrix.needsUpdate = true; }
}

function buildWorld(n, firstNew) {
  disposeWorld();
  const city = genCity(n), R = Math.max(city.roadRing, 1), paved = n >= T.paved, crosswalks = n >= T.apts, S = city.structures, chunked = n > 3000;
  const treeGeo = n > 8000 ? treeGeoLo : treeGeoHi;
  updateTerrain(n);

  /* chunk bookkeeping */
  const chunks = new Map();
  const chunkAt = (x, z) => {
    const ix = chunked ? Math.floor(Math.round(x / P) / CHUNK) : 0, iz = chunked ? Math.floor(Math.round(z / P) / CHUNK) : 0, key = ix + ',' + iz; let c = chunks.get(key);
    if (!c) { c = { key, hi: new THREE.Group(), lo: null, items: [], cx: (ix + 0.5) * CHUNK * P, cz: (iz + 0.5) * CHUNK * P }; world.add(c.hi); chunks.set(key, c); }
    return c;
  };
  const perChunk = (items, xz, make) => { const by = new Map(); for (const it of items) { const [x, z] = xz(it), c = chunkAt(x, z); let a = by.get(c); if (!a) by.set(c, a = []); a.push(it); } for (const [c, a] of by) make(c.hi, a); };
  const instIn = (grp, geo, mat, count, shadow = true) => { const m = new THREE.InstancedMesh(geo, mat, count); m.castShadow = shadow; m.receiveShadow = true; grp.add(m); return m; };
  const skipDecor = (bx, bz) => { const sn = blockSite(bx, bz); return sn && skipSites.includes(sn) && siteUnlocked(sn, n); };

  /* structures */
  const groups = new Map();
  for (const s of S) {
    const model = getModel(s); s.model = model; s.refs = []; s.chunk = chunkAt(s.x, s.z); s.chunk.items.push(s);
    s.base = new THREE.Color(s.type === 'house' ? PASTEL[s.variant % PASTEL.length] : (s.type === 'office' || s.type === 'hotel' || s.type === 'apartment' || s.type === 'skyscraper') ? TOWER_TINT[s.variant % TOWER_TINT.length] : '#ffffff').multiplyScalar(s.type === 'house' ? 1 : 0.9 + hash2(s.i, 3) * 0.2);
    for (const mat of Object.keys(model.parts)) { const k = s.chunk.key + '|' + model.key + '|' + mat; let g = groups.get(k); if (!g) groups.set(k, g = { model, mat, items: [], chunk: s.chunk }); g.items.push(s); }
  }
  const animFrom = Math.max(firstNew, n - 40), anims = [], now = performance.now() / 1000; let delay = 0.6;
  const animSet = new Set(); for (let i = animFrom; i < n; i++) animSet.add(i);
  for (const g of groups.values()) {
    const mesh = new THREE.InstancedMesh(g.model.parts[g.mat], materials[g.mat], g.items.length);
    mesh.castShadow = g.mat !== 'sign'; mesh.receiveShadow = true; mesh.frustumCulled = !g.items.some(s => animSet.has(s.i));
    mesh.userData.items = g.items;
    g.items.forEach((s, slot) => { s.refs.push({ mesh, slot }); mesh.setColorAt(slot, s.base); });
    mesh.instanceColor.needsUpdate = true; g.chunk.hi.add(mesh);
  }
  for (const s of S) placeStruct(s, animSet.has(s.i) ? 1e-4 : 1);
  for (let i = animFrom; i < n; i++) { anims.push({ s: S[i], t0: now + delay, dur: 3.4 }); delay += firstNew === 0 ? 0.12 : 0.9; }
  if (chunked) for (const c of chunks.values()) {
    const list = c.items.filter(s => s.model.topY > 4 && s.type !== 'park' && s.type !== 'green'); if (!list.length) continue;
    const lo = new THREE.InstancedMesh(proxyGeo, materials.concrete, list.length); lo.castShadow = false; lo.receiveShadow = true;
    list.forEach((s, i) => {
      const w = s.span === 9 ? 38 : s.span === 2 ? 26 : 11, d = s.span === 9 ? 38 : 11, h = s.model.topY;
      tmpQ.setFromAxisAngle(UP, s.yaw * Math.PI / 2); tmpM.compose(tmpP.set(s.x, 0, s.z), tmpQ, tmpS.set(w, h, d)); lo.setMatrixAt(i, tmpM);
      lo.setColorAt(i, tmpC.set(PROXY_TINT[s.type] || '#9fb4c8').multiplyScalar(0.85 + hash2(s.i, 5) * 0.3));
    });
    lo.instanceColor.needsUpdate = true; lo.visible = false; world.add(lo); c.lo = lo;
  }

  /* lot pads and block bases */
  const padLists = Object.fromEntries(PAD_KINDS.map(k => [k, []])), glowPads = [];
  for (const s of S) {
    const kind = typeof PAD_OF[s.type] === 'function' ? PAD_OF[s.type](s) : PAD_OF[s.type] || 'plaza', lots = [[s.x, s.z]];
    if (s.span === 2) { const ax = s.yaw % 2 === 0; lots[0] = [s.x + (ax ? -L / 2 : 0), s.z + (ax ? 0 : -L / 2)]; lots.push([s.x + (ax ? L / 2 : 0), s.z + (ax ? 0 : L / 2)]); }
    if (s.span === 9) { lots.length = 0; for (let a = -1; a <= 1; a++) for (let b2 = -1; b2 <= 1; b2++) lots.push([s.x + a * L, s.z + b2 * L]); }
    for (const [x, z] of lots) { padLists[kind].push({ x, z, yaw: s.yaw * Math.PI / 2 }); glowPads.push({ x, z, i: s.i }); }
  }
  const padGeo = flatPlane(L, L);
  for (const k of PAD_KINDS) { const list = padLists[k]; if (!list.length) continue; const m = instanced(padGeo, padMat[k], list.length, 'pad'); m.receiveShadow = true; list.forEach((p, i) => setPos(m, i, p.x, 0.08, p.z, p.yaw)); }
  if (paved) {
    const blocks = []; for (let bx = -R; bx <= R; bx++) for (let bz = -R; bz <= R; bz++) { const sn = blockSite(bx, bz); if (sn && ['river', 'airport', 'harbor'].includes(sn) && siteUnlocked(sn, n)) continue; blocks.push([bx * P, bz * P]); }
    const m = instanced(flatPlane(3 * L, 3 * L), baseMat, blocks.length, 'base'); m.receiveShadow = true; blocks.forEach((b, i) => setPos(m, i, b[0], 0.04, b[1]));
  }

  /* roads (skipping ground that infrastructure replaces) */
  const segGeo = flatPlane(12, 3 * L), intGeo = flatPlane(12, 12), v = [], h = [], it = [], ok = (x, z) => !excludedFromRoads(x, z, n);
  for (let k = -R - 1; k <= R; k++) { for (let q = -R; q <= R; q++) { if (ok(k * P + P / 2, q * P)) v.push([k * P + P / 2, q * P]); if (ok(q * P, k * P + P / 2)) h.push([q * P, k * P + P / 2]); } for (let m2 = -R - 1; m2 <= R; m2++) if (ok(k * P + P / 2, m2 * P + P / 2)) it.push([k * P + P / 2, m2 * P + P / 2]); }
  const rv = instanced(segGeo, paved ? roadTex.paved : roadTex.dirt, v.length, 'roadV'), rh = instanced(segGeo, paved ? roadTex.paved : roadTex.dirt, h.length, 'roadH'), ri = instanced(intGeo, paved ? (crosswalks ? roadTex.cross : roadTex.inter) : roadTex.interDirt, it.length, 'inter');
  rv.receiveShadow = rh.receiveShadow = ri.receiveShadow = true;
  v.forEach((p, i) => setPos(rv, i, p[0], 0.06, p[1])); h.forEach((p, i) => setPos(rh, i, p[0], 0.06, p[1], Math.PI / 2)); it.forEach((p, i) => setPos(ri, i, p[0], 0.06, p[1]));

  /* trees and benches */
  const trees = [], benches = [], local = (s, lx, lz) => { const c = Math.cos(s.yaw * Math.PI / 2), sn = Math.sin(s.yaw * Math.PI / 2); return [s.x + lx * c + lz * sn, s.z - lx * sn + lz * c]; };
  for (const s of S) {
    const r = mulberry32(s.i * 131 + 7);
    if (s.type === 'house') { const spots = [[-6.9, -6.9], [6.9, -6.9], [-7.2, 3], [7.2, 3]].sort(() => r() - 0.5), c = 1 + Math.floor(r() * 3); for (let k = 0; k < c; k++) { const [x, z] = local(s, ...spots[k]); trees.push([x, z, 0.8 + r() * 0.5]); } }
    else if (s.type === 'park') { for (let k = 0; k < 7; k++) { const a = r() * 6.283, d = 4.5 + r() * 2.8, [x, z] = local(s, Math.cos(a) * d, Math.sin(a) * d); trees.push([x, z, 0.9 + r() * 0.6]); } for (const [lx, lz, a] of [[-2.4, 0.9, 0], [2.4, 0.9, 0], [0, -2.4, 1]]) { const [x, z] = local(s, lx, lz); benches.push([x, z, s.yaw * Math.PI / 2 + a * Math.PI / 2]); } }
    else if (s.type === 'green') { for (let k = 0; k < 5; k++) { const [x, z] = local(s, (r() - .5) * 13, (r() - .5) * 13); trees.push([x, z, 0.8 + r() * 0.7]); } }
    else if (s.type === 'apartment' || s.type === 'school' || s.type === 'church') { for (const lx of [-7, 7]) if (r() < 0.7) { const [x, z] = local(s, lx, -6.9); trees.push([x, z, 0.8 + r() * 0.4]); } }
    else if (s.type === 'campus') { for (let k = 0; k < 12; k++) { const a = k / 12 * 6.283; trees.push([s.x + Math.cos(a) * 9, s.z + Math.sin(a) * 9, 0.9 + r() * 0.3]); } }
    else if (s.type === 'monument') { for (let k = 0; k < 12; k++) { const a = k / 12 * 6.283 + 0.26; trees.push([s.x + Math.cos(a) * 21.5, s.z + Math.sin(a) * 21.5, 1 + r() * 0.3]); } }
  }
  const ringB = Math.min(city.ringMax, 80);
  if (n >= T.town) for (let bx = -ringB; bx <= ringB; bx++) for (let bz = -ringB; bz <= ringB; bz++) {
    if (skipDecor(bx, bz)) continue;
    for (let side = 0; side < 4; side++) for (const o of [-16, 0, 16]) {
      if (hash2(bx * 7 + side, bz * 13 + o) > (n > 20000 ? 0.3 : 0.5)) continue;
      const e = side < 2 ? (side ? 23.5 : -23.5) : o, f = side < 2 ? o : (side === 2 ? 23.5 : -23.5); trees.push([bx * P + e, bz * P + f, 0.7 + hash2(bx + o, bz + side) * 0.3]);
    }
  }
  for (let bx = -R; bx <= R; bx++) for (let bz = -R; bz <= R; bz++) { const sn = blockSite(bx, bz); if (!sn || siteUnlocked(sn, n)) continue; for (let k = 0; k < 8; k++) trees.push([bx * P + (hash2(bx * 9 + k, bz) - 0.5) * 42, bz * P + (hash2(bx, bz * 9 + k) - 0.5) * 42, 0.8 + hash2(k, bx + bz) * 0.7]); }
  const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), benchMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  perChunk(trees, t => [t[0], t[1]], (grp, list) => { const m = instIn(grp, treeGeo, treeMat, list.length, n <= 8000);
    list.forEach((t, i) => { setPos(m, i, t[0], 0, t[1], hash2(i, 5) * 6.28, t[2]); m.setColorAt(i, tmpC.setRGB(0.8 + hash2(i, 9) * 0.4, 0.85 + hash2(i, 11) * 0.3, 0.8 + hash2(i, 13) * 0.3)); }); m.instanceColor.needsUpdate = true; });
  perChunk(benches, b => [b[0], b[1]], (grp, list) => { const m = instIn(grp, benchGeo, benchMat, list.length); list.forEach((b, i) => setPos(m, i, b[0], 0.09, b[1], b[2])); });

  /* city-feel props: hydrants, bus stops, billboards, parked cars */
  const hyd = [], stops = [], boards = [], parked = [];
  if (n >= T.town && n <= 40000) for (let bx = -ringB; bx <= ringB; bx++) for (let bz = -ringB; bz <= ringB; bz++) {
    if (skipDecor(bx, bz)) continue;
    for (let side = 0; side < 4; side++) {
      const h2 = hash2(bx * 11 + side, bz * 17 + 3), ex = side < 2 ? (side ? 23.2 : -23.2) : 12, ez = side < 2 ? 12 : (side === 2 ? 23.2 : -23.2);
      if (h2 < 0.35) hyd.push([bx * P + ex, bz * P + ez]);
      if (n >= T.apts && h2 > 0.82 && h2 < 0.94) stops.push([bx * P + (side < 2 ? ex : -12), bz * P + (side < 2 ? -12 : ez), side < 2 ? 0 : Math.PI / 2]);
    }
    const hb = hash2(bx * 5 + 1, bz * 9 + 2); if (hb > 0.9) { const sx = hb > 0.95 ? 1 : -1; boards.push([bx * P + sx * 23.3, bz * P + sx * 23.3, hash2(bx, bz) * 6.283, Math.floor(hb * 997) % 6]); }
  }
  for (const s of S) if (['shop', 'diner', 'gas', 'store', 'cinema', 'post'].includes(s.type)) { const r = mulberry32(s.i * 977 + 3); for (const lx of [-4, -1.2, 1.6]) if (r() < 0.65) { const [x, z] = local(s, lx, 6.9); parked.push([x, z, s.yaw * Math.PI / 2 + Math.PI / 2, r()]); } }
  const hydMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }), stopMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.2 });
  perChunk(hyd, p => [p[0], p[1]], (grp, list) => { const m = instIn(grp, hydGeo, hydMat, list.length, false); list.forEach((p, i) => setPos(m, i, p[0], 0, p[1])); });
  perChunk(stops, p => [p[0], p[1]], (grp, list) => { const m = instIn(grp, stopGeo, stopMat, list.length); list.forEach((p, i) => setPos(m, i, p[0], 0, p[1], p[2])); });
  const postMat = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.6, metalness: 0.6 });
  perChunk(boards, p => [p[0], p[1]], (grp, list) => {
    const bm = instIn(grp, boardGeo, materials.sign, list.length), pm = instIn(grp, boardPostGeo, postMat, list.length), pal = ['#ff5b8f', '#ffd36b', '#6fe3ff', '#8bff9b', '#b79bff', '#ff8a6b'];
    list.forEach((p, i) => { setPos(bm, i, p[0], 0, p[1], p[2]); setPos(pm, i, p[0], 0, p[1], p[2]); bm.setColorAt(i, tmpC.set(pal[p[3]])); }); bm.instanceColor.needsUpdate = true; });
  const parkMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.6 }), carPal = ['#d9dce2', '#14161a', '#8a1c1c', '#26446e', '#8e9298', '#e8e3d4', '#1e3a2b', '#c9a227'];
  perChunk(parked, p => [p[0], p[1]], (grp, list) => { const m = instIn(grp, carGeo, parkMat, list.length); list.forEach((p, i) => { setPos(m, i, p[0], 0, p[1], p[2]); m.setColorAt(i, tmpC.set(carPal[Math.floor(p[3] * carPal.length)])); }); m.instanceColor.needsUpdate = true; });

  /* rotating landmarks: windmill sails and ferris wheels */
  const rotors = []; for (const s of S) if (s.type === 'windmill' || s.type === 'amusement') rotors.push(s);
  const rotorMesh = { sail: null, wheel: null }, sailList = rotors.filter(s => s.type === 'windmill'), wheelList = rotors.filter(s => s.type === 'amusement');
  if (sailList.length) rotorMesh.sail = instanced(sailGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), sailList.length, 'sails');
  if (wheelList.length) { rotorMesh.wheel = instanced(wheelGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3 }), wheelList.length, 'wheels'); rotorMesh.wheel.castShadow = true; }

  /* smoke from the power plant */
  const plants = S.filter(s => s.type === 'powerplant'); let smoke = null;
  if (plants.length) {
    const em = plants.flatMap(s => s.model.smoke.map(e => ({ s, e }))), PER = 9;
    smoke = { em, PER, mesh: instanced(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xdfe2e6, transparent: true, opacity: 0.5, depthWrite: false, roughness: 1 }), em.length * PER, 'smoke') };
  }

  /* street lamps */
  if (paved) {
    const lamps = []; for (let bx = -ringB - 1; bx <= ringB + 1; bx++) for (let bz = -ringB - 1; bz <= ringB + 1; bz++) { if (skipDecor(bx, bz)) continue; for (const s1 of [-1, 1]) for (const o of [-8, 8]) {
      if (hash2(bx * 3 + o, bz * 5 + s1) > (n > 20000 ? 0.4 : 0.85)) continue; lamps.push([bx * P + s1 * 23.7, bz * P + o], [bx * P + o, bz * P + s1 * 23.7]); } }
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.5, metalness: 0.7 }), hg = n > 8000 ? headGeoLo : headGeo;
    perChunk(lamps, p => p, (grp, list) => { const pm = instIn(grp, poleGeo, poleMat, list.length, n <= 8000), hm = instIn(grp, hg, lampMat, list.length, false); list.forEach((p, i) => { setPos(pm, i, p[0], 0, p[1]); setPos(hm, i, p[0], 9.2, p[1]); }); });
  }

  /* traffic lights (central intersections only) */
  let tl = null;
  if (crosswalks) {
    const list = [], K = Math.min(R + 1, 12); for (let k = -K - 1; k <= K; k++) for (let m2 = -K - 1; m2 <= K; m2++) for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) list.push({ k, m: m2, cx: k * P + P / 2, cz: m2 * P + P / 2, sx, sz });
    const pm = instanced(tlPoleGeo, new THREE.MeshStandardMaterial({ color: 0x1d2023, roughness: 0.5, metalness: 0.6 }), list.length, 'tlpoles'), lm = instanced(lampSphere, tlMat, list.length, 'tlamps');
    list.forEach((t, i) => { setPos(pm, i, t.cx + t.sx * 7, 0, t.cz + t.sz * 7); setPos(lm, i, t.cx + t.sx * 7, 6.6, t.cz + t.sz * 7); lm.setColorAt(i, tmpC.setRGB(3, 0.12, 0.08)); });
    lm.instanceColor.needsUpdate = true; tl = { list, mesh: lm, last: new Int8Array(list.length).fill(-1) };
  }

  /* aviation lights */
  const tall = S.filter(s => s.model.glow); let avi = null;
  if (tall.length) { avi = instanced(new THREE.SphereGeometry(0.9, 10, 8), aviMat, tall.length, 'avi'); tall.forEach((s, i) => setPos(avi, i, s.x, s.model.topY + 0.6, s.z)); }

  /* platform glow pads (only visible with "Show by platform") */
  const igShare = live.total > 0 ? live.instagram / live.total : 0.6;
  const glow = instanced(flatPlane(L - 1, L - 1), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }), Math.max(1, glowPads.length), 'platglow');
  glowPads.forEach((p, i) => { setPos(glow, i, p.x, 0.14, p.z); glow.setColorAt(i, PLAT[platformOf(p.i, igShare)]); }); glow.count = glowPads.length; if (glow.instanceColor) glow.instanceColor.needsUpdate = true; glow.visible = platformView;

  /* infrastructure: river, bridges, highway, rail, airport, harbor */
  const infra = buildInfra(n, { R, materials, lampMat, carGeo, getWindowF: () => windowF }); world.add(infra.group);

  W = { n, city, S, R, paved, crosswalks, anims, tl, glow, igShare, smoke, rotors: { sailList, wheelList, ...rotorMesh }, chunks, chunked, infra, extent: Math.max(S.reduce((m, s) => Math.max(m, Math.hypot(s.x, s.z)), 0) + 70, n >= SITES.airport.at ? 760 : 0) };
  initAgents();
  applyPlatform();
  fitCamera();
  updateChunks(true);
  refreshBizFx(); refreshVisitorFx(); refreshGolden(); refreshClaimPlates(visitor.publicClaims);
}
function updateChunks(force) {
  if (!W || !W.chunked) return;
  const cp = camera.position, hiR = isMobile ? 380 : 650;
  for (const c of W.chunks.values()) { const hi = Math.hypot(cp.x - c.cx, cp.z - c.cz) - CHUNK * P * 0.7 < hiR; if (c.hi.visible !== hi || force) { c.hi.visible = hi; if (c.lo) c.lo.visible = !hi; } }
}

function applyPlatform() {
  if (!W) return;
  const share = W.igShare;
  for (const s of W.S) {
    tmpC.copy(s.base); if (platformView) tmpC.lerp(PLAT[platformOf(s.i, share)], 0.5);
    for (const r of s.refs) { r.mesh.setColorAt(r.slot, tmpC); r.mesh.instanceColor.needsUpdate = true; }
  }
  W.glow.visible = platformView;
}

/* ---------- agents: cars, buses, people ---------- */
let cars = null, buses = null, people = null;
function initAgents() {
  cars = buses = people = null;
  const n = W.n, R = W.R, r = mulberry32(77), ext = (R + 0.5) * P;
  if (n >= T.paved) {
    const count = Math.round(Math.min(260, 20 + n * 0.5)), list = [], body = instanced(carGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.6 }), count, 'cars'), lights = instanced(new THREE.BoxGeometry(0.45, 0.3, 0.12), new THREE.MeshBasicMaterial({ color: 0xffffff }), count * 2, 'carlights');
    const palette = ['#d9dce2', '#14161a', '#8a1c1c', '#26446e', '#8e9298', '#e8e3d4', '#1e3a2b'];
    for (let i = 0; i < count; i++) {
      let axis, line, tries = 0; const dir = r() < 0.5 ? 1 : -1, vmax = 7 + r() * 6;
      do { axis = r() < 0.5 ? 0 : 1; line = Math.floor(r() * (2 * R + 2)) - R - 1; const c = line * P + P / 2; // keep traffic off the airport and harbor
        var blocked = [[n >= SITES.airport.at, AIRPORT], [n >= SITES.harbor.at, HARBOR]].some(([on, b]) => on && (axis ? (c > b.x0 && c < b.x1) : (c > b.z0 && c < b.z1))); } while (blocked && ++tries < 20);
      list.push({ axis, line, dir, s: (r() * 2 - 1) * ext, v: vmax, vmax, key: axis * 1e6 + line * 4 + dir + 2 });
      body.setColorAt(i, tmpC.set(palette[Math.floor(r() * palette.length)])); lights.setColorAt(i * 2, tmpC.setRGB(2.4, 2.3, 2)); lights.setColorAt(i * 2 + 1, tmpC.setRGB(2.4, .12, .08));
    }
    body.instanceColor.needsUpdate = lights.instanceColor.needsUpdate = true; body.castShadow = true;
    cars = { list, body, lights, ext };
  }
  if (W.crosswalks) {
    const bus = instanced(busGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.3 }), 3, 'buses'); bus.castShadow = true;
    const kLo = -Math.min(R, 2), kHi = Math.min(R, 2), x0 = kLo * P + P / 2 + 2.4, x1 = kHi * P + P / 2 - 2.4, z0 = x0, z1 = x1;
    const pts = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], lens = pts.map((p, i) => { const q = pts[(i + 1) % 4]; return Math.hypot(q[0] - p[0], q[1] - p[1]); }), tot = lens.reduce((a, b) => a + b, 0);
    buses = { mesh: bus, pts, lens, tot, offs: [0, tot / 3, 2 * tot / 3] };
  }
  const pc = Math.round(Math.min(220, Math.max(8, n / 3)));
  const parks = W.S.filter(s => s.type === 'park'), blocks = []; for (const s of W.S) blocks.push([s.bx, s.bz]);
  const pr = mulberry32(1234), list = [];
  for (let i = 0; i < pc; i++) {
    if (parks.length && pr() < 0.3) { const p = parks[Math.floor(pr() * parks.length)]; list.push({ kind: 'park', cx: p.x, cz: p.z, rad: 3 + pr() * 2.5, t: pr() * 6.28, spd: (0.2 + pr() * 0.15) * (pr() < .5 ? 1 : -1) }); }
    else { const b = blocks[Math.floor(pr() * blocks.length)] || [0, 0]; list.push({ kind: 'walk', bx: b[0], bz: b[1], t: pr() * 8 * 22.6, spd: (1.1 + pr() * 0.5) * (pr() < .5 ? 1 : -1) }); }
    list[i].ph = pr() * 6.28; list[i].spdA = 1;
  }
  const shirts = ['#c9433b', '#3b6fb0', '#e0b43a', '#4f9b5e', '#e8e8e8', '#7b4fa3', '#222'], skins = ['#f1c9a5', '#d9a679', '#a97551', '#6b4a33'], pants = ['#2a3446', '#4b4f57', '#6b5a3a', '#1c1f24'];
  const mk = (geo, cols, name) => { const m = instanced(geo, new THREE.MeshStandardMaterial({ roughness: 0.75 }), pc, name); m.castShadow = true; list.forEach((p, i) => m.setColorAt(i, tmpC.set(cols[Math.floor(hash2(i, name.length) * cols.length)]))); m.instanceColor.needsUpdate = true; return m; };
  people = { list, body: mk(personParts.body, shirts, 'pbody'), head: mk(personParts.head, skins, 'phead'), legL: mk(personParts.leg, pants, 'pl1'), legR: mk(personParts.leg, pants, 'pl2') };
}

const CYCLE = 26;
function lightState(axis, k, m, t) { // 0 green, 1 yellow, 2 red for a car travelling on `axis` (1 = along z)
  const ph = (t + hash2(k, m) * CYCLE) % CYCLE;
  if (axis === 1) return ph < 11 ? 0 : ph < 13 ? 1 : 2;
  return ph < 13 ? 2 : ph < 24 ? 0 : 1;
}
const LC = [[0.15, 2.2, 0.5], [2.6, 1.7, 0.1], [3, 0.12, 0.08]];

const planeG = (() => {
  const g = new THREE.Group(), white = new THREE.MeshStandardMaterial({ color: 0xe8ecf2, roughness: 0.35, metalness: 0.5 });
  const add = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  add(new THREE.CylinderGeometry(1.6, 1.4, 26, 14).rotateZ(Math.PI / 2), white); add(new THREE.SphereGeometry(1.6, 14, 10), white, 13, 0, 0);
  add(new THREE.BoxGeometry(5, 0.3, 26), white, -1, -0.3, 0).rotation.y = 0; add(new THREE.BoxGeometry(3, 0.25, 9), white, -11, 0.2, 0); add(new THREE.BoxGeometry(3.5, 4.5, 0.3), white, -11.5, 2.6, 0);
  g.userData.strobe = add(new THREE.SphereGeometry(0.45, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 4, 4) }), -13, 1, 0);
  add(new THREE.SphereGeometry(0.4, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 3, 0.4) }), -1, -0.2, 13).name = 'g'; add(new THREE.SphereGeometry(0.4, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.15, 0.1) }), -1, -0.2, -13);
  g.scale.setScalar(2.2); g.visible = false; scene.add(g); return g; })();
const mA = new THREE.Matrix4(), mB = new THREE.Matrix4(), mC = new THREE.Matrix4();
function updateAmbient(t) {
  if (!W) return;
  planeG.visible = W.n >= T.downtown; if (planeG.visible) { const f = (t % 90) / 90; planeG.position.set(-2800 + f * 5600, 340 + Math.sin(t * 0.2) * 8, -650); planeG.userData.strobe.visible = Math.sin(t * 9) > 0.6; }
  const spin = (list, mesh, speed) => { if (!mesh) return; list.forEach((s, i) => { tmpQ.setFromAxisAngle(UP, s.yaw * Math.PI / 2); mA.compose(tmpP.set(s.x, 0, s.z), tmpQ, tmpS.set(1, 1, 1)); const h = s.model.hub; mB.makeTranslation(h[0], h[1], h[2]); mC.makeRotationZ(t * speed); mesh.setMatrixAt(i, mA.multiply(mB).multiply(mC)); }); mesh.instanceMatrix.needsUpdate = true; };
  spin(W.rotors.sailList, W.rotors.sail, 0.7); spin(W.rotors.wheelList, W.rotors.wheel, -0.12);
  if (W.smoke) {
    const { em, PER, mesh } = W.smoke;
    em.forEach(({ s, e }, i) => { const c = Math.cos(s.yaw * Math.PI / 2), sn = Math.sin(s.yaw * Math.PI / 2), ex = s.x + e[0] * c + e[2] * sn, ez = s.z - e[0] * sn + e[2] * c;
      for (let k = 0; k < PER; k++) { const u = (t * 0.1 + k / PER + i * 0.31) % 1; setPos(mesh, i * PER + k, ex + u * 26, e[1] + u * 55, ez + u * 9, 0, 1.6 + u * 7); } });
    mesh.instanceMatrix.needsUpdate = true;
  }
}
function updateAgents(dt, t) {
  if (!W) return;
  if (cars) {
    const { list, body, lights, ext } = cars, lanes = new Map();
    for (const c of list) { let a = lanes.get(c.key); if (!a) lanes.set(c.key, a = []); a.push(c); }
    for (const a of lanes.values()) { a.sort((p, q) => p.s * p.dir - q.s * q.dir); for (let i = 0; i < a.length; i++) a[i].lead = a[i + 1] || null; }
    for (let i = 0; i < list.length; i++) {
      const c = list[i]; let allowed = c.vmax;
      if (c.lead) { const gap = (c.lead.s - c.s) * c.dir - 4.8; if (gap < 30) allowed = Math.min(allowed, Math.max(0, (gap - 1.2) * 1.1)); }
      if (W.crosswalks) {
        const m = c.dir > 0 ? Math.floor((c.s - P / 2) / P) + 1 : Math.ceil((c.s - P / 2) / P) - 1, ctr = m * P + P / 2, dist = (ctr - c.s) * c.dir;
        if (dist > 7.2 && dist < 40) { const st = lightState(c.axis, c.line, m, t); if (st === 2 || (st === 1 && dist > 14)) allowed = Math.min(allowed, Math.max(0, (dist - 7.2) * 1.0)); }
      }
      c.v += clamp(allowed - c.v, -10 * dt, 3 * dt); c.s += c.v * c.dir * dt; if (c.s > ext) c.s -= 2 * ext; else if (c.s < -ext) c.s += 2 * ext;
      const lane = c.line * P + P / 2, x = c.axis ? lane - c.dir * 2.4 : c.s, z = c.axis ? c.s : lane + c.dir * 2.4, hx = c.axis ? 0 : c.dir, hz = c.axis ? c.dir : 0, yaw = Math.atan2(hx, hz);
      tmpQ.setFromAxisAngle(UP, yaw); tmpS.set(1, 1, 1); tmpM.compose(tmpP.set(x, 0, z), tmpQ, tmpS); body.setMatrixAt(i, tmpM);
      tmpM.compose(tmpP.set(x + hx * 2.15, 0.7, z + hz * 2.15), tmpQ, tmpS); lights.setMatrixAt(i * 2, tmpM); tmpM.compose(tmpP.set(x - hx * 2.15, 0.7, z - hz * 2.15), tmpQ, tmpS); lights.setMatrixAt(i * 2 + 1, tmpM);
    }
    body.instanceMatrix.needsUpdate = lights.instanceMatrix.needsUpdate = true;
  }
  if (W.tl) {
    const { list, mesh, last } = W.tl; let dirty = false;
    for (let i = 0; i < list.length; i++) { const tlg = list[i], axis = tlg.sx * tlg.sz > 0 ? 1 : 0, st = lightState(axis, tlg.k, tlg.m, t); if (st !== last[i]) { last[i] = st; mesh.setColorAt(i, tmpC.setRGB(...LC[st])); dirty = true; } }
    if (dirty) mesh.instanceColor.needsUpdate = true;
  }
  if (buses) {
    const { mesh, pts, lens, tot, offs } = buses;
    for (let b = 0; b < 3; b++) { let d = ((t * 8 + offs[b]) % tot + tot) % tot, k = 0; while (d > lens[k]) { d -= lens[k]; k++; } const p = pts[k], q = pts[(k + 1) % 4], f = d / lens[k], dx = (q[0] - p[0]) / lens[k], dz = (q[1] - p[1]) / lens[k];
      setPos(mesh, b, p[0] + (q[0] - p[0]) * f, 0, p[1] + (q[1] - p[1]) * f, Math.atan2(dx, dz)); }
    mesh.instanceMatrix.needsUpdate = true;
  }
  if (people) {
    const { list, body, head, legL, legR } = people, H = 22.6;
    for (let i = 0; i < list.length; i++) {
      const p = list[i]; let x, z, yaw;
      if (p.kind === 'park') { p.t += p.spd * dt; x = p.cx + Math.cos(p.t) * p.rad; z = p.cz + Math.sin(p.t) * p.rad; yaw = Math.atan2(-Math.sin(p.t) * Math.sign(p.spd), Math.cos(p.t) * Math.sign(p.spd)); }
      else {
        p.t = (p.t + p.spd * dt + 8 * H) % (8 * H); const u = p.t / (2 * H), side = Math.floor(u) % 4, f = (u % 1) * 2 * H - H; let lx, lz, hx, hz;
        if (side === 0) { lx = f; lz = -H; hx = 1; hz = 0; } else if (side === 1) { lx = H; lz = f; hx = 0; hz = 1; } else if (side === 2) { lx = -f; lz = H; hx = -1; hz = 0; } else { lx = -H; lz = -f; hx = 0; hz = -1; }
        x = p.bx * P + lx; z = p.bz * P + lz; const sg = Math.sign(p.spd); yaw = Math.atan2(hx * sg, hz * sg);
      }
      p.ph += Math.abs(p.spd) * dt * 3.2; const bob = Math.abs(Math.sin(p.ph)) * 0.05, sw = Math.sin(p.ph) * 0.6;
      tmpQ.setFromAxisAngle(UP, yaw); tmpS.set(1, 1, 1); tmpM.compose(tmpP.set(x, bob, z), tmpQ, tmpS); body.setMatrixAt(i, tmpM); head.setMatrixAt(i, tmpM);
      for (const [mesh, sgn, off] of [[legL, 1, -0.1], [legR, -1, 0.1]]) { tmpE.set(sw * sgn, 0, 0); tmpM2.compose(tmpP.set(off, 0.86, 0), new THREE.Quaternion().setFromEuler(tmpE), tmpS.set(1, 1, 1)); mesh.setMatrixAt(i, tmpM.clone().compose(tmpP.set(x, bob, z), tmpQ, tmpS).multiply(tmpM2)); }
    }
    body.instanceMatrix.needsUpdate = head.instanceMatrix.needsUpdate = legL.instanceMatrix.needsUpdate = legR.instanceMatrix.needsUpdate = true;
  }
}

/* ---------- weather: rain comes and goes ---------- */
const rain = { level: 0, target: 0, manual: false, nextAt: 300 + Math.random() * 120 };
let rainL = 0, fogBase = 0.0007;
const rainGray = new THREE.Color(0x7d8794), RN = isMobile ? 2500 : 5000, rainGeo = new THREE.BufferGeometry(), rainPos = new Float32Array(RN * 6), rainOff = new Float32Array(RN * 3);
for (let i = 0; i < RN; i++) { rainOff[i * 3] = (Math.random() - .5) * 460; rainOff[i * 3 + 1] = Math.random() * 220; rainOff[i * 3 + 2] = (Math.random() - .5) * 460; }
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
const rainMat = new THREE.LineBasicMaterial({ color: 0xc4d6ea, transparent: true, opacity: 0, depthWrite: false, fog: false });
const rainLines = new THREE.LineSegments(rainGeo, rainMat); rainLines.frustumCulled = false; rainLines.visible = false; scene.add(rainLines);
function updateRain(dt, now) {
  if (mode === 'auto' && !rain.manual && now > rain.nextAt) {
    if (rain.target > 0) { rain.target = 0; rain.nextAt = now + 120 + Math.random() * 180; }
    else if (Math.random() < 0.5) { rain.target = 0.6 + Math.random() * 0.4; rain.nextAt = now + 50 + Math.random() * 60; } else rain.nextAt = now + 90 + Math.random() * 90;
  }
  rain.level += (rain.target - rain.level) * Math.min(1, dt * 0.5); rainL = rain.level < 0.01 ? 0 : rain.level;
  scene.fog.density = fogBase * (1 + 1.4 * rainL);
  rainLines.visible = rainL > 0; if (!rainLines.visible) return;
  rainMat.opacity = 0.5 * rainL; rainLines.position.set(controls.target.x, 0, controls.target.z);
  for (let i = 0; i < RN; i++) {
    let y = rainOff[i * 3 + 1] - 95 * dt; if (y < 0) { y += 220; rainOff[i * 3] = (Math.random() - .5) * 460; rainOff[i * 3 + 2] = (Math.random() - .5) * 460; } rainOff[i * 3 + 1] = y;
    const x = rainOff[i * 3], z = rainOff[i * 3 + 2], j = i * 6; rainPos[j] = x; rainPos[j + 1] = y; rainPos[j + 2] = z; rainPos[j + 3] = x + 1.2; rainPos[j + 4] = y - 4.5; rainPos[j + 5] = z + 0.4;
  }
  rainGeo.attributes.position.needsUpdate = true;
}
$('rain').addEventListener('click', e => { rain.manual = true; rain.target = rain.target > 0 ? 0 : 0.95; e.target.classList.toggle('on', rain.target > 0); e.target.setAttribute('aria-pressed', rain.target > 0); });

/* ---------- time of day ---------- */
let mode = 'auto', tDay = 0.4, tTarget = 0.4, windowF = 0;
const dayFog = new THREE.Color(0x9fbfe6), duskFog = new THREE.Color(0xe3a77c), nightFog = new THREE.Color(0x070b18), fogCol = new THREE.Color();
const sunWarm = new THREE.Color(0xff9b55), sunWhite = new THREE.Color(0xfff2e0), sunDir = new THREE.Vector3(), md = new THREE.Vector3();
function applyTime(t) {
  const a = (t - 0.25) * Math.PI * 2; sunDir.set(Math.cos(a) * 0.9, Math.sin(a), 0.45).normalize();
  const elev = sunDir.y, dayF = smooth(-0.06, 0.28, elev), nightF = smooth(0.03, -0.14, elev), dusk = (1 - dayF) * (1 - nightF) + smooth(.3, 0.0, elev) * dayF * .6;
  skyU.sunPosition.value.set(sunDir.x, Math.max(elev, 0.004), sunDir.z).normalize(); skyU.rayleigh.value = lerp(2.2, 1.2, dayF);
  nightDome.material.uniforms.opacity.value = nightF; stars.material.opacity = smooth(-0.02, -0.2, elev) * 0.95;
  md.set(-sunDir.x * .6 + .15, Math.max(-elev, 0) * .85 + .05, -sunDir.z * .8).normalize();
  moon.position.copy(md).multiplyScalar(14000); moon.lookAt(0, 0, 0); moon.material.opacity = smooth(0.02, -0.16, elev);
  sun.color.copy(sunWarm).lerp(sunWhite, smooth(0.05, 0.45, elev)); sun.intensity = 3.4 * smooth(0.0, 0.2, elev) * (1 - 0.65 * rainL); moonLight.intensity = 0.55 * nightF;
  moonLight.position.copy(md).multiplyScalar(1000).add(controls.target);
  hemi.intensity = lerp(0.07, 0.55, dayF); hemi.color.set(0x9ec5ff).lerp(tmpC.set(0x1a2a55), nightF); scene.environmentIntensity = lerp(0.04, 1.3, dayF);
  fogCol.copy(dayFog).lerp(duskFog, clamp(dusk, 0, 1)).lerp(nightFog, nightF); scene.fog.color.copy(fogCol).lerp(rainGray, 0.5 * rainL * (1 - nightF * 0.7));
  for (const k of ['paved', 'inter', 'cross']) roadTex[k].roughness = lerp(0.88, 0.3, rainL);
  renderer.toneMappingExposure = lerp(0.95, 0.42, dayF) * (1 + dusk * 0.15);
  windowF = smooth(0.14, -0.1, elev);
  for (const k of ['glass', 'concrete', 'brick', 'siding', 'shop', 'metal']) materials[k].emissiveIntensity = 1.05 * windowF;
  materials.sign.color.setScalar(1.0 + 0.9 * windowF); lampMat.color.setRGB(1, .78, .45).multiplyScalar(5 * windowF);
  bloom.strength = lerp(0.4, 0.12, dayF); bloom.threshold = lerp(0.8, 1.0, dayF);
  sun.position.copy(controls.target).addScaledVector(sunDir, 1500); sun.target.position.copy(controls.target); sun.target.updateMatrixWorld();
}
document.querySelectorAll('#tod button').forEach(btn => btn.addEventListener('click', () => {
  mode = btn.dataset.mode; document.querySelectorAll('#tod button').forEach(b => b.classList.toggle('on', b === btn));
  tTarget = mode === 'day' ? 0.4 : mode === 'night' ? 0.0 : tDay;
}));

/* ---------- camera, fly-to, celebrations ---------- */
let desiredDist = 300, introT = 0, fly = null;
function fitCamera() {
  const R = W.extent, asp = innerWidth / innerHeight;
  desiredDist = clamp(R * 0.95 + 110, 150, 9000) * (asp < 1 ? Math.pow(1 / asp, 0.8) : 1);
  controls.maxDistance = desiredDist * 3;
  if (!fly) controls.target.set(0, clamp(R * 0.1, 18, 70), 0);
  const sc = clamp(R * 1.1 + 100, 200, 900), cam = sun.shadow.camera; cam.left = cam.bottom = -sc; cam.right = cam.top = sc; cam.updateProjectionMatrix();
  fogBase = 0.55 / desiredDist;
}
function flyTo(x, y, z, dist, hold = 4.5) {
  const off = camera.position.clone().sub(controls.target), sph = new THREE.Spherical().setFromVector3(off);
  fly = { t0: performance.now() / 1000, in: 2.4, hold, out: 2.4, from: controls.target.clone(), to: new THREE.Vector3(x, y, z), d0: sph.radius, d1: dist, back: controls.target.clone(), backD: desiredDist };
  controls.enabled = false;
}
function updateFly(now) {
  if (!fly) return;
  const t = now - fly.t0, total = fly.in + fly.hold + fly.out; let f;
  if (t < fly.in) f = easeInOut(t / fly.in); else if (t < fly.in + fly.hold) f = 1; else f = 1 - easeInOut(clamp((t - fly.in - fly.hold) / fly.out, 0, 1));
  const tgtBack = new THREE.Vector3(0, clamp(W.extent * 0.1, 18, 70), 0);
  controls.target.copy(tgtBack).lerp(fly.to, f);
  const off = camera.position.clone().sub(controls.target), sph = new THREE.Spherical().setFromVector3(off);
  sph.radius = lerp(desiredDist, fly.d1, f); sph.phi = lerp(Math.min(sph.phi, 1.27), 1.2, f * 0.5); camera.position.copy(controls.target).add(off.setFromSpherical(sph));
  if (t > total) { fly = null; controls.enabled = true; }
}
const fw = (() => {
  const N = 2600, pos = new Float32Array(N * 3).fill(-9999), col = new Float32Array(N * 3), vel = new Float32Array(N * 3), life = new Float32Array(N), max = new Float32Array(N), base = new Float32Array(N * 3), g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ size: 3.5, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); p.frustumCulled = false; scene.add(p);
  return { pos, col, vel, life, max, base, p, N, cursor: 0, queue: [] }; })();
function burst(x, y, z, color) {
  for (let k = 0; k < 170; k++) {
    const i = fw.cursor = (fw.cursor + 1) % fw.N, a = Math.random() * 6.283, b = Math.acos(2 * Math.random() - 1), sp = 14 + Math.random() * 22;
    fw.pos.set([x, y, z], i * 3); fw.vel.set([Math.sin(b) * Math.cos(a) * sp, Math.cos(b) * sp, Math.sin(b) * Math.sin(a) * sp], i * 3);
    fw.life[i] = fw.max[i] = 1.6 + Math.random() * 1.2; tmpC.set(color).multiplyScalar(2.2); fw.base.set([tmpC.r, tmpC.g, tmpC.b], i * 3);
  }
}
function updateFireworks(dt, now) {
  for (let q = fw.queue.length - 1; q >= 0; q--) if (now >= fw.queue[q].t) { const e = fw.queue.splice(q, 1)[0]; burst(e.x, e.y, e.z, e.c); }
  for (let i = 0; i < fw.N; i++) {
    if (fw.life[i] <= 0) continue; fw.life[i] -= dt; const j = i * 3, f = Math.max(0, fw.life[i] / fw.max[i]);
    fw.vel[j + 1] -= 16 * dt; fw.vel[j] *= 0.985; fw.vel[j + 1] *= 0.985; fw.vel[j + 2] *= 0.985; fw.pos[j] += fw.vel[j] * dt; fw.pos[j + 1] += fw.vel[j + 1] * dt; fw.pos[j + 2] += fw.vel[j + 2] * dt;
    fw.col[j] = fw.base[j] * f; fw.col[j + 1] = fw.base[j + 1] * f; fw.col[j + 2] = fw.base[j + 2] * f; if (fw.life[i] <= 0) fw.pos[j + 1] = -9999;
  }
  fw.p.geometry.attributes.position.needsUpdate = fw.p.geometry.attributes.color.needsUpdate = true;
}
function celebrate(m) {
  if (!W || !W.S.length) return;
  const idx = clamp(UNLOCK_INDEX[m.at] ?? m.at - 1, 0, W.S.length - 1), pos = UNLOCK_POS[m.at], s = pos ? { x: pos.x, z: pos.z } : W.S[idx], now = performance.now() / 1000;
  toast('Unlocked: ' + m.name); flyTo(s.x, 20, s.z, pos ? 260 : 150, 7); startLiveEvent(); if (demo && !useRemote) visitor.milestoneCrate(m);
  ['#ff6bd6', '#6be3ff', '#ffe36b', '#8bff9b', '#ff8a6b', '#b79bff'].forEach((c, k) => fw.queue.push({ t: now + 2.2 + k * 0.7, x: s.x + (Math.random() - .5) * 60, y: 70 + Math.random() * 50, z: s.z + (Math.random() - .5) * 60, c }));
  celebrating = { s, until: now + 12 };
}
let celebrating = null;

/* ---------- live data, HUD, slider ---------- */
async function fetchLive() {
  try { const r = await fetch('live.json?t=' + Date.now(), { cache: 'no-store' }); const j = await r.json();
    const ig = Math.max(0, Math.floor(Number(j.instagram ?? j.count ?? 0))), yt = Math.max(0, Math.floor(Number(j.youtube ?? 0))); return { instagram: ig, youtube: yt, total: Math.floor(Number(j.total ?? ig + yt)) }; } catch (e) { return null; }
}
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), 6000); }
function setCount(n, { celebrateOk = true } = {}) {
  n = clamp(Math.floor(n), 0, MAX_N); if (n === count && W) return;
  const prev = count; count = n;
  buildWorld(n, prev === 0 || n < prev ? Math.max(0, n - 40) : prev);
  if (prev === 0 && !loadedOnce) shown = 0; else if (n < prev) shown = n;
  let crossed = null; if (celebrateOk && loadedOnce) for (const m of MILESTONES) if (m.at > 0 && prev < m.at && n >= m.at) crossed = m;
  loadedOnce = true; if (crossed) celebrate(crossed); else if (n > prev && prev > 0 && n - prev < 40) toast('+' + (n - prev) + ' new building' + (n - prev > 1 ? 's' : ''));
  $('devn').value = n; $('devr').value = Math.round(1000 * Math.log(n + 1) / Math.log(MAX_N + 1));
}
async function poll() { if (devActive) return; const d = await fetchLive(); if (!d) return; live = d; setCount(d.total); }
function updateHud() {
  const n = Math.floor(shown), tot = Math.max(1, live.total), igS = live.instagram / tot, show = devActive ? { ig: Math.round(count * igS), yt: count - Math.round(count * igS) } : { ig: live.instagram, yt: live.youtube };
  $('count').textContent = fmt(n); $('igc').textContent = fmt(show.ig); $('ytc').textContent = fmt(show.yt);
  const nm = nextMilestone(count); let prev = 0; for (const m of MILESTONES) if (m.at <= count) prev = m.at;
  $('fill').style.width = (nm ? clamp((count - prev) / (nm.at - prev), 0, 1) * 100 : 100) + '%';
  $('next').textContent = nm ? `Next unlock: ${nm.name} at ${fmt(nm.at)}` : 'Every unlock reached';
}
$('plat').addEventListener('click', e => { platformView = !platformView; e.target.classList.toggle('on', platformView); e.target.setAttribute('aria-pressed', platformView); applyPlatform(); });
$('fly').addEventListener('click', () => { if (!W || !W.S.length) return; const s = W.S[W.S.length - 1]; flyTo(s.x, 25, s.z, 130, 6); });
if (dev) $('dev').style.display = 'block';
let debounce = 0;
$('devr').addEventListener('input', e => { devActive = true; const n = Math.round(Math.pow(MAX_N + 1, e.target.value / 1000)) - 1; $('devn').value = n; clearTimeout(debounce); debounce = setTimeout(() => setCount(n, { celebrateOk: false }), 140); });
$('devr').addEventListener('change', e => { devActive = true; setCount(Math.round(Math.pow(MAX_N + 1, e.target.value / 1000)) - 1, { celebrateOk: false }); });
$('devn').addEventListener('change', e => { devActive = true; setCount(Number(e.target.value) || 0); });
addEventListener('keydown', e => { if (e.target.tagName === 'INPUT') return; if (e.key === '+' || e.key === '=') { devActive = true; setCount(count + 1); } });

/* ---------- demo businesses show up outdoors: sign, extra floors, and pedestrians who gather at busy shops ---------- */
let bizFx = null;
function refreshBizFx() {
  if (bizFx) { world.remove(bizFx.group); bizFx.group.traverse(o => { if (o.isInstancedMesh) o.dispose(); else if (o.geometry && o.userData.own) o.geometry.dispose(); }); bizFx = null; }
  if (!demo || !W) return;
  const group = new THREE.Group(), people = []; world.add(group);
  for (const [idx, b] of Object.entries(store.state.business)) {
    const s = W.S[+idx]; if (!s) continue;
    const d = BUSINESSES[b.type], st = stageOf(b.level).name, rank = st === 'stand' ? 0 : st === 'shop' ? 1 : 2, yaw = s.yaw * Math.PI / 2, fx = Math.sin(yaw), fz = Math.cos(yaw);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(4 + rank * 2, 1.1 + rank * 0.3, 0.3), new THREE.MeshBasicMaterial({ color: new THREE.Color(d.color).multiplyScalar(1.6), toneMapped: false }));
    sign.position.set(s.x + fx * 6.6, 4.3 + rank, s.z + fz * 6.6); sign.rotation.y = yaw; sign.userData.own = true; group.add(sign);
    for (let k = 0; k < rank; k++) { const fl = new THREE.Mesh(new THREE.BoxGeometry(10, 3.4, 8), new THREE.MeshStandardMaterial({ color: new THREE.Color(d.color).lerp(new THREE.Color('#ffffff'), 0.55), roughness: 0.6 })); fl.position.set(s.x, s.model.topY + 1.7 + k * 3.4, s.z); fl.rotation.y = yaw; fl.castShadow = true; fl.userData.own = true; group.add(fl); }
    const n = Math.min(10, 1 + Math.floor(b.level / 4)); for (let k = 0; k < n; k++) people.push({ s, yaw, ph: k * 1.9 + idx * 0.7, off: 7.6 + (k % 3) * 0.7, span: 3.5 + (k % 4) });
  }
  if (!people.length) { bizFx = { group, people: [] }; return; }
  const body = new THREE.InstancedMesh(personParts.body, new THREE.MeshStandardMaterial({ roughness: 0.7 }), people.length), head = new THREE.InstancedMesh(personParts.head, new THREE.MeshStandardMaterial({ roughness: 0.7 }), people.length);
  const shirts = ['#c9433b', '#3b6fb0', '#e0b43a', '#4f9b5e', '#e8e8e8', '#7b4fa3'], skins = ['#f1c9a5', '#d9a679', '#a97551', '#6b4a33'];
  people.forEach((p, i) => { body.setColorAt(i, tmpC.set(shirts[i % 6])); head.setColorAt(i, tmpC.set(skins[i % 4])); }); body.instanceColor.needsUpdate = head.instanceColor.needsUpdate = true; body.frustumCulled = head.frustumCulled = false; group.add(body, head);
  bizFx = { group, people, body, head };
}
function updateBizFx(t) {
  if (!bizFx || !bizFx.people.length) return; const { people, body, head } = bizFx;
  people.forEach((p, i) => { const a = Math.sin(t * 0.35 + p.ph) * p.span, c = Math.cos(p.yaw), sn = Math.sin(p.yaw), fx = sn, fz = c, rx = c, rz = -sn, x = p.s.x + fx * p.off + rx * a, z = p.s.z + fz * p.off + rz * a, y = Math.abs(Math.sin(t * 5 + p.ph)) * 0.04;
    tmpQ.setFromAxisAngle(UP, p.yaw + (Math.cos(t * 0.35 + p.ph) > 0 ? Math.PI / 2 : -Math.PI / 2)); tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(1, 1, 1)); body.setMatrixAt(i, tmpM); head.setMatrixAt(i, tmpM); });
  body.instanceMatrix.needsUpdate = head.instanceMatrix.needsUpdate = true;
}

/* ---------- interiors (demo mode): click a house or shop to go inside ---------- */
const demo = params.has('demo') || dev;
const useRemote = remoteConfigured && (params.has('remote') || !demo), visitorOn = demo || useRemote;
{ const ref = params.get('ref'); if (ref) { try { localStorage.setItem('nc.ref', String(ref).slice(0, 20)); } catch (e) { /* ignore */ } } }
const fadeEl = $('fade');
const interior = new InteriorSystem({
  renderer, renderPass, canvas, envMap: scene.environment, store, getNight: () => windowF, notify: msg => toast(msg), getModel, materials,
  openPreview: sys => previewStage(sys, sys.s), capture: cb => { captureCb = cb; },
  onExit: () => {
    fadeEl.classList.add('on');
    setTimeout(() => { renderPass.scene = scene; renderPass.camera = camera; fly = null; controls.enabled = true; $('hud').style.display = ''; $('dev').style.visibility = ''; labelEl.style.opacity = 0; fadeEl.classList.remove('on'); refreshBizFx(); }, 450);
  },
});
let entering = false, captureCb = null;
function openBuilding(s) {
  if (entering || interior.active) return; entering = true;
  flyTo(s.x, 4, s.z, 44, 6); toast('Going inside…');
  setTimeout(() => fadeEl.classList.add('on'), 1900);
  setTimeout(() => { fly = null; controls.enabled = false; $('hud').style.display = 'none'; $('dev').style.visibility = 'hidden'; interior.enter(s); fadeEl.classList.remove('on'); entering = false; }, 2500);
}
const pickRay = new THREE.Raycaster(), pickNdc = new THREE.Vector2(); let pdown = null;
const visibleChain = o => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
canvas.addEventListener('pointerdown', e => { pdown = [e.clientX, e.clientY, performance.now()]; });
canvas.addEventListener('pointerup', e => {
  const d = pdown; pdown = null;
  if (!visitorOn || !W || interior.active || entering || !d || Math.hypot(e.clientX - d[0], e.clientY - d[1]) > 5 || performance.now() - d[2] > 350) return;
  const r = canvas.getBoundingClientRect(); pickNdc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); pickRay.setFromCamera(pickNdc, camera);
  if (goldenGroup) { const gh = pickRay.intersectObjects(goldenGroup.children, false)[0]; if (gh && gh.object.userData.golden !== undefined) { const gi = gh.object.userData.golden, gs = W.S[gi]; visitor.findGolden(gi).then(ok => { if (ok) { fw.queue.push({ t: performance.now() / 1000, x: gs.x, y: gs.model.topY + 12, z: gs.z, c: '#ffd23a' }); refreshGolden(); } }); return; } }
  const meshes = []; world.traverse(o => { if (o.isInstancedMesh && o.userData.items && visibleChain(o)) meshes.push(o); });
  const hit = pickRay.intersectObjects(meshes, false)[0]; if (!hit) return;
  const s = hit.object.userData.items[hit.instanceId]; if (!s) return;
  if (visitor.pickMode) { if (visitor.claimedSet.has(s.i)) { toast('That building is already claimed. Pick another.'); return; } visitor.pickMode = false; visitor.pending = s; visitor.open('building'); return; }
  if (!demo) return;
  if (canEnter(s)) openBuilding(s); else toast('Only homes and shops open in this demo.');
});
if (demo) setTimeout(() => toast('Demo: click a house or shop to go inside'), 4000);
if (demo) { const sb = $('stats'); sb.style.display = ''; sb.addEventListener('click', () => { if (interior.active || entering || !W) return; entering = true; fadeEl.classList.add('on');
  setTimeout(() => { fly = null; controls.enabled = false; $('hud').style.display = 'none'; $('dev').style.visibility = 'hidden'; statsStage(interior); fadeEl.classList.remove('on'); entering = false; }, 600); }); }

/* ---------- visitor features (Phase 3, demo mode): name plates, cosmetics, golden stars, crates, live events ---------- */
const COLOR_HEX = { 'color-cream': '#f2e6c8', 'color-sky': '#9fd0ff', 'color-rose': '#ffb3c7', 'color-mint': '#a8e6c3', 'color-lilac': '#cdb8ff', 'color-sunset': '#ffb36b', 'color-gold': '#ffcc33' };
let vfx = null, goldenGroup = null;
function tintStruct(s, hex, k = 0.65) { tmpC.copy(s.base).lerp(new THREE.Color(hex), k); for (const r of s.refs) { r.mesh.setColorAt(r.slot, tmpC); r.mesh.instanceColor.needsUpdate = true; } }
function refreshVisitorFx() {
  if (vfx) { world.remove(vfx.group); vfx.group.traverse(o => { if (o.userData.own && o.geometry) o.geometry.dispose(); }); vfx = null; }
  if (!visitorOn || !W) return; applyPlatform();
  const v = visitor.v, c = v && v.claim; if (!c) return; const s = W.S[c.building]; if (!s) return;
  const group = new THREE.Group(), eq = v.equipped, anim = [], top = s.model.topY, yaw = s.yaw * Math.PI / 2, fx = Math.sin(yaw), fz = Math.cos(yaw), own = o => { o.userData.own = true; return o; }; world.add(group);
  if (COLOR_HEX[eq.color]) tintStruct(s, COLOR_HEX[eq.color]);
  if (eq.skin === 'skin-aurora') anim.push(t => tintStruct(s, '#' + new THREE.Color().setHSL((t * 0.08) % 1, 0.7, 0.62).getHexString(), 0.7));
  if (eq.skin === 'skin-crystal') tintStruct(s, '#8fe8ff', 0.75);
  let up = top;
  const rk = { 'roof-antenna': 'antenna', 'roof-garden': 'garden', 'roof-satellite': 'dish' }[eq.roof];
  if (rk) { const r = roofItem(rk); r.position.set(s.x, top, s.z); group.add(r); up = top + (rk === 'antenna' ? 9 : 2); }
  if (eq.roof === 'roof-helipad') { const h = own(new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 0.3, 32), new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.8 }))); h.position.set(s.x, top + 0.2, s.z); const hh = own(new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.05, 0.5), new THREE.MeshBasicMaterial({ color: 0xffffff }))); hh.position.set(s.x, top + 0.38, s.z); group.add(h, hh); up = top + 1; }
  if (eq.roof === 'roof-billboard') { const b = own(new THREE.Mesh(new THREE.BoxGeometry(7, 2.4, 0.3), new THREE.MeshBasicMaterial({ map: labelTex(c.optIn ? '@' + c.username : 'Verified owner', '#12151f', '#ffd23a', true), toneMapped: false }))); b.position.set(s.x, top + 3.2, s.z); b.rotation.y = yaw; const p = own(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 3, 6), new THREE.MeshStandardMaterial({ color: 0x555a62 }))); p.position.set(s.x, top + 1.5, s.z); group.add(b, p); up = top + 5; }
  if (eq.neon) { const nc = eq.neon === 'neon-cyan' ? '#33e0ff' : '#ff4fd8', n = own(new THREE.Mesh(new THREE.BoxGeometry(7, 1.2, 0.25), new THREE.MeshBasicMaterial({ map: labelTex(c.optIn ? '@' + c.username : 'NEVEREND', '#05060c', nc, true), toneMapped: false }))); n.material.color.setScalar(1.8); n.position.set(s.x + fx * 6.9, Math.min(top * 0.55, 7), s.z + fz * 6.9); n.rotation.y = yaw; group.add(n); }
  if (eq.glow) { const g = own(new THREE.Mesh(new THREE.BoxGeometry(11.4, top, 11.4), new THREE.MeshBasicMaterial({ color: eq.glow === 'glow-anim' ? 0x66ddff : 0xffb45a, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }))); g.position.set(s.x, top / 2, s.z); group.add(g); anim.push(t => { g.material.opacity = 0.1 + 0.07 * Math.sin(t * (eq.glow === 'glow-anim' ? 3 : 1)); if (eq.glow === 'glow-anim') g.material.color.setHSL((t * 0.1) % 1, 0.8, 0.6); }); }
  if (eq.fx === 'fx-halo') { const h = own(new THREE.Mesh(new THREE.TorusGeometry(9, 0.2, 8, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 1.6, 2.4) }))); h.rotation.x = Math.PI / 2; group.add(h); anim.push(t => { h.position.set(s.x, up + 5 + Math.sin(t * 2), s.z); h.rotation.z = t * 0.8; }); }
  if (eq.fx === 'fx-fireworks') { let next = 0; anim.push((t, now) => { if (now > next) { next = now + 4 + Math.random() * 2; fw.queue.push({ t: now, x: s.x, y: up + 22, z: s.z, c: ['#ff6bd6', '#6be3ff', '#ffe36b', '#8bff9b'][Math.floor(Math.random() * 4)] }); } }); }
  const plate = eq.plate, st = c.status === 'verified', txt = (c.optIn ? '@' + c.username : 'Verified owner').slice(0, 20) + (st ? ' ✓' : ' (pending)');
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex(txt, plate === 'plate-gold' ? '#6b4a00' : plate === 'plate-wood' ? '#8a5a36' : plate === 'plate-neon' ? '#05060c' : 'rgba(12,16,28,.82)', plate === 'plate-gold' ? '#ffd23a' : plate === 'plate-wood' ? '#f4dcae' : plate === 'plate-neon' ? '#ff4fd8' : st ? '#9bffb4' : '#ffe08a', plate === 'plate-neon'), depthTest: false, transparent: true }));
  sp.scale.set(10, 2.5, 1); sp.position.set(s.x, up + 4.5, s.z); sp.renderOrder = 9; sp.userData.own = true; group.add(sp);
  vfx = { group, anim, sprite: sp, base: up + 4.5 };
}
/* name plates for every claimed building (public data only: usernames people chose to show) */
let plates = null; const plateTex = new Map();
function smallPlate(text, verified) {
  const key = text + verified; let t = plateTex.get(key); if (t) return t;
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d'); g.fillStyle = 'rgba(12,16,28,.82)'; g.fillRect(0, 0, 256, 64); g.strokeStyle = verified ? '#9bffb4' : '#ffe08a'; g.lineWidth = 3; g.strokeRect(2, 2, 252, 60);
  g.fillStyle = verified ? '#9bffb4' : '#ffe08a'; g.font = 'bold 28px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 34); t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; plateTex.set(key, t); return t;
}
function refreshClaimPlates(claims) {
  if (plates) { world.remove(plates); plates = null; }
  if (!useRemote || !W || !claims) return; const mine = visitor.v.claim ? visitor.v.claim.building : -1, g = new THREE.Group(); let n = 0; world.add(g);
  for (const c of claims) { if (c.building === mine || n > 400) continue; const s = W.S[c.building]; if (!s) continue; n++; const ok = c.status === 'verified', text = ((c.display_name ? '@' + c.display_name : 'Builder') + (ok ? ' ✓' : '')).slice(0, 20);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smallPlate(text, ok), depthTest: false, transparent: true })); sp.scale.set(8, 2, 1); sp.position.set(s.x, s.model.topY + 4.5, s.z); sp.renderOrder = 8; g.add(sp); }
  plates = g;
}
function refreshGolden() {
  if (goldenGroup) { world.remove(goldenGroup); goldenGroup.traverse(o => { if (o.userData.own && o.geometry) o.geometry.dispose(); }); goldenGroup = null; }
  if (!visitorOn || !W || !W.S.length) return;
  const g = new THREE.Group(); world.add(g);
  visitor.goldenToday(W.S.length).forEach(i => {
    if (visitor.isFound(i)) return; const s = W.S[i], star = new THREE.Mesh(new THREE.OctahedronGeometry(1.6, 0), new THREE.MeshStandardMaterial({ color: 0xffc400, emissive: 0xffa000, emissiveIntensity: 2.4, metalness: 0.8, roughness: 0.25 }));
    star.scale.y = 1.5; star.position.set(s.x, s.model.topY + 8, s.z); star.userData = { golden: i, own: true, star: true }; const hit = new THREE.Mesh(new THREE.SphereGeometry(5), new THREE.MeshBasicMaterial({ visible: false })); hit.position.copy(star.position); hit.userData = { golden: i, own: true }; g.add(star, hit);
  });
  goldenGroup = g;
}
function updateVisitorFx(t, now) {
  if (vfx) { vfx.anim.forEach(f => f(t, now)); vfx.sprite.position.y = vfx.base + Math.sin(t * 1.5) * 0.4; }
  if (goldenGroup) goldenGroup.children.forEach(o => { if (o.userData.star) { o.rotation.y = t * 1.8; o.position.y += Math.sin(t * 2 + o.userData.golden) * 0.01; } });
}
function locateGoldenStar(i) { const s = W && W.S[i]; if (!s) return; flyTo(s.x, s.model.topY + 4, s.z, 70, 5); toast('Look for the spinning gold star!'); }
function overlayStage(fn) { if (interior.active || entering || !W) return; entering = true; fadeEl.classList.add('on'); setTimeout(() => { fly = null; controls.enabled = false; $('hud').style.display = 'none'; $('dev').style.visibility = 'hidden'; fn(); fadeEl.classList.remove('on'); entering = false; }, 600); }
const visitor = new Visitor({
  store, remote: useRemote ? new Remote() : null, notify: msg => toast(msg), applyFx: () => { refreshVisitorFx(); refreshGolden(); }, onClaims: c => { refreshClaimPlates(c); refreshGolden(); }, onEvent: ms => { if (ms && Date.now() - ms < 600000 && !liveEv) startLiveEvent(ms); },
  getCtx: () => ({ W, count, next: nextMilestone(count), fly: i => { const s = W.S[i]; if (s) flyTo(s.x, 10, s.z, 60, 5); }, share: i => overlayStage(() => shareStage(interior, W.S[i], visitor.v.claim, location.host + location.pathname.replace(/\/$/, ''))) }),
  showCrate: res => overlayStage(() => crateStage(interior, res, () => { const r = visitor.openOne(); if (r) crateStage(interior, r, () => {}); })),
  locateGolden: locateGoldenStar,
  onClaimed: i => { const s = W && W.S[i]; if (!s) return; flyTo(s.x, s.model.topY + 8, s.z, 70, 6); const cols = ['#ff6bd6', '#6be3ff', '#ffe36b', '#8bff9b']; for (let k = 0; k < 6; k++) setTimeout(() => { if (typeof fw !== 'undefined') fw.queue.push({ t: performance.now() / 1000, x: s.x + (Math.random() - .5) * 30, y: s.model.topY + 20 + Math.random() * 14, z: s.z + (Math.random() - .5) * 30, c: cols[k % 4] }); }, 900 + k * 450); },
});
$('devev').addEventListener('click', () => startLiveEvent());
if (visitorOn) {
  const hb = $('hubbtn'); hb.style.display = ''; hb.addEventListener('click', () => visitor.open());
  $('dfind').addEventListener('click', () => { const c = visitor.v.claim; if (c && W && W.S[c.building]) { const s = W.S[c.building]; flyTo(s.x, 10, s.z, 60, 5); } else visitor.open('building'); });
  $('dcrate').addEventListener('click', () => visitor.open('crates'));
  visitor.refreshBadge(true);
  let seen = false; try { seen = !!localStorage.getItem('nc.welcomed'); } catch (e) { /* ignore */ }
  if (!seen) setTimeout(() => { import('./gameui.js').then(G => G.welcomeCarousel(() => { try { localStorage.setItem('nc.welcomed', '1'); } catch (e) { /* ignore */ } if (visitor.remote && !visitor.remote.signedIn) visitor.open(); })); }, 2500);
}
$('dview').addEventListener('click', () => { const m = $('viewmenu'); m.style.display = m.style.display === 'flex' ? 'none' : 'flex'; });

/* ---------- live milestone event: 10 minutes of fireworks, a parade of cars, sweeping spotlights, double points ---------- */
let liveEv = null;
function startLiveEvent(startMs) {
  if (liveEv || !W) return; const now = performance.now() / 1000; visitor.startEvent(); const leftSec = startMs ? Math.max(5, 600 - (Date.now() - startMs) / 1000) : 600;
  const R = Math.min(W.extent * 0.8, 600), beams = [], cars = instanced(carGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.6 }), 14, 'parade');
  const pal = ['#ff6bd6', '#6be3ff', '#ffe36b', '#8bff9b', '#ff8a6b', '#b79bff']; for (let i = 0; i < 14; i++) cars.setColorAt(i, tmpC.set(pal[i % 6]).multiplyScalar(1.3)); cars.instanceColor.needsUpdate = true; cars.castShadow = true;
  for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 11, 520, 24, 1, true).translate(0, 260, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(0.1 + i * 0.3, 0.8, 0.7), transparent: true, opacity: 0.11, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })); b.frustumCulled = false; scene.add(b); beams.push(b); }
  const pts = [[-P * 1.5 + 2.4, -P * 1.5 + 2.4], [P * 1.5 - 2.4 + 0, -P * 1.5 + 2.4], [P * 1.5 - 2.4, P * 1.5 - 2.4], [-P * 1.5 + 2.4, P * 1.5 - 2.4]].map(([a, b]) => [a + P / 2 - P / 2, b]), lens = [3 * P, 3 * P, 3 * P, 3 * P];
  liveEv = { until: now + leftSec, nextFw: now, cars, beams, R, pts, lens, tot: 12 * P }; $('evbanner').style.display = 'block'; toast('LIVE EVENT: double points for 10 minutes!');
}
function updateLiveEvent(now) {
  if (!liveEv) return; const left = liveEv.until - now;
  if (left <= 0) { world.remove(liveEv.cars); liveEv.beams.forEach(b => scene.remove(b)); liveEv = null; $('evbanner').style.display = 'none'; return; }
  $('evbanner').textContent = `LIVE EVENT · double points · ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')} left`;
  if (now > liveEv.nextFw) { liveEv.nextFw = now + 1.2 + Math.random() * 1.6; const a = Math.random() * 6.283, r = Math.random() * liveEv.R * 0.7; fw.queue.push({ t: now, x: Math.cos(a) * r, y: 70 + Math.random() * 70, z: Math.sin(a) * r, c: ['#ff6bd6', '#6be3ff', '#ffe36b', '#8bff9b', '#ff8a6b', '#b79bff'][Math.floor(Math.random() * 6)] }); }
  const { pts, lens, tot } = liveEv;
  for (let i = 0; i < 14; i++) { let d = ((now * 11 + i * (tot / 14)) % tot + tot) % tot, k = 0; while (d > lens[k]) { d -= lens[k]; k++; } const p = pts[k], q = pts[(k + 1) % 4], f = d / lens[k]; setPos(liveEv.cars, i, p[0] + (q[0] - p[0]) * f, 0, p[1] + (q[1] - p[1]) * f, Math.atan2(q[0] - p[0], q[1] - p[1])); }
  liveEv.cars.instanceMatrix.needsUpdate = true;
  liveEv.beams.forEach((b, i) => { const a = now * 0.4 + i * 2.094; b.position.set(Math.cos(a) * liveEv.R * 0.5, 0, Math.sin(a) * liveEv.R * 0.5); b.rotation.set(Math.sin(now * 0.7 + i) * 0.5, 0, Math.cos(now * 0.6 + i * 2) * 0.5); });
}
/* ---------- explore mode: walk or drive through the city ---------- */
const explore = new Explore({
  scene, camera, canvas, getWorld: () => W, carGeo, notify: msg => toast(msg),
  onStop: () => { fadeEl.classList.add('on'); setTimeout(() => { fly = null; controls.enabled = true; $('hud').style.display = ''; $('dev').style.visibility = ''; frameView(); fitCamera(); const off = camera.position.clone().sub(controls.target); camera.position.copy(controls.target).add(off.setLength(Math.max(desiredDist, 160))); updateChunks(true); fadeEl.classList.remove('on'); }, 450); },
});
function beginExplore(mode) {
  if (interior.active || entering || explore.active || !W) return; entering = true; fadeEl.classList.add('on');
  setTimeout(() => { fly = null; controls.enabled = false; $('hud').style.display = 'none'; $('dev').style.visibility = 'hidden'; explore.start(mode); fadeEl.classList.remove('on'); entering = false; }, 550);
}
{ const pop = document.createElement('div'); pop.style.cssText = 'position:fixed;left:50%;bottom:78px;transform:translateX(-50%);display:none;gap:8px;padding:8px;border-radius:14px;background:rgba(10,14,26,.8);border:1px solid rgba(255,255,255,.2);backdrop-filter:blur(12px);z-index:12';
  pop.innerHTML = '<button data-m="walk">Walk</button><button data-m="drive">Drive a car</button>'; pop.querySelectorAll('button').forEach(b => { b.style.cssText = 'appearance:none;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.1);color:#f4f7ff;font:inherit;font-size:13px;padding:10px 16px;border-radius:10px;cursor:pointer'; b.addEventListener('click', () => { pop.style.display = 'none'; beginExplore(b.dataset.m); }); });
  document.body.appendChild(pop); $('explore').addEventListener('click', () => { pop.style.display = pop.style.display === 'none' ? 'flex' : 'none'; }); }
/* ---------- loop ---------- */
const labelEl = $('newest'), proj = new THREE.Vector3(), beam = (() => {
  const c = cv(8, 256), g = c.getContext('2d'), grd = g.createLinearGradient(0, 0, 0, 256); grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(.7, 'rgba(255,255,255,.35)'); grd.addColorStop(1, 'rgba(255,255,255,1)'); g.fillStyle = grd; g.fillRect(0, 0, 8, 256);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 700, 24, 1, true).translate(0, 350, 0), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), color: new THREE.Color(0.45, 1.1, 1.7), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, opacity: 0 }));
  m.visible = false; scene.add(m); return m; })();
const ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 1.4, 2.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: false }));
ring.visible = false; scene.add(ring);
let last = performance.now(), frames = 0, slowMs = 0, hidden = false;
document.addEventListener('visibilitychange', () => { hidden = document.hidden; last = performance.now(); });
function frame(nowMs) {
  requestAnimationFrame(frame); if (hidden || !W) return;
  const dt = Math.min((nowMs - last) / 1000, 0.1); last = nowMs; const now = nowMs / 1000;
  if (mode === 'auto') { tDay = (tDay + dt / DAY_SECONDS) % 1; tTarget = tDay; } else { const diff = ((tTarget - tDay + 1.5) % 1) - 0.5; tDay = (tDay + diff * Math.min(1, dt * 1.6) + 1) % 1; }
  updateRain(dt, now); applyTime(tDay);
  if (interior.active) { renderer.toneMappingExposure = 0.9; bloom.strength = 0.35; interior.update(dt); composer.render(); if (captureCb) { const cb = captureCb; captureCb = null; canvas.toBlob(cb, 'image/png'); } return; }
  if (!fly && !explore.active) {
    const off = camera.position.clone().sub(controls.target), sph = new THREE.Spherical().setFromVector3(off); introT = Math.min(introT + dt / 6, 1); const k = easeOut(introT);
    if (introT < 1 && !userTouched) { sph.radius = lerp(desiredDist * 1.9, desiredDist, k); sph.phi = lerp(0.62, 1.15, k); } else if (!userTouched) sph.radius += (desiredDist - sph.radius) * Math.min(1, dt * 0.8);
    camera.position.copy(controls.target).add(off.setFromSpherical(sph));
  }
  if (explore.active) explore.update(dt, now); else { updateFly(now); controls.update(); }
  for (let i = W.anims.length - 1; i >= 0; i--) { const a = W.anims[i], t = (now - a.t0) / a.dur; if (t < 0) continue; placeStruct(a.s, easeOut(clamp(t, 0, 1))); if (t >= 1) W.anims.splice(i, 1); }
  const pending = W.anims.filter(a => now < a.t0).length, target = count - pending;
  shown = shown < target ? Math.min(target, shown + Math.max(1, (target - shown) * dt * 2.2 + dt * 30)) : target; updateHud();
  const nb = W.S[count - 1];
  if (nb) {
    const a = W.anims.find(x => x.s === nb), prog = a ? clamp((now - a.t0) / a.dur, 0, 1) : 1, vis = !a || now >= a.t0; beam.visible = ring.visible = vis;
    beam.position.set(nb.x, 0, nb.z); ring.position.set(nb.x, 0.3, nb.z); const pulse = 0.55 + 0.45 * Math.sin(now * 2.4); beam.material.opacity = (0.16 + 0.22 * pulse) * (1 - windowF * 0.2);
    const rp = (now * 0.5) % 1; ring.scale.setScalar(6 + rp * 34); ring.material.opacity = (1 - rp) * 0.9 * prog;
    proj.set(nb.x, nb.model.topY * easeOut(prog) + 6, nb.z).project(camera); const on = proj.z < 1 && Math.abs(proj.x) < 1.1 && Math.abs(proj.y) < 1.1 && vis;
    labelEl.style.opacity = on ? 1 : 0; labelEl.style.left = (proj.x * 0.5 + 0.5) * innerWidth + 'px'; labelEl.style.top = (-proj.y * 0.5 + 0.5) * innerHeight + 'px';
  } else { beam.visible = ring.visible = false; labelEl.style.opacity = 0; }
  aviMat.color.setRGB(1, 0.07, 0.04).multiplyScalar(0.3 + 4 * Math.max(0, Math.sin(now * 3.1)));
  updateAgents(dt, now); updateAmbient(now); updateBizFx(now); updateVisitorFx(now, now); updateLiveEvent(now); W.infra.update(now, dt); updateFireworks(dt, now);
  if ((frames & 7) === 0) updateChunks();
  composer.render();
  frames++; slowMs += dt * 1000;
  if (frames === 90) { const avg = slowMs / frames; frames = 0; slowMs = 0; if (avg > 26 && pixelRatio > 0.8) setPR(pixelRatio - 0.25); else if (avg < 12 && pixelRatio < Math.min(devicePixelRatio || 1, isMobile ? 1.75 : 2) - 0.01) setPR(pixelRatio + 0.25); }
}
function setPR(v) { pixelRatio = v; renderer.setPixelRatio(v); composer.setPixelRatio(v); composer.setSize(innerWidth, innerHeight); }
function frameView() { camera.aspect = innerWidth / innerHeight; camera.setViewOffset(innerWidth, innerHeight, 0, -innerHeight * 0.1, innerWidth, innerHeight); camera.updateProjectionMatrix(); }
frameView();
addEventListener('resize', () => { frameView(); renderer.setSize(innerWidth, innerHeight, false); composer.setSize(innerWidth, innerHeight); if (W) fitCamera(); });

/* ---------- go ---------- */
window.__city = { explore, beginExplore, renderer, composer, interior, openBuilding, store, visitor, startLiveEvent, refreshVisitorFx, fns: { updateAgents, updateAmbient, updateFireworks, applyTime, updateChunks, updateHud, updateFly }, setCount, get world() { return W; }, scene, camera, controls, setTime: t => { mode = 'manual'; tDay = tTarget = t; }, flyTo };
(async () => {
  try {
    if (params.has('count')) { live = { instagram: Math.round(Number(params.get('count')) * 0.6), youtube: 0, total: Number(params.get('count')) }; live.youtube = live.total - live.instagram; setCount(live.total, { celebrateOk: false }); }
    else { const d = await fetchLive(); if (d) live = d; setCount(live.total, { celebrateOk: false }); }
    requestAnimationFrame(frame); setTimeout(() => $('loading').classList.add('done'), 600);
    if (visitorOn) setTimeout(() => visitor.start(), useRemote ? 1200 : 5500);
    if (!params.has('count')) setInterval(poll, POLL_MS);
  } catch (e) { $('err').style.display = 'block'; $('err').textContent = String(e); console.error(e); }
})();
