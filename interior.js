import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BUSINESSES, FURNITURE, SELL_BACK, stageOf, HOUR, upgradeCost, workerSlots, workerCost, managerCost, baseIncomePerHour, pendingEarnings, eventsForDay, dayOf, netWorth, ownerLevel, MAX_LEVEL } from './economy.js';

export const HOME_TYPES = new Set(['house', 'townhome', 'apartment']);
export const SHOP_TYPES = new Set(['shop', 'store', 'diner', 'gas', 'cinema', 'bank']);
export const canEnter = s => HOME_TYPES.has(s.type) || SHOP_TYPES.has(s.type);

const GRID = 0.5, fmt = n => Math.round(n).toLocaleString();
const rnd = mulberry => mulberry();
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* ---------- materials ---------- */
const matCache = new Map();
const M = (color, rough = 0.7, metal = 0, extra = {}) => { const k = color + rough + metal + JSON.stringify(extra); let m = matCache.get(k); if (!m) matCache.set(k, m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra })); return m; };
const box = (w, h, d, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y + h / 2, z); m.castShadow = m.receiveShadow = true; return m; };
const cyl = (rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 16) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); m.position.set(x, y + h / 2, z); m.castShadow = m.receiveShadow = true; return m; };
function canvasTex(w, h, draw, repeat) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); } return t; }
const woodTex = () => canvasTex(512, 512, (g, w, h) => { g.fillStyle = '#b98a5a'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 64) { for (let x = (y / 64 % 2) * 128; x < w + 128; x += 256) { const l = 120 + Math.random() * 30 | 0; g.fillStyle = `rgb(${l + 55},${l + 20},${l - 30})`; g.fillRect(x - 128 + 2, y + 2, 252, 60); } } g.strokeStyle = 'rgba(60,35,15,.16)'; for (let i = 0; i < 160; i++) { const x = Math.random() * w, y = Math.random() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 20 + Math.random() * 40, y + (Math.random() - .5) * 3); g.stroke(); } }, [3, 2.4]);
const tileTex = () => canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#d9d6cf'; g.fillRect(0, 0, w, h); g.fillStyle = '#bdb8ae'; for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) if ((x + y) % 2) g.fillRect(x * 128, y * 128, 128, 128); g.strokeStyle = 'rgba(0,0,0,.2)'; g.strokeRect(0, 0, w, h); }, [6, 4.5]);
const paperTex = hue => canvasTex(256, 256, (g, w, h) => { g.fillStyle = `hsl(${hue},28%,76%)`; g.fillRect(0, 0, w, h); g.fillStyle = `hsla(${hue},30%,66%,.55)`; for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 16, h); }, [4, 1.4]);
const grassTex = () => canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#6a9a48'; g.fillRect(0, 0, w, h); for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(${Math.random() < .5 ? '30,70,20' : '150,190,90'},.18)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 4); } }, [5, 4]);
function textTex(text, bg, fg) { return canvasTex(512, 160, (g, w, h) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16); g.fillStyle = fg; g.font = 'bold 64px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text.toUpperCase(), w / 2, h / 2 + 4); }); }

/* ---------- furniture models (floor y = 0, front faces +z) ---------- */
const PALETTE = ['#c9533f', '#3f6fb0', '#e0b43a', '#4f9b5e', '#8a5fb0', '#e07fa0', '#3fa8a0', '#d98a3a'];
function makeFurniture(id, seed = 0) {
  const g = new THREE.Group(), c = PALETTE[seed % PALETTE.length], dark = M('#4a3626', 0.6), wood = M('#8a5a36', 0.55), white = M('#f2efe8', 0.6);
  if (id === 'bed') { g.add(box(2.0, 0.35, 1.6, wood), box(1.9, 0.28, 1.5, M(c, 0.9), 0, 0.35, 0.02), box(2.0, 0.95, 0.12, dark, 0, 0, -0.74), box(0.6, 0.14, 0.4, white, -0.5, 0.63, -0.45), box(0.6, 0.14, 0.4, white, 0.5, 0.63, -0.45), box(1.9, 0.05, 0.8, M('#f4f1ea', 0.95), 0, 0.62, 0.35)); g.children[2].rotation.y = 0; }
  else if (id === 'sofa') { g.add(box(2.2, 0.4, 0.9, M(c, 0.95)), box(2.2, 0.55, 0.25, M(c, 0.95), 0, 0.4, -0.33), box(0.22, 0.3, 0.9, M(c, 0.95), -1.0, 0.4, 0), box(0.22, 0.3, 0.9, M(c, 0.95), 1.0, 0.4, 0), box(0.8, 0.12, 0.65, M(c, 0.8), -0.45, 0.4, 0.08), box(0.8, 0.12, 0.65, M(c, 0.8), 0.45, 0.4, 0.08)); }
  else if (id === 'tv') { const scr = M('#0b1a2e', 0.2, 0.1, { emissive: new THREE.Color('#2a6fe0'), emissiveIntensity: 0.9 }); g.add(box(1.6, 0.45, 0.45, wood), box(1.4, 0.8, 0.06, scr, 0, 0.55, -0.05), box(0.5, 0.07, 0.25, dark, 0, 0.45, -0.05)); g.userData.screen = g.children[1]; }
  else if (id === 'plant') { g.add(cyl(0.22, 0.17, 0.35, M('#b4623c', 0.8))); const l = M('#3f8a3a', 0.8); for (const [x, y, z, r] of [[0, 0.7, 0, 0.3], [0.15, 0.55, 0.1, 0.2], [-0.15, 0.62, -0.1, 0.22]]) { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), l); s.position.set(x, y, z); s.castShadow = true; g.add(s); } }
  else if (id === 'lamp') { g.add(cyl(0.18, 0.2, 0.05, dark), cyl(0.025, 0.025, 1.35, M('#2a2a2a', 0.4, 0.6), 0, 0.05), cyl(0.18, 0.28, 0.32, M('#fff1c8', 0.6, 0, { emissive: new THREE.Color('#ffd98a'), emissiveIntensity: 1.2 }), 0, 1.35)); g.userData.light = true; }
  else if (id === 'table') { g.add(box(1.5, 0.08, 1.0, wood, 0, 0.72)); for (const [x, z] of [[-0.65, -0.4], [0.65, -0.4], [-0.65, 0.4], [0.65, 0.4]]) g.add(box(0.07, 0.72, 0.07, dark, x, 0, z)); for (const z of [-0.78, 0.78]) { g.add(box(0.42, 0.06, 0.42, M(c, 0.8), 0, 0.42, z), box(0.42, 0.45, 0.06, M(c, 0.8), 0, 0.45, z + (z < 0 ? -0.18 : 0.18))); } g.add(cyl(0.12, 0.1, 0.12, M('#e8e0d0', 0.4), 0.2, 0.8, 0.1)); }
  else if (id === 'bookshelf') { g.add(box(1.2, 1.9, 0.4, wood)); for (let r = 0; r < 4; r++) { g.add(box(1.12, 0.04, 0.38, dark, 0, 0.1 + r * 0.45, 0.01)); for (let b = 0; b < 8; b++) g.add(box(0.1, 0.3 + (b % 3) * 0.04, 0.26, M(PALETTE[(b + r * 3 + seed) % 8], 0.8), -0.5 + b * 0.14, 0.14 + r * 0.45, 0.03)); } }
  else if (id === 'rug') { const r = box(2.4, 0.03, 1.6, M(c, 1)); const edge = box(2.2, 0.035, 1.4, M('#f0e8d8', 1)); g.add(r, edge); }
  else if (id === 'art') { const tex = canvasTex(128, 128, (cx, w, h) => { const grd = cx.createLinearGradient(0, 0, w, h); grd.addColorStop(0, PALETTE[seed % 8]); grd.addColorStop(1, PALETTE[(seed + 3) % 8]); cx.fillStyle = grd; cx.fillRect(0, 0, w, h); cx.fillStyle = 'rgba(255,255,255,.35)'; cx.beginPath(); cx.arc(w * .65, h * .4, 26, 0, 7); cx.fill(); }); g.add(box(1.0, 0.7, 0.05, dark), (() => { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 0.58), new THREE.MeshBasicMaterial({ map: tex })); p.position.set(0, 0.35, 0.03); return p; })()); }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

