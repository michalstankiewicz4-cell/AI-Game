// Pomiar wydajności: ile czasu każdej klatki zabiera świat, AI, rysowanie (CPU i GPU) i interfejs,
// oraz co najczęściej odpowiada za przycięcia (klatki dłuższe niż 50 ms).
import { $ } from './dom.js';
import { Agent } from '../ai/agent.js';
import { llm } from '../ai/llm.js';

const LAG_MS = 50; // klatka dłuższa niż to = przycięcie (poniżej 20 FPS)
const WINDOW = 600; // ile ostatnich klatek uśredniamy (ok. 10 s przy 60 FPS)

export const CATS = {
  world: '🌍 Świat (zwierzęta, rośliny, ogień, pogoda)',
  ai_decide: '🧠 AI: decyzje',
  ai_path: '🧭 AI: szukanie drogi',
  ai_vision: '👁️ AI: wzrok i pamięć',
  ai_other: '🚶 AI: ruch i potrzeby',
  social: '💬 Rozmowy i narrator',
  render_prep: '🎨 Rysowanie: przygotowanie sceny (CPU)',
  render_draw: '🖌️ Rysowanie: wysyłanie do karty (CPU)',
  gpu: '🎮 Karta graficzna (GPU)',
  ui: '🪟 Interfejs (panele, dziennik)',
  llm: '🤖 Model w przeglądarce (liczy na karcie graficznej)',
  other: '❓ Poza kodem gry (przeglądarka i składanie obrazu, sprzątanie pamięci)',
};

const prof = {
  on: false, cur: {}, depth: 0,
  frames: [], lags: {}, lagTotal: 0, worst: [],
  gpu: { ext: null, gl: null, pending: [], last: 0 },
};
export const perfOn = () => prof.on;

// zmierz fn() i dolicz czas do kategorii (zagnieżdżone wywołania liczą się tylko raz)
export function timed(cat, fn) {
  if (!prof.on) return fn();
  const t0 = performance.now();
  try { return fn(); } finally { prof.cur[cat] = (prof.cur[cat] || 0) + performance.now() - t0; }
}

function wrap(obj, name, cat) {
  const orig = obj[name];
  if (!orig || orig.__perf) return;
  const f = function (...args) {
    if (!prof.on || prof.depth) return orig.apply(this, args);
    prof.depth++;
    const t0 = performance.now();
    try { return orig.apply(this, args); } finally { prof.depth--; prof.cur[cat] = (prof.cur[cat] || 0) + performance.now() - t0; }
  };
  f.__perf = true;
  obj[name] = f;
}

let renderer = null;
export function initPerf(r) {
  renderer = r;
  wrap(Agent.prototype, 'decide', 'ai_decide');
  wrap(Agent.prototype, 'pathTo', 'ai_path');
  wrap(Agent.prototype, 'bfs', 'ai_path');
  wrap(Agent.prototype, 'see', 'ai_vision');
  // rysowanie przez three.js: czas CPU na wysłanie sceny i (jeśli przeglądarka pozwala) czas pracy karty graficznej
  const three = r.renderer;
  const draw = three.render.bind(three);
  three.render = (scene, cam) => {
    if (!prof.on) return draw(scene, cam);
    const g = prof.gpu;
    let q = null;
    if (g.ext && !g.busy) { q = g.gl.createQuery(); g.gl.beginQuery(g.ext.TIME_ELAPSED_EXT, q); g.busy = true; }
    const t0 = performance.now();
    draw(scene, cam);
    prof.cur.render_draw = (prof.cur.render_draw || 0) + performance.now() - t0;
    if (q) { g.gl.endQuery(g.ext.TIME_ELAPSED_EXT); g.pending.push(q); g.busy = false; }
    else if (!g.ext && g.gl && (g.n = (g.n || 0) + 1) % 15 === 0) {
      // bez licznika GPU: co 15. klatkę poczekaj, aż karta skończy rysować, i zmierz, ile to trwało
      const t1 = performance.now();
      g.gl.finish();
      g.last = performance.now() - t1;
      prof.cur.gpuSync = g.last;
    }
  };
  $('perfBtn').onclick = () => togglePerf();
  $('perfClose').onclick = () => togglePerf(false);
  $('perfCopy').onclick = () => {
    const txt = report();
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(
      () => { $('perfCopy').textContent = '✓ Skopiowano'; setTimeout(() => { $('perfCopy').textContent = '📋 Kopiuj raport'; }, 1500); },
      () => { window.prompt('Skopiuj raport:', txt); });
  };
  $('perfReset').onclick = () => resetStats();
}

