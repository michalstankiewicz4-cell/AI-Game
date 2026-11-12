// Logika świata: mapa kafelków, zasoby, ryby, ptaki, most, pora dnia.
import { mulberry32, makeNoise2D } from './rng.js';

export let W = 96;
export let H = 64;
export const MAX_ISLANDS = 4;
const ISLAND_RAD = 26;
// pozycje środków wysp w jednostkach "sąsiedztwa" (odstęp tak, by przesmyk miał ~7 kafelków)
const ISLAND_LAYOUTS = {
  1: [[0, 0]],
  2: [[0, 0], [1, 0]],
  3: [[0, 0], [1, 0], [0.5, 1]],
  4: [[0, 0], [1, 0], [0, 1], [1, 1]],
};
export const T = { SEA: 0, SAND: 1, GRASS: 2, ROCK: 3, POND: 4, BRIDGE: 5 };
export const DAY_LENGTH = 180; // sekund symulacji na dobę

export const BRIDGE_COST = { planks: 2, rope: 1 }; // na jeden segment mostu
export const BRIDGE_BUILD_TIME = 3;

export const idx = (i, j) => j * W + i;
export const toWorld = (i, j) => ({ x: i - W / 2 + 0.5, z: j - H / 2 + 0.5 });
export const toTile = (x, z) => ({ i: Math.floor(x + W / 2), j: Math.floor(z + H / 2) });
const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIRS8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export class World {
  constructor(seed, islandCount = 2) {
    this.seed = seed;
    this.islandCount = Math.max(1, Math.min(MAX_ISLANDS, islandCount));
    const rad = ISLAND_RAD;
    const gx = rad * 2 + 7, gz = (rad / 1.15) * 2 + 7;
    const lay = ISLAND_LAYOUTS[this.islandCount].map(([x, z]) => [x * gx, z * gz]);
    const maxX = Math.max(...lay.map((p) => p[0])), maxZ = Math.max(...lay.map((p) => p[1]));
    W = Math.ceil(maxX + rad * 2 + 16);
    H = Math.ceil(maxZ + (rad / 1.15) * 2 + 16);
    this.islandDefs = lay.map(([x, z]) => ({ ci: x + rad + 8, cj: z + rad / 1.15 + 8, rad }));
    this.W = W; this.H = H;
    this.rand = mulberry32(seed);
    this.time = DAY_LENGTH * 0.3; // start rano
    this.type = new Uint8Array(W * H);
    this.height = new Float32Array(W * H);
    this.island = new Int8Array(W * H).fill(-1); // 0 = wyspa zachodnia, 1 = wschodnia
    this.res = new Array(W * H).fill(null);
    this.resources = [];
    this.structures = []; // ogniska, szałasy
    this.fish = [];
    this.birds = [];
    this.events = []; // komunikaty do dziennika
    this.changed = new Set(); // zasoby do odświeżenia w renderze
    this.nextId = 1;
    this.generate();
  }

  log(text, kind = 'info') {
    this.events.push({ text, kind, day: this.day(), clock: this.clock() });
  }
  day() { return Math.floor(this.time / DAY_LENGTH) + 1; }
  dayFrac() { return (this.time / DAY_LENGTH) % 1; }
  clock() {
    const m = Math.floor(this.dayFrac() * 24 * 60);
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }
  isNight() { const f = this.dayFrac(); return f > 0.8 || f < 0.22; }
  // 0 w nocy .. 1 w południe
  daylight() {
    const f = this.dayFrac();
    return Math.max(0, Math.min(1, Math.sin((f - 0.22) / 0.58 * Math.PI) * 1.4));
  }

  inBounds(i, j) { return i >= 0 && j >= 0 && i < W && j < H; }
  walkable(i, j) {
    if (!this.inBounds(i, j)) return false;
    const t = this.type[idx(i, j)];
    return t === T.SAND || t === T.GRASS || t === T.ROCK || t === T.BRIDGE;
  }

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
  }

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
  }

  // najkrótszy prosty most (poziomy lub pionowy) między wyspami a i b
  findBridge(a, b) {
    let best = null;
    const tryLine = (horizontal) => {
      const outer = horizontal ? H : W, inner = horizontal ? W : H;
      for (let o = 0; o < outer; o++) {
        let lastIsl = -1, lastPos = -1;
        for (let p = 0; p < inner; p++) {
          const i = horizontal ? p : o, j = horizontal ? o : p;
          const k = idx(i, j);
          if (this.type[k] === T.SEA) continue;
          const isl = this.walkable(i, j) ? this.island[k] : -2;
          if (isl >= 0 && lastIsl >= 0 && isl !== lastIsl && p - lastPos > 1 &&
              ((isl === a && lastIsl === b) || (isl === b && lastIsl === a))) {
            const len = p - lastPos - 1;
            if (!best || len < best.len) {
              const tiles = [];
              for (let q = lastPos + 1; q < p; q++) tiles.push(horizontal ? { i: q, j: o } : { i: o, j: q });
              const s = horizontal ? { i: lastPos, j: o } : { i: o, j: lastPos };
              const e = horizontal ? { i: p, j: o } : { i: o, j: p };
              best = { len, tiles, start: s, end: e };
            }
          }
          lastIsl = isl; lastPos = p;
        }
      }
    };
    tryLine(true); tryLine(false);
    return best;
  }

  computeBridges() {
    // drzewo rozpinające: łączymy wyspy najkrótszymi możliwymi mostami
    this.bridges = [];
    this.bridgeTileSet = new Set();
    const n = this.islandCount;
    if (n < 2) return;
    const cands = [];
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
      const br = this.findBridge(a, b);
      if (br && br.len <= 26) cands.push({ a, b, ...br });
    }
    cands.sort((x, y) => x.len - y.len);
    const parent = [...Array(n).keys()];
    const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    for (const c of cands) {
      if (find(c.a) === find(c.b)) continue;
      parent[find(c.a)] = find(c.b);
      // most nie może przecinać innego mostu
      this.bridges.push({ id: this.bridges.length, a: c.a, b: c.b, tiles: c.tiles, start: c.start, end: c.end, fromStart: 0, fromEnd: 0, planks: 0, rope: 0, progS: 0, progE: 0, complete: false });
    }
    this.bridgeTileSet = new Set();
    for (const br of this.bridges) for (const t of br.tiles) this.bridgeTileSet.add(idx(t.i, t.j));
  }

  bridgeBuilt(br) { return br.fromStart + br.fromEnd; }
  bridgeTotals() {
    let built = 0, total = 0;
    for (const br of this.bridges) { built += this.bridgeBuilt(br); total += br.tiles.length; }
    return { built, total };
  }

  // kafelek z którego buduje się następny segment od danej strony
  bridgeFrontier(br, side) {
    if (br.complete) return null;
    const len = br.tiles.length;
    if (side === 's') return br.fromStart === 0 ? br.start : br.tiles[br.fromStart - 1];
    return br.fromEnd === 0 ? br.end : br.tiles[len - br.fromEnd];
  }
  bridgeNext(br, side) {
    if (br.complete) return null;
    return side === 's' ? br.tiles[br.fromStart] : br.tiles[br.tiles.length - 1 - br.fromEnd];
  }

  addBridgeMaterials(br, planks, rope) { br.planks += planks; br.rope += rope; }
  canBuildSegment(br) { return !br.complete && br.planks >= BRIDGE_COST.planks && br.rope >= BRIDGE_COST.rope; }

  // zwraca true jeśli segment skończony
  workOnBridge(br, side, dt) {
    if (!this.canBuildSegment(br)) return false;
    const key = side === 's' ? 'progS' : 'progE';
    br[key] += dt;
    if (br[key] >= BRIDGE_BUILD_TIME) {
      br[key] = 0;
      br.planks -= BRIDGE_COST.planks; br.rope -= BRIDGE_COST.rope;
      const t = this.bridgeNext(br, side);
      this.type[idx(t.i, t.j)] = T.BRIDGE;
      this.height[idx(t.i, t.j)] = 0.35;
      if (side === 's') br.fromStart++; else br.fromEnd++;
      this.bridgeChanged = true;
      this.shoresDirty = true;
      if (this.bridgeBuilt(br) >= br.tiles.length) {
        br.complete = true;
        this.log(`🌉 Most ${br.a + 1}↔${br.b + 1} jest gotowy!`, 'big');
      }
      return true;
    }
    return false;
  }

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
  }

  nearBridgeEnd(i, j) {
    for (const br of this.bridges) {
      for (const e of [br.start, br.end]) if (Math.abs(e.i - i) + Math.abs(e.j - j) < 3) return true;
    }
    return false;
  }

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
  }

  removeResource(res) {
    const k = idx(res.i, res.j);
    if (this.res[k] === res) this.res[k] = null;
    res.removed = true;
    const n = this.resources.indexOf(res);
    if (n >= 0) this.resources.splice(n, 1);
    this.changed.add(res);
  }

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
  }

  spawnFish() {
    this.fishSpots = this.seaTilesNearShore(4);
    for (let n = 0; n < 14 + this.islandCount * 12; n++) this.fish.push(this.newFish());
  }
  newFish() {
    const s = this.fishSpots[Math.floor(this.rand() * this.fishSpots.length)];
    const p = toWorld(s.i, s.j);
    const a = this.rand() * Math.PI * 2;
    return { id: this.nextId++, x: p.x, z: p.z, dir: a, speed: 0.6 + this.rand() * 0.6, depth: 0.25 + this.rand() * 0.25, jump: 0 };
  }

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
  }

  randomLandTile(isl) {
    for (let tries = 0; tries < 200; tries++) {
      const i = Math.floor(this.rand() * W), j = Math.floor(this.rand() * H);
      const k = idx(i, j);
      if (this.type[k] === T.GRASS && (isl === undefined || this.island[k] === isl)) return { i, j };
    }
    return null;
  }

  landedBirds() { return this.birds.filter((b) => b.state === 'landed' && !b.dead); }

  catchBird(bird) {
    bird.dead = true;
    this.birds.splice(this.birds.indexOf(bird), 1);
    this.birdRespawn = (this.birdRespawn || 0) + 1;
    this.birdTimer = 40;
  }

  scareBird(bird) {
    bird.state = 'fly';
    bird.timer = 20 + this.rand() * 30;
    bird.cx = bird.x; bird.cz = bird.z;
  }

  fishNear(x, z, r) {
    return this.fish.filter((f) => Math.hypot(f.x - x, f.z - z) < r);
  }

  catchFish(f) {
    this.fish.splice(this.fish.indexOf(f), 1);
    this.fishRespawn = (this.fishRespawn || 0) + 1;
  }

  update(dt) {
    this.time += dt;
    // odrastanie zasobów
    for (const r of this.resources) {
      if (r.kind === 'seaweed' && r.amount < r.max) {
        r.regrow += dt;
        if (r.regrow > 40) { r.regrow = 0; r.amount++; this.changed.add(r); }
      } else if (r.kind === 'bush' && r.berries < r.max) {
        r.regrow += dt;
        if (r.regrow > 50) { r.regrow = 0; r.berries++; this.changed.add(r); }
      } else if ((r.kind === 'tree' || r.kind === 'palm') && r.growth < 1) {
        r.growth = Math.min(1, r.growth + dt / 240);
        if (r.growth >= 1) r.wood = r.kind === 'tree' ? 3 : 2;
        this.changed.add(r);
      }
    }
    // ryby
    for (const f of this.fish) {
      f.dir += (this.rand() - 0.5) * dt * 1.5;
      const nx = f.x + Math.cos(f.dir) * f.speed * dt, nz = f.z + Math.sin(f.dir) * f.speed * dt;
      const t = toTile(nx, nz);
      if (this.inBounds(t.i, t.j) && this.type[idx(t.i, t.j)] === T.SEA && this.nearLand(t.i, t.j, 6)) { f.x = nx; f.z = nz; }
      else f.dir += Math.PI * (0.6 + this.rand() * 0.8);
      if (f.jump > 0) f.jump -= dt;
      else if (this.rand() < dt * 0.01) f.jump = 1;
    }
    if (this.fishRespawn > 0) {
      this.fishRespawnTimer = (this.fishRespawnTimer || 0) + dt;
      if (this.fishRespawnTimer > 25) { this.fishRespawnTimer = 0; this.fishRespawn--; this.fish.push(this.newFish()); }
    }
    // ptaki
    for (const b of this.birds) {
      b.timer -= dt;
      if (b.state === 'fly') {
        b.angle += b.speed * dt;
        const tx = b.cx + Math.cos(b.angle) * b.radius, tz = b.cz + Math.sin(b.angle) * b.radius;
        b.x += (tx - b.x) * Math.min(1, dt * 1.5); b.z += (tz - b.z) * Math.min(1, dt * 1.5);
        b.y += (b.alt - b.y) * Math.min(1, dt);
        if (b.timer <= 0) {
          const t = this.randomLandTile(Math.floor(this.rand() * this.islandCount));
          if (t) { const p = toWorld(t.i, t.j); b.state = 'landing'; b.lx = p.x + (this.rand() - 0.5) * 0.6; b.lz = p.z + (this.rand() - 0.5) * 0.6; b.lt = t; }
          else b.timer = 10;
        }
      } else if (b.state === 'landing') {
        const dx = b.lx - b.x, dz = b.lz - b.z, d = Math.hypot(dx, dz);
        const gy = this.groundHeight(b.lx, b.lz) + 0.15;
        if (d < 0.2) { b.state = 'landed'; b.timer = 25 + this.rand() * 35; b.y = gy; }
        else {
          const s = Math.min(d, 5 * dt);
          b.x += dx / d * s; b.z += dz / d * s;
          b.y += (gy - b.y) * Math.min(1, dt * 1.2);
        }
      } else if (b.state === 'landed') {
        if (b.timer <= 0) this.scareBird(b);
      }
    }
    if (this.birdRespawn > 0) {
      this.birdTimer -= dt;
      if (this.birdTimer <= 0) {
        this.birdRespawn--; this.birdTimer = 40;
        const isl = this.islandDefs[Math.floor(this.rand() * this.islandCount)];
        const p = toWorld(isl.ci, isl.cj);
        this.birds.push({ id: this.nextId++, state: 'fly', cx: p.x, cz: p.z, radius: 8 + this.rand() * 8, angle: 0, alt: 7, x: p.x + 30, z: p.z, y: 12, timer: 30, speed: 0.3, lx: 0, lz: 0 });
      }
    }
  }

  nearLand(i, j, r) {
    for (let dj = -r; dj <= r; dj += 2) for (let di = -r; di <= r; di += 2) {
      const ni = i + di, nj = j + dj;
      if (this.inBounds(ni, nj) && this.island[idx(ni, nj)] >= 0) return true;
    }
    return false;
  }

  // wysokość terenu w jednostkach sceny
  tileY(i, j) {
    if (!this.inBounds(i, j)) return -1;
    const k = idx(i, j);
    const t = this.type[k];
    if (t === T.BRIDGE) return 0.42;
    return heightToY(this.height[k], t);
  }
  groundHeight(x, z) {
    const t = toTile(x, z);
    return this.tileY(t.i, t.j);
  }

  // BFS po kafelkach lądu; zwraca odległości i rodziców
  bfs(si, sj, mask) {
    const dist = new Int32Array(W * H).fill(-1);
    const parent = new Int32Array(W * H).fill(-1);
    const s = idx(si, sj);
    dist[s] = 0;
    const q = [s];
    for (let h = 0; h < q.length; h++) {
      const c = q[h], ci = c % W, cj = (c / W) | 0;
      for (const [di, dj] of DIRS8) {
        const ni = ci + di, nj = cj + dj;
        if (!this.walkable(ni, nj)) continue;
        if (mask && !mask[idx(ni, nj)]) continue;
        // bez ścinania rogów po przekątnej
        if (di !== 0 && dj !== 0 && (!this.walkable(ci + di, cj) || !this.walkable(ci, cj + dj))) continue;
        const n = idx(ni, nj);
        if (dist[n] >= 0) continue;
        dist[n] = dist[c] + 1;
        parent[n] = c;
        q.push(n);
      }
    }
    return { dist, parent };
  }

  pathFrom(bfsRes, ti, tj) {
    const path = [];
    let c = idx(ti, tj);
    if (bfsRes.dist[c] < 0) return null;
    while (c >= 0 && bfsRes.dist[c] > 0) { path.push({ i: c % W, j: (c / W) | 0 }); c = bfsRes.parent[c]; }
    return path.reverse();
  }

  adjacentTo(i, j, pred) {
    for (const [di, dj] of DIRS4) {
      const ni = i + di, nj = j + dj;
      if (this.inBounds(ni, nj) && pred(this.type[idx(ni, nj)], ni, nj)) return { i: ni, j: nj };
    }
    return null;
  }

  addStructure(kind, i, j, owner) {
    const p = toWorld(i, j);
    const s = { id: this.nextId++, kind, i, j, x: p.x, z: p.z, owner, island: this.island[idx(i, j)], fuel: kind === 'campfire' ? 120 : 0 };
    this.structures.push(s);
    this.structuresChanged = true;
    return s;
  }
}

export function heightToY(h, t) {
  if (t === T.SEA) return Math.max(-2.5, h * 1.2) - 0.25;
  if (t === T.POND) return 0.15;
  return 0.25 + h * 0.75;
}
