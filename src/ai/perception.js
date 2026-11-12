// Percepcja i pamięć: co agent widzi, co pamięta i jak szuka rzeczy w pamięci.
import { T, W, H, idx, toWorld, toTile, BRIDGE_COST } from '../world/world.js';
import { thought, urgent, eventLine } from './commentary.js';
import {
  PERSONAS, FOOD, RECIPES, RECIPE_NAMES, MATS, MAT_NAMES, comboKey, RECIPE_BY_COMBO, KIND_NAMES,
  SPEED, VIEW_RANGE, VIEW_NEAR, viewHalfAngle, wrapAng, INV_CAP, clamp, TORCH,
} from './data.js';

export const perceptionMethods = {
  // ---------- percepcja ----------
  // aktualizuje pamięć o to, co agent widzi w swoim stożku widzenia (full = rozglądanie dookoła)
  // zasięg wzroku: w nocy dużo mniejszy; płonąca pochodnia w ręku albo bliskie ognisko daje połowę dziennego
  viewMul() {
    const w = this.world;
    const day = clamp(w.daylight() * 1.6, 0, 1);
    let night = TORCH.night;
    if (this.torchLit() || this.nearStructure('campfire', 3)) night = TORCH.light;
    return night + (1 - night) * day;
  },
  torchLit() { return this.heldL === 'torch' && this.torchBurn > 0; },

  see(full = false, range = null) {
    const w = this.world;
    const mul = range ? 1 : this.viewMul();
    const R = range || VIEW_RANGE * mul, x0 = this.x, z0 = this.z;
    this.viewR = R;
    const i0 = Math.max(0, Math.floor(this.i - R)), i1 = Math.min(W - 1, Math.ceil(this.i + R));
    const j0 = Math.max(0, Math.floor(this.j - R)), j1 = Math.min(H - 1, Math.ceil(this.j + R));
    const visible = (dx, dz) => {
      const d = Math.hypot(dx, dz);
      if (d > R) return false;
      if (full || d <= VIEW_NEAR) return true;
      return Math.abs(wrapAng(Math.atan2(dx, dz) - this.facing)) <= viewHalfAngle(d / mul);
    };
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const p = toWorld(i, j);
      if (!visible(p.x - x0, p.z - z0)) continue;
      const k = idx(i, j);
      if (!this.seen[k]) { this.seen[k] = 1; this.seenCount++; }
      const r = w.res[k];
      const old = this.memByTile.get(k);
      if (old !== undefined && (!r || r.id !== old)) { this.mem.delete(old); this.memByTile.delete(k); }
      if (r) {
        this.mem.set(r.id, { r, kind: r.kind, i: r.i, j: r.j, berries: r.berries, growth: r.growth, amount: r.amount, stone: r.stone, stand: r.stand, t: w.time });
        this.memByTile.set(k, r.id);
      }
    }
    for (const s of w.structures) if (!this.knownStructs.has(s.id) && visible(s.x - x0, s.z - z0)) this.knownStructs.add(s.id);
    for (const b of w.birds) {
      if (b.state === 'landed' && visible(b.x - x0, b.z - z0)) { const t = toTile(b.x, b.z); this.memBirds.set(b.id, { b, i: t.i, j: t.j, t: w.time }); }
      else if (b.state !== 'landed' && this.memBirds.has(b.id) && visible(b.x - x0, b.z - z0)) this.memBirds.delete(b.id);
    }
    for (const b of w.boars || []) if (!b.dead && visible(b.x - x0, b.z - z0)) this.memBoars.set(b.id, { b, i: b.i, j: b.j, t: w.time });
    for (const o of w.agents || []) if (o !== this && o.alive && visible(o.x - x0, o.z - z0)) this.memAgents.set(o.id, { a: o, i: o.i, j: o.j, t: w.time });
    for (const f of w.fish) if (visible(f.x - x0, f.z - z0)) this.memFish.push({ x: f.x, z: f.z, t: w.time });
    if (this.memFish.length > 60) this.memFish.splice(0, this.memFish.length - 60);
  },

  // najbliższy ZAPAMIĘTANY zasób spełniający warunek (warunek dotyczy zapamiętanego stanu)
  nearestRes(bfs, pred, taken) {
    let best = null;
    const now = this.world.time;
    for (const m of this.mem.values()) {
      m.age = now - m.t;
      if (!pred(m) || (taken && taken.has(m.r.id))) continue;
      const d = bfs.dist[idx(m.i, m.j)];
      if (d < 0) continue;
      if (!best || d < best.d) best = { r: m.r, d };
    }
    return best;
  },

  nearestTile(bfs, list) {
    let best = null;
    for (const t of list) {
      const d = bfs.dist[idx(t.i, t.j)];
      if (d >= 0 && (!best || d < best.d)) best = { ...t, d };
    }
    return best;
  },

  // wygasłe ognisko nie grzeje i nie piecze; any = true znajduje także wygasłe (do podsycenia)
  nearestStructure(bfs, kind, any = false) {
    let best = null;
    for (const s of this.world.structures) {
      if (s.kind !== kind || !this.knownStructs.has(s.id)) continue;
      if (kind === 'campfire' && !any && !(s.fuel > 0)) continue;
      const d = bfs.dist[idx(s.i, s.j)];
      if (d >= 0 && (!best || d < best.d)) best = { s, d, i: s.i, j: s.j };
    }
    return best;
  },

  bestFishingSpot(bfs) {
    let best = null;
    const others = this.world.agents.filter((a) => a !== this && a.task && a.task.fishSpot).map((a) => a.task.fishSpot);
    for (const t of this.world.seaShore) {
      const d = bfs.dist[idx(t.i, t.j)];
      if (d < 0) continue;
      if (others.some((o) => Math.abs(o.i - t.i) + Math.abs(o.j - t.j) < 4)) continue;
      if (this.badSpots.some((o) => this.world.time - o.t < 45 && Math.abs(o.i - t.i) + Math.abs(o.j - t.j) < 4)) continue;
      let fish = 0;
      for (const f of this.memFish) if (Math.abs(f.x - t.wx) < 5 && Math.abs(f.z - t.wz) < 5) fish++;
      const s = d - fish * 3;
      if (!best || s < best.s) best = { ...t, d, s, fish };
    }
    return best;
  },

  nearestSeaweed(bfs, taken) {
    let best = null;
    for (const m of this.mem.values()) {
      const r = m.r;
      if (m.kind !== 'seaweed' || (m.amount <= 0 && this.world.time - m.t < 50) || (taken && taken.has(r.id))) continue;
      const st = r.stand;
      const d = bfs.dist[idx(st.i, st.j)];
      if (d >= 0 && (!best || d < best.d)) best = { r, d };
    }
    return best;
  },

  islandScarcity(isl) {
    // na podstawie pamięci: im mniej znanych jagód na wyspie na osobę, tym większy niedobór (0..1)
    let berries = 0;
    for (const m of this.mem.values()) if (m.kind === 'bush' && this.world.island[idx(m.i, m.j)] === isl) berries += m.berries;
    const people = this.world.agents.filter((a) => a.alive && a.island === isl).length || 1;
    return clamp(1 - berries / (people * 8), 0, 1);
  },

  nearStructure(kind, r) {
    return this.world.structures.find((s) => s.kind === kind && (kind !== 'campfire' || s.fuel > 0) && Math.hypot(s.x - this.x, s.z - this.z) <= r);
  },

  freeTileNear(i, j, bfs) {
    for (let r = 1; r < 3; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const ni = i + di, nj = j + dj;
      if (!this.world.inBounds(ni, nj)) continue;
      if (bfs.dist[idx(ni, nj)] >= 0 && !this.world.structures.some((s) => s.i === ni && s.j === nj)) return { i: ni, j: nj };
    }
    return null;
  },

  pathTo(i, j) {
    const p = this.world.pathFrom(this.bfsCache, i, j);
    return p;
  },
};
