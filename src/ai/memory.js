// Pamięć oczekiwań: postać pamięta, co gdzie zostawiła i posadziła. Gdy wraca i czegoś nie ma,
// zastanawia się, co się stało, wyciąga wnioski i zmienia zachowanie.
import { MAT_NAMES, FOOD, CROPS, FARM, VIEW_RANGE, VIEW_NEAR, viewHalfAngle, wrapAng, clamp } from './data.js';

// słowo na stosunek do kogoś (g: 'm' albo 'k' to płeć tej osoby)
export function relWord(v, g) {
  const k = g === 'k';
  return v >= 50 ? (k ? 'przyjaciółka' : 'przyjaciel') : v >= 20 ? (k ? 'koleżanka' : 'kolega') : v <= -50 ? (k ? 'wróg' : 'wróg') : v <= -20 ? (k ? 'nielubiana' : 'nielubiany') : (k ? 'obojętna' : 'obojętny');
}
const NAME = (k) => MAT_NAMES[k] || (FOOD[k] && FOOD[k].name) || k;
const PLACE = (s) => (s.kind === 'chest' ? 'w skrzyni' : s.kind === 'stash' ? 'na kupce' : s.kind === 'planter' ? 'w doniczce' : 'na grządce');

export const memoryMethods = {
  initMemory() {
    this.expect = new Map();   // id budowli -> czego się tam spodziewa
    this.suspect = new Map();  // id postaci -> ile razy coś po niej zginęło
    this.beliefs = new Set();  // wnioski: stashUnsafe, fieldsRaided, dryGrowth
    this.conclusions = [];     // ostatnie wnioski słowami (dla modelu i karty postaci)
  },

  // po odłożeniu albo wzięciu: tyle ma tam leżeć
  expectStore(s) { this.expect.set(s.id, { kind: 'store', s, items: { ...s.items }, t: this.world.time }); },
  // po zasianiu: tu rośnie moja roślina
  expectPlant(f) { this.expect.set(f.id, { kind: 'plant', s: f, crop: f.crop, t: this.world.time }); },

  // ---------- stosunki z innymi: wynikają z tego, co sobie nawzajem robią ----------
  likeOf(id) { return (this.rel && this.rel.get(id)) || 0; },
  like(id, d, why) {
    if (id == null || id === this.id) return;
    const rel = this.rel || (this.rel = new Map()), whyM = this.relWhy || (this.relWhy = new Map());
    const old = rel.get(id) || 0, v = clamp(old + d, -100, 100);
    rel.set(id, v);
    if (why) whyM.set(id, (whyM.get(id) || []).filter((x) => x !== why).concat(why).slice(-3));
    // przekroczenie progu: postać to zauważa i mówi o tym (w dzienniku)
    const lvl = (x) => (x >= 50 ? 2 : x >= 20 ? 1 : x <= -50 ? -2 : x <= -20 ? -1 : 0);
    if (lvl(v) !== lvl(old)) {
      const who = this.agentName(id);
      const word = relWord(v, this.fOf(id, 'm', 'k'));
      this.say(`${lvl(v) > lvl(old) ? '💚' : '💔'} ${word === 'obojętny' || word === 'obojętna' ? `${who} jest ${this.f('mu', 'jej')} teraz obojętn${this.fOf(id, 'y', 'a')}` : `${who} to teraz dla ${this.f('niego', 'niej')}: ${word}`}`, 'info');
    }
  },
  // krótko dla modelu językowego: tylko wyraźne sympatie i antypatie
  relSummary() {
    return [...(this.rel || new Map())].filter(([, v]) => Math.abs(v) >= 20).map(([id, v]) => `${this.agentName(id)}: ${relWord(v, this.fOf(id, 'm', 'k'))} (${(this.relWhy.get(id) || []).join(', ')})`).join('; ');
  },
  relWord(id) { return relWord(this.likeOf(id), this.fOf(id, 'm', 'k')); },

  // dziennik reakcji (zakładka „Reakcje” w karcie postaci): co zauważyła i czy coś powiedziała
  logReact(icon, what, said, key) {
    const L = this.reactLog || (this.reactLog = []);
    L.push({ t: this.world.time, icon, what, said: said || null, key });
    (this.reactKinds || (this.reactKinds = new Set())).add(key); // do wiki: na co postać już reagowała
    if (L.length > 14) L.shift();
  },

  conclude(key, text) {
    const fresh = key && !this.beliefs.has(key);
    if (key) this.beliefs.add(key);
    this.conclusions = this.conclusions.filter((c) => c !== text).concat(text).slice(-4);
    return fresh;
  },
  blame(id) { this.suspect.set(id, (this.suspect.get(id) || 0) + 1); this.like(id, -3, 'podejrzewam, że bierze moje rzeczy'); },
  agentName(id) { const a = this.world.agents.find((x) => x.id === id); return a ? a.name : null; },

  // postać widzi budowlę, o której coś pamięta: czy wszystko jest tak, jak zostawiła?
  checkExpect(s) {
    const e = this.expect.get(s.id);
    if (!e) return;
    const w = this.world;
    if (e.kind === 'store') {
      const gone = [];
      for (const k in e.items) { const n = e.items[k] - (s.items[k] || 0); if (n > 0) gone.push(`${n}× ${NAME(k)}`); }
      if (!gone.length) { this.expectStore(s); return; } // przybyło albo bez zmian: zapamiętaj nowy stan
      const by = s.lastTaker && s.lastTaker.id !== this.id && s.lastTaker.t > e.t ? s.lastTaker.id : null;
      const who = by != null ? this.agentName(by) : null;
      // ta osoba już się przyznała i wiadomo, że zapasy są wspólne: nie robi z tego sprawy
      if (by != null && this.beliefs.has('shared:' + by)) { this.expectStore(s); return; }
      if (by != null) this.blame(by);
      this.logReact('🤔', `${PLACE(s)} brakuje: ${gone.slice(0, 3).join(', ')}`, true, 'missing');
      this.speak(`Zostawił${this.f('em', 'am')} tu ${gone.slice(0, 3).join(', ')}, a teraz tego nie ma... ${who ? `Czyżby ${who}? Widział${this.f('em', 'am')}, jak tu zaglądał${this.fOf(by, '', 'a')}.` : 'Ktoś tu był? A może coś to zabrało?'}`, true);
      if (s.kind === 'stash') {
        if (this.conclude('stashUnsafe', 'Na kupce przy obozie rzeczy giną: lepiej chować je do skrzyni.')) this.say('dochodzi do wniosku, że na kupce rzeczy giną. Trzeba skrzyni 📦🧠', 'learn');
      } else if (who) this.conclude(null, `Ktoś (chyba ${who}) bierze rzeczy ze skrzyni.`);
      if (who && (this.suspect.get(by) || 0) >= 2) this.conclude('distrust:' + by, `${who} bierze moje rzeczy: lepiej nic ${this.fOf(by, 'mu', 'jej')} nie dawać, dopóki się nie wytłumaczy.`);
      this.expectStore(s);
      return;
    }
    if (e.kind === 'plant') {
      const mine = s.harvestedBy && s.harvestedBy.t > e.t;
      if ((s.stage === 'tilled' || s.stage === 'empty') && mine) {
        const by = s.harvestedBy.id;
        this.expect.delete(s.id);
        if (by === this.id) return;
        const who = this.agentName(by);
        this.blame(by);
        this.logReact('🤔', `${PLACE(s)} pusto, a coś tu rosło${who ? ` (chyba ${who})` : ''}`, true, 'missing');
        this.speak(`Posadził${this.f('em', 'am')} tu ${CROPS[e.crop] ? CROPS[e.crop].name : 'roślinę'}, a teraz ${PLACE(s)} pusto! ${who ? `To pewnie ${who} zebrał${this.fOf(by, '', 'a')} moje plony.` : 'Ktoś zebrał moje plony?'}`, true);
        if (this.conclude('fieldsRaided', 'Grządki z dala od mojego obozu ktoś obiera: będę sadzić w doniczkach przy sobie i częściej doglądać.')) this.say('postanawia sadzić w doniczkach przy obozie, żeby nikt nie zabierał plonów 🪴🧠', 'learn');
        return;
      }
      // rośnie dłużej, niż się spodziewała: może za sucho?
      if (s.stage === 'planted' && w.time - e.t > FARM.grow * 1.25 && !e.slow) {
        e.slow = true;
        if (s.water <= 0 && !this.known.has('watering')) {
          this.speak('Ta roślina rośnie strasznie wolno... Ziemia jest sucha jak pieprz. Może trzeba ją podlewać?', true);
          this.known.add('watering');
          this.conclude('dryGrowth', 'Na suchej ziemi rośliny rosną wolno: trzeba je podlewać.');
          this.say('wnioskuje, że rośliny trzeba podlewać 💧🧠', 'learn');
        } else this.speak('Rośnie wolniej, niż myślał' + this.f('em', 'am') + '. Trzeba będzie tu częściej zaglądać.');
      }
      if (s.stage === 'ripe' || (s.stage !== 'planted' && !mine)) this.expect.delete(s.id);
    }
  },

  // zmiany przy roślinach: dojrzała, wyschła, ktoś podlał. Postać zauważa je zawsze,
  // a czy coś powie i co z tym zrobi, zależy od priorytetów (humor, zdrowie, zmęczenie, pilne potrzeby)
  noticeChange(s) {
    const st = s.stage === 'planted' ? (s.water > 0 ? 'wet' : 'dry') : s.stage;
    const seen = this.seenPlant || (this.seenPlant = new Map());
    const old = seen.get(s.id);
    seen.set(s.id, st);
    if (!old || old === st) return;
    const mine = s.planter === this.id || s.owner === this.id;
    const what = CROPS[s.crop] ? CROPS[s.crop].name : 'roślina';
    const where = s.kind === 'planter' ? 'w doniczce' : 'na grządce';
    let line = null;
    if (st === 'ripe') line = mine ? `${what[0].toUpperCase() + what.slice(1)} ${where} dojrzał${s.crop === 'flower' ? 'y' : s.crop === 'rye' ? 'o' : ''}! Czas zbierać.` : null;
    else if (st === 'dry' && old === 'wet') {
      this.noticedDry = this.world.time; // przez chwilę bardziej chce podlać
      line = mine ? `Ziemia ${where} wyschła. Trzeba będzie podlać.` : null;
    } else if (st === 'wet' && old === 'dry' && mine && s.wateredBy && s.wateredBy !== this.id) {
      const who = this.agentName(s.wateredBy);
      line = `${who || 'Ktoś'} podlał${this.fOf(s.wateredBy, '', 'a')} moją ${s.kind === 'planter' ? 'doniczkę' : 'grządkę'}. Miło!`;
      if (s.wateredBy != null) this.suspect.delete(s.wateredBy);
    }
    if (!line) return;
    const f = this.reactFactors();
    const say = Math.random() < f.chance * 0.8;
    this.logReact('🌱', line, say ? line : null, 'plant');
    if (say) this.speak(line, true);
  },

  // zmiany w świecie, które postać zauważa po powrocie (nie te, które sama zrobiła albo widziała przed chwilą)
  remark(line, key) {
    const w = this.world;
    if (!line || w.time - (this.remarkT || -1e9) < 20) return; // nie komentuje wszystkiego naraz
    const f = this.reactFactors();
    this.remarkT = w.time;
    if (Math.random() > f.chance * 0.6) { this.logReact('🔎', line, null, 'change'); return; }
    this.logReact('🔎', line, line, 'change');
    this.speak(line, true);
    if (key) this.lastRemark = key;
  },
  noticeRes(m, r) {
    const w = this.world;
    if (!m || w.time - m.t < 25) return; // patrzyła przed chwilą: to nie zaskoczenie
    const by = (r || m.r).lastBy;
    if (by === this.id && w.time - ((r || m.r).lastByT || 0) < 300) return; // sama to zrobiła
    const who = by != null && by !== this.id ? this.agentName(by) : null;
    const tree = m.kind === 'tree' || m.kind === 'palm';
    let line = null;
    if (!r) {
      if (tree) line = `Tu był pień, a teraz zostało gołe miejsce. ${who ? `${who} go wyrwał${this.fOf(by, '', 'a')}?` : 'Ktoś go wyrwał?'}`;
      else if (m.kind === 'rock') line = 'Ta skała zniknęła! Ktoś rozbił ją do końca.';
      else if (m.kind === 'bush' || m.kind === 'rye' || m.kind === 'flower') line = `Tu ${m.kind === 'bush' ? 'rósł krzak' : m.kind === 'rye' ? 'rosło żyto' : 'rosły kwiaty'}, a teraz nic nie ma.`;
    } else if (tree && m.growth >= 1 && r.growth < 1) line = `Ktoś ściął tu drzewo${who ? `, chyba ${who}` : ''}. Został sam pień.`;
    else if (tree && m.growth < 1 && r.growth >= 1) line = 'O, w miejscu pnia wyrosło nowe drzewo.';
    else if (m.kind === 'bush' && m.berries >= 2 && r.berries === 0) line = `Ktoś objadł ten krzak z jagód${who ? `. ${who}?` : '.'}`;
    else if (m.kind === 'bush' && m.berries === 0 && r.berries >= 2) line = 'Na krzaku znów są jagody!';
    else if (m.kind === 'rye' && m.ears > 0 && r.ears === 0) line = 'Ktoś zebrał kłosy z tego żyta.';
    else if (m.kind === 'flower' && m.flowers > 0 && r.flowers === 0) line = 'Ktoś zerwał tu wszystkie kwiaty.';
    else if (m.kind === 'rock' && m.stone - r.stone >= 2) line = 'Ktoś odłupał kawał tej skały.';
    this.remark(line);
  },
  // nowa budowla, której wcześniej tu nie było (postawiona przez kogoś innego)
  noticeNew(s) {
    if (s.owner === this.id || s.kind === 'stash' || this.world.time - (s.t || 0) > 300) return; // tylko świeżo postawione
    const NAMES = { campfire: 'ognisko', shelter: 'szałas', tent: 'namiot', workbench: 'stół', bed: 'łóżko', chest: 'skrzynię', field: 'grządkę', planter: 'doniczkę z rośliną' };
    const who = this.agentName(s.owner);
    if (NAMES[s.kind]) this.remark(`${who ? who + ' postawił' + this.fOf(s.owner, '', 'a') : 'Ktoś postawił'} tu ${NAMES[s.kind]}. ${s.kind === 'chest' || s.kind === 'campfire' ? 'Przyda się.' : 'Ciekawe.'}`);
  },
  // ognisko zgasło albo znów się pali
  noticeFire(s) {
    const lit = s.fuel > 0;
    const seen = this.seenFire || (this.seenFire = new Map());
    const old = seen.get(s.id);
    seen.set(s.id, lit);
    if (old === undefined || old === lit) return;
    if (!lit) { this.noticedOut = this.world.time; this.remark('Ognisko zgasło. Trzeba je rozpalić na nowo.'); }
    else if (s.lastFedBy !== this.id) this.remark('Ognisko znów się pali. Ktoś je rozpalił.');
  },

  // ---------- świadek: postać widzi, jak ktoś inny coś robi z jej rzeczami ----------
  // czy właścicielka tej rzeczy to ja (skrzynia, kupka, łóżko, ognisko, stół, grządka, doniczka)
  ownsThing(s) { return s.owner === this.id || s.planter === this.id; },
  // widzi ten punkt: zasięg, pole widzenia i nic nie zasłania
  canSee(x, z) {
    if (!this.alive || this.asleep) return false;
    const dx = x - this.x, dz = z - this.z, d = Math.hypot(dx, dz);
    const mul = this.viewMul();
    if (d > VIEW_RANGE * mul) return false;
    if (d > VIEW_NEAR && Math.abs(wrapAng(Math.atan2(dx, dz) - this.facing)) > viewHalfAngle(d / mul)) return false;
    return this.lineOfSight(this.x, this.z, x, z);
  },
  // wołane przez tego, kto działa: wszyscy właściciele, którzy to widzą, mogą zareagować
  beSeenDoing(s, act) {
    for (const o of this.world.agents) if (o !== this && o.alive && o.ownsThing(s) && o.canSee(this.x, this.z)) o.witness(this, s, act);
  },
  witness(a, s, act) {
    const w = this.world;
    const key = a.id + ':' + s.id + ':' + act;
    const seen = this.witnessed || (this.witnessed = new Map());
    if (w.time - (seen.get(key) || -1e9) < (act === 'bed' ? 200 : 40)) return; // to samo już widział(a) przed chwilą
    seen.set(key, w.time);
    const fond = this.likeOf(a.id) >= 30, hate = this.likeOf(a.id) <= -30;
    const shared = this.beliefs.has('shared:' + a.id) || fond, distrust = this.beliefs.has('distrust:' + a.id) || hate;
    const he = (m, k) => this.fOf(a.id, m, k);
    const what = { chest: 'skrzyni', stash: 'kupki', bed: 'łóżka' }[s.kind] || 'rzeczy';
    let line = null, mood = 0;
    // to, co postać widzi, zapamiętuje zawsze (nie będzie się potem zastanawiać, kto to był); czy coś powie, zależy od nastroju i zajęcia
    if (act === 'take') {
      if (this.expect.has(s.id)) this.expectStore(s);
      if (shared) line = Math.random() < 0.5 ? (fond ? `Bierz, ${a.name}, dla ciebie nie szkoda.` : `Bierz śmiało, ${a.name}, zapasy są wspólne.`) : null;
      else {
        this.blame(a.id);
        mood = distrust ? -6 : -3;
        line = distrust ? `Hej, ${a.name}! Znowu grzebiesz w mojej ${what}? Zostaw to!` : `${a.name}, to moja ${s.kind === 'chest' ? 'skrzynia' : 'kupka'}. Czego tam szukasz?`;
        if ((this.suspect.get(a.id) || 0) >= 2) this.conclude('distrust:' + a.id, `${a.name} bierze moje rzeczy na moich oczach: lepiej nic ${he('mu', 'jej')} nie dawać, dopóki się nie wytłumaczy.`);
        else this.conclude(null, `Widział${this.f('em', 'am')}, jak ${a.name} bierze z mojej ${what}.`);
      }
    } else if (act === 'store') {
      if (this.expect.has(s.id)) this.expectStore(s);
      this.suspect.delete(a.id);
      mood = 2;
      line = `Dzięki, ${a.name}, że dokładasz do mojej ${what}!`;
    } else if (act === 'bed') {
      mood = shared ? 0 : -4;
      line = shared ? `${a.name} śpi w moim łóżku... Niech ${he('mu', 'jej')} będzie, poszukam innego miejsca.` : `${a.name} śpi w moim łóżku! No ładnie, a ja gdzie mam spać?`;
      if (!shared) this.conclude(null, `${a.name} zajmuje moje łóżko.`);
    } else if (act === 'harvest') {
      this.expect.delete(s.id);
      if (!shared) { this.blame(a.id); mood = -4; }
      line = shared ? `${a.name} zbiera z mojej ${s.kind === 'planter' ? 'doniczki' : 'grządki'}. Niech będzie, byle ${he('zasiał', 'zasiała')} znowu.` : `Hej, ${a.name}! To moje plony, sam${this.f('', 'a')} to posadził${this.f('em', 'am')}!`;
    } else if (act === 'water') {
      this.suspect.delete(a.id);
      mood = 3;
      line = `Dzięki, ${a.name}, że podlewasz moje rośliny!`;
    } else if (act === 'fire') {
      mood = 2;
      line = `Dzięki, ${a.name}, że dokładasz do mojego ognia.`;
    } else if (act === 'bench') {
      line = Math.random() < 0.5 ? `${a.name} majsterkuje przy moim stole. Ciekawe, co z tego wyjdzie.` : null;
    }
    this.mood = clamp(this.mood + mood, 0, 100);
    const REL = { take: shared ? -1 : distrust ? -10 : -6, store: 4, bed: shared ? -1 : -5, harvest: shared ? -2 : -8, water: 6, fire: 3, bench: 0 };
    const WHY = { take: 'bierze moje rzeczy', store: 'dokłada do moich zapasów', bed: 'śpi w moim łóżku', harvest: 'zbiera moje plony', water: 'podlewa moje rośliny', fire: 'pilnuje mojego ognia' };
    if (REL[act]) this.like(a.id, REL[act], WHY[act]);
    const DID = { take: `bierze z mojej ${what}`, store: `dokłada do mojej ${what}`, bed: 'śpi w moim łóżku', harvest: 'zbiera moje plony', water: 'podlewa moje rośliny', fire: 'dokłada do mojego ognia', bench: 'majsterkuje przy moim stole' };
    const f = this.reactFactors();
    // przykre rzeczy trudniej przemilczeć niż miłe
    const say = line && Math.random() <= Math.min(1, f.chance * (mood < 0 ? 1.2 : 0.7));
    this.logReact(mood < 0 ? '😠' : mood > 0 ? '🙂' : '👀', `${a.name} ${DID[act] || act}`, say ? line : null, act);
    if (!say) return;
    this.speakCd = 0;
    this.speak(line, true);
  },

  // forma czasownika zależna od płci postaci (imiona z PERSONAS: Ada, Celina, Ewa to kobiety)
  f(m, k) { return this.female() ? k : m; },
  fOf(id, m, k) { const a = this.world.agents.find((x) => x.id === id); return a && a.female() ? k : m; },
  female() { return /a$/.test(this.name); },
};
