// Opcjonalny „mózg” postaci z modelem językowym:
//  - Claude API (klucz wpisuje gracz; zostaje tylko w localStorage tej przeglądarki, nigdy w repo),
//  - darmowy model z Hugging Face uruchamiany w przeglądarce (WebLLM + WebGPU).
import { FOOD, ITEM_LABELS, TOOL_LABELS, RECIPE_NAMES } from './data.js';
import { FREE_SYSTEM, describeFree } from './intent.js';

export const MODELS = {
  'claude-opus-5-5': { name: 'Claude Opus 5.5', inp: 4, out: 20 },
  'claude-sonnet-5-5': { name: 'Claude Sonnet 5.5', inp: 2, out: 10 },
  'claude-haiku-5-5': { name: 'Claude Haiku 5.5', inp: 0.10, out: 0.50 },
};
export const WEB_MODELS = {
  // od najlżejszego; po utracie karty graficznej gra schodzi na lżejszy
  'Qwen2.5-0.5B-Instruct-q4f16_1-MLC': { name: 'Qwen2.5 0.5B (najlżejszy)', size: '~0,4 GB', vram: '0,9 GB' },
  'Llama-3.2-1B-Instruct-q4f16_1-MLC': { name: 'Llama 3.2 1B', size: '~0,7 GB', vram: '0,9 GB' },
  'Qwen2.5-1.5B-Instruct-q4f16_1-MLC': { name: 'Qwen2.5 1.5B (najmądrzejszy)', size: '~1 GB', vram: '1,6 GB' },
};
const WEBLLM_URL = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.86/+esm';
const LS = 'wyspyai.llm';
const LS_KEY = 'wyspyai.apiKey';
const AGENT_CD = { claude: 25, web: 20 }; // s czasu gry między zapytaniami jednej postaci
const GLOBAL_GAP = { claude: 2500, web: 4000 }; // model w przeglądarce dzieli kartę z grafiką, więc daje jej oddech // ms czasu rzeczywistego między dowolnymi zapytaniami
const MAX_INFLIGHT = { claude: 2, web: 1 };    // model w przeglądarce liczy jedno zapytanie naraz

function load(k, def) { try { const v = localStorage.getItem(k); return v == null ? def : v; } catch { return def; } }
function save(k, v) { try { if (v == null || v === '') localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* prywatne okno */ } }

export const hasWebGPU = () => typeof navigator !== 'undefined' && !!navigator.gpu;

class LLM {
  constructor() {
    let s = {};
    try { s = JSON.parse(load(LS, '{}')) || {}; } catch { s = {}; }
    // zgodność ze starszym zapisem (mode: off/talk/decide)
    this.provider = s.provider === 'claude' ? 'claude' : 'web';
    this.model = MODELS[s.model] ? s.model : 'claude-opus-5-5';
    this.webModel = WEB_MODELS[s.webModel] ? s.webModel : 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';
    this.budget = +s.budget > 0 ? +s.budget : 1;
    this.freedom = !!s.freedom; // „pełna swoboda”: model sam wymyśla zamiar
    this.key = load(LS_KEY, '');
    this.web = { engine: null, id: null, loading: false, progress: 0, text: '', error: '', note: '', lost: 0 };
    this.usage = { input: 0, output: 0, calls: 0, errors: 0, cost: 0 };
    this.inflight = 0;
    this.lastCall = -1e9;
    this.lastError = '';
    this.paused = false; // wstrzymane po przekroczeniu budżetu lub błędzie klucza
  }
  persist() { save(LS, JSON.stringify({ provider: this.provider, model: this.model, webModel: this.webModel, budget: this.budget, freedom: this.freedom })); }
  setKey(k) { this.key = (k || '').trim(); save(LS_KEY, this.key); this.paused = false; this.lastError = ''; }
  get webReady() { return !!this.web.engine && this.web.id === this.webModel; }
  get active() {
    if (this.paused) return false;
    if (this.provider === 'claude') return !!this.key;
    if (this.provider === 'web') return this.webReady;
    return false;
  }
  get decides() { return this.active; }
  resetUsage() { this.usage = { input: 0, output: 0, calls: 0, errors: 0, cost: 0 }; this.paused = false; this.lastError = ''; }

