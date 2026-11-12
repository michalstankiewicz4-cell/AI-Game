// Rozmowy między agentami: wymiana wiedzy (pamięci mapy), doświadczenia i przedmiotów.
import { idx, toWorld, T } from '../world/world.js';
import { FOOD, RECIPES, RECIPE_NAMES, MAT_NAMES } from './data.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const TALK_RANGE = 2.6;
const PAIR_COOLDOWN = 70; // s symulacji między rozmowami tej samej pary

function direction(from, x, z) {
  const dx = x - from.x, dz = z - from.z;
  if (Math.hypot(dx, dz) < 6) return 'tuż obok';
  const ang = Math.atan2(dx, -dz) * 180 / Math.PI; // 0 = północ
  const names = ['na północy', 'na północnym wschodzie', 'na wschodzie', 'na południowym wschodzie', 'na południu', 'na południowym zachodzie', 'na zachodzie', 'na północnym zachodzie'];
  return names[Math.round(((ang + 360) % 360) / 45) % 8];
}

const SKILL_TALK = {
  fish: ['Pokażę ci, jak łowić: zarzucaj tam, gdzie widać ławice.', 'Sztuczka z rybami? Cierpliwość i płytka woda przy brzegu.'],
  hunt: ['Na ptaki podchodź pod wiatr i rzucaj od razu, zanim się spłoszą.', 'Polowanie to wyczucie chwili. Pokażę ci.'],
  chop: ['Rąb pod kątem, drzewo szybciej padnie.', 'Pokażę ci, jak sprawnie ścinać drzewa.'],
  mine: ['W kopalni szukaj rdzawych żył, tam jest żelazo.', 'Kop wzdłuż ciemnych pasów skały, tam bywa ruda.'],
};
const SKILL_NAME = { fish: 'łowienia', hunt: 'polowania', chop: 'ścinania drzew', mine: 'górnictwa' };

// czego "a" wie, a "b" nie - najciekawsza nowina
function news(a, b, world) {
  const out = [];
  if (world.mine && a.mem.has(world.mine.id) && !b.mem.has(world.mine.id)) {
    out.push({ v: 5, text: `${direction(b, world.mine.x, world.mine.z)} na wzgórzu jest kopalnia, da się tam znaleźć żelazo!` });
  }
  // staw
  const knowsPond = (ag) => world.pondShore.some((p) => ag.seen[idx(p.i, p.j)]);
  if (knowsPond(a) && !knowsPond(b)) {
    const p = world.pondShore.find((q) => a.seen[idx(q.i, q.j)]);
    out.push({ v: 6, text: `Wiem, gdzie jest słodka woda: staw ${direction(b, p.water.x, p.water.z)}.` });
  }
  for (const s of world.structures) {
    if (a.knownStructs.has(s.id) && !b.knownStructs.has(s.id)) {
      const where = direction(b, s.x, s.z);
      const txt = {
        campfire: `Jest ognisko ${where}, można tam upiec jedzenie.`,
        shelter: `Stoi szałas ${where}, dobrze się w nim śpi.`,
        tent: `Rozbiłem namiot ${where}.`,
        workbench: `Mam stół do pracy ${where}, przy nim wychodzą różne rzeczy.`,
        bed: `${where[0].toUpperCase() + where.slice(1)} stoi łóżko.`,
      }[s.kind];
      if (txt) out.push({ v: 3, text: txt });
      break;
    }
  }
  let bushes = 0, bx = 0, bz = 0;
  for (const [id, m] of a.mem) if (m.kind === 'bush' && !b.mem.has(id)) { bushes++; bx += m.r.x; bz += m.r.z; }
  if (bushes >= 3) out.push({ v: 2 + Math.min(3, bushes / 3), text: `${direction(b, bx / bushes, bz / bushes)} rośnie sporo krzaków z jagodami.` });
  let birds = [...a.memBirds.values()].filter((m) => !b.memBirds.has(m.b.id));
  if (birds.length) out.push({ v: 2, text: `Widziałem ptaki ${direction(b, birds[0].b.x, birds[0].b.z)}.` });
  const newIsl = [...a.visited].filter((i) => !b.visited.has(i));
  if (newIsl.length) out.push({ v: 4, text: `Byłem na wyspie ${newIsl[0] + 1}. Warto tam zajrzeć!` });
  const recipe = [...a.known].find((r) => RECIPES[r] && !b.known.has(r));
  if (recipe) out.push({ v: 7, text: `Odkryłem, że z ${Object.keys(RECIPES[recipe]).map((k) => MAT_NAMES[k]).join(' i ')} da się zrobić: ${RECIPE_NAMES[recipe]}!` });
  const food = [...a.edible].find(([k, v]) => v && !b.edible.has(k));
  if (food) out.push({ v: 5, text: `${FOOD[food[0]].name[0].toUpperCase() + FOOD[food[0]].name.slice(1)} jest jadalne, sprawdziłem.` });
  if (a.saltKnown && !b.saltKnown) out.push({ v: 4.5, text: 'Nie pij morskiej wody, jest słona. Sprawdziłem na sobie.' });
  out.sort((x, y) => y.v - x.v);
  return out[0] || null;
}

