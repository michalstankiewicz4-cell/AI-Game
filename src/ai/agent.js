// Autonomiczny agent AI: stan (potrzeby, ekwipunek, narzędzia, pamięć) i pętla życia.
// Zachowania są w osobnych modułach dołączanych do klasy (perception, knowledge, decide, tasks).
import { T, W, H, idx, toWorld, toTile, BRIDGE_COST } from '../world/world.js';
import { thought, urgent, eventLine } from './commentary.js';
import { llm } from './llm.js';
import { mapIntent } from './intent.js';
import {
  PERSONAS, FOOD, RECIPES, RECIPE_NAMES, MATS, MAT_NAMES, comboKey, RECIPE_BY_COMBO, KIND_NAMES,
  SPEED, VIEW_RANGE, VIEW_NEAR, viewHalfAngle, wrapAng, INV_CAP, MAX_WEIGHT, WEIGHT, clamp, TORCH,
} from './data.js';
import { perceptionMethods } from './perception.js';
import { knowledgeMethods } from './knowledge.js';
import { decideMethods } from './decide.js';
import { tasksMethods } from './tasks.js';
import { buildingMethods, BUILD_LABEL } from './building.js';

export { PERSONAS, FOOD, RECIPES, RECIPE_NAMES, MAT_NAMES, KIND_NAMES, VIEW_RANGE, VIEW_NEAR, viewHalfAngle } from './data.js';
export { ITEM_LABELS, TOOL_LABELS } from './data.js';

