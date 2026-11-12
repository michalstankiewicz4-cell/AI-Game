// Opcjonalny tryb LLM: postacie myślą i/lub mówią przez Claude API.
// Klucz API wpisuje gracz; zostaje tylko w localStorage tej przeglądarki, nigdy w repo.
import { FOOD, ITEM_LABELS, TOOL_LABELS, RECIPE_NAMES } from './data.js';

export const MODELS = {
  'claude-opus-5-5': { name: 'Claude Opus 5.5', inp: 4, out: 20 },
  'claude-sonnet-5-5': { name: 'Claude Sonnet 5.5', inp: 2, out: 10 },
  'claude-haiku-5-5': { name: 'Claude Haiku 5.5', inp: 0.10, out: 0.50 },
};
const LS = 'wyspyai.llm';
const LS_KEY = 'wyspyai.apiKey';
const AGENT_CD = 25;      // s czasu gry między zapytaniami jednej postaci
const GLOBAL_GAP = 2500;  // ms czasu rzeczywistego między dowolnymi zapytaniami
const MAX_INFLIGHT = 2;

function load(k, def) { try { const v = localStorage.getItem(k); return v == null ? def : v; } catch { return def; } }
function save(k, v) { try { if (v == null || v === '') localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* prywatne okno */ } }

class LLM {
  constructor() {
    let s = {};
    try { s = JSON.parse(load(LS, '{}')) || {}; } catch { s = {}; }
    this.mode = ['off', 'talk', 'decide'].includes(s.mode) ? s.mode : 'off';
    this.model = MODELS[s.model] ? s.model : 'claude-opus-5-5';
    this.budget = +s.budget > 0 ? +s.budget : 1;
    this.key = load(LS_KEY, '');
    this.usage = { input: 0, output: 0, calls: 0, errors: 0, cost: 0 };
    this.inflight = 0;
    this.lastCall = -1e9;
    this.lastError = '';
    this.paused = false; // wstrzymane po przekroczeniu budżetu lub błędzie klucza
  }
  persist() { save(LS, JSON.stringify({ mode: this.mode, model: this.model, budget: this.budget })); }
  setKey(k) { this.key = (k || '').trim(); save(LS_KEY, this.key); this.paused = false; this.lastError = ''; }
  get active() { return this.mode !== 'off' && !!this.key && !this.paused; }
  get decides() { return this.active && this.mode === 'decide'; }
  resetUsage() { this.usage = { input: 0, output: 0, calls: 0, errors: 0, cost: 0 }; this.paused = false; this.lastError = ''; }

  // czy postać może teraz zapytać model
  canAsk(agent) {
    if (!this.active || this.inflight >= MAX_INFLIGHT) return false;
    if (performance.now() - this.lastCall < GLOBAL_GAP) return false;
    if (agent.llmBusy || agent.world.time < (agent.llmNext || 0)) return false;
    if (this.usage.cost >= this.budget) { this.paused = true; this.lastError = `Osiągnięto limit $${this.budget.toFixed(2)}`; return false; }
    return true;
  }

  // agent wybiera jedną z opcji (labels) i mówi krótką myśl; wynik trafia asynchronicznie do agenta
  ask(agent, labels) {
    if (!this.canAsk(agent)) return false;
    agent.llmBusy = true;
    agent.llmNext = agent.world.time + AGENT_CD;
    this.lastCall = performance.now();
    this.inflight++;
    const decide = this.mode === 'decide';
    const sys = `Grasz postacią w symulacji przetrwania na tropikalnych wyspach. Odpowiadasz wyłącznie jednym obiektem JSON, bez żadnego innego tekstu. `
      + (decide ? 'Format: {"wybor": <numer opcji>, "mysl": "<krótka wypowiedź>"}. ' : 'Format: {"mysl": "<krótka wypowiedź>"}. ')
      + 'Wypowiedź to jedno zdanie po polsku (do 14 słów), mówione na głos w pierwszej osobie, zgodnie z charakterem postaci, jak komentarz streamera. Bez cudzysłowów w środku.';
    const user = describe(agent, labels, decide);
    const started = agent.world.time;
    this.call(sys, user, decide ? 160 : 120)
      .then((txt) => {
        const j = parseJson(txt);
        if (!j) throw new Error('Model nie zwrócił JSON-a');
        const thought = typeof j.mysl === 'string' ? j.mysl.trim().slice(0, 140) : '';
        let label = null;
        if (decide) { const n = Math.round(+j.wybor); if (n >= 1 && n <= labels.length) label = labels[n - 1]; }
        agent.onLLM({ label, thought, at: started });
      })
      .catch((e) => { this.usage.errors++; this.lastError = String(e.message || e).slice(0, 160); })
      .finally(() => { this.inflight--; agent.llmBusy = false; });
    return true;
  }

