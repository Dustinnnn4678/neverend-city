// Explore mode: walk the streets as a 3D character or drive a car through the city.
// Controls: W A S D or arrow keys, Shift to sprint, Space = handbrake (car), drag to look around, Esc to exit.
// On phones there is an on-screen pad on the left.
import * as THREE from 'three';
import { makePerson, pose } from './interior.js';
import { P } from './city-gen.js';
import { riverCurve, RIVER_HALF, HARBOR } from './infra.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export class Explore {
  constructor({ scene, camera, canvas, getWorld, carGeo, notify, onStop }) {
    Object.assign(this, { scene, camera, canvas, getWorld, carGeo, notify, onStop }); this.active = false; this.keys = new Set(); this.joy = { x: 0, y: 0 };
    addEventListener('keydown', e => { if (!this.active) return; if (e.key === 'Escape') { this.stop(); return; } this.keys.add(e.key.toLowerCase()); if (e.key === ' ') e.preventDefault(); });
    addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
    let drag = null; canvas.addEventListener('pointerdown', e => { if (this.active && !e.target.closest('#xpad')) drag = e.clientX; });
    addEventListener('pointermove', e => { if (this.active && drag !== null) { this.camYaw -= (e.clientX - drag) * 0.006; drag = e.clientX; this.lastLook = performance.now(); } });
    addEventListener('pointerup', () => { drag = null; });
    this._ui();
  }
  _ui() {
    const el = this.ui = document.createElement('div'); el.id = 'xui'; el.style.cssText = 'position:fixed;inset:0;pointer-events:none;display:none;z-index:15;font-family:system-ui,sans-serif;color:#f4f7ff';
    el.innerHTML = `<div style="position:absolute;top:14px;left:14px;pointer-events:auto"><button id="xexit" style="padding:9px 14px;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:rgba(10,14,26,.6);color:inherit;font:inherit;font-size:13px;cursor:pointer">← Exit explore (Esc)</button></div>
<div id="xhint" style="position:absolute;left:50%;transform:translateX(-50%);bottom:18px;padding:8px 14px;border-radius:99px;background:rgba(10,14,26,.55);font-size:12px;letter-spacing:.06em;text-align:center;max-width:92vw"></div>
<div id="xspeed" style="position:absolute;top:16px;right:16px;padding:8px 14px;border-radius:99px;background:rgba(10,14,26,.55);font-size:13px"></div>
<div id="xpad" style="position:absolute;left:22px;bottom:70px;width:130px;height:130px;border-radius:50%;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.25);pointer-events:auto;touch-action:none;display:none"><div id="xknob" style="position:absolute;left:45px;top:45px;width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.45)"></div></div>`;
    document.body.appendChild(el); el.querySelector('#xexit').addEventListener('click', () => this.stop());
    const pad = el.querySelector('#xpad'), knob = el.querySelector('#xknob'); let on = false;
    const set = e => { const r = pad.getBoundingClientRect(), x = clamp((e.clientX - r.left - 65) / 50, -1, 1), y = clamp((e.clientY - r.top - 65) / 50, -1, 1); this.joy.x = x; this.joy.y = y; knob.style.left = 45 + x * 40 + 'px'; knob.style.top = 45 + y * 40 + 'px'; };
    pad.addEventListener('pointerdown', e => { on = true; pad.setPointerCapture(e.pointerId); set(e); }); pad.addEventListener('pointermove', e => { if (on) set(e); });
    const end = () => { on = false; this.joy.x = this.joy.y = 0; knob.style.left = '45px'; knob.style.top = '45px'; }; pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
    this.pad = pad; this.hint = el.querySelector('#xhint'); this.speedEl = el.querySelector('#xspeed');
  }
  _buildObstacles() {
    const W = this.getWorld(), grid = new Map(), add = (cx, cz, hw, hd) => { const o = { x0: cx - hw, x1: cx + hw, z0: cz - hd, z1: cz + hd };
      for (let gx = Math.floor(o.x0 / 40); gx <= Math.floor(o.x1 / 40); gx++) for (let gz = Math.floor(o.z0 / 40); gz <= Math.floor(o.z1 / 40); gz++) { const k = gx + ',' + gz; (grid.get(k) || grid.set(k, []).get(k)).push(o); } };
    for (const s of W.S) { if (s.type === 'park' || s.type === 'green') continue; const along = s.yaw % 2 === 0; let hw = 5.8, hd = 5.8; if (s.span === 2) { hw = along ? 13.5 : 5.8; hd = along ? 5.8 : 13.5; } else if (s.span === 9) { hw = hd = 22; } else if (s.type === 'observation' || s.type === 'watertower' || s.type === 'celltower') { hw = hd = 3; } add(s.x, s.z, hw, hd); }
    this.grid = grid; this.n = W.n;
  }
  _blockedTerrain(x, z) {
    if (this.n >= 1000 && Math.abs(x - riverCurve(z)) < RIVER_HALF) { const m = ((z - P / 2) % P + P) % P, nearRoad = Math.min(m, P - m) < 7; if (!nearRoad) return true; }
    if (this.n >= 4000 && x > HARBOR.x0 + 14 && x < HARBOR.x1 - 14 && z > HARBOR.z0 + 30 && z < HARBOR.z1 - 14) return true;
    return false;
  }
  _collide(pos, r) {
    for (let it = 0; it < 2; it++) { const gx = Math.floor(pos.x / 40), gz = Math.floor(pos.z / 40);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const list = this.grid.get((gx + a) + ',' + (gz + b)); if (!list) continue;
        for (const o of list) { const cx = clamp(pos.x, o.x0, o.x1), cz = clamp(pos.z, o.z0, o.z1), dx = pos.x - cx, dz = pos.z - cz, d2 = dx * dx + dz * dz; if (d2 < r * r) { if (d2 > 1e-6) { const d = Math.sqrt(d2), k = (r - d) / d; pos.x += dx * k; pos.z += dz * k; this.speed *= 0.5; } else { pos.x += r; } } } } }
  }
  start(mode) {
    this._buildObstacles(); this.mode = mode; this.active = true; this.speed = 0; this.yaw = 0; this.camYaw = 0; this.lastLook = 0; this.keys.clear();
    this.group = new THREE.Group(); this.scene.add(this.group);
    if (mode === 'walk') { this.me = makePerson('#e0b43a', '#e0b48a', '#2a3446'); this.me.scale.setScalar(1.15); }
    else { this.me = new THREE.Mesh(this.carGeo, new THREE.MeshStandardMaterial({ vertexColors: true, color: new THREE.Color('#d9433a'), roughness: 0.3, metalness: 0.6 })); this.me.scale.setScalar(1.15); this.me.castShadow = true; }
    this.pos = new THREE.Vector3(P / 2 - 3 + (mode === 'drive' ? 0 : 7), 0, 14); if (this.n >= 1000) this.pos.z = 14; this.me.position.copy(this.pos); this.group.add(this.me);
    this.saveFov = this.camera.fov; this.camera.fov = 62; this.camera.updateProjectionMatrix(); this.camera.clearViewOffset(); this.camera.updateProjectionMatrix();
    this.ui.style.display = 'block'; this.pad.style.display = matchMedia('(pointer:coarse)').matches ? 'block' : 'none';
    this.hint.textContent = mode === 'walk' ? 'W A S D to walk · Shift to run · drag to look · Esc to exit' : 'W / S to drive · A / D to steer · Space = brake · drag to look · Esc to exit';
    this.camPos = this.camera.position.clone(); this.camPos.set(this.pos.x, 6, this.pos.z + 12);
  }
  stop() {
    if (!this.active) return; this.active = false; this.scene.remove(this.group); this.camera.fov = this.saveFov; this.camera.updateProjectionMatrix(); this.ui.style.display = 'none'; this.onStop && this.onStop();
  }
  update(dt, t) {
    if (!this.active) return; const k = this.keys, up = k.has('w') || k.has('arrowup'), down = k.has('s') || k.has('arrowdown'), left = k.has('a') || k.has('arrowleft'), right = k.has('d') || k.has('arrowright'), run = k.has('shift');
    let fx = (right ? 1 : 0) - (left ? 1 : 0) + this.joy.x, fy = (down ? 1 : 0) - (up ? 1 : 0) + this.joy.y;
    if (this.mode === 'walk') {
      if (k.has('q')) this.camYaw += dt * 1.8; if (k.has('e')) this.camYaw -= dt * 1.8;
      const len = Math.hypot(fx, fy), moving = len > 0.1, sp = (run ? 6.5 : 3.4) * Math.min(1, len), s = Math.sin(this.camYaw), c = Math.cos(this.camYaw);
      if (moving) {
        const f = -fy / len, r = fx / len, vx = s * f - c * r, vz = c * f + s * r, nx = this.pos.x + vx * sp * dt, nz = this.pos.z + vz * sp * dt;
        if (!this._blockedTerrain(nx, nz)) { this.pos.x = nx; this.pos.z = nz; } this.yaw = Math.atan2(vx, vz); this.speed = sp;
      } else this.speed = 0;
      this._collide(this.pos, 0.55); this.me.position.set(this.pos.x, 0, this.pos.z); this.me.rotation.y = this.yaw; pose(this.me, moving, false, t, run ? 1.0 : 0.7);    } else {
      const thr = -fy, steer = -fx; this.speed += (thr > 0.1 ? 14 : thr < -0.1 ? -10 : 0) * dt * Math.abs(thr > 0 ? thr : thr); if (k.has(' ')) this.speed *= Math.pow(0.02, dt); this.speed *= Math.pow(0.45, dt);
      this.speed = clamp(this.speed, -8, run ? 34 : 26); const turn = steer * clamp(Math.abs(this.speed) / 6, 0, 1) * 1.7 * dt * Math.sign(this.speed || 1); this.yaw += turn;
      const nx = this.pos.x + Math.sin(this.yaw) * this.speed * dt, nz = this.pos.z + Math.cos(this.yaw) * this.speed * dt; if (this._blockedTerrain(nx, nz)) this.speed *= -0.3; else { this.pos.x = nx; this.pos.z = nz; }
      this._collide(this.pos, 2.1); this.me.position.set(this.pos.x, 0, this.pos.z); this.me.rotation.y = this.yaw; this.me.rotation.z = -turn * 4;
    }
    // chase camera
    if (performance.now() - this.lastLook > 1500) { let d = this.yaw - this.camYaw; d = Math.atan2(Math.sin(d), Math.cos(d)); if (this.mode === 'drive' && Math.abs(this.speed) > 1) this.camYaw += d * Math.min(1, dt * 1.6); }
    const dist = this.mode === 'walk' ? 7 : 11 + Math.abs(this.speed) * 0.1, h = this.mode === 'walk' ? 3.2 : 4.6, want = new THREE.Vector3(this.pos.x - Math.sin(this.camYaw) * dist, h, this.pos.z - Math.cos(this.camYaw) * dist);
    this.camPos.lerp(want, Math.min(1, dt * 5)); this.camera.position.copy(this.camPos); this.camera.lookAt(this.pos.x, this.mode === 'walk' ? 1.4 : 1.2, this.pos.z);
    this.speedEl.textContent = this.mode === 'drive' ? Math.round(Math.abs(this.speed) * 3.6) + ' km/h' : '';
  }
}
