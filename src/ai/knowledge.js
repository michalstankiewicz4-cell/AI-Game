// Wiedza zdobywana metodą prób: ciekawość, eksperymenty, odkrywanie receptur.
import { T, W, H, idx, toWorld, toTile, BRIDGE_COST } from '../world/world.js';
import { thought, urgent, eventLine } from './commentary.js';
import {
  PERSONAS, FOOD, RECIPES, RECIPE_NAMES, MATS, MAT_NAMES, comboKey, RECIPE_BY_COMBO, KIND_NAMES,
  SPEED, VIEW_RANGE, VIEW_NEAR, viewHalfAngle, wrapAng, INV_CAP, clamp,
} from './data.js';

export const knowledgeMethods = {
  nextExperiment() {
    const have = MATS.filter((m) => this.inv[m] > 0);
    const fire = this.world.structures.some((s) => s.kind === 'campfire' && Math.hypot(s.x - this.x, s.z - this.z) < 3);
    const combos = [];
    const n = have.length;
    for (let a = 0; a < n; a++) {
      combos.push([have[a]]);
      for (let b = a + 1; b < n; b++) {
        combos.push([have[a], have[b]]);
        for (let c = b + 1; c < n; c++) combos.push([have[a], have[b], have[c]]);
      }
    }
    const keyOf = (c) => comboKey(c) + (c.includes('iron') && fire ? '@ogień' : '');
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

  taskExperiment(combo) {
    const names = combo.types.map((t) => MAT_NAMES[t]).join(' + ');
    return {
      path: [], label: `🧪 Próbuje: ${names}`,
      act: (dt, t) => {
        if (t.elapsed < 3.5) return null;
        const r = RECIPE_BY_COMBO.get(comboKey(combo.types));
        this.tried.add(combo.key);
        if (!r) {
          this.event('expFail', { what: names });
          return 'done';
        }
        if (r === 'ironTool' && !this.world.structures.some((s) => s.kind === 'campfire' && Math.hypot(s.x - this.x, s.z - this.z) < 3)) {
          this.speak('Ruda i gałąź... może w ogniu by się dało to wykuć?', true);
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
