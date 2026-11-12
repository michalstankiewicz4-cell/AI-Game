// Mózg agenta: wybór działania na podstawie użyteczności (utility AI).
import { T, W, H, idx, toWorld, toTile, BRIDGE_COST } from '../world/world.js';
import { thought, urgent, eventLine } from './commentary.js';
import { llm } from './llm.js';
import { BUILD_LABEL } from './building.js';
import {
  PERSONAS, FOOD, RECIPES, RECIPE_NAMES, MATS, MAT_NAMES, comboKey, RECIPE_BY_COMBO, KIND_NAMES,
  SPEED, VIEW_RANGE, VIEW_NEAR, viewHalfAngle, wrapAng, INV_CAP, MAX_WEIGHT, WEIGHT, clamp,
  STORES,
} from './data.js';

export const decideMethods = {
  // ---------- decyzje ----------
  decide() {
    const w = this.world;
    const bfs = w.bfs(this.i, this.j, this.seen);
    this.bfsCache = bfs;
    // stare wspomnienia o ptakach i rybach blakną
    for (const [id, m] of this.memBirds) if (w.time - m.t > 45) this.memBirds.delete(id);
    this.memFish = this.memFish.filter((f) => w.time - f.t < 90);
    let unknownNeed = 0; // jak bardzo brakuje wiedzy o potrzebnych rzeczach
    const opts = [];
    const add = (score, label, make) => { if (score > 0) opts.push({ score, label, make }); };
    const crit = (v, lim) => (v < lim ? 0.9 : 0);
    const needCurve = (v) => Math.pow(1 - v / 100, 1.6);
    const distOf = (i, j) => bfs.dist[idx(i, j)];
    const taken = new Set(w.agents.filter((a) => a !== this && a.alive && a.task && a.task.targetId).map((a) => a.task.targetId));

    // --- woda ---
    if (this.thirst < 80) {
      const spot = this.nearestTile(bfs, w.pondShore);
      if (spot) add(needCurve(this.thirst) * 1.35 + crit(this.thirst, 25) - spot.d * 0.002, '💧 Pić wodę', () => this.taskDrink(spot));
      else {
        unknownNeed = Math.max(unknownNeed, needCurve(this.thirst) * 1.4 + 0.25);
        if (!this.saltKnown && this.thirst < 60) {
          const sea = this.nearestTile(bfs, w.seaShore);
          if (sea) add(needCurve(this.thirst) * 1.3 + 0.2 - sea.d * 0.003, '🌊 Napić się z morza', () => this.taskSaltWater(sea));
        }
      }
    }
    // --- jedzenie z ekwipunku ---
    if (this.hunger < 75 && this.foodStock() > 0) {
      add(needCurve(this.hunger) * 1.35 + crit(this.hunger, 25) + 0.05, '🍽️ Zjeść', () => this.taskEat());
    }
    // --- jedzenie schowane w skrzyni ---
    let pantry = null; // najbliższa znana skrzynia z jedzeniem
    for (const s of w.structures) {
      if (s.kind !== 'chest' || !this.knownStructs.has(s.id) || !s.items) continue;
      const food = Object.keys(FOOD).filter((k) => s.items[k] > 0 && this.edible.get(k) !== false);
      if (!food.length) continue;
      const d = distOf(s.i, s.j);
      if (d >= 0 && d < 40 && (!pantry || d < pantry.d)) pantry = { s, d, i: s.i, j: s.j, food, val: food.reduce((t, k) => t + s.items[k] * FOOD[k].val, 0) };
    }
    if (pantry && this.hunger < 70 && this.foodStock() === 0 && this.roomFor(1)) {
      const wantFood = {}; for (const k of pantry.food) wantFood[k] = this.inv[k] + 3;
      add(needCurve(this.hunger) * 1.25 + crit(this.hunger, 25) * 0.8 - pantry.d * 0.004, '🍱 Wziąć jedzenie ze skrzyni', () => this.taskTakeStash(pantry, wantFood));
    }
    // --- zdobywanie jedzenia ---
    const stock = this.foodStock();
    const foodNeed = needCurve(this.hunger) * 1.1 + crit(this.hunger, 20) * (stock > 0 ? 0 : 1) - Math.min(stock, 80) / 160;
    // zapas w skrzyni też się liczy: nie ma po co zbierać bez końca
    const reserve = stock + (pantry ? Math.min(pantry.val, 200) : 0);
    const stockWish = reserve < 50 && this.hunger > 40 ? 0.32 : reserve < 90 && this.hunger > 60 ? 0.12 : 0;
    const foodScore = Math.max(foodNeed, stockWish);
    if (!this.full() && foodScore > 0) {
      const nOpts = opts.length;
      const bush = this.nearestRes(bfs, (m) => m.kind === 'bush' && (m.berries > 0 || m.age > 60), taken);
      if (bush) add(foodScore * (this.edible.get('berries') ? 1 : 0.75) + (this.w.gather - 1) * 0.15 - bush.d * 0.004, '🫐 Zbierać jagody', () => this.taskBerries(bush.r));
      if (this.tools.rod) {
        const spot = this.bestFishingSpot(bfs);
        if (spot) add(foodScore * (spot.fish > 0 ? 1.05 : 0.55) + (this.w.fish - 1) * 0.15 - spot.d * 0.004, '🎣 Łowić ryby', () => this.taskFish(spot));
      }
      if (this.tools.spear) {
        let best = null;
        for (const m of this.memBirds.values()) {
          const b = m.b;
          if (taken.has(b.id) || b.dead) continue;
          const t = { i: m.i, j: m.j }; const d = distOf(t.i, t.j);
          if (d >= 0 && d < 30 && (!best || d < best.d)) best = { b, d, t };
        }
        if (best) add(foodScore * 1.1 + (this.w.hunt - 1) * 0.15 - best.d * 0.008, '🔱 Polować na ptaka', () => this.taskHunt(best));
      }
      // dzik: dużo mięsa, ale tylko z bronią i w dobrej formie
      if ((this.tools.sword || this.tools.spear) && this.health > 60) {
        let best = null;
        for (const [id, m] of this.memBoars) {
          if (m.b.dead || w.time - m.t > 40) { this.memBoars.delete(id); continue; }
          const d = distOf(m.i, m.j);
          if (d >= 0 && d < 30 && (!best || d < best.d)) best = { ...m, d };
        }
        if (best) add(foodScore * 1.15 + (this.tools.sword ? 0.1 : 0) + (this.w.hunt - 1) * 0.15 - best.d * 0.006, '🐗 Polować na dzika', () => this.taskHuntBoar(best));
      }
      if (opts.length === nOpts) unknownNeed = Math.max(unknownNeed, foodScore * 1.2);
      else if (!bush && foodScore > 0.4) unknownNeed = Math.max(unknownNeed, foodScore * 0.7); // tylko słabe opcje - warto poszukać jedzenia
    }
    // --- sen ---
    {
      const e = this.energy;
      let s = 0;
      if (e < 35) s = needCurve(e) * 1.5 + crit(e, 10);
      if (w.isNight() && e < 85) s = Math.max(s, 0.5 + (1 - e / 100) * 0.4);
      if (s > 0) add(s, '😴 Spać', () => this.taskSleep(bfs));
    }
    // --- ciepło ---
    const fire = this.nearestStructure(bfs, 'campfire');
    const cold = clamp((36.4 - this.bodyT) / 1.4, 0, 1); // 0 przy 36,4°C, 1 przy 35°C
    if (cold > 0 && this.known.has('warmFire') && fire && fire.d < 40 && !this.nearStructure('campfire', 2.6)) {
      add(cold * 1.3 + (this.bodyT < 35.3 ? 0.9 : 0) - fire.d * 0.004, '🔥 Ogrzać się przy ognisku', () => this.taskWarm(fire));
    }
    // --- gotowanie ---
    if (this.rawCount() > 0 && fire && fire.d < 40 && this.known.has('cook')) {
      add(0.42 + this.rawCount() * 0.05 + (this.hunger < 50 ? 0.15 : 0) - fire.d * 0.004, '🔥 Upiec jedzenie', () => this.taskCook(fire));
    }
    // --- rzemiosło (łańcuch: drzewo → kłody + gałęzie, kłoda → deski, wodorosty → lina) ---
    const inv = this.inv, tools = this.tools;
    const has = (cost) => Object.keys(cost).every((k) => inv[k] >= cost[k]);
    const K = (r) => this.known.has(r);
    const anyFire = this.nearestStructure(bfs, 'campfire', true); // także wygasłe
    const myFire = anyFire && anyFire.d < 25;
    const shelter = this.nearestStructure(bfs, 'shelter');
    const myShelter = shelter && shelter.d < 25;
    const tentN = this.nearestStructure(bfs, 'tent');
    const myRoof = myShelter || (tentN && tentN.d < 25);
    const bench = this.nearestStructure(bfs, 'workbench');
    const myBench = bench && bench.d < 30;
    const bedN = this.nearestStructure(bfs, 'bed');
    // --- ognisko się wypala: podsycić albo rozpalić na nowo ---
    if (myFire && anyFire.s.fuel < 50 && (inv.logs > 0 || inv.sticks > (anyFire.s.fuel > 0 ? 1 : 1) || inv.leaves > 0) && (anyFire.s.fuel > 0 || inv.sticks >= 2)) {
      const out = !(anyFire.s.fuel > 0);
      add(0.3 + (out ? 0.15 : 0.1 * (1 - anyFire.s.fuel / 50)) + (w.isNight() ? 0.15 : 0) + (K('warmFire') ? cold * 0.6 : 0) + (this.rawCount() ? 0.08 : 0) - anyFire.d * 0.004,
        out ? '🔥 Rozpalić ognisko na nowo' : '🪵 Podsycić ognisko', () => this.taskFeedFire(anyFire));
    }
    if (!tools.rod && K('rod') && has(RECIPES.rod)) add(0.62 * this.w.fish, '🎣 Zrobić wędkę', () => this.taskCraft('rod', RECIPES.rod, 'robi wędkę z gałęzi i liny 🎣', true));
    if (!tools.spear && K('spear') && has(RECIPES.spear)) add(0.58 * this.w.hunt, '🔱 Zrobić włócznię', () => this.taskCraft('spear', RECIPES.spear, 'robi włócznię 🔱', true));
    if (fire && fire.d < 30 && !fire.s.grill && K('grill') && has(RECIPES.grill)) add(0.36 + (this.rawCount() ? 0.08 : 0), '🍢 Zrobić ruszt', () => this.taskGrill(fire, RECIPES.grill));
    if (!myRoof && K('tent') && has(RECIPES.tent)) add(0.5 + (this.known.has('warmRoof') ? cold * 0.3 : 0) + (w.isNight() ? 0.1 : 0), '⛺ Rozbić namiot', () => this.taskBuild('tent', RECIPES.tent));
    if (!myBench && K('workbench') && has(RECIPES.workbench)) add(0.4, '🛠️ Zrobić stół rzemieślniczy', () => this.taskBuild('workbench', RECIPES.workbench));
    if (myRoof && !(bedN && bedN.d < 25) && K('bed') && has(RECIPES.bed)) add(0.42, '🛏️ Zrobić łóżko', () => this.taskBuild('bed', RECIPES.bed));
    const chestN = this.nearestStructure(bfs, 'chest');
    const myChest = chestN && chestN.d < 25;
    const stashes = w.structures.filter((s) => s.kind === 'stash' && this.knownStructs.has(s.id) && s.items && Object.values(s.items).some((v) => v > 0)).length;
    if (!myChest && (myFire || myRoof) && K('chest') && has(RECIPES.chest)) add(0.3 + Math.min(0.15, stashes * 0.05) + (this.invWeight() / MAX_WEIGHT > 0.6 ? 0.08 : 0), '📦 Zrobić skrzynię', () => this.taskBuild('chest', RECIPES.chest));
    // --- deski: polecenia modelu albo własne majsterkowanie przy obozie ---
    let plankOp = null;
    if (this.buildQueue.length && w.time - (this.buildQueueT || 0) < 120) {
      const cmd = this.buildQueue[0];
      add(0.55, BUILD_LABEL, () => this.taskPlank(cmd));
    } else {
      this.buildQueue.length = 0;
      if (K('planks') && (myFire || myRoof || myChest)) {
        plankOp = this.scriptBuildOp();
        if (plankOp && inv.planks >= 1) add(0.1 + 0.06 * this.w.build + Math.min(0.15, this.buildDrive() * 0.03) + (inv.planks >= 4 ? 0.04 : 0) - (w.isNight() ? 0.08 : 0), BUILD_LABEL, () => this.taskPlank(plankOp));
      }
    }
    // --- pochodnie: zrobić zapas przy ognisku, po zmroku zapalić ---
    if (K('torch') && fire && fire.d < 30) {
      if (inv.torch < 2 && has(RECIPES.torch)) add(0.3 + (w.daylight() < 0.5 ? 0.12 : 0), '🔥 Zrobić pochodnię', () => this.taskMakeTorch(fire, RECIPES.torch, 2 - inv.torch));
      if (inv.torch > 0 && !(this.torchBurn > 0) && w.daylight() < 0.35 && this.energy > 30 && fire.d > 2) add(0.34, '🔥 Zapalić pochodnię', () => this.taskLightTorch(fire));
    }
    const danger = K('boarDanger') ? 0.2 : 0;
    if (!tools.sword && K('sword') && has(RECIPES.sword) && fire && fire.d < 30) add(0.42 + danger, '🗡️ Wykuć miecz', () => this.taskForgeSword(fire, RECIPES.sword));
    if (!tools.shield && K('shield') && has(RECIPES.shield)) add(0.36 + danger, '🛡️ Zrobić tarczę', () => this.taskCraft('shield', RECIPES.shield, 'robi drewnianą tarczę 🛡️', true));
    if (!tools.clothes && K('clothes') && has(RECIPES.clothes)) add(0.42 + cold * 0.4, '👕 Uszyć ubranie', () => this.taskCraft('clothes', RECIPES.clothes, 'szyje ubranie z liści i liny 👕', true));
    if (!myFire && K('campfire') && has(RECIPES.campfire)) add(0.7 + (this.known.has('warmFire') ? cold * 0.5 : 0), '🔥 Rozpalić ognisko', () => this.taskBuild('campfire', RECIPES.campfire));
    if (myFire && !myShelter && K('shelter') && has(RECIPES.shelter)) add(0.45 + (this.known.has('warmRoof') ? cold * 0.3 : 0), '🛖 Zbudować szałas', () => this.taskBuild('shelter', RECIPES.shelter));
    if (fire && fire.d < 30 && K('ironTool') && has(RECIPES.ironTool)) {
      if (!tools.ironPick) add(0.5 * this.w.mine, '⛏️ Wykuć żelazny kilof', () => this.taskForge('ironPick', fire));
      else if (!tools.ironAxe) add(0.48, '🪓 Wykuć żelazną siekierę', () => this.taskForge('ironAxe', fire));
    }
    // lista życzeń: czego potrzebuję do celów
    const bridgesLeft = K('bridge') && w.bridges.some((br) => !br.complete);
    const want = { logs: 0, sticks: 0, leaves: 0, planks: 0, rope: 0, stone: 1, seaweed: 0 };
    const wish = (cost, mul = 1) => { for (const k in cost) if (k in want) want[k] += cost[k] * mul; };
    if (!tools.rod && K('rod')) wish(RECIPES.rod);
    if (!tools.spear && K('spear')) wish(RECIPES.spear);
    if (!myFire && K('campfire')) wish(RECIPES.campfire);
    else if (!myShelter && K('shelter')) wish(RECIPES.shelter);
    if (K('ironTool') && (!tools.ironPick || !tools.ironAxe)) want.sticks += 1;
    if (bridgesLeft) wish(BRIDGE_COST, Math.max(1, Math.round(2 * this.w.build)));
    if (!myRoof && K('tent') && !K('shelter')) wish(RECIPES.tent);
    if (!myBench && K('workbench')) wish(RECIPES.workbench);
    else if (myRoof && !(bedN && bedN.d < 25) && K('bed')) wish(RECIPES.bed);
    if (fire && !fire.s.grill && K('grill')) wish(RECIPES.grill);
    if (!tools.clothes && K('clothes')) wish(RECIPES.clothes);
    if (!tools.shield && K('shield')) wish(RECIPES.shield);
    if (!tools.sword && K('sword')) want.planks += 1;
    if (!myChest && (myFire || myRoof) && K('chest')) wish(RECIPES.chest);
    if (plankOp) want.planks += 2; // zapas desek na budowę
    if (K('torch') && inv.torch < 2) wish(RECIPES.torch);
    if (myFire) want.sticks += 2; // zapas na podsycanie ogniska
    // zapas do eksperymentów, dopóki są nieodkryte receptury
    if (Object.keys(RECIPES).some((r) => !K(r))) {
      want.logs = Math.max(want.logs, 1); want.sticks = Math.max(want.sticks, 2); want.stone = Math.max(want.stone, 1);
      if (this.triedKinds.has('tree') || this.triedKinds.has('palm')) want.leaves = Math.max(want.leaves, 1);
      if (K('rope')) want.rope = Math.max(want.rope, 1);
      if (K('planks')) want.planks = Math.max(want.planks, 1);
      if (this.triedKinds.has('seaweed') && !K('rope')) want.seaweed = Math.max(want.seaweed, 1);
    }
    // deski robi się z kłód, linę z wodorostów
    const missPlanks = Math.max(0, want.planks - inv.planks);
    const missRope = Math.max(0, want.rope - inv.rope);
    if (K('planks')) want.logs += Math.ceil(missPlanks / 2);
    if (K('rope')) want.seaweed += missRope * 2;
    const room = this.roomFor(3);
    // --- składziki: weź to, czego brakuje, albo odłóż nadmiar ---
    {
      let best = null;
      for (const s of w.structures) {
        if (!STORES.has(s.kind) || !this.knownStructs.has(s.id) || !s.items) continue;
        let gain = 0;
        for (const k in want) if (want[k] > inv[k] && s.items[k] > 0) gain += Math.min(s.items[k], want[k] - inv[k]);
        if (!gain) continue;
        const d = distOf(s.i, s.j);
        if (d >= 0 && d < 30 && (!best || gain - d * 0.1 > best.gain - best.d * 0.1)) best = { s, d, gain, i: s.i, j: s.j };
      }
      if (best && this.roomFor(1)) add(Math.min(0.56, 0.24 + best.gain * 0.05) - best.d * 0.003, '📦 Wziąć z zapasów', () => this.taskTakeStash(best, want));
      const load = this.invWeight() / MAX_WEIGHT;
      const extra = MATS.reduce((t, k) => t + Math.max(0, inv[k] - (want[k] || 0)) * WEIGHT[k], 0);
      if (load > 0.55 && extra > 3) {
        const home = fire || anyFire || shelter || tentN;
        // skrzynia wygrywa z kupką na ziemi (liczona jak bliższa o 8 kafelków)
        const st = [...w.structures].filter((s) => STORES.has(s.kind) && this.knownStructs.has(s.id)).map((s) => ({ s, d: distOf(s.i, s.j), i: s.i, j: s.j })).filter((x) => x.d >= 0 && x.d < (x.s.kind === 'chest' ? 28 : 20)).sort((a, b) => (a.d - (a.s.kind === 'chest' ? 8 : 0)) - (b.d - (b.s.kind === 'chest' ? 8 : 0)))[0];
        const target = st || (home && home.d < 25 ? home : null);
        add(0.22 + (load - 0.55) * 1.5 - (target ? target.d * 0.003 : 0), '📦 Odłożyć zapasy', () => this.taskStore(target, want));
      } else if (myChest && chestN.d < 8) {
        // przy skrzyni: schowaj nadmiar jedzenia i zbędne materiały
        const spare = Object.keys(FOOD).reduce((t, k) => t + Math.max(0, inv[k] - 2), 0) + (extra > 2 ? 2 : 0);
        if (spare >= 3) add(0.2 + Math.min(0.12, spare * 0.02), '📦 Odłożyć zapasy', () => this.taskStore(chestN, want));
      }
    }
    if (missPlanks > 0 && K('planks') && inv.logs >= 1 && tools.axe) add(0.46, '🪚 Ciosać deski', () => this.taskCraft(null, RECIPES.planks, null, false, { planks: 2 }));
    if (missRope > 0 && K('rope') && inv.seaweed >= 2) add(0.46, '🪢 Skręcić linę', () => this.taskCraft(null, RECIPES.rope, null, false, { rope: 1 }));
    const shortLogs = want.logs - inv.logs, shortSticks = want.sticks - inv.sticks, shortLeaves = want.leaves - inv.leaves;
    if ((shortLogs > 0 || shortSticks > 0 || shortLeaves > 0) && room) {
      const tree = this.nearestRes(bfs, (m) => (m.kind === 'tree' || m.kind === 'palm') && (m.growth >= 1 || m.age > 200), taken);
      const short = Math.max(shortLogs, shortSticks, Math.ceil(shortLeaves / 2));
      if (tree) add(Math.min(0.5, 0.18 + short * 0.04) - tree.d * 0.003, '🪓 Ścinać drzewo', () => this.taskChop(tree.r));
      else unknownNeed = Math.max(unknownNeed, 0.3);
    }
    if (want.seaweed > inv.seaweed && room) {
      const sw = this.nearestSeaweed(bfs, taken);
      if (sw) add(Math.min(0.48, 0.18 + (want.seaweed - inv.seaweed) * 0.04) - sw.d * 0.003, '🌿 Zbierać wodorosty', () => this.taskSeaweed(sw));
      else unknownNeed = Math.max(unknownNeed, 0.28);
    }
    if (inv.stone < want.stone && room) {
      const rock = this.nearestRes(bfs, (r) => r.kind === 'rock', taken);
      if (rock) add(Math.min(0.48, 0.15 + (want.stone - inv.stone) * 0.05) - rock.d * 0.003, '🪨 Zbierać kamienie', () => this.taskStone(rock.r));
      else unknownNeed = Math.max(unknownNeed, 0.25);
    }
    // --- pomysł na most: zna deski i linę, widzi wodę między wyspami ---
    if (!K('bridge') && K('planks') && K('rope') && w.bridges.length) {
      this.known.add('bridge');
      this.event('bridgeIdea');
      this.say('wpada na pomysł: most z desek i liny! 💡', 'learn');
    }
    // --- mosty ---
    if (K('bridge')) {
      let best = null;
      for (const br of w.bridges) {
        if (br.complete) continue;
        for (const side of ['s', 'e']) {
          const fr = w.bridgeFrontier(br, side);
          const d = distOf(fr.i, fr.j);
          if (d < 0) continue;
          const other = side === 's' ? br.end : br.start;
          const useful = distOf(other.i, other.j) < 0 ? 1 : 0.35; // czy most otworzy nową wyspę
          const s = useful - d * 0.004;
          if (!best || s > best.s) best = { br, side, fr, d, s, useful };
        }
      }
      if (best) {
        const scarcity = this.islandScarcity(this.island);
        const urge = (0.3 * this.w.build + scarcity * 0.25 + Math.min(0.15, (w.day() - 1) * 0.05)) * best.useful;
        if (has(BRIDGE_COST)) add(urge - best.d * 0.002, '🌉 Budować most', () => this.taskBridge(best.br, best.side));
        else if (w.canBuildSegment(best.br)) add(urge * 0.9 - best.d * 0.002, '🌉 Pomóc przy moście', () => this.taskBridge(best.br, best.side));
      }
    }
    // --- kopalnia ---
    if (w.mine && this.mem.has(w.mine.id) && this.triedKinds.has('mine')) {
      const d = distOf(w.mine.i, w.mine.j);
      // rudę liczy razem z tym, co ma w znanych składzikach, żeby nie kopać bez końca
      const stored = w.structures.reduce((t, s) => t + (STORES.has(s.kind) && this.knownStructs.has(s.id) && s.items ? (s.items.iron || 0) : 0), 0);
      const needIron = !tools.ironPick || !tools.ironAxe || (!tools.sword && K('sword'));
      if (d >= 0 && this.roomFor(3) && tools.pickaxe && inv.iron + stored < (needIron ? 6 : 2)) {
        const wantIron = needIron ? 1 : 0.3;
        add((0.22 + 0.12 * wantIron) * this.w.mine + (inv.stone < 2 ? 0.05 : 0) - d * 0.002, '⛏️ Kopać w kopalni', () => this.taskMine(d));
      }
    }
    // --- ciekawość: zbadaj nieznany rodzaj zasobu ---
    if (room) {
      let best = null;
      for (const m of this.mem.values()) {
        if (this.triedKinds.has(m.kind) || (taken && taken.has(m.r.id))) continue;
        if ((m.kind === 'bush' && m.berries <= 0) || ((m.kind === 'tree' || m.kind === 'palm') && m.growth < 1) || (m.kind === 'seaweed' && m.amount <= 0)) continue;
        const d = m.kind === 'seaweed' ? bfs.dist[idx(m.r.stand.i, m.r.stand.j)] : bfs.dist[idx(m.i, m.j)];
        if (d >= 0 && (!best || d < best.d)) best = { m, d };
      }
      if (best) add(0.34 + (w.day() <= 2 ? 0.08 : 0) - best.d * 0.004, `🔎 Zbadać ${KIND_NAMES[best.m.kind]}`, () => this.taskInvestigate(best.m, bfs));
    }
    // --- eksperymenty: łączenie materiałów ---
    {
      const combo = this.nextExperiment();
      const unknown = Object.keys(RECIPES).filter((r) => !this.known.has(r)).length;
      if (combo && unknown) add(0.26 + unknown * 0.02 + (this.hunger > 50 && this.thirst > 50 ? 0.08 : 0), '🧪 Eksperymentować', () => this.taskExperiment(combo));
      // przy stole rzemieślniczym wychodzą rzeczy, których nie da się zrobić na kolanach
      if (myBench && unknown && !this.nearStructure('workbench', 3)) {
        const at = this.nextExperiment({ fire: false, bench: true });
        if (at && at.key.includes('@stół')) add(0.3 + unknown * 0.02, '🧪 Eksperymentować przy stole', () => this.taskExperiment(at, this.pathTo(bench.i, bench.j) || []));
      }
    }
    // --- rozglądanie się i zwiad ---
    {
      const since = w.time - this.lastLook;
      if (since > 12) add(0.06 + Math.min(0.2, since / 600) + unknownNeed * 0.5, '👀 Rozejrzeć się', () => this.taskLook());
      const explored = this.seenCount / (W * H);
      add(0.08 + unknownNeed * 0.6 + (explored < 0.25 ? 0.12 : 0) + (w.day() <= 1 ? 0.05 : 0), '🧭 Zbadać okolicę', () => this.taskExplore(bfs));
    }
    // --- towarzystwo: odwiedź kogoś, by wymienić się wiedzą ---
    if (w.social && !w.isNight()) {
      let best = null;
      for (const m of this.memAgents.values()) {
        if (!m.a.alive || w.time - m.t > 60) continue;
        const key = Math.min(this.id, m.a.id) + ':' + Math.max(this.id, m.a.id);
        if ((w.social.cd.get(key) || -1e9) > w.time) continue;
        const d = distOf(m.i, m.j);
        if (d >= 0 && d < 30 && (!best || d < best.d)) best = { ...m, d };
      }
      if (best) add(0.16 + (this.seenCount < best.a.seenCount ? 0.06 : 0) - best.d * 0.003, `💬 Porozmawiać`, () => ({
        path: this.pathTo(best.i, best.j), label: `💬 Idzie do ${best.a.name}`, act: (dt, t) => (t.elapsed > 2 ? 'done' : null),
      }));
    }
    // --- odpoczynek / spacer ---
    add(0.05, '🚶 Pospacerować', () => this.taskWander(bfs));
    add(this.energy < 60 ? 0.1 : 0.02, '🪑 Odpocząć', () => this.taskRest());

    opts.sort((a, c) => c.score - a.score);
    this.scores = opts.slice(0, 6).map((o) => ({ label: o.label, score: o.score }));
    this.allLabels = opts.map((o) => o.label); // dla trybu pełnej swobody
    // tryb LLM: wybór modelu (jeśli świeży) wygrywa, chyba że lokalnie coś jest krytyczne
    let order = opts;
    this.llmDriven = false;
    if (this.llmPick) {
      const pick = this.llmPick; this.llmPick = null;
      const o = llm.decides && w.time - pick.at < 30 && opts.find((x) => x.label === pick.label);
      if (o && (o === opts[0] || opts[0].score < 1.1)) { order = [o, ...opts.filter((x) => x !== o)]; this.llmDriven = true; }
    }
    for (const o of order) {
      const task = o.make();
      if (task) {
        task.label = task.label || o.label;
        this.task = task;
        const changed = o.label !== this.lastLabel;
        this.lastLabel = o.label;
        // zapytaj model: w trybie decyzji przy każdej decyzji, w trybie rozmowy przy zmianie zajęcia
        let asked = false;
        if (llm.active && !this.llmDriven && (llm.decides || changed)) {
          const labels = llm.decides ? [o.label, ...opts.filter((x) => x !== o).slice(0, 5).map((x) => x.label)] : [o.label];
          asked = llm.ask(this, labels);
        }
        if (changed && !asked && !this.llmDriven && Math.random() < 0.55) this.speak(thought(o.label));
        return;
      }
    }
  },
};