const POCKET = new Set(['seeds', 'feathers', 'arrows']);

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
    this.bodyT = 36.6; this.feltT = 18; // temperatura ciała i odczuwalna (°C)
    this.mood = 60; this.joy = 0; this.lastTalk = -999; // samopoczucie 0-100, chwilowa radość, ostatnia rozmowa
    this.inv = { logs: 0, sticks: 0, leaves: 0, planks: 0, seaweed: 0, rope: 0, stone: 0, iron: 0, berries: 0, rawFish: 0, cookedFish: 0, rawMeat: 0, cookedMeat: 0, torch: 0, feathers: 0, hide: 0, seeds: 0, arrows: 0, bowl: 0, waterBowl: 0 };
    this.tools = { axe: true, pickaxe: true, rod: false, spear: false, ironAxe: false, ironPick: false, clothes: false, sword: false, shield: false, knife: false, hoe: false, bow: false, leather: false };
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
    this.buildQueue = [];         // polecenia budowy z desek od modelu językowego
    this.memBoars = new Map(); // id -> { b, i, j, t } gdzie widział dziki
    this.memAgents = new Map(); // id -> { a, i, j, t } gdzie ostatnio widział innych          // łowiska, gdzie nic nie brało
    this.visionT = 0;
    this.lastLook = -999;
    this.seenCount = 0;
    this.see(true, 9);
  }

  // za ciężko albo za dużo: odłóż połowę najcięższego materiału na kupkę (składzik) w miejscu, gdzie stoi
  dropSurplus() {
    let best = null;
    // za dużo rzeczy: odłóż tego, czego ma najwięcej sztuk; za ciężko: tego, co najwięcej waży
    const byCount = this.invTotal() >= INV_CAP;
    const val = (k) => (byCount ? this.inv[k] : this.inv[k] * WEIGHT[k]);
    for (const k of MATS) if (this.inv[k] > 0 && (!best || val(k) > val(best))) best = k;
    if (!best) return;
    const n = Math.max(1, Math.floor(this.inv[best] / 2));
    this.inv[best] -= n;
    const st = this.stashHere();
    if (st) { st.items[best] = (st.items[best] || 0) + n; this.rememberStruct(st); }
    if (Math.random() < 0.3) this.speak(`Za dużo dźwigam, odkładam ${MAT_NAMES[best]}.`);
  }
  // składzik w zasięgu ręki albo nowa kupka obok
  stashHere() {
    const w = this.world;
    const close = (s) => Math.hypot(s.x - this.x, s.z - this.z) < 1.8;
    const near = w.structures.find((s) => s.kind === 'chest' && close(s)) || w.structures.find((s) => s.kind === 'stash' && close(s));
    if (near) return near;
    const free = (i, j) => w.walkable(i, j) && w.type[idx(i, j)] !== T.BRIDGE && !w.res[idx(i, j)] && !w.structures.some((s) => s.i === i && s.j === j);
    let spot = free(this.i, this.j) ? { i: this.i, j: this.j } : null;
    for (let r = 1; !spot && r < 3; r++) for (let dj = -r; dj <= r && !spot; dj++) for (let di = -r; di <= r && !spot; di++) if (free(this.i + di, this.j + dj)) spot = { i: this.i + di, j: this.j + dj };
    if (!spot) return null;
    return w.addStructure('stash', spot.i, spot.j, this.id);
  }

  // dzik zaatakował: rana (tarcza osłabia cios), lekcja na przyszłość i walka albo ucieczka
  hitByBoar(b, dmg) {
    if (!this.alive) return;
    this.health = clamp(this.health - dmg * (this.tools.shield ? 0.4 : 1), 0, 100);
    this.lastHit = { by: 'boar', t: this.world.time };
    this.joy = 0; this.mood = Math.max(0, this.mood - 4);
    this.asleep = false;
    this.fightBoar = b;
    if (!this.known.has('boarDanger')) {
      this.known.add('boarDanger');
      this.say('przekonuje się na własnej skórze, że dziki są groźne 🐗🧠', 'learn');
      this.speak('Au! Ten dzik mnie zaatakował!', true);
    }
    if (!this.tools.sword && !this.tools.spear && !(this.tools.bow && this.inv.arrows > 0) && !(this.task && this.task.flee)) { this.task = this.taskFlee(b); this.speak('Uciekam!', true); }
  }

  boarKilled(b) {
    this.stats.boars = (this.stats.boars || 0) + 1; this.practice('hunt');
    // z nożem dzika da się oskórować (mięso i skóra), bez noża ledwo coś urwie
    if (this.tools.knife && b) { this.carcass = b; this.carcassT = this.world.time; }
    else { this.inv.rawMeat += 1; if (b) b.skinned = true; this.speak('Bez noża ledwo urwę kawałek mięsa...', true); return (this.fightBoar = null); }
    this.joy = Math.min(30, this.joy + 15); this.fightBoar = null;
    this.speak('Mam go! Będzie pieczeń.', true);
  }

  rememberStruct(s) { this.knownStructs.add(s.id); }
  practice(k) { this.skill[k] = Math.min(1, this.skill[k] + 0.05 * (1 - this.skill[k])); }

  // dymek nad głową + wpis w czacie komentarzy
  // Mówi tylko model językowy. Teksty z szablonów nie trafiają do dymków:
  // zostają jako notatki, które model dostaje w następnym zapytaniu i opisuje własnymi słowami.
  speak(text, force = false) {
    if (!text || !this.alive) return;
    if (!this.llmSaid && llm.active) {
      this.notes = (this.notes || []).concat(text).slice(-5);
      if (force) {
        this.world.log(`<span style="opacity:.7">${this.name}: ${text}</span>`, 'talk');
        this.llmNext = Math.min(this.llmNext || 0, this.world.time + 3); // ważne zdarzenie: zapytaj model wcześniej
      }
      return;
    }
    if (!force && this.speakCd > 0) return;
    // gdy model nie działa (ładuje się, błąd, brak klucza), mówi skrypt, oznaczony 📜
    const script = !this.llmSaid;
    if (!script) this.lastSaid = text;
    this.bubble = { text, t: 5.5, script };
    this.speakCd = 6 + Math.random() * 6;
    if (this.world.onChat) this.world.onChat(this, text, !script);
  }
  event(key, ctx) { this.speak(eventLine(key, ctx), true); }
  // odpowiedź modelu językowego
  onLLM({ label, thought, intent, at, build }) {
    if (!this.alive) return;
    // polecenia dla desek: nazwy od razu, kładzenie i przenoszenie jako zadanie
    if (build && build.length && this.applyBuildOps(build)) label = BUILD_LABEL;
    if (intent != null) { // pełna swoboda: przetłumacz zamiar na dostępne działanie
      label = intent ? mapIntent(intent, this.allLabels || []) : null;
      this.llmIntent = { text: intent, label, t: this.world.time };
    }
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
  // drobiazgi (nasiona, pióra, strzały) mieszczą się w kieszeni i nie zajmują miejsca w plecaku
  invTotal() { let s = 0; for (const k in this.inv) if (!POCKET.has(k)) s += this.inv[k]; return s; }
  invWeight() { let s = 0; for (const k in this.inv) s += this.inv[k] * (WEIGHT[k] || 0.5); return s; }
  full() { return this.invTotal() >= INV_CAP || this.invWeight() >= MAX_WEIGHT; }
  // czy zmieści jeszcze n rzeczy o wadze ok. kg
  roomFor(n = 1, kg = 2 * n) { return this.invTotal() + n <= INV_CAP && this.invWeight() + kg <= MAX_WEIGHT; }

  say(text, kind) { this.world.log(`<b style="color:#${this.color.toString(16).padStart(6, '0')}">${this.name}</b>: ${text}`, kind); }

  // ---------- pętla ----------
  update(dt) {
    if (!this.alive) return;
    const w = this.world;
    this.speakCd -= dt;
    if (this.bubble && (this.bubble.t -= dt) <= 0) this.bubble = null;
    const isl = this.island;
    if (isl >= 0 && !this.visited.has(isl)) { this.visited.add(isl); this.event('newIsland'); this.say(`dociera na wyspę ${isl + 1}! 🏝️`, 'big'); }
    // temperatura: ciało dąży do stanu wynikającego z odczuwalnej temperatury otoczenia
    const warmFire = this.nearStructure('campfire', 2.6), hut = this.nearStructure('shelter', 1.5), tent = !hut && this.nearStructure('tent', 1.3);
    // dom z desek: gra liczy tylko przykrycie i ściany wokół pola, na którym stoi postać
    const house = w.pieces.length ? w.shelterAt(this.i, this.j) : null;
    const roof = hut || tent || (house && house.roof && house.closed >= 0.5);
    this.feltT = w.airTemp(this.i, this.j) + (warmFire ? 14 : 0) + Math.max(hut ? 7 : tent ? 5 : 0, house ? house.warm : 0) + (this.tools.leather ? 7 : this.tools.clothes ? 4 : 0) + (this.working ? 4 : 0) + (this.asleep ? -2 : 0);
    const targetT = clamp(36.8 + (this.feltT < 18 ? (this.feltT - 18) * 0.12 : (this.feltT - 18) * 0.06), 33, 39.5);
    this.bodyT += (targetT - this.bodyT) * Math.min(1, 0.03 * dt);
    // doświadczenie: zmarznięta postać sama zauważa, że przy ogniu albo pod dachem robi się cieplej
    this.warmT = (warmFire || roof) && this.bodyT < 36.4 ? (this.warmT || 0) + dt : 0;
    if (this.warmT > 4) {
      const k = warmFire ? 'warmFire' : 'warmRoof';
      if (!this.known.has(k)) {
        this.known.add(k);
        this.say(warmFire ? 'czuje, że przy ognisku robi się cieplej 🔥🧠' : 'czuje, że pod dachem jest cieplej 🛖🧠', 'learn');
        this.speak(warmFire ? 'O, przy ogniu od razu cieplej!' : 'Pod dachem jakoś cieplej...', true);
      }
    }
    const coldMul = this.bodyT < 36 ? 1 + (36 - this.bodyT) * 0.35 : 1; // zimno: organizm spala więcej
    const hotMul = this.bodyT > 37.5 ? 1 + (this.bodyT - 37.5) * 0.8 : 1; // gorąco: szybciej chce się pić
    // spadek potrzeb
    const workMul = this.working ? 1.35 : 1;
    this.hunger = clamp(this.hunger - 0.26 * dt * workMul * coldMul, 0, 100);
    this.thirst = clamp(this.thirst - 0.36 * dt * workMul * hotMul, 0, 100);
    if (this.asleep) {
      const shelter = this.nearStructure('shelter', 1.5);
      const tentS = !shelter && this.nearStructure('tent', 1.3);
      const fire = this.nearStructure('campfire', 3);
      const bed = this.nearStructure('bed', 1.2);
      this.energy = clamp(this.energy + (1.1 + (shelter ? 0.9 : tentS ? 0.5 : 0) + (fire ? 0.3 : 0) + (bed ? 1.0 : 0)) * dt, 0, 100);
      // doświadczenie: po pierwszej nocy w łóżku postać wie, że tak lepiej się wysypia
      if (bed && !this.known.has('bedRest') && (this.bedT = (this.bedT || 0) + dt) > 6) {
        this.known.add('bedRest');
        this.say('wysypia się w łóżku dużo lepiej niż na ziemi 🛏️🧠', 'learn');
        this.speak('Ależ się wyspałem w tym łóżku!', true);
      }
      this.hunger = clamp(this.hunger + 0.1 * dt, 0, 100); // sen spowalnia głód
      this.thirst = clamp(this.thirst + 0.12 * dt, 0, 100);
      if (shelter) this.health = clamp(this.health + 0.2 * dt, 0, 100);
    } else {
      this.energy = clamp(this.energy - 0.2 * dt * workMul, 0, 100);
    }
    // samopoczucie: potrzeby, ciepło, wygoda, towarzystwo i chwilowe radości (odkrycia, dobre jedzenie, budowa)
    {
      const avg = (this.hunger + this.thirst + this.energy + this.health) / 4;
      const low = Math.min(this.hunger, this.thirst, this.energy, this.health);
      let target = 0.55 * avg + 0.45 * low;
      if (this.bodyT < 36) target -= (36 - this.bodyT) * 15;
      else if (this.bodyT > 37.5) target -= (this.bodyT - 37.5) * 10;
      if (roof || (this.asleep && this.nearStructure('bed', 1.2))) target += 6;
      if (warmFire && w.isNight()) target += 5;
      const others = w.agents.some((o) => o !== this && o.alive);
      if (others) target += w.time - this.lastTalk < 90 ? 8 : w.time - this.lastTalk > 240 ? -8 : 0;
      this.joy = Math.max(0, this.joy - dt * 0.15);
      this.mood = clamp(this.mood + (clamp(target + this.joy, 0, 100) - this.mood) * Math.min(1, 0.02 * dt), 0, 100);
    }
    // zdrowie
    let dmg = 0;
    if (this.hunger <= 0) dmg += 0.7;
    if (this.thirst <= 0) dmg += 1.0;
    if (this.energy <= 0) dmg += 0.3;
    if (this.bodyT < 35) dmg += 0.2 + (35 - this.bodyT) * 0.6; // wychłodzenie
    if (this.bodyT > 39) dmg += (this.bodyT - 39) * 0.8;       // przegrzanie
    if (dmg > 0) this.health -= dmg * dt;
    else if (this.hunger > 40 && this.thirst > 40 && this.energy > 25 && this.bodyT > 35.5) this.health = clamp(this.health + 0.15 * dt, 0, 100);
    if (this.health <= 0) {
      this.health = 0; this.alive = false; this.task = null; this.asleep = false;
      const cause = this.lastHit && w.time - this.lastHit.t < 5 ? 'od ran zadanych przez dzika' : this.thirst <= 0 ? 'z pragnienia' : this.hunger <= 0 ? 'z głodu' : this.bodyT < 35 ? 'z wychłodzenia' : this.bodyT > 39 ? 'z przegrzania' : 'z wycieńczenia';
      this.say(`💀 umiera ${cause} (dzień ${w.day()})`, 'death');
      this.bubble = { text: '...', t: 3 };
      const other = w.agents.find((a) => a.alive);
      if (other) other.event('death', { name: this.name });
      return;
    }

    // walka z dzikiem: uzbrojona postać stoi i zadaje ciosy, zamiast robić cokolwiek innego
    const fb = this.fightBoar;
    if (fb && (fb.dead || Math.hypot(fb.x - this.x, fb.z - this.z) > 2.2 || (fb.target !== this && fb.state !== 'roam'))) this.fightBoar = null;
    else if (fb && (this.tools.sword || this.tools.spear || (this.tools.bow && this.inv.arrows > 0))) {
      this.facing = Math.atan2(fb.x - this.x, fb.z - this.z);
      this.working = true;
      this.strikeT = (this.strikeT || 0) - dt;
      if (this.strikeT <= 0) {
        this.strikeT = 1;
        const bow = !this.tools.sword && !this.tools.spear;
        if (bow && Math.random() < 0.5) this.inv.arrows = Math.max(0, this.inv.arrows - 1); // strzała czasem się łamie
        const dmg = (this.tools.sword ? 14 : bow ? 11 : 9) + this.skill.hunt * 4;
        if (w.hurtBoar(fb, dmg, this)) this.boarKilled(fb);
      }
      if (this.task && !this.task.urgent) this.task = null;
      this.visionT -= dt; if (this.visionT <= 0) { this.visionT = 0.3; this.see(false); }
      return;
    }
    // przerwanie zadania gdy pojawi się pilna potrzeba
    this.recheck -= dt;
    if (this.task && this.recheck <= 0) {
      this.recheck = 1.5;
      if (!this.task.urgent && (this.thirst < 18 || this.hunger < 15 || this.energy < 8)) {
        this.task = null;
        this.speak(urgent(this.thirst < 18 ? 'thirst' : this.hunger < 15 ? 'hunger' : 'energy'), true);
      } else if (!this.task.urgent && !this.task.warm && this.bodyT < 35.2 && !this.nearStructure('campfire', 2.6)) {
        this.task = null;
        this.speak(urgent('cold'), true);
      }
    }
    if (this.invTotal() >= INV_CAP || this.invWeight() > MAX_WEIGHT) this.dropSurplus();
    if (!this.task) this.decide();
    if (this.task) this.runTask(dt);
    // tryb Claude: co jakiś czas postać pyta model, nawet w trakcie długiego zadania
    if (this.task && !this.task.urgent && !this.asleep && llm.active && w.time >= (this.llmNext || 0) && this.scores && this.scores.length) {
      const labels = [this.lastLabel, ...this.scores.map((s) => s.label).filter((l) => l !== this.lastLabel)].filter(Boolean).slice(0, 6);
      if (labels.length) llm.ask(this, llm.decides ? labels : [this.task.label]);
    }
    this.updateHeld(dt);
    // wzrok (śpiący nie widzi)
    this.visionT -= dt;
    if (this.visionT <= 0 && !this.asleep) { this.visionT = 0.3; this.see(false); }
  }

  // co postać trzyma w ręku: po zmroku płonącą pochodnię, w walce broń, przy pracy narzędzie
  updateHeld(dt) {
    const w = this.world;
    // pochodnia pali się tylko w ręku (w dzień postać ją gasi i chowa)
    if (this.torchBurn > 0 && this.held === 'torch') {
      this.torchBurn -= dt;
      if (this.torchBurn <= 0) { this.torchBurn = 0; if (this.held === 'torch') this.held = null; this.speak('Pochodnia mi zgasła...', true); }
    }
    const dark = w.daylight() < 0.35;
    // zapalenie pochodni od palącego się ogniska
    if (dark && !this.asleep && !(this.torchBurn > 0) && this.inv.torch > 0 && this.known.has('torch') && this.nearStructure('campfire', 2.6)) {
      this.inv.torch--; this.torchBurn = TORCH.burn; this.held = 'torch';
      this.say('zapala pochodnię 🔥');
    }
    const lbl = (this.task && this.task.label) || '';
    let h = null;
    if (this.asleep) h = null;
    else if (/Skóruje|nóż|miskę|Struga/i.test(lbl) && this.tools.knife) h = 'knife';
    else if (/grządk|ziemię|motyk/i.test(lbl) && this.tools.hoe) h = 'hoe';
    else if (/łuk/i.test(lbl) && this.tools.bow) h = 'bow';
    else if (this.fightBoar || /dzik/i.test(lbl)) h = this.tools.sword ? 'sword' : this.tools.spear ? 'spear' : this.tools.bow && this.inv.arrows > 0 ? 'bow' : 'axe';
    else if (dark && this.torchBurn > 0) h = 'torch';
    else if (/Ścina|Bada drzewo|Bada palm|deski|Ciosa/i.test(lbl)) h = this.tools.ironAxe ? 'ironAxe' : 'axe';
    else if (/Kopie|skał|kamie|kopalni/i.test(lbl)) h = this.tools.ironPick ? 'ironPick' : 'pickaxe';
    else if (/Łowi|ryb/i.test(lbl) && this.tools.rod) h = 'rod';
    else if (/ptak/i.test(lbl) && this.tools.spear) h = 'spear';
    else h = this.tools.sword ? 'sword' : 'axe';
    this.held = h;
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
      // ciężki plecak spowalnia (od 70% udźwigu), zmęczenie też
      const load = this.invWeight() / MAX_WEIGHT;
      const step = SPEED * dt * (this.energy < 15 ? 0.6 : 1) * (load > 0.7 ? 1 - (load - 0.7) * 1.2 : 1);
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
    // samopoczucie wpływa na tempo pracy: przygnębiony pracuje wolniej, zadowolony trochę szybciej
    t.elapsed = (t.elapsed || 0) + dt * (this.mood < 30 ? 0.8 : this.mood > 75 ? 1.1 : 1);
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

Object.assign(Agent.prototype, perceptionMethods, knowledgeMethods, decideMethods, tasksMethods, buildingMethods);
