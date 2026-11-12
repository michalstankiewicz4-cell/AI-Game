// Spina świat, agentów, render i interfejs.
import { World, W, H, idx, toWorld, T } from './world.js';
import { Agent, PERSONAS, computeShores, ITEM_LABELS, TOOL_LABELS } from './agent.js';
import { Renderer } from './render.js';
import { Narrator } from './commentary.js';
import { Social } from './social.js';

const $ = (id) => document.getElementById(id);
const STEP = 0.1; // krok symulacji (s)

const state = {
  world: null, agents: [], narrator: null, speed: 1, paused: false, selected: null, follow: false,
  opts: { labels: true, bubbles: true, follow: false, aiView: false }, cfg: { agents: 3, islands: 2, seed: 0 }, acc: 0, over: false,
};
const renderer = new Renderer($('app'));
renderer.onPick = (a) => select(a);

// ---------- menu ----------
function segment(id, key) {
  const el = $(id);
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    el.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    state.cfg[key] = +b.dataset.v;
    describeMode();
  });
}
segment('optAgents', 'agents');
segment('optIslands', 'islands');
const rndSeed = () => { $('optSeed').value = 1 + Math.floor(Math.random() * 99999); };
rndSeed();
$('seedRnd').onclick = rndSeed;

function describeMode() {
  const { agents: a, islands: i } = state.cfg;
  const who = a === 1 ? 'Samotny rozbitek' : `${a} rozbitków`;
  let txt = `${who} na ${i === 1 ? 'jednej wyspie' : `wyspie startowej spośród ${i}`}. `;
  if (i === 1) txt += 'Wszystko jest na miejscu: drewno, kamienie, kopalnia, ptaki i ryby. Wyzwanie: przetrwać jak najdłużej.';
  else txt += `Wyspa startowa jest uboga w jedzenie. Trzeba zbudować ${i - 1 === 1 ? 'most' : `${i - 1} mosty`}, a kopalnia z rudą żelaza leży na najdalszej wyspie.`;
  if (a > 1) txt += ' Agenci mają różne charaktery: ' + PERSONAS.slice(0, a).map((p) => `${p.name} (${p.role.toLowerCase()})`).join(', ') + '.';
  $('modeDesc').textContent = txt;
}
describeMode();

$('startBtn').onclick = () => { state.cfg.seed = +$('optSeed').value || 1; startGame(); };
$('menuBtn').onclick = () => { state.paused = true; updatePause(); $('menu').classList.remove('hidden'); $('startBtn').textContent = '▶ Nowa gra'; };
$('goRestart').onclick = () => { $('gameover').classList.add('hidden'); rndSeed(); $('menu').classList.remove('hidden'); };

// ---------- start gry ----------
function startGame() {
  $('menu').classList.add('hidden');
  $('hud').classList.remove('hidden');
  const world = new World(state.cfg.seed, state.cfg.islands);
  computeShores(world);
  world.agents = [];
  // start blisko środka wyspy 0
  const c = world.islandDefs[0];
  const spots = [];
  for (let r = 0; r < 12 && spots.length < 8; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    const i = Math.round(c.ci) + di, j = Math.round(c.cj) + dj;
    if (world.walkable(i, j) && world.island[idx(i, j)] === 0 && !world.res[idx(i, j)] && !spots.some((s) => s.i === i && s.j === j)) spots.push({ i, j });
  }
  for (let n = 0; n < state.cfg.agents; n++) {
    const s = spots[n * 2 % spots.length];
    world.agents.push(new Agent(world, PERSONAS[n], s.i, s.j, n));
  }
  if (state.opts.aiView) toggleAiView();
  state.world = world; state.agents = world.agents; state.selected = null; state.opts.follow = false; state.over = false;
  state.narrator = new Narrator(world);
  state.social = new Social(world);
  $('chat').innerHTML = ''; $('log').innerHTML = '';
  world.onChat = (a, text) => addFeed('chat', `<b style="color:${hex(a.color)}">${a.name}:</b> ${esc(text)}`);
  renderer.build(world);
  // kamera nad wyspą startową
  const p = toWorld(c.ci, c.cj);
  renderer.controls.target.set(p.x, 0, p.z);
  renderer.camera.position.set(p.x - 6, 42, p.z + 40);
  renderer.controls.update();
  buildAgentCards();
  $('detail').classList.add('hidden');
  state.paused = false; updatePause();
  const n = state.cfg.agents;
  addFeed('chat', `🎙️ Witamy na Wyspach AI! ${n === 1 ? 'Jeden rozbitek' : n + ' rozbitków'} budzi się na plaży. Mają tylko siekierę i kilof. Zobaczmy, jak sobie poradzą...`, 'narr');
  world.agents.forEach((a, k) => setTimeout(() => a.speak(['Gdzie ja jestem?!', 'Dobra, nie panikujemy. Najpierw woda.', 'Wyspa... trzeba się tu jakoś urządzić.', 'Mam siekierę i kilof. Da się żyć.'][k % 4], true), 600 + k * 900));
}

