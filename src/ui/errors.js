// Zakładka „Błędy”: zbiera błędy gry, modelu i konsoli, z przyciskiem do skopiowania całości.
import { $, esc } from './dom.js';
import { VERSION } from '../version.js';

const list = [];
let onChange = null;

export function reportError(source, msg) {
  const text = String((msg && (msg.stack || msg.message)) || msg || '').slice(0, 2000);
  if (!text) return;
  const last = list[list.length - 1];
  if (last && last.source === source && last.text === text) { last.count++; last.at = new Date(); }
  else list.push({ at: new Date(), source, text, count: 1 });
  if (list.length > 200) list.shift();
  if (onChange) onChange();
}

function hhmmss(d) { return d.toTimeString().slice(0, 8); }

export function errorsText() {
  const head = [`Wyspy AI v${VERSION}`, navigator.userAgent, `WebGPU: ${navigator.gpu ? 'tak' : 'nie'}`, `Strona: ${location.href}`];
  if (window.__gpuInfo) head.push(`Karta (WebGPU): ${window.__gpuInfo}`);
  if (window.__glInfo) head.push(`Karta (WebGL): ${window.__glInfo}`);
  return head.join('\n') + '\n\n' + (list.length ? list.map((e) => `[${hhmmss(e.at)}] ${e.source}${e.count > 1 ? ` (×${e.count})` : ''}: ${e.text}`).join('\n') : 'Brak błędów.');
}

function render() {
  const el = $('errors');
  el.innerHTML = `<div class="err-bar"><button id="errCopy">📋 Kopiuj wszystko</button><button id="errClear">🗑️ Wyczyść</button><span id="errMsg"></span></div>`
    + (list.length ? list.map((e) => `<div class="m err"><span class="t">${hhmmss(e.at)}</span><b>${esc(e.source)}</b>${e.count > 1 ? ` ×${e.count}` : ''}: <code>${esc(e.text)}</code></div>`).join('') : '<div class="m" style="opacity:.6">Brak błędów.</div>');
  $('errCopy').onclick = async () => {
    const t = errorsText();
    try { await navigator.clipboard.writeText(t); $('errMsg').textContent = 'Skopiowano ✓'; }
    catch {
      const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); $('errMsg').textContent = 'Skopiowano ✓'; } catch { $('errMsg').textContent = 'Zaznacz i skopiuj ręcznie'; }
      ta.remove();
    }
  };
  $('errClear').onclick = () => { list.length = 0; render(); updateBadge(); };
  el.scrollTop = el.scrollHeight;
}

function updateBadge() {
  const b = document.querySelector('#feed .tabs button[data-tab="errors"]');
  if (b) b.textContent = list.length ? `⚠️ Błędy (${list.length})` : '⚠️ Błędy';
}

export function initErrors() {
  onChange = () => { updateBadge(); if (!$('errors').classList.contains('hidden')) render(); };
  window.addEventListener('error', (e) => reportError('Strona', e.error || `${e.message} (${e.filename}:${e.lineno})`));
  window.addEventListener('unhandledrejection', (e) => reportError('Obietnica', e.reason));
  // przechwyć też błędy i ostrzeżenia z konsoli (np. z WebLLM)
  for (const level of ['error', 'warn']) {
    const orig = console[level].bind(console);
    console[level] = (...args) => {
      orig(...args);
      const t = args.map((a) => (a instanceof Error ? a.message : typeof a === 'object' ? (() => { try { return JSON.stringify(a); } catch { return String(a); } })() : String(a))).join(' ');
      if (level === 'warn' && /GPU stall|powerPreference/i.test(t)) return; // szum
      reportError(level === 'error' ? 'Konsola' : 'Ostrzeżenie', t);
    };
  }
  // jaka karta graficzna rysuje grę
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) window.__glInfo = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
  } catch { /* brak */ }
  if (navigator.gpu) navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }).then((a) => {
    if (a && a.info) window.__gpuInfo = [a.info.vendor, a.info.architecture, a.info.description].filter(Boolean).join(' ');
  }).catch(() => {});
  return render;
}