function resetStats() { prof.llmFrames = 0; prof.allFrames = 0; prof.frames = []; prof.lags = {}; prof.lagTotal = 0; prof.worst = []; prof.started = performance.now(); }

export function togglePerf(v) {
  prof.on = v ?? !prof.on;
  $('perf').classList.toggle('hidden', !prof.on);
  $('perfBtn').classList.toggle('on', prof.on);
  if (prof.on) {
    resetStats();
    const g = prof.gpu;
    if (!g.gl && renderer) {
      g.gl = renderer.renderer.getContext();
      g.ext = g.gl.getExtension('EXT_disjoint_timer_query_webgl2');
    }
  }
}

// odbierz gotowe pomiary GPU (przychodzą z opóźnieniem kilku klatek)
function pollGpu() {
  const g = prof.gpu;
  if (!g.ext) return null;
  let ms = null;
  while (g.pending.length) {
    const q = g.pending[0];
    if (!g.gl.getQueryParameter(q, g.gl.QUERY_RESULT_AVAILABLE)) break;
    const disjoint = g.gl.getParameter(g.ext.GPU_DISJOINT_EXT);
    const ns = g.gl.getQueryParameter(q, g.gl.QUERY_RESULT);
    g.gl.deleteQuery(q); g.pending.shift();
    if (!disjoint) ms = ns / 1e6;
  }
  if (g.pending.length > 8) { for (const q of g.pending) g.gl.deleteQuery(q); g.pending.length = 0; }
  if (ms != null) g.last = ms;
  return g.last;
}

// wywoływane na początku każdej klatki z czasem od poprzedniej (ms) i czasem rysowania całej klatki
export function frameStart() { if (prof.on) { prof.cur = {}; prof.t0 = performance.now(); } }
export function frameEnd(interval, steps) {
  if (!prof.on) return;
  const c = prof.cur;
  c.ai_other = Math.max(0, (c.agents || 0) - (c.ai_decide || 0) - (c.ai_path || 0) - (c.ai_vision || 0));
  delete c.agents;
  c.render_prep = Math.max(0, (c.render || 0) - (c.render_draw || 0));
  delete c.render;
  const gpu = prof.gpu.ext ? pollGpu() : (prof.gpu.last || null);
  if (gpu != null) c.gpu = gpu;
  const work = performance.now() - prof.t0 - (c.gpuSync || 0);
  delete c.gpuSync;
  // reszta przerwy między klatkami, której nie zajęła gra: przeglądarka, GC, model w głównym wątku (albo czekanie na kartę)
  c.other = Math.max(0, interval - work - (gpu != null ? Math.max(0, gpu - work) : 0) - 16.7);
  c.interval = interval; c.steps = steps;
  // czy model w przeglądarce liczył w tej klatce (pytanie w toku albo odpowiedź przyszła w czasie tej przerwy)
  const busy = llm.provider === 'web' && (llm.inflight > 0 || (llm.lastDone || 0) > performance.now() - interval - 5);
  c.llmBusy = busy;
  if (busy) { c.llm = c.other; c.other = 0; }
  prof.llmFrames = (prof.llmFrames || 0) + (busy ? 1 : 0); prof.allFrames = (prof.allFrames || 0) + 1;
  prof.frames.push(c);
  if (prof.frames.length > WINDOW) prof.frames.shift();
  if (interval > LAG_MS && prof.frames.length > 5) {
    let cause = 'other', best = 0;
    for (const k in CATS) if ((c[k] || 0) > best) { best = c[k]; cause = k; }
    // bez pomiaru GPU: długa przerwa przy małej pracy CPU to najczęściej karta graficzna albo przeglądarka
    prof.lags[cause] = (prof.lags[cause] || 0) + 1;
    prof.lagTotal++;
    prof.worst.push({ ms: Math.round(interval), cause, steps });
    prof.worst.sort((a, b) => b.ms - a.ms);
    if (prof.worst.length > 5) prof.worst.length = 5;
  }
  if ((prof.drawT = (prof.drawT || 0) - interval) <= 0) { prof.drawT = 500; renderPanel(); }
}