// scala pamięć: "to" dostaje wiedzę "from"
function shareKnowledge(from, to) {
  let gained = 0;
  for (let k = 0; k < from.seen.length; k++) if (from.seen[k] && !to.seen[k]) { to.seen[k] = 1; to.seenCount++; gained++; }
  for (const [id, m] of from.mem) {
    const mine = to.mem.get(id);
    if (!mine || mine.t < m.t) {
      to.mem.set(id, { ...m });
      to.memByTile.set(idx(m.i, m.j), id);
    }
  }
  for (const s of from.knownStructs) to.knownStructs.add(s);
  for (const r of from.known) if (RECIPES[r] ? to.learn(r, from) : !to.known.has(r) && to.known.add(r)) gained++;
  for (const [k, v] of from.edible) if (!to.edible.has(k)) to.edible.set(k, v);
  if (from.saltKnown) to.saltKnown = true;
  for (const k of from.triedKinds) to.triedKinds.add(k);
  for (const [id, m] of from.memBirds) if (!to.memBirds.has(id)) to.memBirds.set(id, { ...m });
  to.memFish.push(...from.memFish.slice(-20));
  return gained;
}

// prezent: jedzenie dla głodnego, materiały dla potrzebującego
function gift(a, b) {
  if (b.hunger < 55 && b.foodStock() < 20 && a.foodStock() >= 30) {
    const order = ['cookedMeat', 'cookedFish', 'berries', 'rawMeat', 'rawFish'];
    const k = order.find((o) => a.inv[o] > 0);
    if (k) {
      const n = k === 'berries' ? Math.min(3, a.inv[k]) : 1;
      a.inv[k] -= n; b.inv[k] += n;
      return { text: `Masz ${n > 1 ? n + 'x ' : ''}${FOOD[k].name}, wyglądasz na głodnego.`, reply: pick(['Dzięki, ratujesz mi życie!', 'Dziękuję! Odwdzięczę się.', 'Jesteś wielki!']), log: `daje ${b.name} jedzenie (${FOOD[k].name})` };
    }
  }
  if (!b.tools.rod && b.inv.rope === 0 && a.inv.rope >= 2) {
    a.inv.rope--; b.inv.rope++;
    return { text: 'Weź linę, zrobisz sobie wędkę.', reply: 'O, dzięki! Właśnie tego mi brakowało.', log: `daje ${b.name} linę` };
  }
  if (b.inv.sticks === 0 && a.inv.sticks >= 6) {
    a.inv.sticks -= 2; b.inv.sticks += 2;
    return { text: 'Mam za dużo gałęzi, weź dwie.', reply: 'Przydadzą się, dzięki!', log: `daje ${b.name} 2 gałęzie` };
  }
  if (b.inv.stone === 0 && a.inv.stone >= 6) {
    a.inv.stone -= 2; b.inv.stone += 2;
    return { text: 'Masz, dwa kamienie na narzędzia.', reply: 'Dzięki!', log: `daje ${b.name} 2 kamienie` };
  }
  return null;
}