  // pobranie i uruchomienie modelu w przeglądarce (za pierwszym razem pobiera pliki z Hugging Face, potem z pamięci podręcznej)
  async loadWeb() {
    const W = this.web;
    if (this.webReady || W.loading) return;
    W.error = '';
    if (!hasWebGPU()) { W.error = 'Ta przeglądarka nie obsługuje WebGPU (spróbuj Chrome lub Edge na komputerze).'; return; }
    W.loading = true; W.progress = 0; W.text = 'Ładowanie biblioteki WebLLM...';
    try {
      if (W.engine) { try { await W.engine.unload(); } catch { /* ignoruj */ } W.engine = null; W.id = null; }
      const webllm = await import(WEBLLM_URL);
      const id = this.webModel;
      const engine = await webllm.CreateMLCEngine(id, {
        initProgressCallback: (r) => { W.progress = r.progress || 0; W.text = r.text || ''; },
      }, { context_window_size: 1536 }); // mniejsza pamięć podręczna = mniej VRAM
      W.engine = engine; W.id = id; W.progress = 1; W.text = 'Model gotowy';
    } catch (e) {
      W.loading = false;
      if (!this.webLost(e)) W.error = 'Nie udało się uruchomić modelu: ' + String(e.message || e).slice(0, 200);
    } finally { W.loading = false; }
  }

  // karta graficzna „zgubiła” urządzenie (za mało pamięci, przeciążenie): zejdź na lżejszy model i spróbuj ponownie
  webLost(e) {
    const msg = String((e && e.message) || e || '');
    const W = this.web;
    // po resecie karty Chrome blokuje WebGPU dla tej strony aż do odświeżenia
    if (/compatible GPU|adapter/i.test(msg)) {
      W.engine = null; W.id = null;
      W.error = W.lost > 0
        ? `Po resecie karty graficznej przeglądarka blokuje WebGPU do odświeżenia strony. Odśwież stronę (F5), gra zapamiętała lżejszy model: ${WEB_MODELS[this.webModel].name}.`
        : 'Przeglądarka nie znalazła karty graficznej z WebGPU. Sprawdź, czy w Chrome/Edge jest włączona akceleracja sprzętowa, albo wybierz Claude API.';
      return true;
    }
    if (!/device|lost|hung|memory|not loaded|unload/i.test(msg)) return false;
    W.engine = null; W.id = null; W.lost++;
    const ids = Object.keys(WEB_MODELS);
    const k = ids.indexOf(this.webModel);
    if (k > 0) {
      this.webModel = ids[k - 1]; this.persist();
      W.note = `Karta graficzna nie udźwignęła modelu, przełączam na lżejszy: ${WEB_MODELS[this.webModel].name}.`;
    } else if (W.lost > 2) {
      W.error = 'Karta graficzna nie daje rady nawet z najmniejszym modelem. Spróbuj Claude API albo zamknij inne karty i odśwież stronę.';
      return true;
    } else W.note = 'Karta graficzna się zresetowała, ponownie uruchamiam model...';
    setTimeout(() => this.loadWeb(), 3000);
    return true;
  }

  // czy postać może teraz zapytać model
  canAsk(agent) {
    const p = this.provider;
    if (!this.active || this.inflight >= MAX_INFLIGHT[p]) return false;
    if (performance.now() - this.lastCall < GLOBAL_GAP[p]) return false;
    if (agent.llmBusy || agent.world.time < (agent.llmNext || 0)) return false;
    if (p === 'claude' && this.usage.cost >= this.budget) { this.paused = true; this.lastError = `Osiągnięto limit $${this.budget.toFixed(2)}`; return false; }
    return true;
  }