// ---------- feed ----------
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
function addFeed(target, html, cls = '') {
  const el = $(target);
  const w = state.world;
  const stick = el.scrollTop + el.clientHeight >= el.scrollHeight - 30;
  const d = document.createElement('div');
  d.className = 'm ' + cls;
  d.innerHTML = `<span class="t">D${w ? w.day() : 1} ${w ? w.clock() : ''}</span>${html}`;
  el.appendChild(d);
  while (el.childNodes.length > 200) el.removeChild(el.firstChild);
  if (stick) el.scrollTop = el.scrollHeight;
}
document.querySelectorAll('#feed .tabs button[data-tab]').forEach((b) => b.onclick = () => {
  document.querySelectorAll('#feed .tabs button[data-tab]').forEach((x) => x.classList.toggle('on', x === b));
  $('chat').classList.toggle('hidden', b.dataset.tab !== 'chat');
  $('log').classList.toggle('hidden', b.dataset.tab !== 'log');
  $('feed').classList.remove('min');
});
$('feedMin').onclick = () => $('feed').classList.toggle('min');

// ---------- sterowanie ----------
document.querySelectorAll('.speed button[data-speed]').forEach((b) => b.onclick = () => setSpeed(+b.dataset.speed));
function setSpeed(s) {
  state.speed = s; state.paused = false; updatePause();
  document.querySelectorAll('.speed button[data-speed]').forEach((x) => x.classList.toggle('on', +x.dataset.speed === s));
}
$('pauseBtn').onclick = () => { state.paused = !state.paused; updatePause(); };
function updatePause() { $('pauseBtn').textContent = state.paused ? '▶' : '⏸'; }
$('tLabels').onchange = (e) => { state.opts.labels = e.target.checked; };
$('tBubbles').onchange = (e) => { state.opts.bubbles = e.target.checked; };
$('aiViewBtn').onclick = () => toggleAiView();
function toggleAiView() {
  state.opts.aiView = !state.opts.aiView;
  if (state.opts.aiView && !state.selected) select(state.agents.find((a) => a.alive) || state.agents[0]);
  $('aiViewBtn').classList.toggle('on', state.opts.aiView);
}

const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  keys.add(e.key.toLowerCase());
  if (e.key === ' ') { state.paused = !state.paused; updatePause(); e.preventDefault(); }
  if (['1', '2', '3', '4'].includes(e.key)) setSpeed([1, 2, 4, 8][+e.key - 1]);
  if (e.key.toLowerCase() === 'f') state.opts.follow = !state.opts.follow;
  if (e.key.toLowerCase() === 'v') toggleAiView();
  if (e.key === 'Escape') select(null);
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());

let downAt = null;
renderer.renderer.domElement.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
renderer.renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5 || e.button !== 0) return;
  const a = renderer.pick(e.clientX, e.clientY);
  if (a) select(a);
});