function teach(a, b) {
  let best = null;
  for (const k in a.skill) {
    const d = a.skill[k] - b.skill[k];
    if (d > 0.15 && (!best || d > best.d)) best = { k, d };
  }
  if (!best) return null;
  b.skill[best.k] += best.d * 0.4;
  return { text: pick(SKILL_TALK[best.k]), reply: pick(['Dzięki za radę!', 'Spróbuję tak zrobić.', 'Nie wiedziałem, dzięki!']), log: `uczy ${b.name} ${SKILL_NAME[best.k]}` };
}

function smallTalk(a) {
  const low = [['thirst', 'Ledwo żyję z pragnienia...'], ['hunger', 'Strasznie jestem głodny.'], ['energy', 'Padam ze zmęczenia.']].find(([k]) => a[k] < 35);
  if (low) return low[1];
  return pick(['Cześć! Jak leci?', 'Hej, wszystko w porządku?', 'Jakoś się trzymamy, co?', 'Ciekawe, czy ktoś nas tu znajdzie...', 'Ładny dziś dzień na przetrwanie.']);
}

export class Social {
  constructor(world) {
    this.world = world;
    world.social = this;
    this.cd = new Map();
    this.convos = [];
    this.check = 0;
  }

  update(dt) {
    const w = this.world;
    // kolejka kwestii w trwających rozmowach
    for (const c of this.convos) {
      c.t += dt;
      while (c.lines.length && c.lines[0].at <= c.t) { const l = c.lines.shift(); l.who.speak(l.text, true); }
    }
    this.convos = this.convos.filter((c) => c.lines.length);
    this.check -= dt;
    if (this.check > 0) return;
    this.check = 0.5;
    const alive = w.agents.filter((a) => a.alive && !a.asleep && !(a.task && (a.task.urgent || a.task.talk)));
    for (let x = 0; x < alive.length; x++) for (let y = x + 1; y < alive.length; y++) {
      const a = alive[x], b = alive[y];
      if (Math.hypot(a.x - b.x, a.z - b.z) > TALK_RANGE) continue;
      const key = Math.min(a.id, b.id) + ':' + Math.max(a.id, b.id);
      if ((this.cd.get(key) || -1e9) > w.time) continue;
      this.cd.set(key, w.time + PAIR_COOLDOWN);
      this.talk(a, b);
      return;
    }
  }

  talk(a, b) {
    const w = this.world;
    const lines = [];
    let at = 0;
    const say = (who, text) => { if (text) { lines.push({ who, text, at }); at += 1.8; } };
    say(a, smallTalk(a));
    // wiedza w obie strony
    const nA = news(a, b, w), nB = news(b, a, w);
    if (nA) say(a, nA.text);
    if (nB) say(b, nB.text);
    else say(b, smallTalk(b));
    const g1 = shareKnowledge(a, b), g2 = shareKnowledge(b, a);
    // doświadczenie
    let t1 = teach(a, b), T1 = a, S1 = b;
    if (!t1) { t1 = teach(b, a); T1 = b; S1 = a; }
    // przedmioty
    const gA = gift(a, b), gB = gA ? null : gift(b, a);
    const logs = [];
    if (t1) { say(T1, t1.text); say(S1, t1.reply); logs.push(`${T1.name} ${t1.log}`); }
    if (gA) { say(a, gA.text); say(b, gA.reply); logs.push(`${a.name} ${gA.log}`); }
    if (gB) { say(b, gB.text); say(a, gB.reply); logs.push(`${b.name} ${gB.log}`); }
    say(b, pick(['Do zobaczenia!', 'Trzymaj się!', 'Powodzenia!', 'Na razie!']));
    this.convos.push({ t: 0, lines });
    // obaj zatrzymują się na czas rozmowy
    const dur = at + 0.5;
    for (const [me, other] of [[a, b], [b, a]]) {
      me.task = { talk: true, path: [], rest: true, label: `💬 Rozmawia z ${other.name}`, face: other, act: (dt, t) => (t.elapsed > dur ? 'done' : null) };
    }
    const learned = g1 + g2;
    w.log(`💬 ${a.name} i ${b.name} rozmawiają${learned ? ` i dzielą się wiedzą o mapie (+${learned} pól)` : ''}${logs.length ? '. ' + logs.join(', ') : ''}.`, 'talk');
  }
}
