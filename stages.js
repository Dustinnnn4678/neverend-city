// Extra 3D "stages" that reuse the interior viewer: cosmetics preview, 3D-print miniature, net-worth chart.
// Everything here runs in the browser. Buying and ordering need the server (see docs/SERVER-PLAN.md), so the buy and
// order buttons only explain that for now; previewing and downloading an STL work today.
import * as THREE from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { netWorth, FURNITURE, BUSINESSES } from './economy.js';

const fmt = n => Math.round(n).toLocaleString();
export function labelTex(text, bg, fg, glow) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 512, 128); g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(6, 6, 500, 116);
  g.fillStyle = fg; g.font = 'bold 56px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; if (glow) { g.shadowColor = fg; g.shadowBlur = 24; } g.fillText(text, 256, 68);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const COLORS = { Original: null, Cream: '#f2e6c8', Sky: '#9fd0ff', Rose: '#ffb3c7', Mint: '#a8e6c3', Lilac: '#cdb8ff', Sunset: '#ffb36b' };
const NEON = { Off: null, Pink: '#ff4fd8', Cyan: '#33e0ff', Gold: '#ffd23a', Green: '#6bff8f' };
const GLOW = { Off: null, Warm: '#ffb45a', Cyan: '#4ae0ff', Pink: '#ff6fd0' };
const ROOF = { None: null, Flag: 'flag', Antenna: 'antenna', 'Solar panels': 'solar', 'Roof garden': 'garden', Satellite: 'dish' };
const FX = { None: null, 'Halo ring': 'halo', 'Light beam': 'beam', Sparkles: 'sparkles' };
const PLATE = { None: null, Wood: 'wood', Neon: 'neon' };
const PRICE = { color: 1, neon: 2, glow: 2, roof: 3, fx: 4, plate: 1 };
const PRINT = { 50: 20, 80: 30, 120: 40 };

export function roofItem(kind) {
  const g = new THREE.Group(), M = (c, r = 0.6, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  if (kind === 'flag') { add(new THREE.CylinderGeometry(0.08, 0.08, 5, 8), M('#cfd3d8', 0.4, 0.6), 0, 2.5, 0); add(new THREE.BoxGeometry(2.2, 1.3, 0.06), M('#d9433a'), 1.2, 4.3, 0); }
  if (kind === 'antenna') { add(new THREE.CylinderGeometry(0.06, 0.18, 9, 6), M('#cfd3d8', 0.4, 0.6), 0, 4.5, 0); for (const y of [4, 6, 8]) add(new THREE.BoxGeometry(1.8 - (y - 4) * 0.2, 0.08, 0.08), M('#cfd3d8', 0.4, 0.6), 0, y, 0); add(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.2, 0.1) }), 0, 9.1, 0); }
  if (kind === 'solar') for (let i = 0; i < 4; i++) { const p = add(new THREE.BoxGeometry(2.4, 0.08, 1.4), M('#1d3a6e', 0.25, 0.7), (i % 2) * 2.7 - 1.3, 0.6, Math.floor(i / 2) * 1.8 - 0.9); p.rotation.x = -0.45; add(new THREE.BoxGeometry(0.08, 0.5, 0.08), M('#8a8f96'), (i % 2) * 2.7 - 1.3, 0.25, Math.floor(i / 2) * 1.8 - 0.9); }
  if (kind === 'garden') { add(new THREE.BoxGeometry(3.6, 0.4, 3), M('#5a4130', 1), 0, 0.2, 0); add(new THREE.BoxGeometry(3.4, 0.1, 2.8), M('#4f8a3a', 1), 0, 0.45, 0); for (const [x, z] of [[-1, -0.6], [0.9, 0.5], [0, -0.1]]) add(new THREE.IcosahedronGeometry(0.55, 1), M('#3f7a34', 0.9), x, 0.95, z); }
  if (kind === 'dish') { add(new THREE.CylinderGeometry(0.15, 0.2, 1.4, 8), M('#8a8f96', 0.5, 0.5), 0, 0.7, 0); const d = add(new THREE.SphereGeometry(1.2, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2.4), M('#eceef2', 0.4, 0.4), 0, 1.7, 0); d.rotation.x = -1.0; d.material.side = THREE.DoubleSide; add(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 6), M('#8a8f96'), 0, 2.2, 0.55).rotation.x = -0.6; }
  return g;
}


