// Ustawienia trybu Claude API w menu, licznik tokenów w HUD i przesuwanie okienek.
import { $ } from './dom.js';
import { llm, MODELS } from '../ai/llm.js';

const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n));

export function initLlmMenu() {
  const seg = $('optLlm');
  const box = $('llmBox');
  const sync = () => {
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === llm.mode));
    box.classList.toggle('hidden', llm.mode === 'off');
  };
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    llm.mode = b.dataset.v; llm.persist(); sync();
  });
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
  $('tokBtn').onclick = () => { if (confirm('Wyzerować licznik tokenów i wznowić tryb Claude?')) llm.resetUsage(); };
  sync();
}

// wywoływane co 0,25 s z pętli HUD
export function updateTokens() {
  const b = $('tokBtn');
  const on = llm.mode !== 'off';
  b.classList.toggle('hidden', !on);
  if (!on) return;
  const u = llm.usage;
  const st = !llm.key ? ' · brak klucza' : llm.paused ? ' · wstrzymane' : llm.inflight ? ' · …' : '';
  b.textContent = `🤖 ${fmt(u.input)}↑ ${fmt(u.output)}↓ · $${u.cost.toFixed(u.cost < 1 ? 3 : 2)}${st}`;
  b.classList.toggle('err', !llm.key || llm.paused);
  b.classList.toggle('warn', !llm.paused && u.cost > llm.budget * 0.8);
  b.title = `Claude API (${MODELS[llm.model].name}) · zapytań: ${u.calls}, błędów: ${u.errors}\n`
    + `Tokeny wejściowe: ${u.input}, wyjściowe: ${u.output} (z myśleniem modelu)\n`
    + `Szacunkowy koszt: $${u.cost.toFixed(4)} z limitu $${llm.budget.toFixed(2)}`
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
