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

  // forma czasownika zależna od płci postaci (imiona z PERSONAS: Ada, Celina, Ewa to kobiety)
  f(m, k) { return this.female() ? k : m; },
  fOf(id, m, k) { const a = this.world.agents.find((x) => x.id === id); return a && a.female() ? k : m; },
  female() { return /a$/.test(this.name); },
};