/* ---------- animated people (stylized) ---------- */
export function makePerson(shirt, skin = '#e0b48a', pants = '#2a3446') {
  const g = new THREE.Group(), s = M(shirt, 0.7), sk = M(skin, 0.7), p = M(pants, 0.8);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.5, 4, 8), s); torso.position.y = 1.1; torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), sk); head.position.y = 1.62; head.castShadow = true;
  const limb = (w, h, d, mat, x, y) => { const piv = new THREE.Group(); piv.position.set(x, y, 0); const m = box(w, h, d, mat, 0, -h); m.castShadow = true; piv.add(m); return piv; };
  const legL = limb(0.16, 0.8, 0.2, p, -0.1, 0.82), legR = limb(0.16, 0.8, 0.2, p, 0.1, 0.82), armL = limb(0.11, 0.55, 0.13, s, -0.27, 1.32), armR = limb(0.11, 0.55, 0.13, s, 0.27, 1.32);
  g.add(torso, head, legL, legR, armL, armR); g.userData = { legL, legR, armL, armR, torso, phase: Math.random() * 6 };
  return g;
}
export function pose(p, walking, sit, t, amp = 0.7) {
  const u = p.userData, sw = walking ? Math.sin(t * 7 + u.phase) * amp : 0;
  u.legL.rotation.x = sit ? -1.45 : sw; u.legR.rotation.x = sit ? -1.45 : -sw; u.armL.rotation.x = walking ? -sw : (sit ? -0.5 : Math.sin(t * 1.2 + u.phase) * 0.05); u.armR.rotation.x = walking ? sw : (sit ? -0.5 : 0);
  u.torso.position.y = 1.1 + (walking ? Math.abs(Math.sin(t * 7 + u.phase)) * 0.04 : 0);
}
const SHIRTS = ['#c9433b', '#3b6fb0', '#e0b43a', '#4f9b5e', '#7b4fa3', '#e8e8e8', '#e07fa0', '#3fa8a0'], SKINS = ['#f1c9a5', '#d9a679', '#a97551', '#6b4a33'];

