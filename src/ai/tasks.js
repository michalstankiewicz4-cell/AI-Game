// Zadania (akcje) agenta: każde zwraca obiekt z trasą i funkcją act().
import { T, W, H, idx, toWorld, toTile, BRIDGE_COST } from '../world/world.js';
import { thought, urgent, eventLine } from './commentary.js';
import {
  FIRE_FUEL,
  PERSONAS, FOOD, RECIPES, RECIPE_NAMES, MATS, MAT_NAMES, comboKey, RECIPE_BY_COMBO, KIND_NAMES,
  STORES, SPEED, VIEW_RANGE, VIEW_NEAR, viewHalfAngle, wrapAng, INV_CAP, WEIGHT, clamp,
} from './data.js';

const BUILD = {
  campfire: ['🔥 Rozpala ognisko', 'rozpala ognisko 🔥', 5],
  shelter: ['🛖 Buduje szałas', 'stawia szałas 🛖', 9],
  tent: ['⛺ Rozbija namiot', 'rozbija namiot z gałęzi i liści ⛺', 6],
  workbench: ['🛠️ Robi stół', 'zbija stół rzemieślniczy 🛠️', 7],
  bed: ['🛏️ Robi łóżko', 'robi łóżko z desek, gałęzi i liści 🛏️', 7],
  chest: ['📦 Zbija skrzynię', 'zbija skrzynię na zapasy 📦', 6],
};