function modelBounds(model) { const b = new THREE.Box3(); for (const g of Object.values(model.parts)) { g.computeBoundingBox(); b.union(g.boundingBox); } return b; }

export function previewStage(sys, s) {
  const { getModel, materials } = sys.ctx, model = getModel(s), bb = modelBounds(model), size = bb.getSize(new THREE.Vector3()), top = bb.max.y;
  const o = { color: null, neon: null, glow: null, roof: null, fx: null, plate: null, mm: 80, name: 'My Building' };
  let root, scene, fxList = [], sparkle = null;

  function rebuild() {
    if (root) { scene.remove(root); root.traverse(m => { if (m.userData.own) { m.geometry.dispose(); } }); }
    root = new THREE.Group(); fxList = []; sparkle = null;
    for (const [mat, geo] of Object.entries(model.parts)) {
      const base = materials[mat], m = base.clone();
      if (mat === 'glass' || mat === 'concrete' || mat === 'brick' || mat === 'siding' || mat === 'shop' || mat === 'metal') {
        if (o.color && mat !== 'glass') m.color.set(o.color); if (o.color && mat === 'glass') m.color.set(o.color).multiplyScalar(0.9);
        m.emissiveIntensity = o.glow ? 2.6 : 0.2; if (o.glow) m.emissive.set(o.glow);
      }
      if (mat === 'sign') { m.color.setScalar(1.8); }
      const mesh = new THREE.Mesh(geo, m); mesh.castShadow = mesh.receiveShadow = true; mesh.userData.shared = true; root.add(mesh);
    }
    const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2, front = bb.max.z + 0.35;
    if (o.neon) { const t = new THREE.Mesh(new THREE.BoxGeometry(Math.min(8, size.x * 0.8), 1.3, 0.25), new THREE.MeshBasicMaterial({ map: labelTex(o.name, '#05060c', o.neon, true), toneMapped: false })); t.material.color.setScalar(1.8); t.position.set(cx, Math.min(top * 0.55, 7), front); t.userData.own = true; root.add(t); }
    if (o.roof) { const r = roofItem(ROOF_KEYS[o.roof]); r.position.set(cx, top, cz); root.add(r); }
    if (o.plate) { const w = 5, pl = new THREE.Mesh(new THREE.BoxGeometry(w, 0.9, 0.2), o.plate === 'wood' ? new THREE.MeshStandardMaterial({ map: labelTex(o.name, '#8a5a36', '#f4dcae'), roughness: 0.7 }) : new THREE.MeshBasicMaterial({ map: labelTex(o.name, '#05060c', '#ff4fd8', true), toneMapped: false })); pl.position.set(cx, 1.2, bb.max.z + 3.2); pl.userData.own = true; const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.2, 0.2), new THREE.MeshStandardMaterial({ color: '#4a3626' })); post.position.set(cx, 0.6, bb.max.z + 3.1); post.userData.own = true; root.add(pl, post); }
    if (o.fx === 'halo') { const h = new THREE.Mesh(new THREE.TorusGeometry(Math.max(size.x, size.z) * 0.7, 0.18, 8, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 1.6, 2.4) })); h.rotation.x = Math.PI / 2; h.position.set(cx, top + 4, cz); h.userData.own = true; root.add(h); fxList.push(t => { h.rotation.z = t * 0.8; h.position.y = top + 4 + Math.sin(t * 2) * 0.6; }); }
    if (o.fx === 'beam') { const b = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 160, 20, 1, true).translate(0, 80 + top, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.1, 1.8), transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); b.position.set(cx, 0, cz); b.userData.own = true; root.add(b); fxList.push(t => { b.material.opacity = 0.18 + 0.12 * Math.sin(t * 3); }); }
    if (o.fx === 'sparkles') { const n = 140, pos = new Float32Array(n * 3), ph = new Float32Array(n); for (let i = 0; i < n; i++) { ph[i] = Math.random() * 6.28; } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); const p = new THREE.Points(g, new THREE.PointsMaterial({ color: new THREE.Color(2.4, 2, 0.9), size: 3, sizeAttenuation: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); p.frustumCulled = false; p.userData.own = true; root.add(p);
      fxList.push(t => { for (let i = 0; i < n; i++) { const a = ph[i] + t * (0.4 + (i % 5) * 0.08), r = Math.max(size.x, size.z) * (0.6 + (i % 7) * 0.08), y = ((t * 3 + i * 1.7) % (top + 10)); pos[i * 3] = cx + Math.cos(a) * r; pos[i * 3 + 1] = y; pos[i * 3 + 2] = cz + Math.sin(a) * r; } g.attributes.position.needsUpdate = true; }); }
    scene.add(root);
  }
  const ROOF_KEYS = ROOF;

  function exportStl() {
    const wrap = new THREE.Group(), body = new THREE.Group(); for (const [, geo] of Object.entries(model.parts)) body.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial()));
    const big = Math.max(size.x, size.y, size.z), k = o.mm / big; body.scale.setScalar(k); body.position.set(-(bb.min.x + bb.max.x) / 2 * k, -bb.min.y * k, -(bb.min.z + bb.max.z) / 2 * k); wrap.add(body); wrap.rotation.x = -Math.PI / 2; wrap.updateMatrixWorld(true);
    const data = new STLExporter().parse(wrap, { binary: true }), url = URL.createObjectURL(new Blob([data], { type: 'model/stl' })), a = document.createElement('a'); a.href = url; a.download = `neverend-city-${s.type}-${s.i + 1}-${o.mm}mm.stl`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    sys.notify(`Saved ${a.download}: ${(size.x * k).toFixed(0)} x ${(size.z * k).toFixed(0)} x ${(size.y * k).toFixed(0)} mm (units are millimetres).`);
  }

  sys.openStage({
    title: 'Preview and print', returnTo: s, autoRotate: 0.8,
    camera: { r: Math.max(size.x, size.z, size.y * 0.8) * 1.9 + 12, target: [0, Math.min(top * 0.4, 30), 0], height: 0.55 },
    build(sc) {
      scene = sc; sc.background = new THREE.Color('#10141c'); const hm = new THREE.HemisphereLight(0xdfeeff, 0x3a3f46, 1.0), sun = new THREE.DirectionalLight(0xfff1dc, 2.4); sun.position.set(30, 50, 40); sun.castShadow = true; Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 200 }); sun.shadow.mapSize.setScalar(2048);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(Math.max(size.x, size.z) * 0.95 + 6, Math.max(size.x, size.z) * 0.95 + 8, 1.2, 64), new THREE.MeshStandardMaterial({ color: '#2a303a', roughness: 0.8 })); base.position.y = -0.6; base.receiveShadow = true; base.userData.own = true;
      sc.add(hm, sun, base); rebuild();
    },
    panel(el) {
      const sel = (key, map) => `<div class="tag">${{ color: 'Building color', neon: 'Neon sign', glow: 'Glowing windows', roof: 'Rooftop item', fx: 'Animated effect', plate: 'Name plate' }[key]} Â· $${PRICE[key]}</div><div style="display:flex;flex-wrap:wrap;gap:6px">${Object.keys(map).map(n => `<button data-k="${key}" data-v="${n}" style="${o[key] === (key === 'roof' ? (map[n] ? n : null) : (map[n] ?? null)) || (!o[key] && !map[n]) ? 'background:#2f6aa8' : ''}">${n}</button>`).join('')}</div>`;
      const total = Object.keys(PRICE).reduce((t, k) => t + (o[k] ? PRICE[k] : 0), 0);
      el.innerHTML = `<h3>Preview on your building</h3><div class="sub">Try cosmetics for free. They are visual only: no points, ranking or advantages.</div><input id="pname" value="${o.name}" maxlength="18" style="width:100%;padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:rgba(0,0,0,.35);color:inherit">`
        + sel('color', COLORS) + sel('neon', NEON) + sel('glow', GLOW) + sel('roof', ROOF) + sel('fx', FX) + sel('plate', PLATE)
        + `<button class="pri" id="pbuy">Buy selected: $${total}</button><div class="sub">Payments are not connected yet. Later this opens Stripe Checkout in test mode.</div>`
        + `<h3 style="margin-top:8px">3D-printed miniature</h3><div class="sub">Your building as a print-ready STL file. Model size: ${(size.x).toFixed(0)} x ${(size.z).toFixed(0)} x ${(size.y).toFixed(0)} m, scaled down to the size you pick.</div><div style="display:flex;gap:6px">${Object.keys(PRINT).map(mm => `<button data-mm="${mm}" style="${o.mm == mm ? 'background:#2f6aa8' : ''}">${mm} mm Â· $${PRINT[mm]}</button>`).join('')}</div><button id="pstl">Download STL (free test)</button><button id="porder">Order a printed miniature</button>`;
      el.querySelectorAll('[data-k]').forEach(b => b.addEventListener('click', () => { const k = b.dataset.k, v = b.dataset.v, map = { color: COLORS, neon: NEON, glow: GLOW, roof: ROOF, fx: FX, plate: PLATE }[k]; o[k] = k === 'roof' ? (map[v] ? v : null) : (map[v] ?? null); rebuild(); this.panel(el); }));
      el.querySelectorAll('[data-mm]').forEach(b => b.addEventListener('click', () => { o.mm = +b.dataset.mm; this.panel(el); }));
      el.querySelector('#pname').addEventListener('input', e => { o.name = e.target.value || 'My Building'; clearTimeout(this._nt); this._nt = setTimeout(rebuild, 250); });
      el.querySelector('#pbuy').addEventListener('click', () => sys.notify('Payments are not connected yet. This will open Stripe Checkout in test mode later.'));
      el.querySelector('#pstl').addEventListener('click', exportStl);
      el.querySelector('#porder').addEventListener('click', () => sys.notify('Ordering needs payments and a print service connected. For now, download the STL.'));
    },
    update(dt, t) { fxList.forEach(f => f(t)); },
  });
}

