// Generowanie świata: wyspy, stawy, wzgórze z kopalnią, zasoby, ryby i ptaki.
import { W, H, T, idx, toWorld, toTile, DIRS4, DIRS8, BRIDGE_COST, BRIDGE_BUILD_TIME, heightToY } from './world.js';
import { makeNoise2D } from '../core/rng.js';

export const generateMethods = {
  generate() {
    const r = this.rand;
    const noise = makeNoise2D(r);
    const islands = this.islandDefs;
    const n = islands.length;
    // kopalnia na wyspie najdalszej od startowej (lub na jedynej)
    let mineIsl = 0, far = -1;
    islands.forEach((isl, k) => { const d = Math.hypot(isl.ci - islands[0].ci, isl.cj - islands[0].cj); if (d > far) { far = d; mineIsl = k; } });
    const mi = islands[mineIsl];
    const hill = n === 1
      ? { ci: mi.ci + mi.rad * 0.45, cj: mi.cj - mi.rad * 0.35, rad: 9, isl: mineIsl }
      : { ci: mi.ci + mi.rad * 0.3, cj: mi.cj - mi.rad * 0.25, rad: 9, isl: mineIsl };
    this.hill = hill;
    const ponds = islands.map((isl, k) => ({
      ci: isl.ci - isl.rad * (0.2 + r() * 0.15) * (k % 2 ? -1 : 1), cj: isl.cj + isl.rad * (0.15 + r() * 0.15),
      rad: k === 0 ? 2.6 : 1.9 + r() * 0.6,
    }));

    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      let best = -5, bestK = -1;
      islands.forEach((isl, k) => {
        const ang = Math.atan2(j - isl.cj, i - isl.ci);
        const wob = 0.68 + 0.6 * noise(Math.cos(ang) * 2.2 + k * 17 + 100, Math.sin(ang) * 2.2 + 100, 2);
        const d = Math.hypot(i - isl.ci, (j - isl.cj) * 1.15) / (isl.rad * wob);
        const nz = noise(i * 0.07 + k * 50, j * 0.07);
        const e = (1 - d) * 2.6 + (nz - 0.5) * 1.8;
        if (e > best) { best = e; bestK = k; }
      });
      const dh = Math.hypot(i - hill.ci, j - hill.cj) / hill.rad;
      if (dh < 1 && bestK === hill.isl) best += 3.2 * (1 - dh * dh) * (1 - dh * dh);
      const k = idx(i, j);
      const edge = Math.min(i, j, W - 1 - i, H - 1 - j);
      if (edge < 3) best = Math.min(best, -1);
      this.height[k] = best;
      if (best <= 0) this.type[k] = T.SEA;
      else {
        this.island[k] = bestK;
        if (best < 0.45) this.type[k] = T.SAND;
        else if (best > 2.7) this.type[k] = T.ROCK;
        else this.type[k] = T.GRASS;
      }
    }
    // stawy ze słodką wodą
    for (const p of ponds) {
      for (let j = Math.floor(p.cj - p.rad); j <= Math.ceil(p.cj + p.rad); j++)
        for (let i = Math.floor(p.ci - p.rad); i <= Math.ceil(p.ci + p.rad); i++) {
          if (Math.hypot(i - p.ci, j - p.cj) <= p.rad && this.inBounds(i, j)) {
            const k = idx(i, j);
            if (this.type[k] !== T.SEA) { this.type[k] = T.POND; this.height[k] = Math.max(0.3, this.height[k] - 0.6); }
          }
        }
    }
    for (let k = 0; k < n; k++) this.keepLargestComponent(k);

    this.computeBridges();
    this.placeResources();
    this.spawnFish();
    this.spawnBirds();
    this.spawnBoars();
  },

  keepLargestComponent(isl) {
    const seen = new Uint8Array(W * H);
    let best = [];
    for (let s = 0; s < W * H; s++) {
      if (seen[s] || this.island[s] !== isl || this.type[s] === T.SEA) continue;
      const comp = [s]; seen[s] = 1;
      for (let q = 0; q < comp.length; q++) {
        const c = comp[q], ci = c % W, cj = (c / W) | 0;
        for (const [di, dj] of DIRS4) {
          const ni = ci + di, nj = cj + dj;
          if (!this.inBounds(ni, nj)) continue;
          const nn = idx(ni, nj);
          if (!seen[nn] && this.island[nn] === isl && this.type[nn] !== T.SEA) { seen[nn] = 1; comp.push(nn); }
        }
      }
      if (comp.length > best.length) best = comp;
    }
    const keep = new Set(best);
    for (let s = 0; s < W * H; s++) {
      if (this.island[s] === isl && !keep.has(s)) { this.island[s] = -1; this.type[s] = T.SEA; this.height[s] = -0.2; }
    }
  },

  placeResources() {
    const r = this.rand;
    const n = this.islandCount;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const k = idx(i, j);
      const t = this.type[k], isl = this.island[k];
      if (t === T.SEA || t === T.POND) continue;
      if (this.nearBridgeEnd(i, j)) continue;
      const v = r();
      if (t === T.GRASS) {
        // wyspa startowa ma mniej jedzenia (gdy są inne wyspy) - zachęta do budowy mostu
        const poor = n > 1 && isl === 0;
        const treeP = 0.13;
        const bushP = poor ? 0.018 : n === 1 ? 0.03 : 0.045;
        const rockP = poor ? 0.012 : 0.03;
        if (v < treeP) this.addResource('tree', i, j, { wood: 3, growth: 1 });
        else if (v < treeP + bushP) this.addResource('bush', i, j, { berries: 3, max: 4, regrow: 0 });
        else if (v < treeP + bushP + rockP) this.addResource('rock', i, j, { stone: 4 });
        // kępy dzikiego żyta i kwiaty na łąkach
        else if (v < treeP + bushP + rockP + 0.012) this.addResource('rye', i, j, { ears: 3, max: 3, regrow: 0 });
        else if (v < treeP + bushP + rockP + 0.03) this.addResource('flower', i, j, { flowers: 2, max: 2, regrow: 0, hue: Math.floor(r() * 3) });
      } else if (t === T.SAND) {
        if (v < 0.02) this.addResource('rock', i, j, { stone: 3 });
        else if (v < 0.035) this.addResource('palm', i, j, { wood: 2, growth: 1 });
      } else if (t === T.ROCK) {
        if (v < 0.12) this.addResource('rock', i, j, { stone: 6 });
      }
    }
    // wodorosty w płytkiej wodzie przy brzegu
    for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) {
      const k = idx(i, j);
      if (this.type[k] !== T.SEA || this.res[k] || this.bridgeTileSet.has(k)) continue;
      const stand = this.adjacentTo(i, j, (t, ni, nj) => this.walkable(ni, nj) && !this.bridgeTileSet.has(idx(ni, nj)));
      if (stand && r() < 0.07) {
        const sw = this.addResource('seaweed', i, j, { amount: 3, max: 3, regrow: 0 });
        sw.stand = stand;
      }
    }
    // kopalnia na zboczu wzgórza (od strony środka wyspy)
    const h = this.hill;
    const isl = this.islandDefs[h.isl];
    let best = null;
    for (let j = Math.floor(h.cj - 10); j <= h.cj + 10; j++) for (let i = Math.floor(h.ci - 10); i <= h.ci + 10; i++) {
      if (!this.walkable(i, j) || this.island[idx(i, j)] !== h.isl) continue;
      const hh = this.height[idx(i, j)];
      if (hh < 1.6 || hh > 2.8) continue;
      const d = Math.hypot(i - (h.ci + (isl.ci - h.ci) * 0.6), j - (h.cj + (isl.cj - h.cj) * 0.6));
      if (!best || d < best.d) best = { i, j, d };
    }
    if (best) {
      const k = idx(best.i, best.j);
      if (this.res[k]) this.removeResource(this.res[k]);
      this.type[k] = T.ROCK;
      this.mine = this.addResource('mine', best.i, best.j, { depth: 0 });
      const p = toWorld(best.i, best.j);
      this.mine.x = p.x; this.mine.z = p.z;
      this.mine.rot = Math.atan2(isl.ci - h.ci, isl.cj - h.cj);
    }
  },

  seaTilesNearShore(maxDist) {
    const out = [];
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      if (this.type[idx(i, j)] !== T.SEA) continue;
      let near = false;
      for (let dj = -maxDist; dj <= maxDist && !near; dj++)
        for (let di = -maxDist; di <= maxDist; di++) {
          const ni = i + di, nj = j + dj;
          if (this.inBounds(ni, nj) && this.island[idx(ni, nj)] >= 0) { near = true; break; }
        }
      if (near) out.push({ i, j });
    }
    return out;
  },

  spawnFish() {
    this.fishSpots = this.seaTilesNearShore(4);
    for (let n = 0; n < 14 + this.islandCount * 12; n++) this.fish.push(this.newFish());
  },

  spawnBirds() {
    for (let n = 0; n < 5 + this.islandCount * 2; n++) {
      const isl = this.islandDefs[n % this.islandCount];
      const p = toWorld(isl.ci, isl.cj);
      this.birds.push({
        id: this.nextId++, state: 'fly', cx: p.x, cz: p.z, radius: 6 + this.rand() * 10,
        angle: this.rand() * Math.PI * 2, alt: 6 + this.rand() * 4, x: p.x, z: p.z, y: 8,
        timer: 10 + this.rand() * 40, speed: 0.25 + this.rand() * 0.2, lx: 0, lz: 0,
      });
    }
  },

  newFish() {
    const s = this.fishSpots[Math.floor(this.rand() * this.fishSpots.length)];
    const p = toWorld(s.i, s.j);
    const a = this.rand() * Math.PI * 2;
    return { id: this.nextId++, x: p.x, z: p.z, dir: a, speed: 0.6 + this.rand() * 0.6, depth: 0.25 + this.rand() * 0.25, jump: 0 };
  },

  addResource(kind, i, j, props) {
    const k = idx(i, j);
    const r = { id: this.nextId++, kind, i, j, ...props };
    const p = toWorld(i, j);
    r.x = p.x + (this.rand() - 0.5) * 0.3; r.z = p.z + (this.rand() - 0.5) * 0.3;
    r.rot = this.rand() * Math.PI * 2;
    r.scale = 0.8 + this.rand() * 0.45;
    this.res[k] = r;
    this.resources.push(r);
    return r;
  },

  nearBridgeEnd(i, j) {
    for (const br of this.bridges) {
      for (const e of [br.start, br.end]) if (Math.abs(e.i - i) + Math.abs(e.j - j) < 3) return true;
    }
    return false;
  },
};
