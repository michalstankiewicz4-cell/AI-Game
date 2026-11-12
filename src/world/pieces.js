// Budowanie z pojedynczych desek: podłogi, ściany i skosy przyciągane do siatki kafelków.
// Każda deska ma nazwę, którą można zmienić; deski da się zdjąć i położyć gdzie indziej.
// Z takich elementów może (ale nie musi) powstać dom: gra liczy tylko, czy pole jest przykryte i obudowane.
import { T, idx } from './world.js';

export const PIECE_LH = 0.85;     // wysokość jednego poziomu (ściany)
export const PIECE_MAX_LVL = 2;   // poziomy 0..2
export const PIECE_TYPES = { floor: 'podłoga', wall: 'ściana', slope: 'skos' };
export const SIDES = ['N', 'E', 'S', 'W'];
export const SIDE_NAMES = { N: 'północna', E: 'wschodnia', S: 'południowa', W: 'zachodnia' };
const DIR = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };

// ściana leży na krawędzi kafelka; krawędź zapisujemy jednoznacznie (N albo W)
export function canonEdge(i, j, side) {
  if (side === 'S') return { i, j: j + 1, side: 'N' };
  if (side === 'E') return { i: i + 1, j, side: 'W' };
  return { i, j, side };
}
export function slotKey(p) {
  if (p.type === 'wall') { const e = canonEdge(p.i, p.j, p.side); return `w:${e.i}:${e.j}:${p.lvl}:${e.side}`; }
  return `${p.type[0]}:${p.i}:${p.j}:${p.lvl}`;
}

