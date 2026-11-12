// Autonomiczny agent AI: stan (potrzeby, ekwipunek, narzędzia, pamięć) i pętla życia.
// Zachowania są w osobnych modułach dołączanych do klasy (perception, knowledge, decide, tasks).
import { T, W, H, idx, toWorld, toTile, BRIDGE_COST } from '../world/world.js';
import { thought, urgent, eventLine } from './commentary.js';
import { llm } from './llm.js';
import {
  PERSONAS, FOOD, RECIPES, RECIPE_NAMES, MATS, MAT_NAMES, comboKey, RECIPE_BY_COMBO, KIND_NAMES,
  SPEED, VIEW_RANGE, VIEW_NEAR, viewHalfAngle, wrapAng, INV_CAP, clamp,
} from './data.js';
import { perceptionMethods } from './perception.js';
import { knowledgeMethods } from './knowledge.js';
import { decideMethods } from './decide.js';
import { tasksMethods } from './tasks.js';

export { PERSONAS, FOOD, RECIPES, RECIPE_NAMES, MAT_NAMES, KIND_NAMES, VIEW_RANGE, VIEW_NEAR, viewHalfAngle } from './data.js';
export { ITEM_LABELS, TOOL_LABELS } from './data.js';

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
    this.inv = { logs: 0, sticks: 0, planks: 0, seaweed: 0, rope: 0, stone: 0, iron: 0, berries: 0, rawFish: 0, cookedFish: 0, rawMeat: 0, cookedMeat: 0 };
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
    // wiedza zdobywana metodą prób
    this.known = new Set();      // odkryte receptury (+ 'bridge', 'cook')
    this.edible = new Map();     // rodzaj jedzenia -> true/false
    this.tried = new Set();      // wypróbowane kombinacje materiałów
    this.triedKinds = new Set(); // rodzaje zasobów, które już badał
    this.saltKnown = false;      // wie, że morska woda nie gasi pragnienia
    this.memAgents = new Map(); // id -> { a, i, j, t } gdzie ostatnio widział innych          // łowiska, gdzie nic nie brało
    this.visionT = 0;
    this.lastLook = -999;
    this.seenCount = 0;
    this.see(true, 9);
  }

  dropSurplus() {
    // wyrzuć nadmiar najliczniejszego materiału
    let best = null;
    for (const k of MATS) if (!best || this.inv[k] > this.inv[best]) best = k;
    const n = Math.max(1, Math.floor(this.inv[best] / 2));
    this.inv[best] -= n;
    if (Math.random() < 0.3) this.speak(`Za dużo dźwigam, zostawiam ${MAT_NAMES[best]}.`);
  }

  rememberStruct(s) { this.knownStructs.add(s.id); }
  practice(k) { this.skill[k] = Math.min(1, this.skill[k] + 0.05 * (1 - this.skill[k])); }

  // dymek nad głową + wpis w czacie komentarzy
  // Mówi tylko model językowy. Teksty z szablonów nie trafiają do dymków:
  // zostają jako notatki, które model dostaje w następnym zapytaniu i opisuje własnymi słowami.
  speak(text, force = false) {
    if (!text || !this.alive) return;
    if (!this.llmSaid) {
      this.notes = (this.notes || []).concat(text).slice(-5);
      if (force) {
        this.world.log(`<span style="opacity:.7">${this.name}: ${text}</span>`, 'talk');
        this.llmNext = Math.min(this.llmNext || 0, this.world.time + 3); // ważne zdarzenie: zapytaj model wcześniej
      }
      return;
    }
    if (!force && this.speakCd > 0) return;
    this.lastSaid = text;
    this.bubble = { text, t: 5.5 };
    this.speakCd = 6 + Math.random() * 6;
    if (this.world.onChat) this.world.onChat(this, text, this.llmSaid);
  }
  event(key, ctx) { this.speak(eventLine(key, ctx), true); }
  // odpowiedź modelu językowego
  onLLM({ label, thought, at }) {
    if (!this.alive) return;
    if (thought) { this.llmSaid = true; this.speak(thought, true); this.llmSaid = false; this.notes = []; }
    if (label && this.task && label !== this.lastLabel && !this.task.urgent && this.world.time - at < 30) {
      this.llmPick = { label, at };
      this.task = null; // przy najbliższej aktualizacji agent przemyśli decyzję
    }
  }

  get island() { return this.world.island[idx(this.i, this.j)]; }

  foodStock() {
    let s = 0;
    for (const k in FOOD) if (this.edible.get(k) !== false) s += this.inv[k] * FOOD[k].val;
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
    if (this.invTotal() >= INV_CAP - 1) this.dropSurplus();
    if (!this.task) this.decide();
    if (this.task) this.runTask(dt);
    // tryb Claude: co jakiś czas postać pyta model, nawet w trakcie długiego zadania
    if (this.task && !this.task.urgent && !this.asleep && llm.active && w.time >= (this.llmNext || 0) && this.scores && this.scores.length) {
      const labels = [this.lastLabel, ...this.scores.map((s) => s.label).filter((l) => l !== this.lastLabel)].filter(Boolean).slice(0, 6);
      if (labels.length) llm.ask(this, llm.decides ? labels : [this.task.label]);
    }
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

Object.assign(Agent.prototype, perceptionMethods, knowledgeMethods, decideMethods, tasksMethods);
