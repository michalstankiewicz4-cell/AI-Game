// Wiedza zdobywana metodą prób: ciekawość, eksperymenty, odkrywanie receptur.
import { T, W, H, idx, toWorld, toTile, BRIDGE_COST } from '../world/world.js';
import { thought, urgent, eventLine } from './commentary.js';
import {
  FIRE_RECIPES, BENCH_RECIPES, FIRE_COMBOS, KNIFE_RECIPES,
  PERSONAS, FOOD, RECIPES, RECIPE_NAMES, MATS, MAT_NAMES, comboKey, RECIPE_BY_COMBO, KIND_NAMES,
  SPEED, VIEW_RANGE, VIEW_NEAR, viewHalfAngle, wrapAng, INV_CAP, clamp,
} from './data.js';

export const knowledgeMethods = {
  // tryb „wie wszystko”: postać zaczyna z pełną wiedzą o recepturach, jedzeniu, zjawiskach i mapie świata
  knowAll() {
    const w = this.world;
    this.omniscient = true;
    for (const r of Object.keys(RECIPES)) this.known.add(r);
    for (const k of ['cook', 'bridge', 'warmFire', 'warmRoof', 'bedRest', 'boarDanger', 'seeds', 'farm', 'watering', 'clay', 'road']) this.known.add(k);
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
        this.mem.set(r.id, { r, kind: r.kind, i: r.i, j: r.j, berries: r.berries, growth: r.growth, amount: r.amount, stone: r.stone, ears: r.ears, flowers: r.flowers, stand: r.stand, t: w.time });
        this.memByTile.set(k, r.id);
      }
    }
    for (const s of w.structures) this.knownStructs.add(s.id);
  },

  // postać widzi u kogoś rzecz, której nie umie zrobić: przyglądając się, widzi, z czego jest zrobiona
  noticeIdea(r, by, held = false) {
    if (!r || !RECIPES[r] || this.known.has(r) || this.ideas.has(r) || this.omniscient) return;
    this.ideas.set(r, { t: this.world.time, by });
    const who = by != null && by !== this.id ? this.agentName(by) : null;
    const parts = Object.keys(RECIPES[r]).map((k) => MAT_NAMES[k]).join(', ');
    const thing = who ? (held ? `To, co ma w rękach ${who} (${RECIPE_NAMES[r]})` : `To, co postawił${this.fOf(by, '', 'a')} tu ${who} (${RECIPE_NAMES[r]})`) : `Ta rzecz (${RECIPE_NAMES[r]})`;
    const line = `${thing}... chyba zrobione z tego: ${parts}. Spróbuję tak samo!`;
    const say = Math.random() < this.reactFactors().chance;
    this.logReact('💡', `podpatruje: ${RECIPE_NAMES[r]}${who ? ` (${who})` : ''}`, say ? line : null, 'idea');
    if (say) this.speak(line, true);
    this.say(`podpatruje${who ? `, co ma ${who}` : ''}: ${RECIPE_NAMES[r]} 👀💡`, 'learn');
  },
  // podpatrzone, a jeszcze nieodkryte receptury
  openIdeas() { return [...this.ideas.keys()].filter((r) => !this.known.has(r)); },

  nextExperiment(at = null) {
    const have = MATS.filter((m) => this.inv[m] > 0);
    const now = this.world.time;
    for (const m of have) if (!this.matFirst.has(m)) this.matFirst.set(m, now);
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
    // najpierw to, co podpatrzył(a) u innych: ma wszystkie materiały, więc próbuje tak samo
    for (const r of this.openIdeas()) {
      const types = Object.keys(RECIPES[r]);
      if (!types.every((k) => this.inv[k] > 0)) continue;
      const key = keyOf(types);
      if (!this.tried.has(key)) return { types, fire, key, idea: r };
    }
    if (!fresh.length) return null;
    // ciekawość: preferuj mniejsze kombinacje i te z rzeczą, którą dopiero co zdobył(a)
    const isNew = (c) => c.some((m) => now - (this.matFirst.get(m) || 0) < 150);
    // krzemień iskrzy (postać to widziała, badając go): iskra + coś, co się pali, to dobry pomysł, póki nie zna ognia
    const spark = this.triedKinds.has('flint') && !this.known.has('campfire');
    const fiery = (c) => spark && c.includes('flint') && c.some((m) => m === 'sticks' || m === 'logs' || m === 'leaves');
    const bonus = (c) => (isNew(c) ? 1.2 : 0) + (fiery(c) ? 3 : 0);
    fresh.sort((x, y) => x.length - y.length - bonus(x) + bonus(y) + (Math.random() - 0.5) * 2.5);
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
          this.failStreak++;
          this.event('expFail', { what: names });
          return 'done';
        }
        if (FIRE_RECIPES.has(r) && !this.nearStructure('campfire', 3)) {
          this.speak({ ironTool: 'Ruda i gałąź... może w ogniu by się dało to wykuć?', sword: 'Ruda i deska... w ogniu dałoby się to wykuć?', torch: 'Gałąź owinięta liśćmi... gdyby ją tak podpalić?', pot: `Ulepił${this.f('em', 'am')} z gliny naczynie, ale się rozłazi. Może w ogniu by stwardniało?` }[r] || 'Kamienie i patyki... coś by z tego było nad ogniem.', true);
          return 'done';
        }
        if (BENCH_RECIPES.has(r) && !this.nearStructure('workbench', 3)) {
          this.speak('Coś mi tu świta, ale na kolanach tego nie zrobię. Przydałby się porządny stół.', true);
          return 'done';
        }
        if (KNIFE_RECIPES.has(r) && !this.tools.knife) {
          this.speak(r === 'bow' ? `Z tej kłody i liny wyszłoby coś sprężystego... gdybym miał${this.f('', 'a')} czym strugać.` : `Tę deskę dałoby się wydrążyć, gdybym miał${this.f('', 'a')} coś ostrego.`, true);
          return 'done';
        }
        if (r === 'planks' && !this.tools.axe) return 'done';
        this.learn(r);
        // od razu zrób, jeśli starcza materiałów (narzędzia i półprodukty)
        const cost = RECIPES[r];
        const enough = Object.keys(cost).every((k) => this.inv[k] >= cost[k]);
        if (enough && ['planks', 'rope', 'rod', 'spear', 'knife', 'hoe', 'bow', 'bowl', 'arrows', 'pot', 'shovel'].includes(r)) {
          for (const k in cost) this.inv[k] -= cost[k];
          if (r === 'planks') this.inv.planks += 2;
          else if (r === 'rope') this.inv.rope += 1;
          else if (r === 'bowl') this.inv.bowl += 1;
          else if (r === 'pot') this.inv.pot += 1;
          else if (r === 'arrows') this.inv.arrows += 4;
          else this.tools[r] = true;
        }
        return 'done';
      },
    };
  },

  learn(r, from) {
    if (this.known.has(r)) return false;
    this.known.add(r);
    this.failStreak = 0; // udało się: znów chce próbować
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
    else if (m.kind === 'rye') task = this.taskRye(r);
    else if (m.kind === 'flower') task = this.taskFlowers(r);
    else if (m.kind === 'seaweed') task = this.taskSeaweed({ r, d: 0 });
    else if (m.kind === 'mine') task = this.taskMine();
    else if (m.kind === 'flint') task = this.taskFlint(r);
    if (!task) return null;
    task.label = `🔎 Bada ${KIND_NAMES[m.kind]}`;
    task.onEnd = (res) => {
      if (res !== 'done' || this.triedKinds.has(m.kind)) return;
      this.triedKinds.add(m.kind);
      const got = { tree: 'kłody i gałęzie', palm: 'kłodę i gałąź', rock: 'kamienie', bush: 'jagody (jadalne?)', rye: 'ziarno z kłosów', flower: 'kwiaty i trochę nasion', seaweed: 'wodorosty', mine: 'kamień i może rudę', flint: 'krzemień: twardy, ostry, iskrzy, gdy uderzyć nim o kamień' }[m.kind];
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
