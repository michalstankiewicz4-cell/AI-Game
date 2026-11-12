// Zadania (akcje) agenta: każde zwraca obiekt z trasą i funkcją act().
import { T, W, H, idx, toWorld, toTile, BRIDGE_COST } from '../world/world.js';
import { thought, urgent, eventLine } from './commentary.js';
import {
  PERSONAS, FOOD, RECIPES, RECIPE_NAMES, MATS, MAT_NAMES, comboKey, RECIPE_BY_COMBO, KIND_NAMES,
  SPEED, VIEW_RANGE, VIEW_NEAR, viewHalfAngle, wrapAng, INV_CAP, clamp,
} from './data.js';

export const tasksMethods = {
  // ---------- zadania ----------
  taskDrink(spot) {
    return {
      urgent: true, path: this.pathTo(spot.i, spot.j), face: spot.water,
      act: (dt, t) => {
        this.thirst = clamp(this.thirst + 35 * dt, 0, 100);
        return this.thirst >= 100 || t.elapsed > 4 ? 'done' : null;
      },
    };
  },

  taskEat() {
    // najpierw najlepsze jedzenie, ale bez marnowania
    const order = ['cookedMeat', 'cookedFish', 'berries', 'rawMeat', 'rawFish'];
    return {
      urgent: true, path: [],
      act: (dt, t) => {
        if (t.elapsed < 1.2) return null;
        const k = order.find((o) => this.inv[o] > 0 && this.edible.get(o) !== false);
        if (!k) return 'fail';
        this.inv[k]--;
        const first = !this.edible.has(k);
        const raw = k === 'rawFish' || k === 'rawMeat';
        if (raw && Math.random() < 0.25) {
          // surowe potrafi zaszkodzić
          this.hunger = clamp(this.hunger + FOOD[k].val * 0.5, 0, 100);
          this.health = clamp(this.health - 8, 0, 100);
          this.event('stomach');
        } else {
          this.hunger = clamp(this.hunger + FOOD[k].val, 0, 100);
          if (first) this.event('tasteGood', { food: FOOD[k].name });
        }
        if (first) { this.edible.set(k, true); this.say(`odkrywa, że ${FOOD[k].name} ${raw ? 'da się zjeść (ale lepiej upiec)' : 'jest jadalne'} 🧠`, 'learn'); }
        t.elapsed = 0;
        return this.hunger > 85 || this.foodStock() === 0 ? 'done' : null;
      },
    };
  },

  taskBerries(bush) {
    return {
      targetId: bush.id, path: this.pathTo(bush.i, bush.j), face: bush,
      act: (dt, t) => {
        if (bush.removed || bush.berries <= 0 || this.invTotal() >= INV_CAP) return 'done';
        if (t.elapsed > 1.3) {
          t.elapsed = 0; bush.berries--; this.inv.berries++; this.stats.berries++;
          this.world.changed.add(bush);
        }
        return null;
      },
    };
  },

  taskFish(spot) {
    const task = {
      fishSpot: spot, path: this.pathTo(spot.i, spot.j), face: spot.water, label: '🎣 Łowi ryby',
      act: (dt, t) => {
        t.tick = (t.tick || 0) + dt;
        if (t.tick >= 1) {
          t.tick = 0;
          const near = this.world.fishNear(spot.wx, spot.wz, 5);
          const p = Math.min(0.5, (0.05 + near.length * 0.08) * (1 + this.skill.fish));
          if (Math.random() < p) {
            if (near.length) this.world.catchFish(near[0]);
            this.inv.rawFish++; this.stats.fish++; t.caught = true; this.practice('fish');
            if (this.stats.fish === 1) { this.say('złowił(a) pierwszą rybę! 🐟'); this.event('firstFish'); }
            else if (Math.random() < 0.4) this.event('fish');
            if (this.inv.rawFish >= 3 || this.invTotal() >= INV_CAP) return 'done';
          }
        }
        if (t.elapsed > 14) {
          if (!t.caught) { this.badSpots.push({ i: spot.i, j: spot.j, t: this.world.time }); if (Math.random() < 0.5) this.event('noFish'); }
          return 'done';
        }
        return null;
      },
    };
    return task;
  },

  taskHunt(best) {
    const bird = best.b;
    return {
      targetId: bird.id, path: this.pathTo(best.t.i, best.t.j), face: bird, label: '🔱 Poluje',
      act: (dt, t) => {
        if (bird.dead || bird.state !== 'landed') return 'fail';
        if (t.elapsed < 0.8) return null;
        this.practice('hunt');
        if (Math.random() < 0.5 + 0.35 * this.skill.hunt) {
          this.world.catchBird(bird);
          this.inv.rawMeat++; this.stats.birds++;
          this.say('upolował(a) ptaka! 🐦');
          this.event('bird');
        } else {
          this.world.scareBird(bird);
          this.event('birdMiss');
        }
        return 'done';
      },
    };
  },

  taskSleep(bfs) {
    // śpij w szałasie lub przy ognisku jeśli blisko
    let target = null;
    const sh = this.nearestStructure(bfs, 'shelter');
    const fi = this.nearestStructure(bfs, 'campfire');
    if (sh && sh.d < 30) target = sh;
    else if (fi && fi.d < 30) target = this.freeTileNear(fi.i, fi.j, bfs) || fi;
    const path = target ? this.pathTo(target.i, target.j) : [];
    return {
      urgent: this.energy < 15, path: path || [], rest: true, label: '😴 Śpi',
      act: () => {
        this.asleep = true;
        if (this.thirst < 12 || this.hunger < 10) return 'done';
        if (this.energy >= 99) return 'done';
        if (!this.world.isNight() && this.energy > 75) return 'done';
        return null;
      },
    };
  },

  taskCook(fire) {
    const spot = this.freeTileNear(fire.i, fire.j, this.bfsCache) || fire;
    return {
      path: this.pathTo(spot.i, spot.j), face: fire.s, label: '🔥 Piecze',
      act: (dt, t) => {
        if (t.elapsed < 2.5) return null;
        t.elapsed = 0;
        if (this.inv.rawMeat > 0) { this.inv.rawMeat--; this.inv.cookedMeat++; }
        else if (this.inv.rawFish > 0) { this.inv.rawFish--; this.inv.cookedFish++; }
        return this.rawCount() === 0 ? 'done' : null;
      },
    };
  },

  taskCraft(tool, cost, msg, announce, produce) {
    const names = { rod: 'wędka', spear: 'włócznia' };
    return {
      path: [], label: tool ? '🔨 Majsterkuje' : produce.planks ? '🪚 Ciosa deski' : '🪢 Skręca linę',
      act: (dt, t) => {
        if (t.elapsed < (tool ? 4 : 2.5)) return null;
        t.elapsed = 0;
        for (const k in cost) if (this.inv[k] < cost[k]) return t.made ? 'done' : 'fail';
        for (const k in cost) this.inv[k] -= cost[k];
        if (tool) {
          this.tools[tool] = true;
          this.say(msg);
          this.event('craft', { item: names[tool] });
          return 'done';
        }
        for (const k in produce) this.inv[k] += produce[k];
        t.made = (t.made || 0) + 1;
        return t.made >= 2 ? 'done' : null;
      },
    };
  },

  taskForge(tool, fire) {
    const spot = this.freeTileNear(fire.i, fire.j, this.bfsCache) || fire;
    return {
      path: this.pathTo(spot.i, spot.j), face: fire.s, label: '⚒️ Kuje żelazo',
      act: (dt, t) => {
        if (t.elapsed < 6) return null;
        if (this.inv.iron < 2 || this.inv.sticks < 1) return 'fail';
        this.inv.iron -= 2; this.inv.sticks -= 1;
        this.tools[tool] = true;
        this.event('forge');
        this.say(`wykuwa ${tool === 'ironPick' ? 'żelazny kilof' : 'żelazną siekierę'} ⚒️`, 'big');
        return 'done';
      },
    };
  },

  taskBuild(kind, cost) {
    const w = this.world;
    // znajdź wolny kafelek trawy/piasku obok
    const spot = this.buildSpot();
    if (!spot) return null;
    return {
      path: this.pathTo(spot.stand.i, spot.stand.j), label: kind === 'campfire' ? '🔥 Rozpala ognisko' : '🛖 Buduje szałas',
      face: toWorld(spot.i, spot.j),
      act: (dt, t) => {
        if (t.elapsed < (kind === 'campfire' ? 5 : 9)) return null;
        for (const k in cost) if (this.inv[k] < cost[k]) return 'fail';
        if (w.res[idx(spot.i, spot.j)] || w.structures.some((s) => s.i === spot.i && s.j === spot.j)) return 'fail';
        for (const k in cost) this.inv[k] -= cost[k];
        this.rememberStruct(w.addStructure(kind, spot.i, spot.j, this.id));
        this.say(kind === 'campfire' ? 'rozpala ognisko 🔥' : 'stawia szałas 🛖', 'big');
        this.event(kind);
        return 'done';
      },
    };
  },

  taskChop(tree) {
    const per = (this.tools.ironAxe ? 1.2 : this.tools.axe ? 2.4 : 5) * (1 - 0.4 * this.skill.chop);
    return {
      targetId: tree.id, path: this.pathTo(tree.i, tree.j), face: tree, label: '🪓 Ścina drzewo',
      act: (dt, t) => {
        if (tree.removed || tree.growth < 1) return 'fail';
        if (t.elapsed < per * tree.wood) return null;
        // drzewo daje kłody i gałęzie
        const logs = tree.kind === 'palm' ? 1 : 2, sticks = tree.kind === 'palm' ? 1 : 2;
        this.inv.logs += logs; this.inv.sticks += sticks; this.stats.wood += logs; this.practice('chop');
        tree.wood = 0; tree.growth = 0; // zostaje pniak, odrośnie
        this.world.changed.add(tree);
        return 'done';
      },
    };
  },

  taskSeaweed(sw) {
    const r = sw.r;
    return {
      targetId: r.id, path: this.pathTo(r.stand.i, r.stand.j), face: r, label: '🌿 Zbiera wodorosty',
      act: (dt, t) => {
        if (r.amount <= 0 || this.invTotal() >= INV_CAP) return t.got ? 'done' : 'fail';
        if (t.elapsed < 1.6) return null;
        t.elapsed = 0; r.amount--; this.inv.seaweed++; t.got = true;
        this.world.changed.add(r);
        return null;
      },
    };
  },

  taskStone(rock) {
    const per = this.tools.ironPick ? 1.2 : this.tools.pickaxe ? 2.2 : 4.5;
    return {
      targetId: rock.id, path: this.pathTo(rock.i, rock.j), face: rock, label: '🪨 Rozbija skałę',
      act: (dt, t) => {
        if (rock.removed) return 'fail';
        if (t.elapsed < per) return null;
        t.elapsed = 0;
        rock.stone--; this.inv.stone++;
        this.world.changed.add(rock);
        if (rock.stone <= 0) { this.world.removeResource(rock); return 'done'; }
        return (t.got = (t.got || 0) + 1) >= 3 || this.invTotal() >= INV_CAP ? 'done' : null;
      },
    };
  },

  taskMine() {
    const m = this.world.mine;
    const per = this.tools.ironPick ? 2.5 : 4.5;
    return {
      path: this.pathTo(m.i, m.j), face: { x: m.x + 1, z: m.z - 1 }, label: '⛏️ Kopie w kopalni',
      act: (dt, t) => {
        if (t.elapsed < per) return null;
        t.elapsed = 0;
        m.depth++;
        if (this.inv.stone < 8) this.inv.stone++;
        this.practice('mine');
        if (Math.random() < 0.35 + 0.25 * this.skill.mine) {
          this.inv.iron++; this.stats.iron++;
          if (this.stats.iron === 1) { this.say('znalazł(a) rudę żelaza! ⛏️', 'big'); this.event('iron'); }
        }
        this.world.changed.add(m);
        return (t.got = (t.got || 0) + 1) >= 4 || this.invTotal() >= INV_CAP ? 'done' : null;
      },
    };
  },

  taskBridge(br, side) {
    const w = this.world;
    const fr = w.bridgeFrontier(br, side);
    const nextFace = () => { const n = w.bridgeNext(br, side); return n ? toWorld(n.i, n.j) : null; };
    return {
      path: this.pathTo(fr.i, fr.j), label: '🌉 Buduje most', face: nextFace(),
      act: (dt, t) => {
        if (br.complete) return 'done';
        if (this.inv.planks > 0 || this.inv.rope > 0) {
          this.stats.bridge += this.inv.planks;
          w.addBridgeMaterials(br, this.inv.planks, this.inv.rope); this.inv.planks = 0; this.inv.rope = 0;
        }
        const fr2 = w.bridgeFrontier(br, side);
        if (!fr2 || fr2.i !== this.i || fr2.j !== this.j) {
          // segment gotowy - przejdź na nowy front, jeśli jest jeszcze drewno
          if (fr2 && w.canBuildSegment(br) && w.walkable(fr2.i, fr2.j)) {
            t.path = [{ i: fr2.i, j: fr2.j }];
            t.face = nextFace();
            return null;
          }
          return 'done';
        }
        if (!w.canBuildSegment(br)) return 'done';
        if (w.workOnBridge(br, side, dt)) {
          if (br.complete) this.event('bridgeDone');
          else if (Math.random() < 0.5) this.speak(eventLine('bridge', { built: w.bridgeBuilt(br), total: br.tiles.length }));
        }
        return t.elapsed > 40 ? 'done' : null;
      },
    };
  },

  taskLook() {
    return {
      path: [], label: '👀 Rozgląda się', rest: true,
      act: (dt, t) => {
        if (t.elapsed === dt || !t.start) t.start = this.facing;
        this.facing = t.start + (t.elapsed / 3) * Math.PI * 2;
        if (t.elapsed >= 3) { this.see(true); this.lastLook = this.world.time; return 'done'; }
        return null;
      },
    };
  },

  taskExplore(bfs) {
    // idź na granicę znanego terenu, tam gdzie obok jest coś niewidzianego
    const w = this.world;
    let best = null;
    for (let n = 0; n < 400; n++) {
      const i = Math.floor(Math.random() * W), j = Math.floor(Math.random() * H);
      const k = idx(i, j);
      const d = bfs.dist[k];
      if (d < 4) continue;
      let unseen = 0;
      for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) {
        const ni = i + di, nj = j + dj;
        if (w.inBounds(ni, nj) && !this.seen[idx(ni, nj)]) unseen++;
      }
      if (!unseen) continue;
      const s = unseen * 1.5 - d * 0.5 + Math.random() * 6;
      if (!best || s > best.s) best = { i, j, s };
    }
    if (!best) return null;
    return {
      path: this.pathTo(best.i, best.j), label: '🧭 Bada teren',
      act: (dt, t) => {
        if (!t.start) t.start = this.facing || 0.001;
        this.facing = t.start + (t.elapsed / 3) * Math.PI * 2;
        if (t.elapsed >= 3) { this.see(true); this.lastLook = this.world.time; return 'done'; }
        return null;
      },
    };
  },

  taskWander(bfs) {
    const w = this.world;
    for (let tries = 0; tries < 20; tries++) {
      const i = this.i + Math.floor((Math.random() - 0.5) * 16), j = this.j + Math.floor((Math.random() - 0.5) * 16);
      if (w.inBounds(i, j) && bfs.dist[idx(i, j)] > 0) {
        return { path: this.pathTo(i, j), rest: true, label: '🚶 Spaceruje', act: (dt, t) => (t.elapsed > 1 ? 'done' : null) };
      }
    }
    return null;
  },

  taskRest() {
    return { path: [], rest: true, label: '🪑 Odpoczywa', act: (dt, t) => { this.energy = clamp(this.energy + 0.25 * dt, 0, 100); return t.elapsed > 6 ? 'done' : null; } };
  },

  buildSpot() {
    const w = this.world;
    const bfs = this.bfsCache;
    let best = null;
    for (let r = 1; r < 8 && !best; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const i = this.i + di, j = this.j + dj;
      if (!w.inBounds(i, j)) continue;
      const k = idx(i, j);
      if (w.type[k] !== T.GRASS && w.type[k] !== T.SAND) continue;
      if (w.res[k] || w.structures.some((s) => Math.abs(s.i - i) + Math.abs(s.j - j) < 2)) continue;
      if (bfs.dist[k] < 0) continue;
      const stand = w.adjacentTo(i, j, (tt, ni, nj) => w.walkable(ni, nj) && bfs.dist[idx(ni, nj)] >= 0 && !w.res[idx(ni, nj)]);
      if (stand) { best = { i, j, stand }; break; }
    }
    return best;
  },
};