  // agent wybiera jedną z opcji (labels) i mówi krótką myśl; wynik trafia asynchronicznie do agenta
  ask(agent, labels) {
    if (!this.canAsk(agent)) return false;
    agent.llmBusy = true;
    agent.llmNext = agent.world.time + AGENT_CD[this.provider];
    this.lastCall = performance.now();
    this.inflight++;
    const decide = true; // model zawsze decyduje i mówi
    const sys = `Grasz postacią w symulacji przetrwania na tropikalnych wyspach. Odpowiadasz wyłącznie jednym obiektem JSON, bez żadnego innego tekstu. `
      + (decide ? 'Format: {"wybor": <numer opcji>, "mysl": "<krótka wypowiedź>"}. ' : 'Format: {"mysl": "<krótka wypowiedź>"}. ')
      + 'Wypowiedź to jedno zdanie po polsku (do 14 słów), mówione na głos w pierwszej osobie, zgodnie z charakterem postaci, jak komentarz streamera. Wymyśl ją sam(a), za każdym razem inaczej. Bez cudzysłowów w środku.';
    const free = this.freedom;
    const user = free ? describeFree(agent) : describe(agent, labels, decide);
    const started = agent.world.time;
    this.call(free ? FREE_SYSTEM : sys, user, 160)
      .then((txt) => {
        let j = parseJson(txt);
        // mały model czasem odpowie zwykłym tekstem albo innymi kluczami: bierzemy, co się da
        if (!j) { const t = (txt || '').replace(/[{}"]/g, '').trim(); if (!t) throw new Error('Pusta odpowiedź modelu'); j = { mysl: t.split('\n')[0] }; }
        const pickStr = (...ks) => { for (const k of ks) if (typeof j[k] === 'string' && j[k].trim()) return j[k]; return ''; };
        j.mysl = pickStr('mysl', 'myśl', 'thought', 'wypowiedz', 'wypowiedź', 'text');
        j.zamiar = pickStr('zamiar', 'intent', 'akcja', 'action');
        if (j.wybor == null) j.wybor = j['wybór'] ?? j.choice;
        const thought = j.mysl.trim().replace(/^["„]|["”]$/g, '').slice(0, 140);
        let label = null, intent = null;
        if (free) intent = typeof j.zamiar === 'string' ? j.zamiar.trim().slice(0, 80) : '';
        else if (decide) { const n = Math.round(+j.wybor); if (n >= 1 && n <= labels.length) label = labels[n - 1]; }
        agent.onLLM({ label, thought, intent, at: started });
      })
      .catch((e) => { this.usage.errors++; this.lastError = String(e.message || e).slice(0, 160); })
      .finally(() => { this.inflight--; agent.llmBusy = false; });
    return true;
  }

  call(system, user, maxTokens) {
    return this.provider === 'web' ? this.callWeb(system, user, maxTokens) : this.callClaude(system, user, maxTokens);
  }

  async callWeb(system, user, maxTokens) {
    const engine = this.web.engine;
    if (!engine) throw new Error('Model nie jest załadowany');
    let r;
    try {
      r = await engine.chat.completions.create({
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        max_tokens: maxTokens,
        temperature: 0.7,
        response_format: { type: 'json_object' },
      });
    } catch (e) { this.webLost(e); throw e; }
    const u = r.usage || {};
    this.usage.input += u.prompt_tokens || 0; this.usage.output += u.completion_tokens || 0; this.usage.calls++;
    return r.choices?.[0]?.message?.content || '';
  }

  async callClaude(system, user, maxTokens) {
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
  if (a.notes && a.notes.length) s += `Co się ostatnio działo w twojej głowie i wokół (opisz to własnymi słowami, nie cytuj): ${a.notes.join(' | ')}\n`;
  if (a.lastSaid) s += `Twoja poprzednia wypowiedź (nie powtarzaj jej): ${a.lastSaid}\n`;
  if (decide) s += `Możliwe działania (lokalna ocena od najlepszego):\n${labels.map((l, n) => `${n + 1}. ${l}`).join('\n')}\nWybierz jedno działanie, dbając o przeżycie, i powiedz, co myślisz.`;
  else s += `Właśnie zaczynasz: ${labels[0]}. Skomentuj to na głos.`;
  return s;
}

export const llm = new LLM();
