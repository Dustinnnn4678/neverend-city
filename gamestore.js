// Live-site version of store.js for homes, furniture and businesses.
// The interior code still changes this object right away so the room feels instant, but every real change is also sent
// to the server as an ACTION ("upgrade", "place"...). The server works out the real numbers from timestamps and its own
// price list, and its answer overwrites the coins and business shown here. Editing this page cannot create coins.
const blank = () => ({ coins: 0, seed: 1, furniture: {}, business: {}, likes: {}, visits: {}, starter: {}, uid: -1, player: {}, noEvents: true, history: [] });

export class RemoteGameStore {
  constructor(remote) { this.remote = remote; this.state = blank(); this.q = Promise.resolve(); this.onDesync = null; this.notify = () => {}; this._last = {}; }
  save() {}                                   // the server is the save file
  reset() { this.state = blank(); }
  canAfford(n) { return this.state.coins >= n; }
  spend(n) { if (n > this.state.coins) return false; this.state.coins -= n; return true; }   // predicted; the server's answer replaces it
  earn(n) { this.state.coins += Math.max(0, Math.floor(n)); }
  furnitureOf(b) { return (this.state.furniture[b] ||= []); }
  nextUid() { return this.state.uid--; }      // temporary negative ids until the server gives the real one
  snap(v, force) { const h = (this.state.history ||= []), last = h[h.length - 1]; if (force || !last || (Date.now() - last.t > 60000 && last.v !== v)) { h.push({ t: Date.now(), v }); if (h.length > 200) h.shift(); } }

  _apply(r, full) {
    const s = this.state; s.coins = Number(r.coins); s.seed = r.seed; s.player = r.player; s.noEvents = true; s.visits = r.visits || {};
    for (const [k, nb] of Object.entries(r.business || {})) { if (s.business[k]) Object.assign(s.business[k], nb); else s.business[k] = nb; }
    for (const k of Object.keys(s.business)) if (!(r.business || {})[k]) delete s.business[k];
    if (full) { s.furniture = r.furniture || {}; s.starter = r.starter || {}; s.uid = -1; }
  }
  async load() { this._apply(await this.remote.rpc('rpc_game_state'), true); }
  async enter(building, kind) { this._apply(await this.remote.rpc('rpc_game_enter', { p_building: building, p_kind: kind }), true); }

  /* send one action; actions run one at a time, in order */
  act(name, a = {}) {
    if (a.throttle) { const now = Date.now(); if (now - (this._last[name] || 0) < a.throttle) return Promise.resolve(); this._last[name] = now; }
    this.q = this.q.then(async () => {
      try {
        let r;
        if (name === 'place') { const it = a.ref; r = await this.remote.rpc('rpc_game_place', { p_building: a.building, p_item: it.id, p_x: it.x, p_z: it.z, p_rot: it.rot || 0, p_wall: it.wall || null }); it.uid = r.uid; }
        else if (name === 'move') { const it = a.ref; r = await this.remote.rpc('rpc_game_move', { p_uid: it.uid, p_x: it.x, p_z: it.z, p_rot: it.rot || 0, p_wall: it.wall || null }); }
        else if (name === 'sell') r = await this.remote.rpc('rpc_game_sell', { p_uid: a.ref.uid });
        else if (name === 'open') r = await this.remote.rpc('rpc_game_open_business', { p_building: a.building, p_type: a.type });
        else if (name === 'collect') r = await this.remote.rpc('rpc_game_collect');
        else if (name === 'upgrade') r = await this.remote.rpc('rpc_game_upgrade');
        else if (name === 'worker') r = await this.remote.rpc('rpc_game_worker');
        else if (name === 'manager') r = await this.remote.rpc('rpc_game_manager');
        else return;
        this._apply(r, false);
      } catch (e) {
        this.notify(e.message || 'That did not work.');
        try { await this.load(); } catch (e2) { /* offline: keep what we have */ }
        if (this.onDesync) this.onDesync();
      }
    });
    return this.q;
  }
}