function panCamera(dt) {
  if (!state.world) return;
  let fx = 0, fz = 0;
  if (keys.has('w') || keys.has('arrowup')) fz -= 1;
  if (keys.has('s') || keys.has('arrowdown')) fz += 1;
  if (keys.has('a') || keys.has('arrowleft')) fx -= 1;
  if (keys.has('d') || keys.has('arrowright')) fx += 1;
  if (!fx && !fz) return;
  state.opts.follow = false;
  const cam = renderer.camera, tgt = renderer.controls.target;
  const fwd = tgt.clone().sub(cam.position); fwd.y = 0; fwd.normalize();
  const right = { x: -fwd.z, z: fwd.x };
  const dist = cam.position.distanceTo(tgt);
  const sp = dist * 0.9 * dt;
  const mx = (right.x * fx - fwd.x * fz) * sp, mz = (right.z * fx - fwd.z * fz) * sp;
  const lim = Math.max(W, H) * 0.7;
  const nx = Math.max(-lim, Math.min(lim, tgt.x + mx)) - tgt.x, nz = Math.max(-lim, Math.min(lim, tgt.z + mz)) - tgt.z;
  tgt.x += nx; tgt.z += nz; cam.position.x += nx; cam.position.z += nz;
}

function select(a) {
  state.selected = a;
  state.opts.follow = !!a;
  $('detail').classList.toggle('hidden', !a);
  document.querySelectorAll('.acard').forEach((c) => c.classList.toggle('sel', a && +c.dataset.id === a.id));
  if (a) renderDetail();
}

// ---------- panele ----------
const NEEDS = [['hunger', '🍖', '#e8a33d'], ['thirst', '💧', '#3fa7d6'], ['energy', '⚡', '#c9d64f'], ['health', '❤️', '#e05a5a']];
function barsHtml(a) {
  return `<div class="bars">${NEEDS.map(([k, ic, c]) => `<span>${ic}</span><div class="b"><i data-k="${k}" style="width:${a[k]}%;background:${c}"></i></div>`).join('')}</div>`;
}
function buildAgentCards() {
  $('agents').innerHTML = state.agents.map((a) => `
    <div class="acard" data-id="${a.id}" style="--c:${hex(a.color)}">
      <div class="top"><span>${a.name} <span class="role">${a.role}</span></span><span class="st"></span></div>
      ${barsHtml(a)}
      <div class="act"></div>
    </div>`).join('');
  document.querySelectorAll('.acard').forEach((c) => c.onclick = () => {
    const a = state.agents[+c.dataset.id];
    select(state.selected === a ? null : a);
  });
}
function updateAgentCards() {
  for (const a of state.agents) {
    const c = document.querySelector(`.acard[data-id="${a.id}"]`); if (!c) continue;
    c.querySelectorAll('i[data-k]').forEach((i) => { i.style.width = a[i.dataset.k] + '%'; });
    c.querySelector('.act').textContent = !a.alive ? '💀 Nie żyje' : a.asleep ? '😴 Śpi' : a.task ? a.task.label : '🤔 Myśli...';
    c.querySelector('.st').textContent = a.alive ? `🏝️${a.island + 1}` : '';
    c.classList.toggle('dead', !a.alive);
  }
}
function renderDetail() {
  const a = state.selected; if (!a) return;
  const inv = Object.entries(a.inv).filter(([, v]) => v > 0).map(([k, v]) => `<span>${ITEM_LABELS[k]}</span><b>${v}</b>`).join('') || '<span style="opacity:.5">pusto</span><b></b>';
  const tools = Object.entries(a.tools).map(([k, v]) => `<span class="${v ? '' : 'no'}">${TOOL_LABELS[k]}</span>`).join('');
  const max = Math.max(0.01, ...a.scores.map((s) => s.score));
  const util = a.scores.map((s, n) => `<span class="${n === 0 ? 'first' : ''}">${s.label}</span><div class="b"><i style="width:${Math.max(3, s.score / max * 100)}%"></i></div>`).join('');
  const alive = ((a.alive ? state.world.time : a.diedAt || state.world.time) - a.stats.bornAt) / 180;
  $('detail').innerHTML = `
    <button class="close" onclick="this.parentNode.classList.add('hidden')">✕</button>
    <h3 style="color:${hex(a.color)}">${a.name}</h3><div style="color:#9fb2c8">${a.role} · ${a.alive ? 'żyje' : 'nie żyje'} · wyspa ${a.island + 1}</div>
    <h4>Potrzeby</h4>${barsHtml(a)}
    <h4>Teraz</h4><div>${!a.alive ? '💀' : a.asleep ? '😴 Śpi' : a.task ? a.task.label : '🤔'}</div>
    ${a.bubble ? `<div style="margin-top:4px;color:#cfe3f2">💬 „${esc(a.bubble.text)}”</div>` : ''}
    <h4>Wiedza</h4><div>🗺️ Zna ${(a.seenCount / (W * H) * 100).toFixed(0)}% mapy · 🧠 pamięta ${a.mem.size} miejsc z zasobami${a.memBirds.size ? ` · 🐦 ${a.memBirds.size} ptaków` : ''}</div>
    <h4>Rozważane decyzje (użyteczność)</h4><div class="util">${util}</div>
    <h4>Ekwipunek</h4><div class="grid">${inv}</div>
    <h4>Doświadczenie</h4><div class="grid">${[['fish', '🎣 Łowienie'], ['hunt', '🔱 Polowanie'], ['chop', '🪓 Ścinanie'], ['mine', '⛏️ Górnictwo']].map(([k, n]) => `<span>${n}</span><b>${Math.round(a.skill[k] * 100)}%</b>`).join('')}</div>
    <h4>Narzędzia</h4><div class="tools">${tools}</div>
    <h4>Statystyki</h4><div class="grid">
      <span>Przeżył(a) dni</span><b>${alive.toFixed(1)}</b><span>Kłody</span><b>${a.stats.wood}</b><span>Ryby</span><b>${a.stats.fish}</b>
      <span>Ptaki</span><b>${a.stats.birds}</b><span>Jagody</span><b>${a.stats.berries}</b><span>Deski na mosty</span><b>${a.stats.bridge}</b><span>Ruda żelaza</span><b>${a.stats.iron}</b>
    </div>`;
}

