// Autonomiczny agent AI: potrzeby, ekwipunek, narzędzia i decyzje oparte na użyteczności (utility AI).
import { T, W, H, idx, toWorld, toTile, BRIDGE_COST } from './world.js';
import { thought, urgent, eventLine } from './commentary.js';

export const PERSONAS = [
  { name: 'Ada', role: 'Budowniczka', color: 0xe74c3c, w: { build: 1.5, fish: 0.9, gather: 1.0, mine: 0.8, hunt: 0.9 } },
  { name: 'Bruno', role: 'Rybak', color: 0x3498db, w: { build: 0.9, fish: 1.6, gather: 0.9, mine: 0.7, hunt: 0.8 } },
  { name: 'Celina', role: 'Zbieraczka', color: 0x2ecc71, w: { build: 1.0, fish: 0.8, gather: 1.5, mine: 0.7, hunt: 0.9 } },
  { name: 'Dawid', role: 'Górnik', color: 0xf1c40f, w: { build: 1.2, fish: 0.8, gather: 0.9, mine: 1.7, hunt: 0.8 } },
  { name: 'Ewa', role: 'Myśliwa', color: 0x9b59b6, w: { build: 1.0, fish: 0.9, gather: 0.9, mine: 0.8, hunt: 1.7 } },
  { name: 'Filip', role: 'Wszechstronny', color: 0xe67e22, w: { build: 1.1, fish: 1.1, gather: 1.1, mine: 1.1, hunt: 1.1 } },
];

export const FOOD = {
  berries: { val: 12, name: 'jagody' },
  rawFish: { val: 16, name: 'surowa ryba' },
  cookedFish: { val: 38, name: 'pieczona ryba' },
  rawMeat: { val: 20, name: 'surowe mięso' },
  cookedMeat: { val: 45, name: 'pieczone mięso' },
};

// przepisy rzemieślnicze
export const RECIPES = {
  planks: { logs: 1 },                        // toporkiem: 1 kłoda → 2 deski
  rope: { seaweed: 2 },                       // 2 wodorosty → 1 lina
  rod: { sticks: 2, rope: 1 },                // wędka
  spear: { sticks: 2, stone: 1, rope: 1 },    // włócznia
  campfire: { sticks: 3, logs: 1, stone: 4 }, // ognisko
  shelter: { logs: 2, planks: 4, rope: 2 },   // szałas
  ironTool: { iron: 2, sticks: 1 },           // żelazne narzędzie (przy ognisku)
};

export const ITEM_LABELS = {
  logs: '🪵 Kłody', sticks: '🥢 Gałęzie', planks: '🟫 Deski', seaweed: '🌿 Wodorosty', rope: '🪢 Lina',
  stone: '🪨 Kamień', iron: '⛏️ Ruda żelaza',
  berries: '🫐 Jagody', rawFish: '🐟 Ryba', cookedFish: '🍣 Piecz. ryba', rawMeat: '🍗 Mięso', cookedMeat: '🍖 Piecz. mięso',
};
export const TOOL_LABELS = {
  axe: '🪓 Siekiera', pickaxe: '⛏️ Kilof', rod: '🎣 Wędka', spear: '🔱 Włócznia', ironAxe: '🪓 Żel. siekiera', ironPick: '⛏️ Żel. kilof',
};

