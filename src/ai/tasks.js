// Zadania (akcje) agenta: każde zwraca obiekt z trasą i funkcją act().
import { T, W, H, idx, toWorld, toTile, BRIDGE_COST } from '../world/world.js';
import { thought, urgent, eventLine } from './commentary.js';
import {
  FIRE_FUEL, FARM, CROPS, VESSELS, POCKET_CAP,
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
        const end = this.thirst >= 100 || t.elapsed > 4;
        // przy piciu postać czasem zauważa, że brzeg stawu jest gliniasty
        if (end && !this.known.has('clay') && Math.random() < 0.15) {
          this.known.add('clay'); this.inv.clay += 1;
          this.say('zauważa, że brzeg stawu jest śliski i gliniasty. Bierze grudkę gliny 🧱', 'learn');
        }
        return end ? 'done' : null;
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
        if (k === 'berries' && this.inv.seeds < POCKET_CAP.seeds && Math.random() < FARM.seedChance) {
          this.inv.seeds++;
          if (!this.known.has('seeds')) { this.known.add('seeds'); this.say('znajduje w jagodach pestki. Może to nasiona? 🌱', 'learn'); }
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
    const bow = !this.tools.spear && this.tools.bow && this.inv.arrows > 0;
    return {
      targetId: bird.id, path: this.pathTo(best.t.i, best.t.j), face: bird, label: bow ? '🏹 Poluje z łuku' : '🔱 Poluje',
      act: (dt, t) => {
        if (bird.dead || bird.state !== 'landed') return 'fail';
        if (t.elapsed < 0.8) return null;
        this.practice('hunt');
        // łuk: celniej, ale strzała czasem się gubi
        if (bow && Math.random() < 0.4) this.inv.arrows = Math.max(0, this.inv.arrows - 1);
        if (Math.random() < (bow ? 0.75 : 0.5) + 0.35 * this.skill.hunt) {
          this.world.catchBird(bird);
          this.inv.rawMeat++; this.inv.feathers += 2; this.stats.birds++;
          this.say(`upolował(a) ptaka${bow ? ' z łuku' : ''}! Mięso i pióra 🐦🪶`);
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
      const seen = new Set();
      for (const p of this.world.pieces) for (const [di, dj] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const i = p.i + di, j = p.j + dj, k = idx(i, j);
        if (seen.has(k)) continue;
        seen.add(k);
        const d = bfs.dist[k];
        if (d < 0 || d > 30) continue;
        const s = this.world.shelterAt(i, j);
        if (s && s.warm >= 5 && (!house || s.warm > house.warm)) house = { i, j, d, warm: s.warm };
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

  // pochodnie robi się przy ogniu; od palącego się ogniska od razu się zapalają, gdy jest ciemno
  taskMakeTorch(fire, cost, n = 2) {
    const spot = this.freeTileNear(fire.i, fire.j, this.bfsCache) || fire;
    return {
      path: this.pathTo(spot.i, spot.j), face: fire.s, label: '🔥 Robi pochodnię',
      act: (dt, t) => {
        if (t.elapsed < 3) return null;
        t.elapsed = 0;
        for (const k in cost) if (this.inv[k] < cost[k]) return t.made ? 'done' : 'fail';
        for (const k in cost) this.inv[k] -= cost[k];
        this.inv.torch++;
        t.made = (t.made || 0) + 1;
        if (t.made === 1) this.say('owija gałąź liśćmi i obwiązuje liną: pochodnia 🔥');
        return t.made >= n ? 'done' : null;
      },
    };
  },
  // po zmroku: podejść do ogniska i zapalić pochodnię (zapala się sama, gdy postać stoi przy ogniu)
  taskLightTorch(fire) {
    const spot = this.freeTileNear(fire.i, fire.j, this.bfsCache) || fire;
    return { path: this.pathTo(spot.i, spot.j), face: fire.s, label: '🔥 Zapala pochodnię', act: (dt, t) => (this.torchBurn > 0 || t.elapsed > 2 ? 'done' : null) };
  },

  // weź ze składziku to, czego brakuje do celów
  taskTakeStash(st, want) {
    return {
      path: this.pathTo(st.i, st.j) || [], label: '📦 Bierze z zapasów',
      act: (dt, t) => {
        if (t.elapsed < 1.5) return null;
        const s = st.s; let got = 0;
        for (const k in want) {
          while (this.inv[k] < want[k] && s.items[k] > 0 && this.roomFor(2, WEIGHT[k] + 1)) { s.items[k]--; this.inv[k]++; got++; }
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
        if (this.world.hurtBoar(b, (this.tools.sword ? 14 : 9) + this.skill.hunt * 4, this)) this.boarKilled(b);
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
    const names = { rod: 'wędka', spear: 'włócznia', clothes: 'ubranie', shield: 'tarcza', knife: 'nóż', hoe: 'motyka', bow: 'łuk', leather: 'ubranie ze skóry' };
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

  // ---------- rolnictwo, miska, skórowanie ----------
  // miejsce na grządkę: najchętniej obok innych grządek, na trawie bez zasobów i budowli
  fieldSpot() {
    const w = this.world, bfs = this.bfsCache;
    const fields = w.structures.filter((s) => s.kind === 'field' && this.knownStructs.has(s.id));
    const free = (i, j) => w.inBounds(i, j) && w.type[idx(i, j)] === T.GRASS && !w.res[idx(i, j)] && !w.structures.some((s) => s.i === i && s.j === j)
      && !w.pieces.some((p) => p.i === i && p.j === j) && bfs.dist[idx(i, j)] >= 0;
    for (const f of fields) for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const i = f.i + di, j = f.j + dj;
      if (free(i, j) && Math.hypot(i - this.i, j - this.j) < 20) return { i, j };
    }
    const b = this.buildSpot();
    return b ? { i: b.i, j: b.j } : null;
  },
  taskTill() {
    const spot = this.fieldSpot();
    if (!spot) return null;
    const w = this.world;
    return {
      path: this.pathTo(spot.i, spot.j), label: '🌾 Spulchnia ziemię motyką',
      act: (dt, t) => {
        if (t.elapsed < 5) return null;
        if (w.res[idx(spot.i, spot.j)] || w.structures.some((s) => s.i === spot.i && s.j === spot.j)) return 'fail';
        const f = w.addStructure('field', spot.i, spot.j, this.id);
        this.rememberStruct(f);
        this.say('przygotowuje grządkę pod sadzenie 🌾');
        return 'done';
      },
    };
  },
  // co posadzić: roślinę, której nasiona ma, a której najmniej rośnie w znanych grządkach i doniczkach
  pickCrop() {
    const have = Object.keys(CROPS).filter((c) => this.inv[CROPS[c].seed] > 0);
    if (!have.length) return null;
    const n = (c) => this.world.structures.filter((s) => s.crop === c && s.stage !== 'tilled' && s.stage !== 'empty' && this.knownStructs.has(s.id)).length;
    return have.sort((x, y) => n(x) - n(y))[0];
  },
  anySeeds() { return Object.values(CROPS).some((c) => this.inv[c.seed] > 0); },
  // sadzenie na grządce albo w pustej doniczce z ziemią
  taskPlant(f, crop = this.pickCrop()) {
    if (!crop) return null;
    const seed = CROPS[crop].seed;
    return {
      targetId: 'f' + f.id, path: this.pathTo(f.i, f.j), label: '🌱 Sadzi nasiona',
      act: (dt, t) => {
        if (t.elapsed < 2.5) return null;
        const free = f.kind === 'planter' ? f.stage === 'empty' : f.stage === 'tilled';
        if (!free || this.inv[seed] < 1) return 'fail';
        this.inv[seed]--; f.stage = 'planted'; f.growth = 0; f.planter = this.id; f.crop = crop;
        if (!this.known.has('farm')) this.speak('Wsadzę to nasionko do ziemi. Ciekawe, czy coś wyrośnie?', true);
        else this.say(`sadzi ${CROPS[crop].name} ${f.kind === 'planter' ? 'w doniczce 🪴' : 'na grządce 🌱'}`);
        return 'done';
      },
    };
  },
  taskHarvest(f) {
    return {
      targetId: 'f' + f.id, path: this.pathTo(f.i, f.j), label: '🧺 Zbiera plony',
      act: (dt, t) => {
        if (t.elapsed < 2.5) return null;
        if (f.stage !== 'ripe') return 'fail';
        const crop = CROPS[f.crop || 'berry'];
        const got = f.kind === 'planter' ? crop.pot : crop.yield;
        for (const k in got) {
          this.inv[k] += got[k];
          if (POCKET_CAP[k]) this.inv[k] = Math.min(this.inv[k], POCKET_CAP[k]);
        }
        if (got.berries) this.stats.berries += got.berries;
        f.berries = 0; f.stage = f.kind === 'planter' ? 'empty' : 'tilled'; f.growth = 0;
        this.joy = Math.min(30, this.joy + (got.flowers ? 12 : 8));
        if (!this.known.has('farm')) {
          this.known.add('farm');
          this.say(`odkrywa, że z nasion wyrasta ${crop.name}! 🌱🧠`, 'learn');
          this.event('discover', { what: 'uprawa' });
        } else this.say(`zbiera ${f.crop === 'rye' ? 'żyto' : f.crop === 'flower' ? 'kwiaty' : 'jagody'} ${f.kind === 'planter' ? 'z doniczki 🪴' : 'ze swojej grządki 🧺'}`);
        if (f.watered && !this.known.has('watering')) {
          this.known.add('watering');
          this.say('zauważa, że podlewana roślina rosła szybciej 💧🧠', 'learn');
        }
        f.watered = false;
        return 'done';
      },
    };
  },
  // podlewanie: woda z miski albo doniczki na grządkę lub do doniczki z rośliną
  waterVessel() { return VESSELS.find(([, full]) => this.inv[full] > 0) || null; },
  emptyVessels() { return VESSELS.reduce((t, [e]) => t + this.inv[e], 0); },
  taskWater(f) {
    return {
      targetId: 'w' + f.id, path: this.pathTo(f.i, f.j), label: '💧 Podlewa',
      act: (dt, t) => {
        if (t.elapsed < 2) return null;
        const v = this.waterVessel();
        if (!v || f.stage !== 'planted') return 'fail';
        this.inv[v[1]]--; this.inv[v[0]]++;
        f.water = 1; f.watered = true;
        if (!this.known.has('watering') && !t.said) this.speak(f.kind === 'planter' ? 'Ziemia w doniczce całkiem sucha. Dam jej trochę wody.' : 'Ta ziemia jest sucha. Może roślinie przyda się woda?', true);
        else if (Math.random() < 0.3) this.say(`podlewa ${f.kind === 'planter' ? 'doniczkę 🪴💧' : 'grządkę 💧'}`);
        return 'done';
      },
    };
  },
  taskFillBowl(spot) {
    return {
      path: this.pathTo(spot.i, spot.j), face: spot.water, label: '🥣 Nabiera wody',
      act: (dt, t) => {
        if (t.elapsed < 2) return null;
        if (this.emptyVessels() < 1) return 'fail';
        for (const [e, full] of VESSELS) { this.inv[full] += this.inv[e]; this.inv[e] = 0; }
        return 'done';
      },
    };
  },
  taskDrinkBowl() {
    return {
      urgent: true, path: [], label: '🥣 Pije z naczynia',
      act: (dt, t) => {
        if (t.elapsed < 1.5) return null;
        const v = this.waterVessel();
        if (!v) return 'fail';
        this.inv[v[1]]--; this.inv[v[0]]++;
        this.thirst = clamp(this.thirst + 40, 0, 100);
        return 'done';
      },
    };
  },
  // glina z brzegu stawu (na doniczki)
  taskClay(spot) {
    return {
      path: this.pathTo(spot.i, spot.j), face: spot.water, label: '🧱 Nabiera gliny',
      act: (dt, t) => {
        if (t.elapsed < 4) return null;
        this.inv.clay += 3;
        this.say('wykopuje glinę z brzegu stawu 🧱');
        return 'done';
      },
    };
  },
  // wypalanie doniczki z gliny w ognisku
  taskFirePot(fire) {
    const spot = this.freeTileNear(fire.i, fire.j, this.bfsCache) || fire;
    return {
      path: this.pathTo(spot.i, spot.j), face: fire.s, label: '🏺 Wypala doniczkę',
      act: (dt, t) => {
        if (t.elapsed < 5) return null;
        if (this.inv.clay < RECIPES.pot.clay || !(fire.s.fuel > 0)) return 'fail';
        this.inv.clay -= RECIPES.pot.clay; this.inv.pot++;
        this.say('lepi z gliny doniczkę i wypala ją w ognisku 🏺');
        return 'done';
      },
    };
  },
  // doniczka albo miska z ziemią i nasionami stawiana przy obozie
  potSpot(home) {
    const w = this.world, bfs = this.bfsCache;
    for (let r = 1; r < 5; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const i = home.i + di, j = home.j + dj;
      if (!w.walkable(i, j) || w.type[idx(i, j)] === T.BRIDGE || w.res[idx(i, j)] || bfs.dist[idx(i, j)] < 0) continue;
      if (w.structures.some((s) => s.i === i && s.j === j) || w.pieces.some((p) => p.i === i && p.j === j && p.type !== 'wall')) continue;
      return { i, j };
    }
    return null;
  },
  taskPotPlant(home, vessel, crop) {
    const spot = this.potSpot(home);
    if (!spot || !crop) return null;
    const seed = CROPS[crop].seed;
    const w = this.world;
    return {
      path: this.pathTo(spot.i, spot.j), label: vessel === 'pot' ? '🪴 Sadzi w doniczce' : '🪴 Sadzi w misce',
      act: (dt, t) => {
        if (t.elapsed > 2 && !t.soil) { t.soil = true; this.say(`nasypuje ziemi do ${vessel === 'pot' ? 'doniczki' : 'miski'} 🪴`); }
        if (t.elapsed < 5) return null;
        if (this.inv[vessel] < 1 || this.inv[seed] < 1 || w.structures.some((s) => s.i === spot.i && s.j === spot.j)) return 'fail';
        this.inv[vessel]--; this.inv[seed]--;
        const p = w.addStructure('planter', spot.i, spot.j, this.id);
        p.vessel = vessel; p.crop = crop; p.stage = 'planted'; p.planter = this.id;
        this.rememberStruct(p);
        this.say(`sadzi ${CROPS[crop].name} w ${vessel === 'pot' ? 'doniczce' : 'misce'} z ziemią 🌱`);
        return 'done';
      },
    };
  },
  // drogi: łopatą ubija wydeptane pola przy obozie; pień na drodze najpierw wyrywa
  roadSpot(home) {
    const w = this.world, bfs = this.bfsCache;
    let best = null;
    for (let dj = -22; dj <= 22; dj++) for (let di = -22; di <= 22; di++) {
      const i = home.i + di, j = home.j + dj;
      if (!w.inBounds(i, j)) continue;
      const k = idx(i, j);
      if (w.traffic[k] < 6 || w.road[k] || !w.walkable(i, j) || w.type[k] === T.BRIDGE || bfs.dist[k] < 0) continue;
      const r = w.res[k];
      if (r && !this.isStump(r)) continue;
      if (w.structures.some((s) => s.i === i && s.j === j) || w.pieces.some((p) => p.i === i && p.j === j)) continue;
      const s = Math.min(w.traffic[k], 40) - Math.hypot(di, dj) * 0.5 - bfs.dist[k] * 0.2;
      if (!best || s > best.s) best = { i, j, s, stump: r };
    }
    return best;
  },
  isStump(r) { return (r.kind === 'tree' || r.kind === 'palm') && r.growth < 0.5 && !r.removed; },
  taskRoad(spot) {
    const w = this.world;
    return {
      targetId: 'r' + idx(spot.i, spot.j), path: this.pathTo(spot.i, spot.j), label: '🛤️ Ubija drogę łopatą',
      act: (dt, t) => {
        if (t.elapsed < 3) return null;
        if (w.res[idx(spot.i, spot.j)] || !this.tools.shovel || !w.addRoad(spot.i, spot.j)) return 'fail';
        if (!t.said && !(w.roadBy && w.roadBy.has(this.id))) { (w.roadBy || (w.roadBy = new Set())).add(this.id); this.say('wyrównuje łopatą wydeptaną ścieżkę: będzie droga 🛤️'); }
        return 'done';
      },
    };
  },
  // wyrwanie pnia kilofem albo łopatą: kawałek drewna, ale drzewo już nie odrośnie
  taskUproot(tree) {
    const per = this.tools.shovel ? 3 : 5;
    return {
      targetId: tree.id, path: this.pathTo(tree.i, tree.j), face: tree, label: `🪵 Wyrywa pień ${this.tools.shovel ? 'łopatą' : 'kilofem'}`,
      act: (dt, t) => {
        if (tree.removed || !this.isStump(tree)) return 'fail';
        if (t.elapsed < per) return null;
        this.world.removeResource(tree);
        this.inv.logs += 1; this.stats.wood += 1;
        if (!this.uprooted) { this.uprooted = true; this.say('wyrywa pień z korzeniami. Kawałek drewna się przyda, ale tu już nic nie odrośnie 🪵'); }
        return 'done';
      },
    };
  },
  // dzikie żyto: kłosy dają ziarno do siewu
  taskRye(r) {
    return {
      targetId: r.id, path: this.pathTo(r.i, r.j), face: r, label: '🌾 Zbiera kłosy żyta',
      act: (dt, t) => {
        if (r.removed || r.ears <= 0 || this.inv.grain >= POCKET_CAP.grain) return 'done';
        if (t.elapsed > 1.5) {
          t.elapsed = 0; r.ears--; this.inv.grain = Math.min(POCKET_CAP.grain, this.inv.grain + 2);
          this.world.changed.add(r);
          if (!t.said) { t.said = true; this.say('wyłuskuje ziarno z kłosów żyta 🌾'); }
        }
        return null;
      },
    };
  },
  // kwiaty: cieszą, a czasem zostają z nich nasiona
  taskFlowers(r) {
    return {
      targetId: r.id, path: this.pathTo(r.i, r.j), face: r, label: '🌼 Zrywa kwiaty',
      act: (dt, t) => {
        if (r.removed || r.flowers <= 0 || this.inv.flowers >= POCKET_CAP.flowers) return 'done';
        if (t.elapsed > 1.2) {
          t.elapsed = 0; r.flowers--; this.inv.flowers++;
          this.joy = Math.min(30, this.joy + 4);
          if (Math.random() < 0.5) this.inv.flowerSeeds = Math.min(POCKET_CAP.flowerSeeds, this.inv.flowerSeeds + 1);
          this.world.changed.add(r);
          if (!t.said) { t.said = true; this.say('zrywa kwiaty. Ładnie pachną 🌼'); }
        }
        return null;
      },
    };
  },
  // upolowany dzik: nożem zdejmuje skórę i odcina mięso
  taskSkin(b) {
    return {
      targetId: 's' + b.id, path: this.pathTo(b.i, b.j) || [], label: '🔪 Skóruje dzika',
      act: (dt, t) => {
        if (t.elapsed < 4) return null;
        if (b.skinned || !b.dead) return 'fail';
        b.skinned = true; this.carcass = null;
        this.inv.rawMeat += 3; this.inv.hide += 1;
        this.say('skóruje dzika nożem: mięso i skóra 🔪');
        return 'done';
      },
    };
  },
  // rzecz robiona z ręki (miska, strzały): zużywa materiały i daje produkt
  taskMake(cost, produce, label, msg) {
    return {
      path: [], label,
      act: (dt, t) => {
        if (t.elapsed < 3.5) return null;
        for (const k in cost) if (this.inv[k] < cost[k]) return 'fail';
        for (const k in cost) this.inv[k] -= cost[k];
        for (const k in produce) this.inv[k] += produce[k];
        if (msg) this.say(msg);
        return 'done';
      },
    };
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
