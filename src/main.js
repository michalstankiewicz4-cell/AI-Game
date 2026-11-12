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
import { initLlmMenu, updateTokens, makeDraggable, prepareLlm } from './ui/llmPanel.js';

const state = {
  world: null, agents: [], narrator: null, social: null, speed: 1, paused: false, selected: null,
  opts: { labels: true, bubbles: true, follow: false, aiView: false }, cfg: { agents: 3, islands: 2, seed: 0 }, acc: 0, over: false,
};
const renderer = new Renderer($('app'));
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

initFeed();
$('verLbl').textContent = $('hudVer').textContent = 'v' + VERSION;
document.title = `Wyspy AI v${VERSION} – symulacja przetrwania`;
initMenu(state.cfg, startGame);
initLlmMenu();
makeDraggable($('detail'), '.dhead');
makeDraggable($('agentsWin'), '.win-h');
$('agentsMin').onclick = (e) => { const w = $('agentsWin'); w.classList.toggle('min'); e.target.textContent = w.classList.contains('min') ? '+' : '–'; };
const panCamera = initControls(state, renderer, { select, setSpeed, updatePause, toggleAiView });
$('menuBtn').onclick = () => { state.paused = true; updatePause(); showMenu(); };
$('goRestart').onclick = () => { $('gameover').classList.add('hidden'); rndSeed(); showMenu(); };

// ---------- start gry ----------
function startGame() {
  $('menu').classList.add('hidden');
  $('hud').classList.remove('hidden');
  if (state.opts.aiView) toggleAiView();
  prepareLlm();
  const game = createGame(state.cfg);
  Object.assign(state, game, { selected: null, over: false });
  state.opts.follow = false;
  const world = game.world;
  clearFeed();
  world.onChat = (a, text, ai) => feed('chat', `<b style="color:${hex(a.color)}">${ai ? '🤖 ' : ''}${a.name}:</b> ${esc(text)}`);
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
  feed('chat', `🎙️ Witamy na Wyspach AI! ${n === 1 ? 'Jeden rozbitek' : n + ' rozbitków'} budzi się na plaży. Mają tylko siekierę i kilof, i nie wiedzą nic o tym świecie. Wszystkiego muszą się nauczyć. Zobaczmy, jak sobie poradzą...`, 'narr');
  feed('chat', '🤖 Wszystko, co mówią postacie, wymyśla na bieżąco model językowy (oznaczenie 🤖). Narrator to skrypt gry.', 'narr');
  world.agents.forEach((a, k) => setTimeout(() => a.speak(['Gdzie ja jestem?!', 'Dobra, nie panikujemy. Najpierw rozejrzę się.', 'Wyspa... nic tu nie znam.', 'Mam siekierę i kilof. Coś wymyślę.'][k % 4], true), 600 + k * 900));
}

// ---------- pętla ----------
let last = performance.now(), hudT = 0;
function loop(now) {
  const rdt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const w = state.world;
  if (w) {
    if (!state.paused && !state.over) {
      state.acc += rdt * state.speed;
      let steps = 0;
      while (state.acc >= STEP && steps < 100) {
        state.acc -= STEP; steps++;
        stepGame(state, (t) => feed('chat', esc(t), 'narr'));
      }
      for (const e of w.events) feed('log', e.text, e.kind);
      // ważne zdarzenia także w komentarzach
      for (const e of w.events) if (e.kind === 'big' || e.kind === 'death' || e.kind === 'learn') feed('chat', '📜 ' + e.text, e.kind); // zdarzenia gry (nie wypowiedzi)
      w.events.length = 0;
      if (state.agents.every((a) => !a.alive)) gameOver();
    }
    panCamera(rdt);
    renderer.frame(w, state.agents, state.selected, now / 1000, state.opts);
    hudT -= rdt;
    if (hudT <= 0) { hudT = 0.25; updateHud(state); updateTokens(); }
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