export function statsStage(sys) {
  const st = sys.store.state, nw = netWorth(st); sys.store.snap(nw, true);
  const hist = st.history.slice(-24); if (hist.length < 2) hist.unshift({ t: Date.now() - 3600e3, v: Math.max(0, nw * 0.6) });
  const max = Math.max(...hist.map(h => h.v), 1);
  sys.openStage({
    title: 'My stats', autoRotate: 0.6, camera: { r: 24, target: [0, 2.5, 0], height: 0.5 },
    build(sc) {
      sc.background = new THREE.Color('#10141c'); sc.add(new THREE.HemisphereLight(0xdfeeff, 0x3a3f46, 1.1)); const d = new THREE.DirectionalLight(0xffffff, 2.2); d.position.set(6, 10, 8); d.castShadow = true; sc.add(d);
      const g = new THREE.Group(); const grid = new THREE.GridHelper(16, 16, 0x445066, 0x2a3140); grid.position.y = 0.01; g.add(grid);
      const n = hist.length, w = Math.min(1.1, 14 / n), x0 = -(n * w) / 2;
      hist.forEach((h, i) => { const hh = Math.max(0.15, h.v / max * 7), c = new THREE.Color().setHSL(0.58 - 0.5 * (i / Math.max(1, n - 1)), 0.7, 0.55); const b = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, hh, w * 0.7), new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, metalness: 0.2 })); b.position.set(x0 + w * (i + 0.5), hh / 2, 0); b.castShadow = true; g.add(b); });
      const lab = (txt, x, y, z) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex(txt, 'rgba(0,0,0,0)', '#ffffff') })); sp.scale.set(3.2, 0.8, 1); sp.position.set(x, y, z); g.add(sp); };
      lab(fmt(hist[hist.length - 1].v), x0 + w * (n - 0.5), hist[hist.length - 1].v / max * 7 + 1.2, 0); if (n > 1) lab(fmt(hist[0].v), x0 + w * 0.5, Math.max(0.15, hist[0].v / max * 7) + 1.2, 0);
      sc.add(g); this.group = g;
    },
    panel(el) {
      const bizs = Object.values(st.business), inc = bizs.reduce((t, b) => t + (BUSINESSES[b.type].base * b.level), 0), furn = Object.values(st.furniture).reduce((t, l) => t + l.length, 0), visits = Object.values(st.visits).reduce((a, b) => a + b, 0), likes = Object.values(st.likes).reduce((a, b) => a + b, 0);
      el.innerHTML = `<h3>My stats</h3><div class="sub">Net worth over time, as 3D bars (oldest on the left).</div><div class="banner">Net worth <b>${fmt(nw)}</b> = coins + upgrades + furniture</div><div class="item"><span>Coins</span><b>${fmt(st.coins)}</b></div><div class="item"><span>Businesses</span><b>${bizs.length}</b></div><div class="item"><span>Furniture placed</span><b>${furn}</b></div><div class="item"><span>Visits</span><b>${visits}</b></div><div class="item"><span>Likes</span><b>${likes}</b></div><div class="sub">Leaderboards, seasons and the Self-Made board need the server and are not live yet.</div>`;
    },
    update(dt, t) { if (this.group) this.group.rotation.y = Math.sin(t * 0.2) * 0.35; },
  });
}