export const piecesMethods = {
  initPieces() {
    this.pieces = [];
    this.pieceSlots = new Map(); // slotKey -> deska
    this.pieceNextId = 1;
    this.pieceCount = { floor: 0, wall: 0, slope: 0 };
    this.piecesChanged = true; this.pieceVer = (this.pieceVer || 0) + 1;
  },

  land(i, j) { return this.walkable(i, j) && this.type[idx(i, j)] !== T.BRIDGE; },
  pieceAt(type, i, j, lvl, side) { return this.pieceSlots.get(slotKey({ type, i, j, lvl, side })) || null; },
  wallOn(i, j, side, lvl) { return this.pieceAt('wall', i, j, lvl, side); },
  anyWallAround(i, j, lvl) { return SIDES.some((s) => this.wallOn(i, j, s, lvl)); },
  pieceById(id) { return this.pieces.find((p) => p.id === id) || null; },

  // czy deskę da się położyć w tym miejscu (podpora, teren, wolne miejsce); zwraca powód odmowy albo null
  placeProblem(spec, ignore) {
    const { type, i, j, lvl } = spec;
    if (!PIECE_TYPES[type]) return 'nieznany rodzaj';
    if (!(lvl >= 0 && lvl <= PIECE_MAX_LVL)) return 'za wysoko';
    if (!this.inBounds(i, j)) return 'poza mapą';
    if (type !== 'floor' && type !== 'wall' && type !== 'slope') return 'nieznany rodzaj';
    if ((type === 'wall' || type === 'slope') && !SIDES.includes(spec.side)) return 'brak strony';
    const taken = this.pieceSlots.get(slotKey(spec));
    if (taken && taken !== ignore && taken !== spec) return 'tu już leży deska';
    const has = (t, a, b, l, s) => { const p = this.pieceAt(t, a, b, l, s); return p && p !== ignore; };
    const wallAround = (a, b, l) => SIDES.some((s) => has('wall', a, b, l, s));
    if (type === 'wall') {
      const [di, dj] = DIR[spec.side];
      if (!this.land(i, j) && !this.land(i + di, j + dj)) return 'nie ma na czym stanąć';
      if (lvl > 0 && !has('wall', i, j, lvl - 1, spec.side)) return 'pod spodem nie ma ściany';
      return null;
    }
    // podłoga i skos: na ziemi wolny ląd, wyżej oparte o ściany albo sąsiednią deskę na tym samym poziomie
    if (lvl === 0) {
      if (!this.land(i, j)) return 'tu nie ma lądu';
      const k = idx(i, j);
      if (this.res[k]) return 'coś tu rośnie albo leży';
      if (this.structures.some((s) => s.i === i && s.j === j)) return 'stoi tu inna budowla';
      return null;
    }
    if (wallAround(i, j, lvl - 1)) return null;
    for (const s of SIDES) {
      const [di, dj] = DIR[s];
      if (has('floor', i + di, j + dj, lvl) || has('slope', i + di, j + dj, lvl)) return null;
    }
    return 'nie ma podpory (potrzebna ściana pod spodem albo deska obok)';
  },

  placePiece(spec, by) {
    if (this.placeProblem(spec)) return null;
    const type = spec.type;
    this.pieceCount[type]++;
    const p = {
      id: this.pieceNextId++, kind: 'plank', type, i: spec.i, j: spec.j, lvl: spec.lvl, side: spec.side || null,
      name: (spec.name || '').trim().slice(0, 40) || `${PIECE_TYPES[type]} ${this.pieceCount[type]}`,
      by: by ? by.id : null, byName: by ? by.name : '', at: this.time,
    };
    if (type === 'wall') Object.assign(p, canonEdge(p.i, p.j, p.side));
    this.pieces.push(p);
    this.pieceSlots.set(slotKey(p), p);
    this.piecesChanged = true; this.pieceVer = (this.pieceVer || 0) + 1;
    return p;
  },

  // zdjęcie deski: nie wolno, jeśli coś się na niej opiera
  removeProblem(p) {
    for (const q of this.pieces) {
      if (q === p || Math.abs(q.i - p.i) > 2 || Math.abs(q.j - p.j) > 2 || q.lvl < p.lvl) continue;
      if (q.lvl === 0 && q.type !== 'wall') continue;
      if (this.placeProblem(q, p)) return `opiera się na niej ${q.name}`;
    }
    return null;
  },
  removePiece(p) {
    if (this.removeProblem(p)) return false;
    this.pieceSlots.delete(slotKey(p));
    const n = this.pieces.indexOf(p);
    if (n >= 0) this.pieces.splice(n, 1);
    this.piecesChanged = true; this.pieceVer = (this.pieceVer || 0) + 1;
    return true;
  },
  renamePiece(p, name) {
    const nm = String(name || '').trim().slice(0, 40);
    if (!nm) return false;
    p.name = nm;
    this.piecesChanged = true; this.pieceVer = (this.pieceVer || 0) + 1;
    return true;
  },

  // przykrycie pola: 1 = deska nad głową, 0.5 = niski skos na ziemi (da się tylko skulić), 0 = nic
  roofLevel(i, j) {
    let r = 0;
    for (let l = 1; l <= PIECE_MAX_LVL; l++) if (this.pieceAt('slope', i, j, l) || this.pieceAt('floor', i, j, l)) return 1;
    if (this.pieceAt('slope', i, j, 0)) r = 0.5;
    return r;
  },
  roofAt(i, j) { return this.roofLevel(i, j) >= 1; },
  // czy kafelek jest przykryty z góry i jak bardzo jest obudowany; wynik zapamiętany do następnej zmiany desek
  shelterAt(i, j) {
    if (!this.pieces.length) return null;
    if (this.shelterVer !== this.pieceVer) { this.shelterCache = new Map(); this.shelterVer = this.pieceVer; }
    const key = idx(i, j);
    if (this.shelterCache.has(key)) return this.shelterCache.get(key);
    const rl = this.roofLevel(i, j), roof = rl > 0;
    let walls = 0;
    for (const s of SIDES) if (this.wallOn(i, j, s, 0)) walls++;
    // na podłodze liczy się cały obwód pomieszczenia, a nie tylko ściany przy tym jednym polu
    let closed = walls / 4;
    if (this.pieceAt('floor', i, j, 0)) {
      const site = this.analyzeSite(i, j, 6);
      if (site && site.perim && site.floor.some((t) => t.i === i && t.j === j)) closed = Math.max(closed, site.walls / site.perim);
    }
    const res = !roof && closed === 0 ? null : { roof, walls, closed, warm: rl * 3 + closed * (roof ? 2.4 + rl * 1.6 : 2.4) };
    this.shelterCache.set(key, res);
    return res;
  },

  // analiza kształtu budowy wokół punktu: podłoga, obwód, brakujące ściany, nieprzykryte pola
  analyzeSite(ci, cj, r = 7) {
    const near = this.pieces.filter((p) => Math.abs(p.i - ci) <= r && Math.abs(p.j - cj) <= r);
    if (!near.length) return null;
    const floor = new Set(near.filter((p) => p.type === 'floor' && p.lvl === 0).map((p) => idx(p.i, p.j)));
    // największy spójny kawałek podłogi
    let best = [];
    const seen = new Set();
    for (const p of near) {
      if (p.type !== 'floor' || p.lvl !== 0 || seen.has(idx(p.i, p.j))) continue;
      const comp = [], q = [[p.i, p.j]]; seen.add(idx(p.i, p.j));
      while (q.length) {
        const [a, b] = q.pop(); comp.push({ i: a, j: b });
        for (const s of SIDES) { const k = idx(a + DIR[s][0], b + DIR[s][1]); if (floor.has(k) && !seen.has(k)) { seen.add(k); q.push([a + DIR[s][0], b + DIR[s][1]]); } }
      }
      if (comp.length > best.length) best = comp;
    }
    const all = near.map((p) => ({ i: p.i, j: p.j }));
    const box = (best.length ? best : all).reduce((b, t) => ({ i0: Math.min(b.i0, t.i), j0: Math.min(b.j0, t.j), i1: Math.max(b.i1, t.i), j1: Math.max(b.j1, t.j) }), { i0: 1e9, j0: 1e9, i1: -1e9, j1: -1e9 });
    const inFloor = new Set(best.map((t) => idx(t.i, t.j)));
    const missingWalls = [], unroofed = [];
    let perim = 0, walls = 0, roofed = 0;
    for (const t of best) {
      for (const s of SIDES) {
        const k = idx(t.i + DIR[s][0], t.j + DIR[s][1]);
        if (inFloor.has(k)) continue;
        perim++;
        if (this.wallOn(t.i, t.j, s, 0)) walls++; else missingWalls.push({ i: t.i, j: t.j, side: s });
      }
      if (this.roofAt(t.i, t.j)) roofed++; else unroofed.push({ i: t.i, j: t.j });
    }
    return { origin: { i: box.i0, j: box.j0 }, w: box.i1 - box.i0 + 1, h: box.j1 - box.j0 + 1, floor: best, perim, walls, missingWalls, roofed, unroofed, pieces: near };
  },

  // wolne miejsca, do których deska „przyskoczy”: wszystko, co dotyka istniejących desek, bez żadnej kolejności
  // (gdy budowy jeszcze nie ma: miejsca wokół wskazanego pola)
  snapSlots(ci, cj, limit = 8) {
    const near = this.pieces.filter((p) => Math.abs(p.i - ci) <= 7 && Math.abs(p.j - cj) <= 7);
    const key = `${this.pieceVer || 0}:${ci}:${cj}`;
    if (!this.slotCache || this.slotCache.key !== key) {
      const all = [], have = new Set();
      const push = (spec) => {
        const k = slotKey(spec);
        if (have.has(k)) return;
        have.add(k);
        if (!this.placeProblem(spec)) all.push(spec);
      };
      const around = (i, j, lvls) => {
        for (const [di, dj] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) for (const l of lvls) {
          if (l < 0 || l > PIECE_MAX_LVL) continue;
          const a = i + di, b = j + dj;
          push({ type: 'floor', i: a, j: b, lvl: l });
          for (const sd of SIDES) { push({ type: 'wall', i: a, j: b, lvl: l, side: sd }); push({ type: 'slope', i: a, j: b, lvl: l, side: sd }); }
        }
      };
      if (!near.length) around(ci, cj, [0]);
      for (const p of near) around(p.i, p.j, [p.lvl, p.lvl + 1]);
      this.slotCache = { key, all };
    }
    // losowa kolejność: żadne miejsce nie jest „podpowiadane”
    const out = this.slotCache.all.slice();
    for (let n = out.length - 1; n > 0; n--) { const k = Math.floor(Math.random() * (n + 1)); [out[n], out[k]] = [out[k], out[n]]; }
    return out.slice(0, limit);
  },

  // suma osłony na polach wokół miejsca (tyle, ile postać może odczuć, chodząc po budowie)
  shelterSum(ci, cj, r = 3) {
    let s = 0;
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { const x = this.shelterAt(ci + di, cj + dj); if (x) s += x.warm; }
    return s;
  },
};