const SPEED = 2.6; // kafelki / s
// pole widzenia: im dalej, tym węższy stożek
export const VIEW_RANGE = 18;
export const VIEW_NEAR = 2.5; // tuż obok widzi dookoła
export function viewHalfAngle(d) { return d <= VIEW_NEAR ? Math.PI : Math.max(0.12, 1.25 * (1 - d / VIEW_RANGE)); }
const wrapAng = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const INV_CAP = 24;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Agent {
  constructor(world, persona, i, j, id) {
    this.world = world;
    this.id = id;
    this.name = persona.name;
    this.role = persona.role;
    this.color = persona.color;
    this.w = persona.w;
    const p = toWorld(i, j);
    this.x = p.x; this.z = p.z; this.i = i; this.j = j;
    this.facing = 0;
    this.hunger = 85; this.thirst = 80; this.energy = 90; this.health = 100;
    this.inv = { logs: 0, sticks: 0, planks: 0, seaweed: 0, rope: 0, stone: 0, iron: 0, berries: 2, rawFish: 0, cookedFish: 0, rawMeat: 0, cookedMeat: 0 };
    this.tools = { axe: true, pickaxe: true, rod: false, spear: false, ironAxe: false, ironPick: false };
    this.task = null;
    this.alive = true;
    this.asleep = false;
    this.scores = [];
    this.recheck = 0;
    this.stats = { wood: 0, fish: 0, birds: 0, berries: 0, bridge: 0, iron: 0, bornAt: world.time };
    this.anim = 0; // faza animacji pracy
    this.working = false;
    this.bubble = null; // { text, t }
    this.speakCd = 0;
    this.lastLabel = null;
    this.visited = new Set([world.island[idx(i, j)]]);
    // percepcja i pamięć
    this.seen = new Uint8Array(W * H);
    this.mem = new Map();        // id zasobu -> zapamiętany stan
    this.memByTile = new Map();  // kafelek -> id zasobu
    this.knownStructs = new Set();
    this.memBirds = new Map();   // id ptaka -> { b, i, j, t }
    this.memFish = [];           // { x, z, t } ostatnio widziane ryby
    this.skill = { fish: 0, hunt: 0, chop: 0, mine: 0 }; // doświadczenie 0..1
    this.badSpots = [];
    this.memAgents = new Map(); // id -> { a, i, j, t } gdzie ostatnio widział innych          // łowiska, gdzie nic nie brało
    this.visionT = 0;
    this.lastLook = -999;
    this.seenCount = 0;
    this.see(true, 9);
  }

  // ---------- percepcja ----------
  // aktualizuje pamięć o to, co agent widzi w swoim stożku widzenia (full = rozglądanie dookoła)
  see(full = false, range = VIEW_RANGE) {
    const w = this.world;
    const R = range, x0 = this.x, z0 = this.z;
    const i0 = Math.max(0, Math.floor(this.i - R)), i1 = Math.min(W - 1, Math.ceil(this.i + R));
    const j0 = Math.max(0, Math.floor(this.j - R)), j1 = Math.min(H - 1, Math.ceil(this.j + R));
    const visible = (dx, dz) => {
      const d = Math.hypot(dx, dz);
      if (d > R) return false;
      if (full || d <= VIEW_NEAR) return true;
      return Math.abs(wrapAng(Math.atan2(dx, dz) - this.facing)) <= viewHalfAngle(d);
    };
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const p = toWorld(i, j);
      if (!visible(p.x - x0, p.z - z0)) continue;
      const k = idx(i, j);
      if (!this.seen[k]) { this.seen[k] = 1; this.seenCount++; }
      const r = w.res[k];
      const old = this.memByTile.get(k);
      if (old !== undefined && (!r || r.id !== old)) { this.mem.delete(old); this.memByTile.delete(k); }
      if (r) {
        this.mem.set(r.id, { r, kind: r.kind, i: r.i, j: r.j, berries: r.berries, growth: r.growth, amount: r.amount, stone: r.stone, stand: r.stand, t: w.time });
        this.memByTile.set(k, r.id);
      }
    }
    for (const s of w.structures) if (!this.knownStructs.has(s.id) && visible(s.x - x0, s.z - z0)) this.knownStructs.add(s.id);
    for (const b of w.birds) {
      if (b.state === 'landed' && visible(b.x - x0, b.z - z0)) { const t = toTile(b.x, b.z); this.memBirds.set(b.id, { b, i: t.i, j: t.j, t: w.time }); }
      else if (b.state !== 'landed' && this.memBirds.has(b.id) && visible(b.x - x0, b.z - z0)) this.memBirds.delete(b.id);
    }
    for (const o of w.agents || []) if (o !== this && o.alive && visible(o.x - x0, o.z - z0)) this.memAgents.set(o.id, { a: o, i: o.i, j: o.j, t: w.time });
    for (const f of w.fish) if (visible(f.x - x0, f.z - z0)) this.memFish.push({ x: f.x, z: f.z, t: w.time });
    if (this.memFish.length > 60) this.memFish.splice(0, this.memFish.length - 60);
  }

  rememberStruct(s) { this.knownStructs.add(s.id); }
  practice(k) { this.skill[k] = Math.min(1, this.skill[k] + 0.05 * (1 - this.skill[k])); }

  // dymek nad głową + wpis w czacie komentarzy
  speak(text, force = false) {
    if (!text || !this.alive) return;
    if (!force && this.speakCd > 0) return;
    this.bubble = { text, t: 4.5 };
    this.speakCd = 6 + Math.random() * 6;
    if (this.world.onChat) this.world.onChat(this, text);
  }
  event(key, ctx) { this.speak(eventLine(key, ctx), true); }

  get island() { return this.world.island[idx(this.i, this.j)]; }

  foodStock() {
    let s = 0;
    for (const k in FOOD) s += this.inv[k] * FOOD[k].val;
    return s;
  }
  rawCount() { return this.inv.rawFish + this.inv.rawMeat; }
  invTotal() { let s = 0; for (const k in this.inv) s += this.inv[k]; return s; }

  say(text, kind) { this.world.log(`<b style="color:#${this.color.toString(16).padStart(6, '0')}">${this.name}</b>: ${text}`, kind); }

  // ---------- pętla ----------
  update(dt) {
    if (!this.alive) return;
    const w = this.world;
    this.speakCd -= dt;
    if (this.bubble && (this.bubble.t -= dt) <= 0) this.bubble = null;
    const isl = this.island;
    if (isl >= 0 && !this.visited.has(isl)) { this.visited.add(isl); this.event('newIsland'); this.say(`dociera na wyspę ${isl + 1}! 🏝️`, 'big'); }
    // spadek potrzeb
    const workMul = this.working ? 1.35 : 1;
    this.hunger = clamp(this.hunger - 0.26 * dt * workMul, 0, 100);
    this.thirst = clamp(this.thirst - 0.36 * dt * workMul, 0, 100);
    if (this.asleep) {
      const shelter = this.nearStructure('shelter', 1.5);
      const fire = this.nearStructure('campfire', 3);
      this.energy = clamp(this.energy + (1.1 + (shelter ? 0.9 : 0) + (fire ? 0.3 : 0)) * dt, 0, 100);
      this.hunger = clamp(this.hunger + 0.1 * dt, 0, 100); // sen spowalnia głód
      this.thirst = clamp(this.thirst + 0.12 * dt, 0, 100);
      if (shelter) this.health = clamp(this.health + 0.2 * dt, 0, 100);
    } else {
      this.energy = clamp(this.energy - 0.2 * dt * workMul, 0, 100);
    }
    // zdrowie
    let dmg = 0;
    if (this.hunger <= 0) dmg += 0.7;
    if (this.thirst <= 0) dmg += 1.0;
    if (this.energy <= 0) dmg += 0.3;
    if (dmg > 0) this.health -= dmg * dt;
    else if (this.hunger > 40 && this.thirst > 40 && this.energy > 25) this.health = clamp(this.health + 0.15 * dt, 0, 100);
    if (this.health <= 0) {
      this.health = 0; this.alive = false; this.task = null; this.asleep = false;
      const cause = this.thirst <= 0 ? 'z pragnienia' : this.hunger <= 0 ? 'z głodu' : 'z wycieńczenia';
      this.say(`💀 umiera ${cause} (dzień ${w.day()})`, 'death');
      this.bubble = { text: '...', t: 3 };
      const other = w.agents.find((a) => a.alive);
      if (other) other.event('death', { name: this.name });
      return;
    }

    // przerwanie zadania gdy pojawi się pilna potrzeba
    this.recheck -= dt;
    if (this.task && this.recheck <= 0) {
      this.recheck = 1.5;
      if (!this.task.urgent && (this.thirst < 18 || this.hunger < 15 || this.energy < 8)) {
        this.task = null;
        this.speak(urgent(this.thirst < 18 ? 'thirst' : this.hunger < 15 ? 'hunger' : 'energy'), true);
      }
    }
    if (!this.task) this.decide();
    if (this.task) this.runTask(dt);
    // wzrok (śpiący nie widzi)
    this.visionT -= dt;
    if (this.visionT <= 0 && !this.asleep) { this.visionT = 0.3; this.see(false); }
  }

  runTask(dt) {
    const t = this.task;
    this.working = false;
    if (t.path && t.path.length) {
      this.asleep = false;
      const next = t.path[0];
      // ścieżka mogła się zablokować
      if (!this.world.walkable(next.i, next.j)) { this.task = null; return; }
      const p = toWorld(next.i, next.j);
      const dx = p.x - this.x, dz = p.z - this.z, d = Math.hypot(dx, dz);
      const step = SPEED * dt * (this.energy < 15 ? 0.6 : 1);
      if (d <= step) {
        this.x = p.x; this.z = p.z; this.i = next.i; this.j = next.j;
        t.path.shift();
      } else {
        this.x += dx / d * step; this.z += dz / d * step;
        this.facing = Math.atan2(dx, dz);
        const tt = toTile(this.x, this.z);
        if (this.world.walkable(tt.i, tt.j)) { this.i = tt.i; this.j = tt.j; }
      }
      return;
    }
    if (t.face) this.facing = Math.atan2(t.face.x - this.x, t.face.z - this.z);
    t.elapsed = (t.elapsed || 0) + dt;
    this.working = !t.rest;
    this.anim += dt;
    const r = t.act(dt, t);
    if (r === 'done' || r === 'fail') {
      if (t.onEnd) t.onEnd(r);
      this.task = null;
      this.working = false;
      this.asleep = false;
    }
  }

  nearStructure(kind, r) {
    return this.world.structures.find((s) => s.kind === kind && Math.hypot(s.x - this.x, s.z - this.z) <= r);
  }

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
      else unknownNeed = Math.max(unknownNeed, needCurve(this.thirst) * 1.4 + 0.25);
    }
    // --- jedzenie z ekwipunku ---
    if (this.hunger < 75 && this.foodStock() > 0) {
      add(needCurve(this.hunger) * 1.35 + crit(this.hunger, 25) + 0.05, '🍽️ Zjeść', () => this.taskEat());
    }
    // --- zdobywanie jedzenia ---
    const stock = this.foodStock();
    const foodNeed = needCurve(this.hunger) * 1.1 + crit(this.hunger, 20) * (stock > 0 ? 0 : 1) - Math.min(stock, 80) / 160;
    const stockWish = stock < 50 && this.hunger > 40 ? 0.32 : stock < 90 && this.hunger > 60 ? 0.12 : 0;
    const foodScore = Math.max(foodNeed, stockWish);
    if (this.invTotal() < INV_CAP && foodScore > 0) {
      const nOpts = opts.length;
      const bush = this.nearestRes(bfs, (m) => m.kind === 'bush' && (m.berries > 0 || m.age > 60), taken);
      if (bush) add(foodScore + (this.w.gather - 1) * 0.15 - bush.d * 0.004, '🫐 Zbierać jagody', () => this.taskBerries(bush.r));
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
      if (opts.length === nOpts) unknownNeed = Math.max(unknownNeed, foodScore * 1.2);
    }
    // --- sen ---
    {
      const e = this.energy;
      let s = 0;
      if (e < 35) s = needCurve(e) * 1.5 + crit(e, 10);
      if (w.isNight() && e < 85) s = Math.max(s, 0.5 + (1 - e / 100) * 0.4);
      if (s > 0) add(s, '😴 Spać', () => this.taskSleep(bfs));
    }
    // --- gotowanie ---
    const fire = this.nearestStructure(bfs, 'campfire');
    if (this.rawCount() > 0 && fire && fire.d < 40) {
      add(0.42 + this.rawCount() * 0.05 + (this.hunger < 50 ? 0.15 : 0) - fire.d * 0.004, '🔥 Upiec jedzenie', () => this.taskCook(fire));
    }
    // --- rzemiosło (łańcuch: drzewo → kłody + gałęzie, kłoda → deski, wodorosty → lina) ---
    const inv = this.inv, tools = this.tools;
    const has = (cost) => Object.keys(cost).every((k) => inv[k] >= cost[k]);
    const myFire = fire && fire.d < 25;
    const shelter = this.nearestStructure(bfs, 'shelter');
    const myShelter = shelter && shelter.d < 25;
    if (!tools.rod && has(RECIPES.rod)) add(0.62 * this.w.fish, '🎣 Zrobić wędkę', () => this.taskCraft('rod', RECIPES.rod, 'robi wędkę z gałęzi i liny 🎣', true));
    if (!tools.spear && has(RECIPES.spear)) add(0.58 * this.w.hunt, '🔱 Zrobić włócznię', () => this.taskCraft('spear', RECIPES.spear, 'robi włócznię 🔱', true));
    if (!myFire && has(RECIPES.campfire)) add(0.7, '🔥 Rozpalić ognisko', () => this.taskBuild('campfire', RECIPES.campfire));
    if (myFire && !myShelter && has(RECIPES.shelter)) add(0.45, '🛖 Zbudować szałas', () => this.taskBuild('shelter', RECIPES.shelter));
    if (fire && fire.d < 30 && has(RECIPES.ironTool)) {
      if (!tools.ironPick) add(0.5 * this.w.mine, '⛏️ Wykuć żelazny kilof', () => this.taskForge('ironPick', fire));
      else if (!tools.ironAxe) add(0.48, '🪓 Wykuć żelazną siekierę', () => this.taskForge('ironAxe', fire));
    }
    // lista życzeń: czego potrzebuję do celów
    const bridgesLeft = w.bridges.some((br) => !br.complete);
    const want = { logs: 0, sticks: 0, planks: 0, rope: 0, stone: 1, seaweed: 0 };
    const wish = (cost, mul = 1) => { for (const k in cost) if (k in want) want[k] += cost[k] * mul; };
    if (!tools.rod) wish(RECIPES.rod);
    if (!tools.spear) wish(RECIPES.spear);
    if (!myFire) wish(RECIPES.campfire);
    else if (!myShelter) wish(RECIPES.shelter);
    if (tools.ironPick === false || tools.ironAxe === false) want.sticks += 1;
    if (bridgesLeft) wish(BRIDGE_COST, Math.max(1, Math.round(2 * this.w.build)));
    // deski robi się z kłód, linę z wodorostów
    const missPlanks = Math.max(0, want.planks - inv.planks);
    const missRope = Math.max(0, want.rope - inv.rope);
    want.logs += Math.ceil(missPlanks / 2);
    want.seaweed += missRope * 2;
    const room = this.invTotal() < INV_CAP;
    if (missPlanks > 0 && inv.logs >= 1 && tools.axe) add(0.46, '🪚 Ciosać deski', () => this.taskCraft(null, RECIPES.planks, null, false, { planks: 2 }));
    if (missRope > 0 && inv.seaweed >= 2) add(0.46, '🪢 Skręcić linę', () => this.taskCraft(null, RECIPES.rope, null, false, { rope: 1 }));
    const shortLogs = want.logs - inv.logs, shortSticks = want.sticks - inv.sticks;
    if ((shortLogs > 0 || shortSticks > 0) && room) {
      const tree = this.nearestRes(bfs, (m) => (m.kind === 'tree' || m.kind === 'palm') && (m.growth >= 1 || m.age > 200), taken);
      const short = Math.max(shortLogs, shortSticks);
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
    // --- mosty ---
    {
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
    if (w.mine && this.mem.has(w.mine.id)) {
      const d = distOf(w.mine.i, w.mine.j);
      if (d >= 0 && this.invTotal() < INV_CAP && tools.pickaxe) {
        const wantIron = (!tools.ironPick || !tools.ironAxe) ? 1 : 0.3;
        add((0.22 + 0.12 * wantIron) * this.w.mine + (inv.stone < 2 ? 0.05 : 0) - d * 0.002, '⛏️ Kopać w kopalni', () => this.taskMine(d));
      }
    }
    // --- rozglądanie się i zwiad ---
    {
      const since = w.time - this.lastLook;
      if (since > 12) add(0.1 + Math.min(0.25, since / 500) + unknownNeed * 0.5, '👀 Rozejrzeć się', () => this.taskLook());
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
    for (const o of opts) {
      const task = o.make();
      if (task) {
        task.label = task.label || o.label;
        this.task = task;
        if (o.label !== this.lastLabel) { this.lastLabel = o.label; if (Math.random() < 0.55) this.speak(thought(o.label)); }
        return;
      }
    }
  }

  islandScarcity(isl) {
    // na podstawie pamięci: im mniej znanych jagód na wyspie na osobę, tym większy niedobór (0..1)
    let berries = 0;
    for (const m of this.mem.values()) if (m.kind === 'bush' && this.world.island[idx(m.i, m.j)] === isl) berries += m.berries;
    const people = this.world.agents.filter((a) => a.alive && a.island === isl).length || 1;
    return clamp(1 - berries / (people * 8), 0, 1);
  }

  // najbliższy ZAPAMIĘTANY zasób spełniający warunek (warunek dotyczy zapamiętanego stanu)
  nearestRes(bfs, pred, taken) {
    let best = null;
    const now = this.world.time;
    for (const m of this.mem.values()) {
      m.age = now - m.t;
      if (!pred(m) || (taken && taken.has(m.r.id))) continue;
      const d = bfs.dist[idx(m.i, m.j)];
      if (d < 0) continue;
      if (!best || d < best.d) best = { r: m.r, d };
    }
    return best;
  }
  nearestTile(bfs, list) {
    let best = null;
    for (const t of list) {
      const d = bfs.dist[idx(t.i, t.j)];
      if (d >= 0 && (!best || d < best.d)) best = { ...t, d };
    }
    return best;
  }
  nearestStructure(bfs, kind) {
    let best = null;
    for (const s of this.world.structures) {
      if (s.kind !== kind || !this.knownStructs.has(s.id)) continue;
      const d = bfs.dist[idx(s.i, s.j)];
      if (d >= 0 && (!best || d < best.d)) best = { s, d, i: s.i, j: s.j };
    }
    return best;
  }
  bestFishingSpot(bfs) {
    let best = null;
    const others = this.world.agents.filter((a) => a !== this && a.task && a.task.fishSpot).map((a) => a.task.fishSpot);
    for (const t of this.world.seaShore) {
      const d = bfs.dist[idx(t.i, t.j)];
      if (d < 0) continue;
      if (others.some((o) => Math.abs(o.i - t.i) + Math.abs(o.j - t.j) < 4)) continue;
      if (this.badSpots.some((o) => this.world.time - o.t < 45 && Math.abs(o.i - t.i) + Math.abs(o.j - t.j) < 4)) continue;
      let fish = 0;
      for (const f of this.memFish) if (Math.abs(f.x - t.wx) < 5 && Math.abs(f.z - t.wz) < 5) fish++;
      const s = d - fish * 3;
      if (!best || s < best.s) best = { ...t, d, s, fish };
    }
    return best;
  }

  pathTo(i, j) {
    const p = this.world.pathFrom(this.bfsCache, i, j);
    return p;
  }

  // ---------- zadania ----------
  taskDrink(spot) {
    return {
      urgent: true, path: this.pathTo(spot.i, spot.j), face: spot.water,
      act: (dt, t) => {
        this.thirst = clamp(this.thirst + 35 * dt, 0, 100);
        return this.thirst >= 100 || t.elapsed > 4 ? 'done' : null;
      },
    };
  }

  taskEat() {
    // najpierw najlepsze jedzenie, ale bez marnowania
    const order = ['cookedMeat', 'cookedFish', 'berries', 'rawMeat', 'rawFish'];
    return {
      urgent: true, path: [],
      act: (dt, t) => {
        if (t.elapsed < 1.2) return null;
        const k = order.find((o) => this.inv[o] > 0);
        if (!k) return 'fail';
        this.inv[k]--; this.hunger = clamp(this.hunger + FOOD[k].val, 0, 100);
        t.elapsed = 0;
        return this.hunger > 85 || this.foodStock() === 0 ? 'done' : null;
      },
    };
  }

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
  }

  taskFish(spot) {
    const task = {
      fishSpot: spot, path: this.pathTo(spot.i, spot.j), face: spot.water, label: '🎣 Łowi ryby',
      act: (dt, t) => {
        t.tick = (t.tick || 0) + dt;
        if (t.tick >= 1) {
          t.tick = 0;
          const near = this.world.fishNear(spot.wx, spot.wz, 5);
          const p = Math.min(0.45, near.length * 0.07 * (1 + this.skill.fish));
          if (near.length && Math.random() < p) {
            this.world.catchFish(near[0]);
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
  }

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
  }

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
  }

  freeTileNear(i, j, bfs) {
    for (let r = 1; r < 3; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const ni = i + di, nj = j + dj;
      if (!this.world.inBounds(ni, nj)) continue;
      if (bfs.dist[idx(ni, nj)] >= 0 && !this.world.structures.some((s) => s.i === ni && s.j === nj)) return { i: ni, j: nj };
    }
    return null;
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

  nearestSeaweed(bfs, taken) {
    let best = null;
    for (const m of this.mem.values()) {
      const r = m.r;
      if (m.kind !== 'seaweed' || (m.amount <= 0 && this.world.time - m.t < 50) || (taken && taken.has(r.id))) continue;
      const st = r.stand;
      const d = bfs.dist[idx(st.i, st.j)];
      if (d >= 0 && (!best || d < best.d)) best = { r, d };
    }
    return best;
  }

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
  }

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
  }

  taskMine() {
    const m = this.world.mine;
    const per = this.tools.ironPick ? 2.5 : 4.5;
    return {
      path: this.pathTo(m.i, m.j), face: { x: m.x + 1, z: m.z - 1 }, label: '⛏️ Kopie w kopalni',
      act: (dt, t) => {
        if (t.elapsed < per) return null;
        t.elapsed = 0;
        m.depth++;
        this.inv.stone++;
        this.practice('mine');
        if (Math.random() < 0.35 + 0.25 * this.skill.mine) {
          this.inv.iron++; this.stats.iron++;
          if (this.stats.iron === 1) { this.say('znalazł(a) rudę żelaza! ⛏️', 'big'); this.event('iron'); }
        }
        this.world.changed.add(m);
        return (t.got = (t.got || 0) + 1) >= 4 || this.invTotal() >= INV_CAP ? 'done' : null;
      },
    };
  }

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
  }

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
  }

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
  }

  taskWander(bfs) {
    const w = this.world;
    for (let tries = 0; tries < 20; tries++) {
      const i = this.i + Math.floor((Math.random() - 0.5) * 16), j = this.j + Math.floor((Math.random() - 0.5) * 16);
      if (w.inBounds(i, j) && bfs.dist[idx(i, j)] > 0) {
        return { path: this.pathTo(i, j), rest: true, label: '🚶 Spaceruje', act: (dt, t) => (t.elapsed > 1 ? 'done' : null) };
      }
    }
    return null;
  }

  taskRest() {
    return { path: [], rest: true, label: '🪑 Odpoczywa', act: (dt, t) => { this.energy = clamp(this.energy + 0.25 * dt, 0, 100); return t.elapsed > 6 ? 'done' : null; } };
  }
}

// lista kafelków przy wodzie (do picia i łowienia) - przeliczana gdy zmienia się most
export function computeShores(world) {
  world.pondShore = [];
  world.seaShore = [];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    if (!world.walkable(i, j)) continue;
    const pond = world.adjacentTo(i, j, (t) => t === T.POND);
    if (pond) world.pondShore.push({ i, j, water: toWorld(pond.i, pond.j) });
    const sea = world.adjacentTo(i, j, (t) => t === T.SEA);
    if (sea) {
      const p = toWorld(sea.i, sea.j);
      world.seaShore.push({ i, j, water: p, wx: p.x, wz: p.z });
    }
  }
}