/* ---------- 3D mystery crate opening ---------- */
const RC = { common: '#b8c4d6', rare: '#4a9eff', epic: '#b06bff', legendary: '#ffb020' };
export function crateStage(sys, res, again) {
  const { item, dupe } = res, col = new THREE.Color(RC[item.rarity]); let chest, lid, trinket, burst, bpos, bvel, glow, shown = false, panelEl = null;
  const mk = (geo, color, rough = 0.6, metal = 0) => new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
  sys.openStage({
    title: 'Mystery crate', autoRotate: 0, camera: { r: 9, target: [0, 1.4, 0], height: 0.4 },
    build(sc) {
      sc.background = new THREE.Color('#0b0e16'); sc.add(new THREE.HemisphereLight(0xcfd8ff, 0x222633, 0.7)); const d = new THREE.DirectionalLight(0xffffff, 2); d.position.set(4, 8, 6); d.castShadow = true; sc.add(d);
      const floor = mk(new THREE.CylinderGeometry(5, 5.4, 0.3, 48), '#1b2030', 0.8); floor.position.y = -0.15; floor.receiveShadow = true; sc.add(floor);
      chest = new THREE.Group(); const body = mk(new THREE.BoxGeometry(2.2, 1.1, 1.4), '#7a4a26'); body.position.y = 0.55; chest.add(body);
      for (const x of [-0.9, 0.9]) { const b = mk(new THREE.BoxGeometry(0.16, 1.14, 1.44), '#d9b53a', 0.3, 0.8); b.position.set(x, 0.55, 0); chest.add(b); }
      lid = new THREE.Group(); lid.position.set(0, 1.1, -0.7); const top = mk(new THREE.BoxGeometry(2.2, 0.36, 1.4), '#8a5630'); top.position.set(0, 0.18, 0.7); lid.add(top); for (const x of [-0.9, 0.9]) { const b = mk(new THREE.BoxGeometry(0.16, 0.4, 1.44), '#d9b53a', 0.3, 0.8); b.position.set(x, 0.18, 0.7); lid.add(b); } chest.add(lid);
      const lock = mk(new THREE.BoxGeometry(0.3, 0.3, 0.1), RC[item.rarity], 0.2, 0.9); lock.position.set(0, 1.0, 0.72); chest.add(lock); chest.traverse(o => { if (o.isMesh) o.castShadow = true; }); sc.add(chest);
      glow = new THREE.PointLight(col, 0, 14, 1.4); glow.position.set(0, 1.4, 0); sc.add(glow);
      const g = new THREE.Group(), emis = (c, i = 1.2) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i, roughness: 0.3, metalness: 0.3 });
      const slot = item.slot, nm = item.name;
      if (slot === 'color') g.add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), emis(nm.includes('Gold') ? '#ffcc33' : '#e8d0a0', 0.5)));
      else if (slot === 'roof') { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.2, 1.6, 8), emis('#cfd3d8', 0.4)); g.add(m); const dish = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), emis('#eceef2', 0.4)); dish.position.y = 0.9; dish.rotation.x = -0.9; g.add(dish); }
      else if (slot === 'plate') g.add(new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.1), emis('#ffd23a', 0.8)));
      else if (slot === 'fx') g.add(new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.08, 10, 40), emis('#6fe3ff', 1.6)));
      else g.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.8, 0), emis(RC[item.rarity], 1.4)));
      g.scale.setScalar(0); trinket = g; sc.add(g);
      const n = 220; bpos = new Float32Array(n * 3); bvel = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, b = Math.acos(2 * Math.random() - 1), s = 2 + Math.random() * 5; bvel.set([Math.sin(b) * Math.cos(a) * s, Math.abs(Math.cos(b)) * s * 1.2, Math.sin(b) * Math.sin(a) * s], i * 3); bpos.set([0, 1.3, 0], i * 3); }
      const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(bpos, 3)); burst = new THREE.Points(bg, new THREE.PointsMaterial({ color: col.clone().multiplyScalar(2.2), size: 4, sizeAttenuation: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); burst.frustumCulled = false; burst.visible = false; sc.add(burst);
    },
    panel(el) { panelEl = el; if (!shown) el.innerHTML = '<h3>Opening…</h3><div class="sub">Good luck!</div>'; },
    update(dt, t) {
      if (t < 1.3) { chest.rotation.z = Math.sin(t * 38) * 0.035 * Math.min(1, t * 1.5); chest.position.x = Math.sin(t * 52) * 0.02 * t; }
      else { chest.rotation.z = 0; chest.position.x = 0; const k = Math.min(1, (t - 1.3) / 0.45); lid.rotation.x = -k * 1.95; glow.intensity = 60 * Math.min(1, (t - 1.3) / 0.6); burst.visible = true;
        for (let i = 0; i < bpos.length / 3; i++) { const dtp = Math.min(dt, 0.05); bpos[i * 3] += bvel[i * 3] * dtp; bpos[i * 3 + 1] += (bvel[i * 3 + 1] - 6 * (t - 1.3)) * dtp; bpos[i * 3 + 2] += bvel[i * 3 + 2] * dtp; } burst.geometry.attributes.position.needsUpdate = true; burst.material.opacity = Math.max(0, 1 - (t - 1.3) / 3); }
      if (t > 1.5) { const k = Math.min(1, (t - 1.5) / 0.9), e = 1 - Math.pow(1 - k, 3); trinket.scale.setScalar(e * 1.4); trinket.position.y = 1.4 + e * 2.2 + Math.sin(t * 2) * 0.1; trinket.rotation.y = t * 1.6; }
      if (t > 2.4 && !shown && panelEl) { shown = true; const el = panelEl; el.innerHTML = `<h3 style="color:${RC[item.rarity]}">${item.rarity.toUpperCase()}</h3><div class="banner">${item.name}</div><div class="sub">${dupe ? 'You already had this, so it turned into 25 points.' : 'Added to your wardrobe. Open the visitor hub to equip it.'}</div>${sys.store.v.crates > 0 ? `<button class="pri" id="cagain">Open another (${sys.store.v.crates} left)</button>` : '<div class="sub">No crates left. Earn one with a 7-day streak or at the next milestone.</div>'}`; const b = el.querySelector('#cagain'); if (b) b.addEventListener('click', again); sys.notify(`${item.rarity}: ${item.name}`); }
    },
  });
}