export const tasksMethods = {
  // ---------- zadania ----------
  taskDrink(spot) {
    return {
      urgent: true, path: this.pathTo(spot.i, spot.j), face: spot.water,
      act: (dt, t) => {
        this.thirst = clamp(this.thirst + 35 * dt, 0, 100);
        this.drankPond = true;
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
          if (k === 'cookedFish' || k === 'cookedMeat') this.joy = Math.min(30, this.joy + 6); // ciepły posiłek cieszy
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
        if (bush.removed || bush.berries <= 0 || this.full()) return 'done';
        if (t.elapsed > 1.3) {
          t.elapsed = 0; bush.berries--; this.inv.berries++; this.stats.berries++;
          this.world.changed.add(bush);
        }
        return null;
      },
    };
  },

  taskFish(spot) {
    if (!this.tools.rod) return null; // bez wędki nie da się łowić
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
            if (this.inv.rawFish >= 3 || this.full()) return 'done';
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
    const sh = this.nearestStructure(bfs, 'shelter') || this.nearestStructure(bfs, 'tent');
    const fi = this.nearestStructure(bfs, 'campfire');
    // łóżko: z ciekawości raz spróbuje, a potem wybiera je, bo wie, że lepiej się w nim śpi
    const bed = (this.known.has('bedRest') || !this.bedTried) && this.nearestStructure(bfs, 'bed');
    // dom z desek: postać, która wie, że pod dachem cieplej, wybiera najlepiej osłonięte pole
    let house = null;
    if (this.known.has('warmRoof') && this.world.pieces.length) {
      for (const p of this.world.pieces) {
        if (p.type !== 'floor' || p.lvl !== 0) continue;
        const d = bfs.dist[idx(p.i, p.j)];
        if (d < 0 || d > 30) continue;
        const s = this.world.shelterAt(p.i, p.j);
        if (s && s.warm >= 5 && (!house || s.warm > house.warm)) house = { i: p.i, j: p.j, d, warm: s.warm };
      }
    }
    if (bed && bed.d < 30) { target = bed; this.bedTried = true; }
    else if (house && (!sh || sh.d >= 30 || house.warm >= 6)) target = house;
    else if (sh && sh.d < 30) target = sh;
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

  // podsycenie ogniska (albo rozpalenie wygasłego): kłody palą się najdłużej, potem gałęzie, na końcu liście
  taskFeedFire(fire) {
    const spot = this.freeTileNear(fire.i, fire.j, this.bfsCache) || fire;
    const s = fire.s;
    return {
      path: this.pathTo(spot.i, spot.j), face: s, label: s.fuel > 0 ? '🪵 Podsyca ogień' : '🔥 Rozpala na nowo',
      act: (dt, t) => {
        if (t.elapsed < 2) return null;
        const out = !(s.fuel > 0);
        if (out) { // rozpałka: dwie gałęzie
          if (this.inv.sticks < 2) return 'fail';
          this.inv.sticks -= 2; s.fuel = 15;
          this.world.structuresChanged = true;
          this.say('rozpala wygasłe ognisko 🔥', 'info');
        }
        while (s.fuel < FIRE_FUEL.max - 20) {
          if (this.inv.logs > 0 && s.fuel < 80) { this.inv.logs--; s.fuel += FIRE_FUEL.logs; }
          else if (this.inv.sticks > 1) { this.inv.sticks--; s.fuel += FIRE_FUEL.sticks; }
          else if (this.inv.leaves > 0) { this.inv.leaves--; s.fuel += FIRE_FUEL.leaves; }
          else break;
        }
        s.fuel = Math.min(FIRE_FUEL.max, s.fuel);
        return 'done';
      },
    };
  },

  // ruszt zakłada się na palące się ognisko
  taskGrill(fire, cost) {
    const spot = this.freeTileNear(fire.i, fire.j, this.bfsCache) || fire;
    return {
      path: this.pathTo(spot.i, spot.j), face: fire.s, label: '🍢 Robi ruszt',
      act: (dt, t) => {
        if (t.elapsed < 4) return null;
        if (fire.s.grill) return 'done';
        for (const k in cost) if (this.inv[k] < cost[k]) return 'fail';
        for (const k in cost) this.inv[k] -= cost[k];
        fire.s.grill = true; this.world.structuresChanged = true;
        this.say('kładzie ruszt z patyków i kamieni nad ogniskiem 🍢', 'big');
        return 'done';
      },
    };
  },

  // weź ze składziku to, czego brakuje do celów
  taskTakeStash(st, want) {
    return {
      path: this.pathTo(st.i, st.j) || [], label: '📦 Bierze z zapasów',
      act: (dt, t) => {
        if (t.elapsed < 1.5) return null;
        const s = st.s; let got = 0;
        for (const k in want) {
          while (this.inv[k] < want[k] && s.items[k] > 0 && this.roomFor(1, WEIGHT[k])) { s.items[k]--; this.inv[k]++; got++; }
        }
        return got ? 'done' : 'fail';
      },
    };
  },

  // odłóż to, czego teraz nie potrzebuje: do znanego składziku albo na nową kupkę przy ognisku lub dachu
  taskStore(target, want) {
    return {
      path: target ? this.pathTo(target.i, target.j) || [] : [], label: '📦 Odkłada zapasy',
      act: (dt, t) => {
        if (t.elapsed < 1.5) return null;
        const s = this.stashHere();
        if (!s) return 'fail';
        this.rememberStruct(s);
        for (const k of MATS) {
          const n = Math.max(0, this.inv[k] - (want[k] || 0));
          if (n > 0) { this.inv[k] -= n; s.items[k] = (s.items[k] || 0) + n; }
        }
        // do skrzyni chowa też nadmiar jedzenia (przy sobie zostawia po 2 sztuki)
        if (s.kind === 'chest') for (const k in FOOD) {
          const n = Math.max(0, this.inv[k] - 2);
          if (n > 0) { this.inv[k] -= n; s.items[k] = (s.items[k] || 0) + n; }
        }
        return 'done';
      },
    };
  },

  // ucieczka przed dzikiem: kilka kafelków dalej, w przeciwną stronę
  taskFlee(b) {
    const w = this.world;
    const ang = Math.atan2(this.z - b.z, this.x - b.x);
    let target = null;
    for (let r = 8; r >= 3 && !target; r--) for (const da of [0, 0.5, -0.5, 1, -1]) {
      const t = toTile(this.x + Math.cos(ang + da) * r, this.z + Math.sin(ang + da) * r);
      if (w.walkable(t.i, t.j)) { const p = this.pathTo(t.i, t.j); if (p && p.length) { target = p; break; } }
    }
    return { urgent: true, flee: true, path: target || [], label: '🏃 Ucieka przed dzikiem', act: () => 'done' };
  },

  // polowanie na dzika: podejść i zaatakować (dalej walka toczy się odruchowo)
  taskHuntBoar(m) {
    const b = m.b;
    return {
      targetId: b.id, path: this.pathTo(m.i, m.j) || [], face: b, label: '🐗 Poluje na dzika',
      act: (dt, t) => {
        if (b.dead) return 'fail';
        if (Math.hypot(b.x - this.x, b.z - this.z) > 2.2) { if (t.elapsed > 6) return 'fail'; const p = this.pathTo(b.i, b.j); if (p && p.length) t.path = p; return null; }
        this.fightBoar = b;
        if (this.world.hurtBoar(b, (this.tools.sword ? 14 : 9) + this.skill.hunt * 4, this)) this.boarKilled();
        return 'done';
      },
    };
  },

  // wykuwanie miecza przy ogniu
  taskForgeSword(fire, cost) {
    const spot = this.freeTileNear(fire.i, fire.j, this.bfsCache) || fire;
    return {
      path: this.pathTo(spot.i, spot.j), face: fire.s, label: '⚒️ Kuje miecz',
      act: (dt, t) => {
        if (t.elapsed < 7) return null;
        for (const k in cost) if (this.inv[k] < cost[k]) return 'fail';
        for (const k in cost) this.inv[k] -= cost[k];
        this.tools.sword = true;
        this.say('wykuwa żelazny miecz 🗡️', 'big');
        this.joy = Math.min(30, this.joy + 10);
        return 'done';
      },
    };
  },

  taskWarm(fire) {
    const spot = this.freeTileNear(fire.i, fire.j, this.bfsCache) || fire;
    return {
      path: this.pathTo(spot.i, spot.j), face: fire.s, label: '🔥 Grzeje się', warm: true,
      act: (dt, t) => (this.bodyT >= 36.7 || t.elapsed > 30 ? 'done' : null),
    };
  },

  taskCook(fire) {
    const spot = this.freeTileNear(fire.i, fire.j, this.bfsCache) || fire;
    return {
      path: this.pathTo(spot.i, spot.j), face: fire.s, label: fire.s.grill ? '🍢 Smaży na ruszcie' : '🔥 Piecze',
      act: (dt, t) => {
        // na ruszcie szybciej i po dwie sztuki naraz
        if (t.elapsed < (fire.s.grill ? 1.4 : 2.5)) return null;
        if (!(fire.s.fuel > 0)) return 'fail';
        t.elapsed = 0;
        for (let n = fire.s.grill ? 2 : 1; n > 0; n--) {
          if (this.inv.rawMeat > 0) { this.inv.rawMeat--; this.inv.cookedMeat++; }
          else if (this.inv.rawFish > 0) { this.inv.rawFish--; this.inv.cookedFish++; }
        }
        return this.rawCount() === 0 ? 'done' : null;
      },
    };
  },

  taskCraft(tool, cost, msg, announce, produce) {
    const names = { rod: 'wędka', spear: 'włócznia', clothes: 'ubranie', shield: 'tarcza' };
    return {
      path: [], label: tool === 'clothes' ? '👕 Szyje ubranie' : tool ? '🔨 Majsterkuje' : produce.planks ? '🪚 Ciosa deski' : '🪢 Skręca linę',
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
      path: this.pathTo(spot.stand.i, spot.stand.j), label: BUILD[kind][0],
      face: toWorld(spot.i, spot.j),
      act: (dt, t) => {
        if (t.elapsed < BUILD[kind][2]) return null;
        for (const k in cost) if (this.inv[k] < cost[k]) return 'fail';
        if (w.res[idx(spot.i, spot.j)] || w.structures.some((s) => s.i === spot.i && s.j === spot.j)) return 'fail';
        for (const k in cost) this.inv[k] -= cost[k];
        this.rememberStruct(w.addStructure(kind, spot.i, spot.j, this.id));
        this.say(BUILD[kind][1], 'big');
        this.joy = Math.min(30, this.joy + 10);
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
        const logs = tree.kind === 'palm' ? 1 : 2, sticks = tree.kind === 'palm' ? 1 : 2, leaves = tree.kind === 'palm' ? 2 : 3;
        this.inv.logs += logs; this.inv.sticks += sticks; this.inv.leaves += leaves; this.stats.wood += logs; this.practice('chop');
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
        if (r.amount <= 0 || this.full()) return t.got ? 'done' : 'fail';
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
        return (t.got = (t.got || 0) + 1) >= 3 || this.full() ? 'done' : null;
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
        return (t.got = (t.got || 0) + 1) >= 4 || this.full() ? 'done' : null;
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
      if (w.pieces.some((p) => p.type !== 'wall' && p.lvl === 0 && Math.abs(p.i - i) + Math.abs(p.j - j) < 2)) continue; // nie na podłodze z desek
      if (bfs.dist[k] < 0) continue;
      const stand = w.adjacentTo(i, j, (tt, ni, nj) => w.walkable(ni, nj) && bfs.dist[idx(ni, nj)] >= 0 && !w.res[idx(ni, nj)]);
      if (stand) { best = { i, j, stand }; break; }
    }
    return best;
  },
};
