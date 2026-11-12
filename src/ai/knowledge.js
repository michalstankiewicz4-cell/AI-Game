// Wiedza zdobywana metodą prób: ciekawość, eksperymenty, odkrywanie receptur.
import { T, W, H, idx, toWorld, toTile, BRIDGE_COST } from '../world/world.js';
import { thought, urgent, eventLine } from './commentary.js';
import {
  FIRE_RECIPES, BENCH_RECIPES, FIRE_COMBOS,
  PERSONAS, FOOD, RECIPES, RECIPE_NAMES, MATS, MAT_NAMES, comboKey, RECIPE_BY_COMBO, KIND_NAMES,
  SPEED, VIEW_RANGE, VIEW_NEAR, viewHalfAngle, wrapAng, INV_CAP, clamp,
} from './data.js';

export const knowledgeMethods = {
  // tryb „wie wszystko”: postać zaczyna z pełną wiedzą o recepturach, jedzeniu, zjawiskach i mapie świata
  knowAll() {
    const w = this.world;
    this.omniscient = true;
    for (const r of Object.keys(RECIPES)) this.known.add(r);
    for (const k of ['cook', 'bridge', 'warmFire', 'warmRoof', 'bedRest', 'boarDanger']) this.known.add(k);
    for (const k of Object.keys(FOOD)) this.edible.set(k, true);
    for (const k of Object.keys(KIND_NAMES)) this.triedKinds.add(k);
    this.saltKnown = true;
    this.drankPond = true;
    // zna też dobre kształty schronienia z desek: ściany wokół i przykrycie nad głową
    this.buildPref = { wall0: 1.2, floor0: 0.4, floor1: 1, slope1: 1, wall1: 0.3 };
    // mapa: wszystkie pola i zasoby, jakie są na starcie (zwierzęta i ryby się ruszają, więc tych nie zna)
    for (let k = 0; k < W * H; k++) {
      if (!this.seen[k]) { this.seen[k] = 1; this.seenCount++; }
      const r = w.res[k];
      if (r) {
        this.mem.set(r.id, { r, kind: r.kind, i: r.i, j: r.j, berries: r.berries, growth: r.growth, amount: r.amount, stone: r.stone, stand: r.stand, t: w.time });
        this.memByTile.set(k, r.id);
      }
    }
    for (const s of w.structures) this.knownStructs.add(s.id);
  },

  nextExperiment(at = null) {
    const have = MATS.filter((m) => this.inv[m] > 0);
    const fire = at ? at.fire : !!this.nearStructure('campfire', 3);
    const bench = at ? at.bench : !!this.nearStructure('workbench', 3);
    const combos = [];
    const n = have.length;
    for (let a = 0; a < n; a++) {
      combos.push([have[a]]);
      for (let b = a + 1; b < n; b++) {
        combos.push([have[a], have[b]]);
        for (let c = b + 1; c < n; c++) combos.push([have[a], have[b], have[c]]);
      }
    }
    // ta sama próba w innym miejscu (przy ogniu, przy stole) liczy się jako nowa, jeśli miejsce ma znaczenie
    // przy ogniu warto spróbować jeszcze raz tego, co z kamieniem albo rudą; przy stole wszystkiego, co z co najmniej dwóch rzeczy
    const keyOf = (c) => comboKey(c) + (fire && (c.includes('iron') || c.includes('stone') || FIRE_COMBOS.has(comboKey(c))) ? '@ogień' : '') + (bench && c.length >= 2 ? '@stół' : '');
    const fresh = combos.filter((c) => {
      const k = keyOf(c);
      if (this.tried.has(k)) return false;
      const r = RECIPE_BY_COMBO.get(k);
      return !(r && this.known.has(comboKey(c) === k ? r : RECIPE_BY_COMBO.get(comboKey(c))));
    });
    if (!fresh.length) return null;
    // ciekawość: preferuj mniejsze kombinacje i te z ogniem w pobliżu
    fresh.sort((x, y) => x.length - y.length + (Math.random() - 0.5) * 2.5);
    return { types: fresh[0], fire, key: keyOf(fresh[0]) };
  },

  taskExperiment(combo, path = []) {
    const names = combo.types.map((t) => MAT_NAMES[t]).join(' + ');
    return {
      path, label: `🧪 Próbuje: ${names}`,
      act: (dt, t) => {
        if (t.elapsed < 3.5) return null;
        const r = RECIPE_BY_COMBO.get(comboKey(combo.types));
        this.tried.add(combo.key);
        if (!r) {
          this.event('expFail', { what: names });
          return 'done';
        }
        if (FIRE_RECIPES.has(r) && !this.nearStructure('campfire', 3)) {
          this.speak({ ironTool: 'Ruda i gałąź... może w ogniu by się dało to wykuć?', sword: 'Ruda i deska... w ogniu dałoby się to wykuć?', torch: 'Gałąź owinięta liśćmi... gdyby ją tak podpalić?' }[r] || 'Kamienie i patyki... coś by z tego było nad ogniem.', true);
          return 'done';
        }
        if (BENCH_RECIPES.has(r) && !this.nearStructure('workbench', 3)) {
          this.speak('Coś mi tu świta, ale na kolanach tego nie zrobię. Przydałby się porządny stół.', true);
          return 'done';
        }
        if (r === 'planks' && !this.tools.axe) return 'done';
        this.learn(r);
        // od razu zrób, jeśli starcza materiałów (narzędzia i półprodukty)
        const cost = RECIPES[r];
        const enough = Object.keys(cost).every((k) => this.inv[k] >= cost[k]);
        if (enough && ['planks', 'rope', 'rod', 'spear'].includes(r)) {
          for (const k in cost) this.inv[k] -= cost[k];
          if (r === 'planks') this.inv.planks += 2;
          else if (r === 'rope') this.inv.rope += 1;
          else this.tools[r] = true;
        }
        return 'done';
      },
    };
  },

  learn(r, from) {
    if (this.known.has(r)) return false;
    this.known.add(r);
    this.joy = Math.min(30, this.joy + (from ? 5 : 15)); // odkrycie cieszy
    if (r === 'campfire') this.known.add('cook');
    const parts = Object.keys(RECIPES[r] || {}).map((k) => MAT_NAMES[k]).join(' + ');
    if (from) this.say(`uczy się od ${from.name}: ${parts} = ${RECIPE_NAMES[r]} 📖`, 'learn');
    else { this.say(`odkrywa recepturę: ${parts} = ${RECIPE_NAMES[r]}! 💡`, 'big'); this.event('discover', { what: RECIPE_NAMES[r] }); }
    return true;
  },

  taskInvestigate(m, bfs) {
    const r = m.r;
    let task;
    if (m.kind === 'tree' || m.kind === 'palm') task = this.taskChop(r);
    else if (m.kind === 'rock') task = this.taskStone(r);
    else if (m.kind === 'bush') task = this.taskBerries(r);
    else if (m.kind === 'seaweed') task = this.taskSeaweed({ r, d: 0 });
    else if (m.kind === 'mine') task = this.taskMine();
    if (!task) return null;
    task.label = `🔎 Bada ${KIND_NAMES[m.kind]}`;
    task.onEnd = (res) => {
      if (res !== 'done' || this.triedKinds.has(m.kind)) return;
      this.triedKinds.add(m.kind);
      const got = { tree: 'kłody i gałęzie', palm: 'kłodę i gałąź', rock: 'kamienie', bush: 'jagody (jadalne?)', seaweed: 'wodorosty', mine: 'kamień i może rudę' }[m.kind];
      this.say(`bada ${KIND_NAMES[m.kind]} i zdobywa: ${got} 🔎`, 'learn');
      if (m.kind === 'tree' || m.kind === 'palm') this.triedKinds.add(m.kind === 'tree' ? 'palm' : 'tree');
    };
    return task;
  },

  taskSaltWater(sea) {
    return {
      urgent: true, path: this.pathTo(sea.i, sea.j), face: sea.water, label: '🌊 Pije morską wodę',
      act: (dt, t) => {
        if (t.elapsed < 2) return null;
        this.health = clamp(this.health - 4, 0, 100);
        this.thirst = clamp(this.thirst - 3, 0, 100);
        this.saltKnown = true;
        this.event('saltWater');
        this.say('odkrywa, że morska woda nie gasi pragnienia 🧂', 'learn');
        return 'done';
      },
    };
  },
};
