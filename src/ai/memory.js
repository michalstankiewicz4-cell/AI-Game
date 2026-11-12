// Pamięć oczekiwań: postać pamięta, co gdzie zostawiła i posadziła. Gdy wraca i czegoś nie ma,
// zastanawia się, co się stało, wyciąga wnioski i zmienia zachowanie.
import { MAT_NAMES, FOOD, CROPS, FARM } from './data.js';

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

  conclude(key, text) {
    const fresh = key && !this.beliefs.has(key);
    if (key) this.beliefs.add(key);
    this.conclusions = this.conclusions.filter((c) => c !== text).concat(text).slice(-4);
    return fresh;
  },
  blame(id) { this.suspect.set(id, (this.suspect.get(id) || 0) + 1); },
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
    if (Math.random() < f.chance * 0.8) this.speak(line, true);
  },

  // zmiany w świecie, które postać zauważa po powrocie (nie te, które sama zrobiła albo widziała przed chwilą)
  remark(line, key) {
    const w = this.world;
    if (!line || w.time - (this.remarkT || -1e9) < 20) return; // nie komentuje wszystkiego naraz
    const f = this.reactFactors();
    if (Math.random() > f.chance * 0.6) return;
    this.remarkT = w.time;
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

  // forma czasownika zależna od płci postaci (imiona z PERSONAS: Ada, Celina, Ewa to kobiety)
  f(m, k) { return this.female() ? k : m; },
  fOf(id, m, k) { const a = this.world.agents.find((x) => x.id === id); return a && a.female() ? k : m; },
  female() { return /a$/.test(this.name); },
};
