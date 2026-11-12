// Punkt wejścia: spina grę, render i interfejs, prowadzi pętlę klatek.
import { toWorld } from './world/world.js';
import { Renderer } from './render/renderer.js';
import { createGame, stepGame, STEP } from './game.js';
import { $, esc, hex } from './ui/dom.js';
import { addFeed, clearFeed, initFeed } from './ui/feed.js';
import { initMenu, showMenu, rndSeed } from './ui/menu.js';
import { initControls } from './ui/controls.js';
import { buildAgentCards, renderDetail, updateHud } from './ui/panels.js';
import { VERSION } from './version.js';
import { initErrors } from './ui/errors.js';
import { initWiki, toggleWiki, wikiOpen, scanDiscoveries } from './ui/wiki.js';
import { initLlmMenu, updateTokens, makeDraggable, prepareLlm } from './ui/llmPanel.js';
import { initPerf, togglePerf, timed, frameStart, frameEnd } from './ui/perf.js';

const state = {
  world: null, agents: [], narrator: null, social: null, speed: 1, paused: false, selected: null,
  opts: { labels: true, bubbles: true, follow: false, aiView: false }, cfg: { agents: 1, islands: 1, seed: 0, knowledge: 'learn' }, acc: 0, over: false,
};
const renderer = new Renderer($('app'));
let quality = 'high';
try { quality = localStorage.getItem('wyspyai.quality') === 'low' ? 'low' : 'high'; } catch { /* brak dostępu */ }
function applyQuality() { renderer.setQuality(quality); $('qualityBtn').textContent = quality === 'low' ? '🎨 Niska' : '🎨 Wysoka'; }
applyQuality();
$('qualityBtn').onclick = () => {
  quality = quality === 'low' ? 'high' : 'low';
  try { localStorage.setItem('wyspyai.quality', quality); } catch { /* brak dostępu */ }
  applyQuality();
};
renderer.onPick = (a) => select(a);
const feed = (target, html, cls) => addFeed(state.world, target, html, cls);

// ---------- akcje interfejsu ----------
function select(a) {
  state.selected = a;
  state.opts.follow = !!a;
  if (a) renderer.flyTo();
  $('detail').classList.toggle('hidden', !a);
  document.querySelectorAll('.acard').forEach((c) => c.classList.toggle('sel', a && +c.dataset.id === a.id));
  if (a) renderDetail(state);
}
function setSpeed(s) {
  state.speed = s; state.paused = false; updatePause();
  document.querySelectorAll('.speed button[data-speed]').forEach((x) => x.classList.toggle('on', +x.dataset.speed === s));
}
function updatePause() { $('pauseBtn').textContent = state.paused ? '▶' : '⏸'; }
function toggleAiView() {
  state.opts.aiView = !state.opts.aiView;
  if (state.opts.aiView && !state.selected) select(state.agents.find((a) => a.alive) || state.agents[0]);
  $('aiViewBtn').classList.toggle('on', state.opts.aiView);
}

initFeed(initErrors());
$('verLbl').textContent = $('hudVer').textContent = 'v' + VERSION;
document.title = `Wyspy AI v${VERSION} – symulacja przetrwania`;
initMenu(state.cfg, startGame);
// moduły gry wczytane: Start działa
$('startBtn').disabled = false;
if ($('startBtn').querySelector('.spin')) $('startBtn').textContent = '▶ Start';
initLlmMenu();
makeDraggable($('detail'), '.dhead');
makeDraggable($('agentsWin'), '.win-h');
$('agentsMin').onclick = (e) => { const w = $('agentsWin'); w.classList.toggle('min'); e.target.textContent = w.classList.contains('min') ? '+' : '–'; };
const panCamera = initControls(state, renderer, { select, setSpeed, updatePause, toggleAiView, toggleWiki, wikiOpen, togglePerf });
initPerf(renderer);
makeDraggable($('perf'), '.win-h');
initWiki(() => state.world);
$('menuBtn').onclick = () => { toggleWiki(false); state.paused = true; updatePause(); showMenu(); };
$('goRestart').onclick = () => { $('gameover').classList.add('hidden'); rndSeed(); showMenu(); };