/* ---------- share card: a story-sized picture of your building ---------- */
export function shareStage(sys, s, claim, siteUrl) {
  const { getModel, materials } = sys.ctx, model = getModel(s), bb = modelBounds(model), size = bb.getSize(new THREE.Vector3()), top = bb.max.y, label = claim && claim.optIn ? '@' + claim.username : 'A verified builder';
  sys.openStage({
    title: 'Share card', noShift: true, autoRotate: 0.6, camera: { r: Math.max(size.x, size.z, size.y * 0.8) * 1.9 + 14, target: [0, Math.min(top * 0.4, 30), 0], height: 0.5 },
    build(sc) {
      sc.background = new THREE.Color('#1a1030'); sc.add(new THREE.HemisphereLight(0xffe9ff, 0x2a2240, 1.0)); const sun = new THREE.DirectionalLight(0xfff1dc, 2.4); sun.position.set(30, 50, 40); sun.castShadow = true; Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 200 }); sc.add(sun);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(Math.max(size.x, size.z) * 0.95 + 6, Math.max(size.x, size.z) * 0.95 + 8, 1.2, 64), new THREE.MeshStandardMaterial({ color: '#3a2f55', roughness: 0.7 })); base.position.y = -0.6; base.receiveShadow = true; base.userData.own = true; sc.add(base);
      for (const [mat, geo] of Object.entries(model.parts)) { const m = new THREE.Mesh(geo, materials[mat]); m.castShadow = m.receiveShadow = true; m.userData.shared = true; sc.add(m); }
    },
    panel(el) {
      el.innerHTML = `<h3>Share card</h3><div class="sub">A 1080 x 1920 picture for stories, with your building and "I helped build Neverend City". Turn the building with your mouse first.</div><button class="pri" id="sdl">Download story image</button><div class="sub" id="smsg"></div>`;
      el.querySelector('#sdl').addEventListener('click', () => sys.ctx.capture(blob => {
        const img = new Image(); img.onload = () => {
          const c = document.createElement('canvas'); c.width = 1080; c.height = 1920; const g = c.getContext('2d'), grd = g.createLinearGradient(0, 0, 0, 1920); grd.addColorStop(0, '#1a1030'); grd.addColorStop(1, '#0b1226'); g.fillStyle = grd; g.fillRect(0, 0, 1080, 1920);
          const side = Math.min(img.width, img.height), sx = (img.width - side) / 2, sy = (img.height - side) / 2; g.save(); g.beginPath(); g.roundRect(40, 420, 1000, 1000, 40); g.clip(); g.drawImage(img, sx, sy, side, side, 40, 420, 1000, 1000); g.restore();
          g.textAlign = 'center'; g.fillStyle = '#d9c8ff'; g.font = '600 46px system-ui, sans-serif'; g.fillText('I HELPED BUILD', 540, 250); g.fillStyle = '#ffffff'; g.font = '700 96px system-ui, sans-serif'; g.fillText('NEVEREND CITY', 540, 360);
          g.fillStyle = '#9bffb4'; g.font = '700 84px system-ui, sans-serif'; g.fillText(label.slice(0, 22), 540, 1560); g.fillStyle = '#c8d0e8'; g.font = '500 42px system-ui, sans-serif'; g.fillText(`Building #${s.i + 1}${claim && claim.status === 'verified' ? '  ·  verified ✓' : ''}`, 540, 1630);
          g.fillStyle = '#8fa0c8'; g.font = '500 36px system-ui, sans-serif'; g.fillText(siteUrl, 540, 1800);
          c.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `neverend-city-building-${s.i + 1}.png`; document.body.appendChild(a); a.click(); a.remove(); sys.notify('Share card saved. Post it to your story!'); }, 'image/png');
        }; img.src = URL.createObjectURL(blob);
      }));
    },
    update() {},
  });
}