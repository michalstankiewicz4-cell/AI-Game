// Świat: mapa kafelków, stałe, zapytania (teren, ścieżki, czas). Generowanie, mosty i przyroda są w osobnych modułach.
import { mulberry32 } from '../core/rng.js';
import { generateMethods } from './generate.js';
import { bridgesMethods } from './bridges.js';
import { natureMethods } from './nature.js';
import { boarMethods } from './boars.js';
import { piecesMethods } from './pieces.js';

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
export const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const DIRS8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

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
    // drogi ubite łopatą (1 = droga) i wydeptanie: ile razy postacie przeszły przez pole
    this.road = new Uint8Array(W * H);
    this.traffic = new Float32Array(W * H);
    this.resources = [];
    this.structures = []; // ogniska, szałasy
    this.fish = [];
    this.birds = [];
    this.events = []; // komunikaty do dziennika
    this.changed = new Set(); // zasoby do odświeżenia w renderze
    this.nextId = 1;
    this.initPieces();
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

  // ---------- klimat umiarkowany ----------
  // średnia dnia 7–21°C zmienia się z dnia na dzień (ciepłe i chłodne dni), w ciągu doby ±3–6°C,
  // najzimniej ok. 4:00, najcieplej ok. 15:00; wyżej jest chłodniej
  dayClimate(k) {
    const r = (n) => { const x = Math.sin((k + 1) * 127.1 + n * 311.7 + this.seed * 0.0137) * 43758.5453; return x - Math.floor(x); };
    return { mean: 14 + (r(1) * 2 - 1) * 7, amp: 3 + r(2) * 3 };
  }
  airTemp(i, j) {
    const t = this.time / DAY_LENGTH, k = Math.floor(t), f = t - k;
    const a = this.dayClimate(k), b = this.dayClimate(k + 1);
    const s = f * f * (3 - 2 * f); // płynne przejście między dniami
    const mean = a.mean + (b.mean - a.mean) * s, amp = a.amp + (b.amp - a.amp) * s;
    // krzywa dobowa: minimum o 4:00, maksimum o 15:00 (szybsze ocieplanie rano, wolniejsze stygnięcie wieczorem)
    const h = f * 24;
    const curve = h >= 4 && h < 15 ? -Math.cos((h - 4) / 11 * Math.PI) : Math.cos(((h - 15 + 24) % 24) / 13 * Math.PI);
    let T = mean + amp * curve;
    if (i != null && this.inBounds(i, j)) T -= Math.max(0, this.height[idx(i, j)] - 1) * 0.8;
    return T;
  }
  // krótki opis pogody na dziś (do dziennika i dla modelu)
  weatherWord(T) { return T < 5 ? 'mróz w powietrzu' : T < 10 ? 'zimno' : T < 15 ? 'chłodno' : T < 22 ? 'przyjemnie' : T < 27 ? 'ciepło' : 'upał'; }

  inBounds(i, j) { return i >= 0 && j >= 0 && i < W && j < H; }
  walkable(i, j) {
    if (!this.inBounds(i, j)) return false;
    const t = this.type[idx(i, j)];
    return t === T.SAND || t === T.GRASS || t === T.ROCK || t === T.BRIDGE;
  }

  addRoad(i, j) {
    const k = idx(i, j);
    if (this.road[k] || !this.walkable(i, j) || this.type[k] === T.BRIDGE) return false;
    this.road[k] = 1; this.roadCount = (this.roadCount || 0) + 1; this.roadChanged = true;
    return true;
  }

  removeResource(res) {
    const k = idx(res.i, res.j);
    if (this.res[k] === res) this.res[k] = null;
    res.removed = true;
    const n = this.resources.indexOf(res);
    if (n >= 0) this.resources.splice(n, 1);
    this.changed.add(res);
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
    const s = { id: this.nextId++, kind, i, j, x: p.x, z: p.z, owner, island: this.island[idx(i, j)], fuel: kind === 'campfire' ? 100 : 0, grill: false };
    if (kind === 'stash' || kind === 'chest') s.items = {};
    // grządka i doniczka: co rośnie (crop), etap, wzrost 0..1 i wilgoć ziemi 0..1
    if (kind === 'field') { s.stage = 'tilled'; s.growth = 0; s.berries = 0; s.crop = null; s.water = 0; }
    if (kind === 'planter') { s.stage = 'empty'; s.growth = 0; s.crop = null; s.water = 0; s.vessel = 'pot'; }
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

Object.assign(World.prototype, generateMethods, bridgesMethods, natureMethods, boarMethods, piecesMethods);
