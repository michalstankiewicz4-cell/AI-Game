// Mosty: wyszukiwanie najkrótszych przesmyków i budowa segment po segmencie.
import { W, H, T, idx, toWorld, toTile, DIRS4, DIRS8, BRIDGE_COST, BRIDGE_BUILD_TIME, heightToY } from './world.js';
import { makeNoise2D } from '../core/rng.js';

export const bridgesMethods = {
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
  },

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
  },

  bridgeBuilt(br) { return br.fromStart + br.fromEnd; },

  bridgeTotals() {
    let built = 0, total = 0;
    for (const br of this.bridges) { built += this.bridgeBuilt(br); total += br.tiles.length; }
    return { built, total };
  },

  // kafelek z którego buduje się następny segment od danej strony
  bridgeFrontier(br, side) {
    if (br.complete) return null;
    const len = br.tiles.length;
    if (side === 's') return br.fromStart === 0 ? br.start : br.tiles[br.fromStart - 1];
    return br.fromEnd === 0 ? br.end : br.tiles[len - br.fromEnd];
  },

  bridgeNext(br, side) {
    if (br.complete) return null;
    return side === 's' ? br.tiles[br.fromStart] : br.tiles[br.tiles.length - 1 - br.fromEnd];
  },

  addBridgeMaterials(br, planks, rope) { br.planks += planks; br.rope += rope; },

  canBuildSegment(br) { return !br.complete && br.planks >= BRIDGE_COST.planks && br.rope >= BRIDGE_COST.rope; },

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
  },
};
