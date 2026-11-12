// Ustawienia trybu Claude API w menu, licznik tokenów w HUD i przesuwanie okienek.
import { $ } from './dom.js';
import { llm, MODELS, WEB_MODELS, hasWebGPU } from '../ai/llm.js';

const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n));

export function initLlmMenu() {
  const seg = $('optLlm');
  const sync = () => {
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === llm.provider));
    $('webBox').classList.toggle('hidden', llm.provider !== 'web');
    $('claudeBox').classList.toggle('hidden', llm.provider !== 'claude');
    updateWebStatus();
  };
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    llm.provider = b.dataset.v; llm.paused = false; llm.persist(); sync();
  });
  // Claude
  const sel = $('llmModel');
  sel.innerHTML = Object.entries(MODELS).map(([id, m]) => `<option value="${id}">${m.name} · $${m.inp}/$${m.out} za 1M tok.</option>`).join('');
  sel.value = llm.model;
  sel.onchange = () => { llm.model = sel.value; llm.persist(); };
  const key = $('llmKey');
  key.value = llm.key;
  key.onchange = () => llm.setKey(key.value);
  $('llmKeyClear').onclick = () => { key.value = ''; llm.setKey(''); };
  const bud = $('llmBudget');
  bud.value = llm.budget;
  bud.onchange = () => { const v = +bud.value; if (v > 0) { llm.budget = v; llm.persist(); if (llm.usage.cost < v) llm.paused = false; } };
  // model w przeglądarce
  const ws = $('webModel');
  ws.innerHTML = Object.entries(WEB_MODELS).map(([id, m]) => `<option value="${id}">${m.name} · pobranie ${m.size}, VRAM ${m.vram}</option>`).join('');
  ws.value = llm.webModel;
  ws.onchange = () => { llm.webModel = ws.value; llm.persist(); updateWebStatus(); };
  $('webLoad').onclick = () => { llm.loadWeb(); updateWebStatus(); };
  $('tokBtn').onclick = () => { if (confirm('Wyzerować licznik tokenów i wznowić model?')) llm.resetUsage(); };
  setInterval(updateWebStatus, 300);
  sync();
}

// przy starcie gry: w trybie przeglądarkowym zacznij pobierać model, jeśli jeszcze nie działa
export function prepareLlm() { if (llm.provider === 'web' && !llm.webReady) { llm.web.lost = 0; llm.loadWeb(); } }

function updateWebStatus() {
  if (llm.provider !== 'web') return;
  const W = llm.web, st = $('webStatus'), pr = $('webProg');
  let txt, err = false;
  if (!hasWebGPU()) { txt = '⚠️ Brak WebGPU w tej przeglądarce. Użyj Chrome lub Edge na komputerze albo wybierz Claude API.'; err = true; }
  else if (W.error) { txt = '⚠️ ' + W.error; err = true; }
  else if (W.loading) txt = `${W.note ? W.note + ' ' : ''}📥 ${Math.round(W.progress * 100)}% · ${W.text}`;
  else if (llm.webReady) txt = `✅ ${WEB_MODELS[llm.webModel].name} gotowy.`;
  else if (W.note) txt = W.note;
  else txt = 'Model pobierze się po kliknięciu 📥 albo przy starcie gry. Do czasu załadowania postacie działają odruchowo i milczą, bo mówi tylko model.';
  if ($('webModel').value !== llm.webModel) $('webModel').value = llm.webModel;
  st.textContent = txt; st.classList.toggle('err', err);
  pr.classList.toggle('hidden', !W.loading && !llm.webReady);
  pr.firstElementChild.style.width = (llm.webReady ? 100 : W.progress * 100) + '%';
}

// wywoływane co 0,25 s z pętli HUD
export function updateTokens() {
  const b = $('tokBtn');
  b.classList.remove('hidden');
  const u = llm.usage, W = llm.web, web = llm.provider === 'web';
  let st = '';
  if (web) st = !hasWebGPU() ? ' · brak WebGPU' : W.error ? ' · błąd modelu' : W.loading ? ` · 📥 ${Math.round(W.progress * 100)}%` : !llm.webReady ? ' · model nie załadowany' : llm.inflight ? ' · …' : '';
  else st = !llm.key ? ' · brak klucza' : llm.paused ? ' · wstrzymane' : llm.inflight ? ' · …' : '';
  const price = web ? 'za darmo' : `$${u.cost.toFixed(u.cost < 1 ? 3 : 2)}`;
  b.textContent = `🤖 ${fmt(u.input)}↑ ${fmt(u.output)}↓ · ${price}${st}`;
  const bad = web ? (!hasWebGPU() || !!W.error) : (!llm.key || llm.paused);
  b.classList.toggle('err', bad);
  b.classList.toggle('warn', !bad && (web ? W.loading : u.cost > llm.budget * 0.8));
  const who = web ? `${WEB_MODELS[llm.webModel].name} w przeglądarce` : `Claude API (${MODELS[llm.model].name})`;
  b.title = `${who} · zapytań: ${u.calls}, błędów: ${u.errors}\n`
    + `Tokeny wejściowe: ${u.input}, wyjściowe: ${u.output}${web ? '' : ' (z myśleniem modelu)'}\n`
    + (web ? 'Koszt: 0 zł, model liczy na Twojej karcie graficznej' : `Szacunkowy koszt: $${u.cost.toFixed(4)} z limitu $${llm.budget.toFixed(2)}`)
    + (web && W.loading ? `\nPobieranie: ${W.text}` : '')
    + (web && W.error ? `\n${W.error}` : '')
    + (llm.lastError ? `\nOstatni błąd: ${llm.lastError}` : '') + '\nKliknij, by wyzerować licznik.';
}

// przeciąganie okienka za nagłówek; pozycja przeżywa odświeżanie zawartości
export function makeDraggable(el, handleSel) {
  let drag = null;
  el.addEventListener('pointerdown', (e) => {
    if (!e.target.closest(handleSel) || e.target.closest('button') || e.button !== 0) return;
    const r = el.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, id: e.pointerId };
    el.setPointerCapture(e.pointerId);
    el.classList.add('dragging');
    e.preventDefault();
  });
  el.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const x = Math.max(0, Math.min(window.innerWidth - el.offsetWidth, e.clientX - drag.dx));
    const y = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - drag.dy));
    el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.right = 'auto';
    el.style.maxHeight = Math.max(120, window.innerHeight - y - 10) + 'px';
  });
  const end = (e) => { if (drag && e.pointerId === drag.id) { drag = null; el.classList.remove('dragging'); } };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}