function stats() {
  const F = prof.frames, n = F.length || 1;
  const rows = Object.keys(CATS).map((k) => {
    const v = F.map((f) => f[k] || 0);
    const avg = v.reduce((t, x) => t + x, 0) / n;
    const max = Math.max(0, ...v);
    return { k, name: CATS[k], avg, max, lags: prof.lags[k] || 0 };
  });
  const iv = F.map((f) => f.interval).sort((a, b) => a - b);
  const fps = iv.length ? 1000 / (iv.reduce((t, x) => t + x, 0) / iv.length) : 0;
  const p95 = iv.length ? iv[Math.floor(iv.length * 0.95)] : 0;
  return { rows, fps, p95, frames: F.length };
}

function renderPanel() {
  const s = stats();
  const g = prof.gpu;
  const top = Object.entries(prof.lags).sort((a, b) => b[1] - a[1])[0];
  $('perfSum').innerHTML = `${Math.round(s.fps)} FPS, 95% klatek szybszych niż ${Math.round(s.p95)} ms. `
    + `Przycięcia (&gt;${LAG_MS} ms): <b>${prof.lagTotal}</b>${top ? `, najczęściej: <b>${CATS[top[0]]}</b>` : ''}.`
    + (g.ext ? '' : '<br><small>Przeglądarka nie podaje dokładnego czasu karty graficznej, więc GPU jest mierzone w przybliżeniu co 15. klatkę.</small>')
    + (prof.allFrames ? `<br><small>Model w przeglądarce liczył w ${Math.round(100 * prof.llmFrames / prof.allFrames)}% klatek; ${prof.lags.llm || 0} z ${prof.lagTotal} przycięć wypadło właśnie wtedy.</small>` : '')
    + (top && top[0] === 'llm' ? '<br><small>Przycięcia robi model językowy: zajmuje kartę graficzną, na której rysuje się gra. Pomaga mocniejsza karta (np. NVIDIA zamiast zintegrowanej), mniejszy model albo Claude API.</small>' : '')
    + (top && top[0] === 'other' ? '<br><small>Przycięcia są poza kodem gry. Przełącz grafikę na „🎨 Niska”: jeśli przycięć ubędzie, to wąskim gardłem jest karta graficzna.</small>' : '')
    + (llm.web.engine && !llm.web.inWorker ? '<br><small>Model językowy liczy w głównym wątku, jego praca też wpada do „poza grą”.</small>' : '');
  const maxAvg = Math.max(0.01, ...s.rows.map((r) => r.avg));
  $('perfRows').innerHTML = s.rows.map((r) => `<tr><td>${r.name}</td><td class="num">${r.avg.toFixed(2)}</td><td class="num">${r.max.toFixed(1)}</td><td class="num">${r.lags || ''}</td><td><i style="width:${Math.round((r.avg / maxAvg) * 60)}px"></i></td></tr>`).join('');
}

export function report() {
  const s = stats();
  const g = prof.gpu;
  const lines = [`Wyspy AI, pomiar wydajności (${s.frames} ostatnich klatek, ${Math.round((performance.now() - (prof.started || 0)) / 1000)} s)`,
    `FPS ${Math.round(s.fps)}, p95 klatki ${Math.round(s.p95)} ms, przycięcia >${LAG_MS} ms: ${prof.lagTotal}`,
    `GPU: ${g.ext ? 'licznik czasu karty' : 'przybliżenie (czekanie na kartę co 15. klatkę)'}; model językowy: ${llm.web.engine ? (llm.web.inWorker ? 'osobny wątek' : 'główny wątek') : llm.provider}`,
    `Karta: ${gpuName()}`,
    `Model w przeglądarce liczył w ${prof.allFrames ? Math.round(100 * prof.llmFrames / prof.allFrames) : 0}% klatek, przycięć w tym czasie: ${prof.lags.llm || 0}`,
    'kategoria | średnio ms | max ms | przycięcia'];
  for (const r of s.rows) lines.push(`${r.name} | ${r.avg.toFixed(2)} | ${r.max.toFixed(1)} | ${r.lags}`);
  lines.push('Najgorsze klatki: ' + prof.worst.map((w) => `${w.ms} ms (${CATS[w.cause]}, kroków symulacji: ${w.steps})`).join('; '));
  return lines.join('\n');
}

function gpuName() {
  try {
    const gl = renderer.renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  } catch { return '?'; }
}