function updateHud() {
  const w = state.world;
  $('dayLbl').textContent = `Dzień ${w.day()}`;
  $('timeLbl').textContent = w.clock();
  $('phaseLbl').textContent = w.isNight() ? '🌙' : '☀️';
  const { built, total } = w.bridgeTotals();
  $('bridgeBar').classList.toggle('hidden', total === 0);
  if (total) {
    const pl = w.bridges.reduce((s, b) => s + (b.complete ? 0 : b.planks), 0), rp = w.bridges.reduce((s, b) => s + (b.complete ? 0 : b.rope), 0);
    $('bridgeLbl').textContent = `🌉 Mosty ${w.bridges.filter((b) => b.complete).length}/${w.bridges.length} · segmenty ${built}/${total}${pl || rp ? ` · na budowie: ${pl} desek, ${rp} lin` : ''} · segment = 2 deski + 1 lina`;
    $('bridgeFill').style.width = (built / total * 100) + '%';
  }
  updateAgentCards();
  if (state.selected && !$('detail').classList.contains('hidden')) renderDetail();
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
        w.update(STEP);
        for (const a of state.agents) { const wasAlive = a.alive; a.update(STEP); if (wasAlive && !a.alive) a.diedAt = w.time; }
        state.social.update(STEP);
        if (w.shoresDirty) { w.shoresDirty = false; computeShores(w); }
        state.narrator.update(STEP, (t) => addFeed('chat', esc(t), 'narr'));
      }
      for (const e of w.events) addFeed('log', e.text, e.kind);
      // ważne zdarzenia także w komentarzach
      for (const e of w.events) if (e.kind === 'big' || e.kind === 'death') addFeed('chat', e.text, e.kind);
      w.events.length = 0;
      if (state.agents.every((a) => !a.alive)) gameOver();
    }
    panCamera(rdt);
    renderer.frame(w, state.agents, state.selected, now / 1000, state.opts);
    hudT -= rdt;
    if (hudT <= 0) { hudT = 0.25; updateHud(); }
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