// ---------- start gry ----------
let firstFrame = null; // wywoływane po narysowaniu pierwszej klatki nowego świata
function startGame() {
  // pokaż loader i oddaj przeglądarce chwilę, żeby go narysowała, zanim zacznie się ciężka praca
  $('loading').classList.remove('hidden');
  $('loadText').textContent = 'Budowanie świata…';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    try { buildGame(); } catch (e) { $('loading').classList.add('hidden'); throw e; }
    firstFrame = () => $('loading').classList.add('hidden');
  }));
}
function buildGame() {
  $('menu').classList.add('hidden');
  $('hud').classList.remove('hidden');
  if (state.opts.aiView) toggleAiView();
  prepareLlm();
  const game = createGame(state.cfg);
  Object.assign(state, game, { selected: null, over: false });
  state.opts.follow = false;
  const world = game.world;
  clearFeed();
  // rozmowa dwóch postaci ma własny kolor: „Ada → Bruno”
  world.onChat = (a, text, ai, to) => feed('chat', `<b style="color:${hex(a.color)}">${ai ? '🤖 ' : '📜 '}${a.name}${to ? ` <span class="to">→ ${to.name}</span>` : ''}:</b> ${to ? `<span class="say">${esc(text)}</span>` : esc(text)}`, to ? 'dialog' : '');
  renderer.build(world);
  // kamera nad wyspą startową
  const c = world.islandDefs[0];
  const p = toWorld(c.ci, c.cj);
  renderer.controls.target.set(p.x, 0, p.z);
  renderer.camera.position.set(p.x - 6, 42, p.z + 40);
  renderer.controls.update();
  buildAgentCards(state, select);
  $('detail').classList.add('hidden');
  state.paused = false; updatePause();
  const n = state.cfg.agents;
  feed('chat', `🎙️ Witamy na Wyspach AI! ${n === 1 ? 'Jeden rozbitek' : n + ' rozbitków'} budzi się na plaży. Mają tylko siekierę i kilof${state.cfg.knowledge === 'all' ? ', ale znają ten świat na wylot. Zobaczmy, jak szybko urządzą obóz...' : ' i nie wiedzą nic o tym świecie. Wszystkiego muszą się nauczyć. Zobaczmy, jak sobie poradzą...'}`, 'narr');
  feed('chat', '🤖 Postacie mówią przez model językowy (🤖). Dopóki model się ładuje albo nie działa, mówi za nie skrypt (📜). Narrator to skrypt gry.', 'narr');
  world.agents.forEach((a, k) => setTimeout(() => a.speak(['Gdzie ja jestem?!', 'Dobra, nie panikujemy. Najpierw rozejrzę się.', 'Wyspa... nic tu nie znam.', 'Mam siekierę i kilof. Coś wymyślę.'][k % 4], true), 600 + k * 900));
}

// ---------- pętla ----------
let last = performance.now(), hudT = 0, fps = 60;
function loop(now) {
  const interval = now - last;
  const rdt = Math.min(0.1, interval / 1000);
  frameStart();
  let steps = 0;
  if (now > last) fps = fps * 0.95 + (1000 / (now - last)) * 0.05;
  last = now;
  const w = state.world;
  if (w) {
    if (!state.paused && !state.over) {
      state.acc += rdt * state.speed;
      while (state.acc >= STEP && steps < 100) {
        state.acc -= STEP; steps++;
        stepGame(state, (t) => feed('chat', esc(t), 'narr'));
      }
      timed('ui', () => {
        for (const e of w.events) feed('log', e.text, e.kind);
        // ważne zdarzenia także w komentarzach
        for (const e of w.events) if (e.kind === 'big' || e.kind === 'death' || e.kind === 'learn') feed('chat', '📜 ' + e.text, e.kind); // zdarzenia gry (nie wypowiedzi)
      });
      w.events.length = 0;
      if (state.agents.every((a) => !a.alive)) gameOver();
    }
    // ułamek drogi do następnego kroku symulacji (do płynnego rysowania ruchu)
    w.alpha = state.paused || state.over ? 1 : Math.min(1, state.acc / STEP);
    panCamera(rdt);
    timed('render', () => renderer.frame(w, state.agents, state.selected, now / 1000, state.opts));
    if (firstFrame) { firstFrame(); firstFrame = null; }
    hudT -= rdt;
    if (hudT <= 0) timed('ui', () => { hudT = 0.25; updateHud(state); updateTokens(); scanDiscoveries(w); $('fpsLbl').textContent = Math.round(fps) + ' FPS'; });
    frameEnd(interval, steps);
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

function gameOver() {
  state.over = true;
  const w = state.world;
  const best = [...state.agents].sort((a, b) => (b.diedAt || 0) - (a.diedAt || 0))[0];
  $('goText').innerHTML = `Wszyscy rozbitkowie zginęli. Przetrwali do <b>${w.day()}. dnia</b>.<br>Najdłużej wytrzymał(a): <b>${best.name}</b>.<br>Zbudowane segmenty mostów: ${w.bridgeTotals().built}/${w.bridgeTotals().total}.`;
  setTimeout(() => $('gameover').classList.remove('hidden'), 2500);
}

// podgląd dla testów
window.__game = state;
window.__renderer = renderer;