/* ---------- the interior system ---------- */
export class InteriorSystem {
  constructor(opts) {
    const { renderer, renderPass, canvas, envMap, store, getNight, onExit, notify } = opts;
    Object.assign(this, { renderer, renderPass, canvas, envMap, store, getNight, onExit, notify }); this.ctx = opts;
    this.camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 300);
    this.controls = new OrbitControls(this.camera, canvas); this.controls.enabled = false; this.controls.enableDamping = true; this.controls.enablePan = false;
    this.controls.minDistance = 5; this.controls.maxDistance = 22; this.controls.maxPolarAngle = 1.45; this.controls.minPolarAngle = 0.3;
    this.active = false; this.ray = new THREE.Raycaster(); this.ndc = new THREE.Vector2(); this.t = 0;
    this._buildUI(); this._bind();
  }

  /* ----- UI ----- */
  _buildUI() {
    const css = document.createElement('style');
    css.textContent = `#iui{position:fixed;inset:0;pointer-events:none;display:none;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#f4f7ff}
#iui *{box-sizing:border-box}#iui .glass{background:rgba(10,14,26,.62);border:1px solid rgba(255,255,255,.16);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-radius:14px;pointer-events:auto}
#iui .top{position:absolute;left:12px;right:12px;top:12px;display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
#iui button{appearance:none;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:inherit;font:inherit;font-size:13px;padding:9px 13px;border-radius:10px;cursor:pointer}
#iui button:hover{background:rgba(255,255,255,.16)}#iui button.pri{background:#2f6aa8;border-color:#5b95d6}#iui button:disabled{opacity:.4;cursor:not-allowed}
#iui .coin{padding:8px 14px;font-size:15px;display:flex;gap:10px;align-items:center;font-variant-numeric:tabular-nums}#iui .coin small{opacity:.65;font-size:11px;letter-spacing:.1em;text-transform:uppercase}
#iui .panel{position:absolute;right:12px;top:68px;bottom:12px;width:min(300px,calc(100vw - 24px));padding:12px;overflow:auto;display:flex;flex-direction:column;gap:8px}
#iui h3{margin:0 0 2px;font-size:15px;font-weight:600}#iui .sub{font-size:12px;opacity:.7;line-height:1.45}
#iui .item{display:flex;justify-content:space-between;align-items:center;gap:8px;width:100%;text-align:left}
#iui .tag{font-size:11px;letter-spacing:.14em;text-transform:uppercase;opacity:.6}
#iui .banner{background:rgba(255,200,60,.14);border:1px solid rgba(255,200,60,.4);padding:8px 10px;border-radius:10px;font-size:12px}
#iui .demo{position:absolute;left:12px;bottom:12px;padding:8px 12px;font-size:12px;opacity:.9;max-width:calc(100vw - 340px)}
@media(max-width:700px){#iui .panel{top:auto;height:44vh;left:12px;right:12px;width:auto}#iui .demo{bottom:calc(44vh + 20px);max-width:none}}`;
    document.head.appendChild(css);
    const root = this.ui = document.createElement('div'); root.id = 'iui';
    root.innerHTML = `<div class="top"><div style="display:flex;gap:8px;pointer-events:auto"><button id="iback" class="glass">← Back to city</button></div>
<div class="glass coin"><div><small>City Coins</small><div id="icoins">0</div></div><div><small>Net worth</small><div id="inw">0</div></div></div></div>
<div class="glass panel" id="ipanel"></div><div class="glass demo">Demo mode: coins and furniture are saved only in this browser. The real, cheat-proof economy needs the server.</div>`;
    document.body.appendChild(root);
    root.querySelector('#iback').addEventListener('click', () => this.exit());
    this.panel = root.querySelector('#ipanel');
  }
  _bind() {
    const c = this.canvas; let down = null;
    c.addEventListener('pointermove', e => { if (this.active) this._move(e); });
    c.addEventListener('pointerdown', e => { if (this.active) down = [e.clientX, e.clientY, performance.now()]; });
    c.addEventListener('pointerup', e => { if (this.active && down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 5 && performance.now() - down[2] < 400) this._click(e); down = null; });
    addEventListener('keydown', e => { if (!this.active || e.target.tagName === 'INPUT') return;
      if (e.key === 'Escape') { if (this.ghost) this._cancelGhost(); else this._select(null); }
      if ((e.key === 'r' || e.key === 'R') && this.ghost) this._rotateGhost();
      if ((e.key === 'Delete' || e.key === 'Backspace') && this.sel) this._sell(); });
    addEventListener('resize', () => { this.camera.aspect = innerWidth / innerHeight; this._viewShift(); });
  }
  _viewShift() { // slide the room left so the side panel never covers it (wide screens only)
    this.camera.aspect = innerWidth / innerHeight;
    if (innerWidth > 700 && !(this.spec && this.spec.noShift && this.kind === 'stage')) this.camera.setViewOffset(innerWidth, innerHeight, 150, 0, innerWidth, innerHeight); else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }
  _ndc(e) { const r = this.canvas.getBoundingClientRect(); this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); this.ray.setFromCamera(this.ndc, this.camera); }
  _refreshCoins() { const s = this.store.state, nw = netWorth(s); this.ui.querySelector('#icoins').textContent = fmt(s.coins); this.ui.querySelector('#inw').textContent = fmt(nw); this.store.snap(nw); }

  /* ----- enter / exit ----- */
  enter(s) {
    this.s = s; this.kind = HOME_TYPES.has(s.type) ? 'home' : 'shop';
    const st = this.store.state; st.visits[s.i] = (st.visits[s.i] || 0) + 1; this.store.save();
    this.scene = new THREE.Scene(); this.scene.environment = this.envMap; this.scene.environmentIntensity = 0.5; this.scene.background = new THREE.Color('#14171f');
    this.people = []; this.customers = []; this.pops = []; this.placed = []; this.ghost = null; this.sel = null; this.walkers = [];
    this.dim = this.kind === 'home' ? { W: 10, D: 8, H: 3.2 } : { W: 12, D: 9, H: 3.4 };
    this.rng = mulberry32(s.i * 977 + 11);
    if (this.kind === 'home') this._buildHome(); else this._buildShop();
    this.camera.position.set(this.dim.W * 0.95, this.dim.D * 1.1, this.dim.D * 1.55); this.controls.target.set(0, 0.7, 0); this.controls.enabled = true; this.controls.update();
    this.renderPass.scene = this.scene; this.renderPass.camera = this.camera; this._viewShift();
    this.active = true; this.ui.style.display = 'block'; this._refreshCoins(); this._renderPanel();
    this.t = 0; this.spawnT = 2;
  }
  _disposeScene() { if (this.scene) this.scene.traverse(o => { if (o.geometry && !o.userData.shared) o.geometry.dispose(); }); }
  exit() {
    if (!this.active) return; this._cancelGhost(); const back = this.returnTo; this.returnTo = null; this.controls.autoRotate = false; this.controls.minDistance = 5; this.controls.maxDistance = 22;
    this._disposeScene(); this.scene = null; this.kind = 'home';
    if (back) { this.active = false; this.enter(back); return; }
    this.active = false; this.controls.enabled = false; this.ui.style.display = 'none'; this.camera.clearViewOffset(); this.onExit && this.onExit();
  }
  /* a generic 3D stage (cosmetics preview, 3D print, stats chart) shown with the same viewer and side panel */
  openStage(spec) {
    if (this.active) { this._cancelGhost(); this._disposeScene(); }
    this.kind = 'stage'; this.spec = spec; this.returnTo = spec.returnTo || null;
    this.scene = new THREE.Scene(); this.scene.environment = this.envMap; this.scene.environmentIntensity = 0.7;
    this.people = []; this.customers = []; this.pops = []; this.placed = []; this.ghost = null; this.sel = null; this.walkers = []; this.glass = []; this.biz = null; this.selBox = null;
    spec.build(this.scene);
    const c = spec.camera; this.camera.position.set(c.r * 0.8, c.r * c.height + 4, c.r * 0.8); this.controls.target.set(...c.target);
    Object.assign(this.controls, { minDistance: 3, maxDistance: c.r * 3, autoRotate: true, autoRotateSpeed: spec.autoRotate || 0.6, enabled: true }); this.controls.update();
    this.renderPass.scene = this.scene; this.renderPass.camera = this.camera; this._viewShift();
    this.active = true; this.ui.style.display = 'block'; this.t = 0; this._renderPanel();
  }

  /* ----- shared room shell ----- */
  _room(floorTex, wallColor, wallHue) {
    const { W, D, H } = this.dim, sc = this.scene;
    this.floor = box(W, 0.2, D, new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.55 }), 0, -0.2, 0); this.floor.castShadow = false; sc.add(this.floor);
    const wallMat = wallHue !== undefined ? new THREE.MeshStandardMaterial({ map: paperTex(wallHue), roughness: 0.9 }) : M(wallColor, 0.9);
    sc.add(box(W + 0.4, H, 0.2, wallMat, 0, 0, -D / 2 - 0.1), box(0.2, H, D, wallMat, -W / 2 - 0.1, 0, 0));
    sc.add(box(W, 0.14, 0.06, M('#f2efe8', 0.5), 0, 0, -D / 2 + 0.03), box(0.06, 0.14, D, M('#f2efe8', 0.5), -W / 2 + 0.03, 0, 0));
    this.glass = []; const win = (x, z, wall) => {
      const fr = M('#f4f1ea', 0.5), gl = new THREE.MeshBasicMaterial({ color: '#9fd0ff' }); this.glass.push(gl);
      const g = new THREE.Group(); g.add(box(1.7, 1.3, 0.1, fr), (() => { const p = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.1), gl); p.position.set(0, 0.65, 0.06); return p; })(), box(0.06, 1.1, 0.04, fr, 0, 0.1, 0.07), box(1.5, 0.06, 0.04, fr, 0, 0.6, 0.07));
      g.position.set(x, 1.1, z); if (wall === 'left') g.rotation.y = Math.PI / 2; sc.add(g);
    };
    win(-D / 2 * 0 - 2.5, -D / 2 + 0.02, 'back'); win(2.5, -D / 2 + 0.02, 'back'); win(-W / 2 + 0.02, 0, 'left');
    this.hemi = new THREE.HemisphereLight(0xdfeeff, 0x6b5a48, 0.9); this.sun = new THREE.DirectionalLight(0xfff1dc, 2.2); this.sun.position.set(-3, 6, 4); this.sun.castShadow = true; this.sun.shadow.mapSize.setScalar(1024);
    Object.assign(this.sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 20 }); this.sun.shadow.bias = -0.0006;
    this.warm = new THREE.PointLight(0xffd9a0, 20, 14, 1.6); this.warm.position.set(0, 2.9, 0.5);
    sc.add(this.hemi, this.sun, this.warm);
  }

  /* ----- home ----- */
  _buildHome() {
    const { W, D } = this.dim, s = this.s, st = this.store.state;
    this._room(woodTex(), null, s.variant % 360);
    // free starter furniture the first time a home is opened
    if (!st.starter[s.i]) { st.starter[s.i] = 1; const L = this.store.furnitureOf(s.i); L.push({ uid: this.store.nextUid(), id: 'bed', x: -W / 2 + 1.2, z: -D / 2 + 1.0, rot: 0 }, { uid: this.store.nextUid(), id: 'lamp', x: -W / 2 + 0.5, z: D / 2 - 1.2, rot: 0 }, { uid: this.store.nextUid(), id: 'plant', x: W / 2 - 0.6, z: -D / 2 + 0.6, rot: 0 }); this.store.save(); }
    this.furnRoot = new THREE.Group(); this.scene.add(this.furnRoot);
    for (const it of this.store.furnitureOf(s.i)) this._addObject(it);
    this._vault();
    // two residents who wander the room and sit on sofas
    for (let k = 0; k < 2; k++) { const p = makePerson(SHIRTS[(s.variant + k * 3) % 8], SKINS[(s.variant + k) % 4]); p.position.set(1 + k, 0, 1.5); this.scene.add(p); this.walkers.push({ obj: p, target: null, wait: 1 + k, sit: false }); }
  }
  _vault() { // the money stack grows with net worth
    const nw = netWorth(this.store.state), n = Math.max(1, Math.min(21, Math.floor(Math.log2(Math.max(2, nw / 40)) * 3))), g = this.vault = new THREE.Group(), gold = M('#d9b53a', 0.3, 0.9), cash = M('#6fa86a', 0.8);
    // 6 rows hold 21 stacks; the row limit keeps this loop finite
    let i = 0; for (let row = 0; i < n && row < 6; row++) for (let c = 0; c < 6 - row && i < n; c++, i++) { const b = box(0.42, 0.14, 0.2, i % 3 ? cash : gold, (c - (6 - row - 1) / 2) * 0.45, row * 0.15, 0); b.rotation.y = ((i * 37) % 11 - 5) * 0.01; g.add(b); }
    const base = box(2.9, 0.12, 0.6, M('#3a3f46', 0.5, 0.6), 0, -0.1, 0); g.add(base); this.coinSpin = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 24), gold); this.coinSpin.rotation.x = Math.PI / 2; this.coinSpin.position.set(0, Math.ceil(n / 6) * 0.15 + 0.5, 0); g.add(this.coinSpin);
    g.position.set(this.dim.W / 2 - 1.8, 0.12, this.dim.D / 2 - 0.7); g.rotation.y = -0.4; this.scene.add(g);
  }
  _addObject(it) {
    const obj = makeFurniture(it.id, it.uid); obj.userData.item = it; this._applyTransform(obj, it); this.furnRoot.add(obj); this.placed.push(obj);
    if (obj.userData.light && this.placed.filter(o => o.userData.pl).length < 3) { const pl = new THREE.PointLight(0xffd08a, 6, 7, 1.8); pl.position.set(0, 1.3, 0); obj.add(pl); obj.userData.pl = pl; }
    return obj;
  }
  _applyTransform(obj, it) {
    const f = FURNITURE[it.id], { W, D } = this.dim;
    if (f.kind === 'wall') { if (it.wall === 'left') { obj.position.set(-W / 2 + 0.06, 1.2, it.z); obj.rotation.y = Math.PI / 2; } else { obj.position.set(it.x, 1.2, -D / 2 + 0.06); obj.rotation.y = 0; } }
    else { obj.position.set(it.x, f.kind === 'rug' ? 0.005 : 0, it.z); obj.rotation.y = it.rot * Math.PI / 2; }
  }
  _foot(it) { const f = FURNITURE[it.id], sw = it.rot % 2 === 1; return { hw: (sw ? f.d : f.w) / 2, hd: (sw ? f.w : f.d) / 2 }; }
  _valid(it) {
    const f = FURNITURE[it.id], { W, D } = this.dim;
    if (f.kind === 'wall') { return it.wall === 'left' ? Math.abs(it.z) < D / 2 - 0.7 : Math.abs(it.x) < W / 2 - 0.7; }
    const { hw, hd } = this._foot(it); if (it.x - hw < -W / 2 + 0.05 || it.x + hw > W / 2 - 0.05 || it.z - hd < -D / 2 + 0.05 || it.z + hd > D / 2 - 0.05) return false;
    for (const o of this.placed) { const p = o.userData.item; if (p.uid === it.uid) continue; const pf = FURNITURE[p.id]; if (pf.kind === 'wall') continue; if ((pf.kind === 'rug') !== (f.kind === 'rug')) continue;
      const q = this._foot(p); if (Math.abs(it.x - p.x) < hw + q.hw - 0.01 && Math.abs(it.z - p.z) < hd + q.hd - 0.01) return false; }
    return true;
  }
  _blocked(x, z) { for (const o of this.placed) { const p = o.userData.item, pf = FURNITURE[p.id]; if (pf.kind !== 'floor') continue; const q = this._foot(p); if (Math.abs(x - p.x) < q.hw + 0.3 && Math.abs(z - p.z) < q.hd + 0.3) return true; } return false; }

  /* ----- placement ----- */
  startPlace(id, moving) {
    this._cancelGhost(); const f = FURNITURE[id]; if (!moving && !this.store.canAfford(f.price)) { this.notify('Not enough City Coins for ' + f.name + '.'); return; }
    const obj = makeFurniture(id, this.store.state.uid + 1);
    obj.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.6; o.castShadow = false; } });
    this.ghost = { id, rot: 0, obj, item: { uid: -1, id, x: 0, z: 0, rot: 0 }, moving: !!moving }; obj.visible = false; this.scene.add(obj);
    this._select(null); this._renderPanel();
  }
  _cancelGhost() {
    if (!this.ghost) return; const g = this.ghost; this.scene.remove(g.obj); this.ghost = null;
    if (g.moving && g.orig && this.active) { this.store.furnitureOf(this.s.i).push(g.orig); this._addObject(g.orig); this.store.save(); this._vaultRefresh(); }   // cancelled a move: put the item back
    if (this.active) this._renderPanel();
  }
  _rotateGhost() { if (!this.ghost || FURNITURE[this.ghost.id].kind === 'wall') return; this.ghost.item.rot = (this.ghost.item.rot + 1) % 4; this._updateGhost(); }
  _move(e) {
    if (!this.ghost) return; this._ndc(e); const f = FURNITURE[this.ghost.id], it = this.ghost.item, { W, D } = this.dim;
    if (f.kind === 'wall') {
      const back = this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), D / 2), new THREE.Vector3()), left = this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(1, 0, 0), W / 2), new THREE.Vector3());
      const okBack = back && Math.abs(back.x) < W / 2 && back.y > 0.2 && back.y < 3, okLeft = left && Math.abs(left.z) < D / 2 && left.y > 0.2 && left.y < 3;
      if (okLeft && (!okBack || this.camera.position.distanceTo(left) < this.camera.position.distanceTo(back))) { it.wall = 'left'; it.z = Math.round(left.z / GRID) * GRID; it.x = 0; }
      else if (okBack) { it.wall = 'back'; it.x = Math.round(back.x / GRID) * GRID; it.z = 0; } else return;
    } else {
      const p = this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3()); if (!p) return; const { hw, hd } = this._foot(it);
      it.x = Math.round((p.x - hw) / GRID) * GRID + hw; it.z = Math.round((p.z - hd) / GRID) * GRID + hd;
    }
    this._updateGhost();
  }
  _updateGhost() {
    const g = this.ghost; if (!g) return; this._applyTransform(g.obj, g.item); g.obj.visible = true; const ok = this._valid(g.item); g.valid = ok;
    g.obj.traverse(o => { if (o.isMesh && o.material && o.material.color) { o.material.emissive = o.material.emissive || new THREE.Color(); } });
    g.obj.traverse(o => { if (o.isMesh && o.material.emissive) { o.material.emissive.set(ok ? '#1c6b2a' : '#8a1c1c'); o.material.emissiveIntensity = 0.7; } });
  }
  _click(e) {
    this._ndc(e);
    if (this.ghost) { if (!this.ghost.item.x && !this.ghost.item.z && !this.ghost.obj.visible) return; this._updateGhost(); if (!this.ghost.valid) { this.notify('That spot is blocked.'); return; }
      const f = FURNITURE[this.ghost.id]; if (!this.ghost.moving && !this.store.spend(f.price)) { this.notify('Not enough City Coins.'); return; }
      const moved = this.ghost.moving && this.ghost.fromUid, it = { ...this.ghost.item, uid: moved ? this.ghost.fromUid : this.store.nextUid() }; this.store.furnitureOf(this.s.i).push(it); this.store.save();
      if (moved) this._act('move', { ref: it }); else this._act('place', { ref: it });
      this.ghost.orig = null; const id = this.ghost.id; this._cancelGhost(); const o = this._addObject(it); this._pop(o); this._fx('place'); this._select(o); this._refreshCoins(); this._vaultRefresh(); void id; return; }
    const hits = this.ray.intersectObjects(this.placed, true); if (hits.length) { let o = hits[0].object; while (o && !o.userData.item) o = o.parent; this._select(o || null); } else this._select(null);
  }
  _select(o) {
    this.sel = o; if (this.selBox) { this.scene.remove(this.selBox); this.selBox = null; }
    if (o) { this.selBox = new THREE.BoxHelper(o, 0xffe08a); this.scene.add(this.selBox); }
    this._renderPanel();
  }
  _sell() {
    if (!this.sel) return; const it = this.sel.userData.item, f = FURNITURE[it.id], list = this.store.furnitureOf(this.s.i); list.splice(list.findIndex(x => x.uid === it.uid), 1);
    this.store.earn(Math.floor(f.price * SELL_BACK)); this.store.save(); this._act('sell', { ref: it }); this.furnRoot.remove(this.sel); this.placed.splice(this.placed.indexOf(this.sel), 1); this._select(null); this._refreshCoins(); this._vaultRefresh();
  }
  _moveSel() { if (!this.sel) return; const it = this.sel.userData.item, list = this.store.furnitureOf(this.s.i); list.splice(list.findIndex(x => x.uid === it.uid), 1); this.store.save(); this.furnRoot.remove(this.sel); this.placed.splice(this.placed.indexOf(this.sel), 1); this._select(null); this.startPlace(it.id, true); this.ghost.item.rot = it.rot; this.ghost.fromUid = it.uid; this.ghost.orig = it; }
  _vaultRefresh() { if (this.kind !== 'home') return; this.scene.remove(this.vault); this._vault(); }

  /* ----- panels ----- */
  _renderPanel() {
    const p = this.panel, st = this.store.state; this._refreshCoins();
    if (this.kind === 'stage') { this.spec.panel(p); return; }
    if (this.kind === 'home') {
      const likes = st.likes[this.s.i] || 0;
      let h = `<h3>Home</h3><div class="sub">Your coins buy furniture. Click an item to buy, move the mouse over the floor, click to place, press R to rotate, Esc to cancel. Selling gives back ${Math.round(SELL_BACK * 100)}%.</div>`;
      if (this.ghost) h += `<div class="banner">Placing: ${FURNITURE[this.ghost.id].name}${this.ghost.moving ? '' : ` (${FURNITURE[this.ghost.id].price} coins)`}</div><button id="irot">Rotate (R)</button><button id="icancel">Cancel (Esc)</button>`;
      else if (this.sel) { const it = this.sel.userData.item, f = FURNITURE[it.id]; h += `<div class="banner">Selected: ${f.name}</div><button id="imove">Move</button><button id="isell">Sell for ${Math.floor(f.price * SELL_BACK)} coins</button>`; }
      h += `<div class="tag">Furniture shop</div>` + Object.entries(FURNITURE).map(([id, f]) => `<button class="item" data-buy="${id}"><span>${f.name}</span><b>${f.price}</b></button>`).join('');
      h += `<div class="tag">Visitors</div><button id="ilike">♥ Like this home (${likes})</button><div class="sub">Visits: ${st.visits[this.s.i] || 0}</div><div class="tag">Extras</div><button id="iprev">Cosmetics and 3D-print preview</button>`;
      p.innerHTML = h;
      p.querySelectorAll('[data-buy]').forEach(b => b.addEventListener('click', () => this.startPlace(b.dataset.buy)));
      const on = (id, fn) => { const el = p.querySelector('#' + id); if (el) el.addEventListener('click', fn); };
      on('iprev', () => this.ctx.openPreview(this)); on('irot', () => this._rotateGhost()); on('icancel', () => this._cancelGhost()); on('imove', () => this._moveSel()); on('isell', () => this._sell());
      on('ilike', () => { st.likes[this.s.i] = (st.likes[this.s.i] || 0) + 1; this.store.save(); this._renderPanel(); });
    } else this._renderShopPanel();
  }

  /* ----- shop ----- */
  _buildShop() {
    const { W, D } = this.dim, s = this.s, st = this.store.state, b = st.business[s.i];
    this.biz = b || null; this.theme = b ? BUSINESSES[b.type] : { name: 'Empty shop', color: '#888888' };
    if (b && b.type === 'lemonade') this._lemonadeScene(); else this._shopScene();
  }
  _shopScene() {
    const { W, D } = this.dim, b = this.biz, color = this.theme.color; this._room(tileTex(), '#d6cdb8');
    const sc = this.scene, accent = M(color, 0.6), cnt = M('#7a5638', 0.5), top = M('#e8dfd0', 0.3, 0.1);
    sc.add(box(7, 1.0, 0.9, cnt, 0, 0, -2.4), box(7.2, 0.08, 1.05, top, 0, 1.0, -2.4), box(7, 0.18, 0.92, accent, 0, 0.0, -1.95), box(0.5, 0.35, 0.4, M('#2a2f36', 0.4, 0.5), -2.4, 1.08, -2.4), box(0.9, 0.45, 0.5, M('#c0c4cc', 0.3, 0.8), 1.8, 1.08, -2.5), box(0.12, 0.5, 0.12, M('#2a2a2a'), 1.8, 1.53, -2.5));
    const board = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.44), new THREE.MeshBasicMaterial({ map: textTex(this.theme.name, '#1d2230', color) })); board.position.set(0, 2.4, -D / 2 + 0.14); sc.add(board);
    for (const x of [-4.4, 4.4]) { sc.add(box(1.2, 1.9, 0.5, M('#efe9dc', 0.6), x, 0, -D / 2 + 0.3)); for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) sc.add(box(0.18, 0.22, 0.2, M(PALETTE[(r * 4 + k) % 8], 0.7), x - 0.45 + k * 0.3, 0.2 + r * 0.44, -D / 2 + 0.34)); }
    this.tables = []; const n = Math.min(8, 2 + Math.floor((b ? b.level : 1) / 5)), spots = [[-4, 1.8], [-1.3, 2.4], [1.4, 1.8], [4, 2.4], [-4, -0.2], [4.2, 0.2], [-1.6, 0.6], [1.6, -0.2]];
    for (let i = 0; i < n; i++) { const [x, z] = spots[i], t = makeFurniture('table', i); t.position.set(x, 0, z); this.scene.add(t); this.tables.push({ x, z, free: true }); }
    const workers = b ? 1 + Math.min(b.workers || 0, 4) : 0; for (let i = 0; i < workers; i++) { const p = makePerson(i ? SHIRTS[(i * 3) % 8] : color, SKINS[i % 4], '#25303c'); p.position.set(-2.5 + i * 1.6, 0, -3.3); this.scene.add(p); this.walkers.push({ obj: p, worker: true, x0: -3 + i * 1.5, dir: 1, ph: i }); }
    this.door = new THREE.Vector3(W / 2 + 1.2, 0, D / 2 - 0.8); this.queueAt = i => new THREE.Vector3(0.4 - i * 0.2, 0, -1.2 + i * 0.75);
    this.mood = { spawnEvery: b ? Math.max(1.5, 6 - b.level * 0.08) : 99 };
  }
  _lemonadeScene() {
    const { W, D } = this.dim, color = this.theme.color, sc = this.scene, b = this.biz;
    this.floor = box(W, 0.2, D, new THREE.MeshStandardMaterial({ map: grassTex(), roughness: 1 }), 0, -0.2, 0); sc.add(this.floor);
    this.hemi = new THREE.HemisphereLight(0xdfeeff, 0x6b8a48, 1.1); this.sun = new THREE.DirectionalLight(0xfff1dc, 2.6); this.sun.position.set(-4, 8, 5); this.sun.castShadow = true; Object.assign(this.sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 24 }); this.sun.shadow.mapSize.setScalar(1024); this.warm = new THREE.PointLight(0xffe0a0, 0, 1); sc.add(this.hemi, this.sun, this.warm); this.glass = [];
    sc.add(box(W, 0.06, 1.4, M('#b8b2a6', 0.9), 0, 0, D / 2 - 0.9));
    const stripe = M(color, 0.8), white = M('#ffffff', 0.8); for (let i = 0; i < 10; i++) sc.add(box(0.6, 0.12, 2.4, i % 2 ? stripe : white, -2.7 + i * 0.6, 2.35, -1.6));
    for (const x of [-3, 3]) sc.add(cyl(0.06, 0.06, 2.4, M('#d8d0c0', 0.5), x, 0, -2.6), cyl(0.06, 0.06, 2.4, M('#d8d0c0', 0.5), x, 0, -0.6));
    sc.add(box(6.2, 1.0, 1.2, M('#e9d9ae', 0.7), 0, 0, -1.8), box(6.4, 0.07, 1.3, M('#f4e9c4', 0.5), 0, 1.0, -1.8), box(6.2, 0.4, 0.06, stripe, 0, 0.35, -1.18));
    const jug = M('#fff2a0', 0.2, 0.05, { transparent: true, opacity: 0.85 }); for (const x of [-2, -0.8, 0.4]) sc.add(cyl(0.28, 0.28, 0.6, jug, x, 1.07, -1.9, 18));
    for (let i = 0; i < 12; i++) sc.add(cyl(0.07, 0.05, 0.14, white, 1.3 + (i % 6) * 0.2, 1.07, -1.9 + Math.floor(i / 6) * 0.2));
    const board = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.12), new THREE.MeshBasicMaterial({ map: textTex('Lemonade', '#fff6c8', '#d9a000') })); board.position.set(0, 2.9, -2.65); sc.add(board);
    for (const [x, z] of [[-5, -2.8], [5, -3.2], [-5.3, 1], [5.4, 0.5]]) { const t = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 1), M('#3f8a3a', 0.9)); t.position.set(x, 1.2, z); t.castShadow = true; sc.add(t, cyl(0.12, 0.16, 0.8, M('#5a4130'), x, 0, z)); }
    this.tables = [[-4.2, 1.2], [4.2, 1.4], [-2, 2.4], [2.2, 2.6]].slice(0, Math.min(4, 1 + Math.floor((b ? b.level : 1) / 4))).map(([x, z], i) => { const t = makeFurniture('table', i); t.position.set(x, 0, z); sc.add(t); return { x, z, free: true }; });
    const p = makePerson(color, SKINS[1], '#25303c'); p.position.set(0, 0, -2.6); sc.add(p); this.walkers.push({ obj: p, worker: true, x0: -1.5, dir: 1, ph: 0 });
    for (let i = 0; i < Math.min(b.workers || 0, 3); i++) { const q = makePerson(SHIRTS[(i * 3 + 1) % 8], SKINS[(i + 2) % 4], '#25303c'); q.position.set(1.5 - i, 0, -2.7); sc.add(q); this.walkers.push({ obj: q, worker: true, x0: 0.5 + i * 0.8, dir: -1, ph: i + 1 }); }
    this.door = new THREE.Vector3(W / 2 + 1.2, 0, D / 2 - 0.8); this.queueAt = i => new THREE.Vector3(0.4 - i * 0.2, 0, -0.3 + i * 0.75);
    this.mood = { spawnEvery: Math.max(1.5, 6 - b.level * 0.08) };
  }
  _renderShopPanel() {
    const p = this.panel, st = this.store.state, b = st.business[this.s.i], now = Date.now(), lvOwner = ownerLevel(st);
    const others = Object.keys(st.business).filter(k => k !== String(this.s.i)).length;
    if (!b) {
      let h = `<h3>Open a business</h3><div class="sub">One business per building. Your owner level is <b>${lvOwner}</b>; it rises as your net worth grows. Free players can reach every business type.</div>`;
      if (others >= 1) h += `<div class="banner">You already run a business elsewhere. A second business slot will be a paid extra later.</div>`;
      for (const [type, d] of Object.entries(BUSINESSES)) { const cost = type === 'lemonade' ? 0 : d.base * 5, locked = lvOwner < d.unlockOwner; h += `<button class="item" data-open="${type}" ${locked || others >= 1 ? 'disabled' : ''}><span>${d.name}<br><small class="tag">${locked ? 'Owner level ' + d.unlockOwner : fmt(d.base) + ' coins/hour at level 1'}</small></span><b>${cost ? fmt(cost) : 'Free'}</b></button>`; }
      h += `<div class="tag">Extras</div><button id="iprev">Cosmetics and 3D-print preview</button>`;
      p.innerHTML = h; p.querySelector('#iprev').addEventListener('click', () => this.ctx.openPreview(this));
      p.querySelectorAll('[data-open]').forEach(el => el.addEventListener('click', () => { const type = el.dataset.open, cost = type === 'lemonade' ? 0 : BUSINESSES[type].base * 5; if (!this.store.spend(cost)) { this.notify('Not enough City Coins.'); return; } st.business[this.s.i] = { type, level: 1, workers: 0, manager: false, lastCollect: Date.now(), fixedAt: 0 }; this.store.save(); this._act('open', { type }); this.s.bizType = type; this._rebuildShop(); this._fx('open', BUSINESSES[type].name); }));
      return;
    }
    const d = BUSINESSES[b.type], per = baseIncomePerHour(b.type, b.level), pend = this._pend(b, now), stage = stageOf(b.level);
    const evs = st.noEvents ? [] : [...eventsForDay(st.seed, dayOf(now)), ...eventsForDay(st.seed, dayOf(now) - 1)].filter(e => now >= e.start && now < e.end), broken = evs.find(e => e.needsFix && !(b.fixedAt >= e.start && b.fixedAt < e.end + HOUR));
    let h = `<h3>${d.name}</h3><div class="sub">Level ${b.level} of ${MAX_LEVEL} · ${stage.name} · ${fmt(per)} coins/hour</div>`;
    for (const e of evs) h += `<div class="banner">${e.label}</div>`;
    h += `<div class="banner">Waiting to collect: <b>${fmt(pend)}</b> coins${b.manager ? '' : ' (up to 1 hour stored; hire a manager to store 8 hours)'}</div>`;
    if (broken) h += `<button class="pri" id="ifix">Fix the broken machine (free)</button>`;
    if (!b.manager) h += `<button class="pri" id="icollect" ${pend ? '' : 'disabled'}>Collect ${fmt(pend)} coins</button>`;
    const next = upgradeCost(b.type, b.level);
    h += `<button class="item" id="iup" ${b.level >= MAX_LEVEL ? 'disabled' : ''}><span>Upgrade to level ${b.level + 1}<br><small class="tag">+ income, more tables${stageOf(b.level + 1).name !== stage.name ? ', becomes a ' + stageOf(b.level + 1).name : ''}</small></span><b>${fmt(next)}</b></button>`;
    h += `<button class="item" id="iwork" ${b.workers >= workerSlots(b.level) ? 'disabled' : ''}><span>Hire a worker (${b.workers}/${workerSlots(b.level)})</span><b>${fmt(workerCost(b.type, b.workers))}</b></button>`;
    h += `<button class="item" id="imgr" ${b.manager ? 'disabled' : ''}><span>${b.manager ? 'Manager hired: income collects automatically' : 'Hire a manager (auto-collect)'}</span><b>${b.manager ? '✓' : fmt(managerCost(b.type))}</b></button>`;
    h += `<div class="tag">Visitors</div><button id="ilike">♥ Like this business (${st.likes[this.s.i] || 0})</button><div class="sub">Visits: ${st.visits[this.s.i] || 0}</div><div class="tag">Extras</div><button id="iprev">Cosmetics and 3D-print preview</button>`;
    p.innerHTML = h;
    const on = (id, fn) => { const el = p.querySelector('#' + id); if (el) el.addEventListener('click', fn); };
    on('iprev', () => this.ctx.openPreview(this));
    on('icollect', () => { const g = this._pend(b); b.lastCollect = Date.now(); this.store.earn(g); this._popCoins('+' + fmt(g)); this._act('collect'); this._fx('collect'); this._renderPanel(); });
    on('ifix', () => { b.fixedAt = Date.now(); this.store.save(); this._renderPanel(); });
    on('iup', () => { const c = upgradeCost(b.type, b.level); if (!this.store.spend(c)) return this.notify('Not enough City Coins.'); this._settle(b); b.level++; this.store.save(); this._act('upgrade'); this._rebuildShop(); this._fx('upgrade', `Level ${b.level}`); });
    on('iwork', () => { const c = workerCost(b.type, b.workers); if (!this.store.spend(c)) return this.notify('Not enough City Coins.'); b.workers++; this.store.save(); this._act('worker'); this._rebuildShop(); this._fx('worker'); });
    on('imgr', () => { const c = managerCost(b.type); if (!this.store.spend(c)) return this.notify('Not enough City Coins.'); b.manager = true; this._settle(b); this.store.save(); this._act('manager'); this._rebuildShop(); this._fx('manager'); });
    on('ilike', () => { st.likes[this.s.i] = (st.likes[this.s.i] || 0) + 1; this.store.save(); this._renderPanel(); });
  }
  _settle(b) { const g = this._pend(b); b.lastCollect = Date.now(); this.store.earn(g); }
  _fx(kind, text) { if (this.ctx.celebrate) this.ctx.celebrate(kind, text); }                       // banners, confetti and sounds live in main.js / gameui.js
  _pop(o) { if (!o || document.body.classList.contains('rm')) return; o.userData.pop = 0; o.scale.setScalar(0.01); (this._popping ||= new Set()).add(o); }   // new furniture drops in with a bounce
  _tickPops(dt) { if (!this._popping || !this._popping.size) return; for (const o of this._popping) { o.userData.pop += dt / 0.45; const k = Math.min(1, o.userData.pop), s = k < 1 ? 1 + Math.sin(k * Math.PI * 2.2) * 0.18 * (1 - k) - Math.pow(1 - k, 3) : 1; o.scale.setScalar(Math.max(0.01, s)); if (k >= 1) { o.scale.setScalar(1); this._popping.delete(o); } } }
  _pend(b, now = Date.now()) { const st = this.store.state; return pendingEarnings(b, st.player, now, st.seed, !st.noEvents); }   // on the live site the server pays plain income (no random events yet)
  _act(name, args) { if (this.store.act) this.store.act(name, { building: this.s.i, ...args }); }   // live site: tell the server what you did; it decides the numbers
  _rebuildShop() { const keep = this.camera.position.clone(), tgt = this.controls.target.clone(); this.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); }); this.scene = new THREE.Scene(); this.scene.environment = this.envMap; this.scene.environmentIntensity = 0.5; this.scene.background = new THREE.Color('#14171f'); this.customers = []; this.pops = []; this.walkers = []; this.renderPass.scene = this.scene; this._buildShop(); this.camera.position.copy(keep); this.controls.target.copy(tgt); this._renderPanel(); }
  _popCoins(text) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(192, 64, (g, w, h) => { g.font = 'bold 40px system-ui'; g.fillStyle = '#ffd23a'; g.strokeStyle = '#6b4a00'; g.lineWidth = 5; g.textAlign = 'center'; g.textBaseline = 'middle'; g.strokeText(text, w / 2, h / 2); g.fillText(text, w / 2, h / 2); }), transparent: true, depthTest: false }));
    sp.scale.set(1.6, 0.53, 1); sp.position.set(this.queueAt ? this.queueAt(0).x : 0, 1.9, -1.4); sp.renderOrder = 10; this.scene.add(sp); this.pops.push({ sp, t: 0 });
  }

  /* ----- per frame ----- */
  update(dt) {
    if (!this.active) return; this.t += dt; const t = this.t, night = this.getNight(), st = this.store.state; this._tickPops(dt);
    this.controls.update();
    if (this.kind === 'stage') { this.spec.update && this.spec.update(dt, t); return; }
    const sky = new THREE.Color('#9fd0ff').lerp(new THREE.Color('#0b1226'), night); (this.glass || []).forEach(m => m.color.copy(sky));
    const lem = this.biz && this.biz.type === 'lemonade', lum = this.kind === 'home' ? 1 : lem ? 0.85 : 0.5;
    if (this.hemi) this.hemi.intensity = THREE.MathUtils.lerp(lem ? 1.1 : 0.9, 0.35, night) * lum;
    if (this.sun) this.sun.intensity = (lem ? 2.6 : 2.2) * (1 - night * 0.9) * lum;
    if (this.warm && this.warm.distance > 2) this.warm.intensity = THREE.MathUtils.lerp(14, 34, night) * lum;
    for (const o of this.placed) if (o.userData.screen) o.userData.screen.material.emissiveIntensity = 0.7 + Math.sin(t * 3) * 0.3;
    if (this.coinSpin) { this.coinSpin.rotation.z = t * 2; this.coinSpin.position.y += Math.sin(t * 2) * 0.0008; }
    if (this.selBox) this.selBox.update();
    if (this.kind === 'home') this._updateResidents(dt, t); else this._updateShop(dt, t, st);
    for (let i = this.pops.length - 1; i >= 0; i--) { const p = this.pops[i]; p.t += dt; p.sp.position.y += dt * 0.9; p.sp.material.opacity = Math.max(0, 1 - p.t / 1.4); if (p.t > 1.4) { this.scene.remove(p.sp); this.pops.splice(i, 1); } }
  }
  _updateResidents(dt, t) {
    for (const w of this.walkers) {
      const o = w.obj; w.wait -= dt;
      if (!w.target && w.wait <= 0) {
        let tries = 0, pick = null;
        const sofas = this.placed.filter(p => p.userData.item.id === 'sofa' && (!p.userData.occ || p.userData.occ === w));
        if (sofas.length && Math.random() < 0.4) { const so = sofas[Math.floor(Math.random() * sofas.length)], s = so.userData.item; so.userData.occ = w; w.sofa = so; pick = { x: s.x, z: s.z + 0.1, sit: true, face: s.rot * Math.PI / 2 }; }
        while (!pick && tries++ < 14) { const x = (Math.random() - 0.5) * (this.dim.W - 1.2), z = (Math.random() - 0.5) * (this.dim.D - 1.2); if (!this._blocked(x, z)) pick = { x, z }; }
        w.target = pick; w.sit = false;
      }
      if (w.target) {
        const dx = w.target.x - o.position.x, dz = w.target.z - o.position.z, d = Math.hypot(dx, dz);
        if (d < 0.1) { if (w.target.sit) { w.sit = true; o.position.y = 0.3; o.rotation.y = w.target.face; w.wait = 6 + Math.random() * 6; } else w.wait = 2 + Math.random() * 4; w.target = null; pose(o, false, w.sit, t); }
        else { if (this._blocked(o.position.x + dx / d * 0.5, o.position.z + dz / d * 0.5) && !w.target.sit) { w.target = null; w.wait = 0.2; continue; } o.position.x += dx / d * dt * 1.1; o.position.z += dz / d * dt * 1.1; o.position.y = 0; o.rotation.y = Math.atan2(dx, dz); pose(o, true, false, t); }
      } else pose(o, false, w.sit, t);
      if (w.sit && w.wait <= 0) { w.sit = false; o.position.y = 0; if (w.sofa) { w.sofa.userData.occ = null; w.sofa = null; } }
    }
  }
  _updateShop(dt, t, st) {
    const b = this.biz;
    for (const w of this.walkers) if (w.worker) { const o = w.obj; o.position.x += w.dir * dt * 0.5; if (o.position.x > w.x0 + 1.4) w.dir = -1; if (o.position.x < w.x0 - 1.4) w.dir = 1; o.rotation.y = w.dir > 0 ? Math.PI / 2 : -Math.PI / 2; pose(o, true, false, t + w.ph, 0.35); }
    if (!b) return;
    this.spawnT -= dt; if (this.spawnT <= 0 && this.customers.length < 9) { this.spawnT = this.mood.spawnEvery * (0.7 + Math.random() * 0.6); const p = makePerson(SHIRTS[Math.floor(Math.random() * 8)], SKINS[Math.floor(Math.random() * 4)]); p.position.copy(this.door); this.scene.add(p); this.customers.push({ obj: p, state: 'queue', wait: 0, table: null }); }
    const inQueue = this.customers.filter(c => c.state === 'queue');
    for (let i = this.customers.length - 1; i >= 0; i--) {
      const c = this.customers[i], o = c.obj; let target = null, speed = 1.3;
      if (c.state === 'queue') { target = this.queueAt(inQueue.indexOf(c)); if (o.position.distanceTo(target) < 0.15 && inQueue.indexOf(c) === 0) { c.wait += dt; if (c.wait > 2.2) { const free = this.tables.find(tb => tb.free); this._popCoins('+' + fmt(baseIncomePerHour(b.type, b.level) / 3600 * (this.mood.spawnEvery * 6))); if (free) { free.free = false; c.table = free; c.state = 'toTable'; } else c.state = 'leave'; } } }
      else if (c.state === 'toTable') { target = new THREE.Vector3(c.table.x + 0.8, 0, c.table.z + 0.9); if (o.position.distanceTo(target) < 0.15) { c.state = 'sit'; c.wait = 0; o.position.y = 0.32; o.rotation.y = Math.PI; } }
      else if (c.state === 'sit') { c.wait += dt; pose(o, false, true, t); if (c.wait > 6 + Math.random() * 0.01) { c.table.free = true; o.position.y = 0; c.state = 'leave'; } continue; }
      else { target = this.door; if (o.position.distanceTo(target) < 0.3) { this.scene.remove(o); this.customers.splice(i, 1); continue; } }
      const dx = target.x - o.position.x, dz = target.z - o.position.z, d = Math.hypot(dx, dz);
      if (d > 0.1) { o.position.x += dx / d * dt * speed; o.position.z += dz / d * dt * speed; o.rotation.y = Math.atan2(dx, dz); pose(o, true, false, t); } else pose(o, false, false, t);
    }
    // keep the panel numbers fresh and collect automatically when a manager is hired
    this._panelT = (this._panelT || 0) + dt;
    if (this._panelT > 2) { this._panelT = 0; if (b.manager) { const g = this._pend(b); if (g > 0) { b.lastCollect = Date.now(); this.store.earn(g); this._popCoins('+' + fmt(g)); this._act('collect', { throttle: 30000 }); } } if (!this.ghost) this._renderPanel(); }
  }
}