  async call(system, user, maxTokens) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1024 + maxTokens, // zapas na wewnętrzne myślenie modelu
        output_config: { effort: 'low' },
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || `HTTP ${res.status}`;
      if (res.status === 401 || res.status === 403) { this.paused = true; throw new Error('Nieprawidłowy klucz API: ' + msg); }
      if (res.status === 400 && /credit|billing/i.test(msg)) this.paused = true;
      throw new Error(msg);
    }
    const u = data.usage || {};
    const inTok = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
    const outTok = u.output_tokens || 0;
    const price = MODELS[this.model];
    this.usage.input += inTok; this.usage.output += outTok; this.usage.calls++;
    this.usage.cost += (inTok * price.inp + outTok * price.out) / 1e6;
    if (data.stop_reason === 'refusal') throw new Error('Model odmówił odpowiedzi');
    const txt = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    if (!txt && data.stop_reason === 'max_tokens') throw new Error('Ucięta odpowiedź (max_tokens)');
    return txt;
  }
}

function parseJson(txt) {
  const m = /\{[\s\S]*\}/.exec(txt || '');
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

function describe(a, labels, decide) {
  const w = a.world;
  const inv = Object.entries(a.inv).filter(([, v]) => v > 0).map(([k, v]) => `${ITEM_LABELS[k]} ×${v}`).join(', ') || 'nic';
  const tools = Object.entries(a.tools).filter(([, v]) => v).map(([k]) => TOOL_LABELS[k]).join(', ');
  const recipes = [...a.known].filter((r) => RECIPE_NAMES[r]).map((r) => RECIPE_NAMES[r]).join(', ') || 'żadnych';
  const edible = [...a.edible].filter(([, v]) => v).map(([k]) => FOOD[k].name).join(', ') || 'nie wiadomo';
  const others = w.agents.filter((o) => o !== a).map((o) => `${o.name} (${o.alive ? (o.task ? o.task.label : 'myśli') : 'nie żyje'})`).join('; ') || 'jesteś sam(a)';
  let s = `Postać: ${a.name}, ${a.role}. Dzień ${w.day()}, godz. ${w.clock()}${w.isNight() ? ' (noc)' : ''}. Wyspa ${a.island + 1} z ${w.islandDefs.length}.\n`
    + `Potrzeby 0-100 (100 = w pełni zaspokojone): głód ${Math.round(a.hunger)}, pragnienie ${Math.round(a.thirst)}, energia ${Math.round(a.energy)}, zdrowie ${Math.round(a.health)}.\n`
    + `Ekwipunek: ${inv}. Narzędzia: ${tools}. Znane receptury: ${recipes}. Jadalne: ${edible}.\n`
    + `Pozostali: ${others}.\n`;
  if (a.bubble) s += `Twoja ostatnia wypowiedź: ${a.bubble.text}\n`;
  if (decide) s += `Możliwe działania (lokalna ocena od najlepszego):\n${labels.map((l, n) => `${n + 1}. ${l}`).join('\n')}\nWybierz jedno działanie, dbając o przeżycie, i powiedz, co myślisz.`;
  else s += `Właśnie zaczynasz: ${labels[0]}. Skomentuj to na głos.`;
  return s;
}

export const llm = new LLM();
