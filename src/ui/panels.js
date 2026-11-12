// Panele HUD: karty agentów, szczegóły wybranej postaci (potrzeby, wiedza, decyzje), pasek mostów.
import { $, esc, hex } from './dom.js';
import { W, H } from '../world/world.js';
import { ITEM_LABELS, TOOL_LABELS, RECIPE_NAMES, FOOD } from '../ai/data.js';

const NEEDS = [['hunger', '🍖', '#e8a33d'], ['thirst', '💧', '#3fa7d6'], ['energy', '⚡', '#c9d64f'], ['health', '❤️', '#e05a5a'], ['mood', '😊', '#e07ad0']];
function barsHtml(a) {
  return `<div class="bars">${NEEDS.map(([k, ic, c]) => `<span>${ic}</span><div class="b"><i data-k="${k}" style="width:${a[k]}%;background:${c}"></i></div>`).join('')}</div>`;
}
export function buildAgentCards(state, select) {
  $('agents').innerHTML = state.agents.map((a) => `
    <div class="acard" data-id="${a.id}" style="--c:${hex(a.color)}">
      <div class="top"><span>${a.name} <span class="role">${a.role}</span></span><span class="st"></span></div>
      ${barsHtml(a)}
      <div class="act"></div>
    </div>`).join('');
  document.querySelectorAll('.acard').forEach((c) => c.onclick = () => {
    const a = state.agents[+c.dataset.id];
    select(a); // ponowne kliknięcie znów centruje kamerę na postaci
  });
}
export function updateAgentCards(state) {
  for (const a of state.agents) {
    const c = document.querySelector(`.acard[data-id="${a.id}"]`); if (!c) continue;
    c.querySelectorAll('i[data-k]').forEach((i) => { i.style.width = a[i.dataset.k] + '%'; });
    c.querySelector('.act').textContent = !a.alive ? '💀 Nie żyje' : a.asleep ? '😴 Śpi' : a.task ? a.task.label : '🤔 Myśli...';
    const st = c.querySelector('.st');
    st.textContent = a.alive ? `${a.llmDriven ? '🤖 ' : ''}🌡️${a.bodyT.toFixed(1)}° 🏝️${a.island + 1}` : '';
    st.classList.toggle('cold', a.alive && a.bodyT < 36);
    st.classList.toggle('hot', a.alive && a.bodyT > 37.5);
    c.classList.toggle('dead', !a.alive);
  }
}
export function renderDetail(state) {
  const a = state.selected; if (!a) return;
  const inv = Object.entries(a.inv).filter(([, v]) => v > 0).map(([k, v]) => `<span>${ITEM_LABELS[k]}</span><b>${v}</b>`).join('') || '<span style="opacity:.5">pusto</span><b></b>';
  const tools = Object.entries(a.tools).map(([k, v]) => `<span class="${v ? '' : 'no'}">${TOOL_LABELS[k]}</span>`).join('');
  const max = Math.max(0.01, ...a.scores.map((s) => s.score));
  const util = a.scores.map((s, n) => `<span class="${n === 0 ? 'first' : ''}">${s.label}</span><div class="b"><i style="width:${Math.max(3, s.score / max * 100)}%"></i></div>`).join('');
  const alive = ((a.alive ? state.world.time : a.diedAt || state.world.time) - a.stats.bornAt) / 180;
  // stały szkielet: nagłówek z osobą i zakładki się nie przewijają, przewija się tylko treść zakładki
  const el = $('detail');
  if (!el.querySelector('.dbody')) {
    el.innerHTML = `<div class="dhead"><button class="close" onclick="this.closest('#detail').classList.add('hidden')">✕</button><h3></h3><div class="drole"></div>`
      + `<div class="dtabs">${TABS.map(([k, n]) => `<button data-tab="${k}">${n}</button>`).join('')}</div></div><div class="dbody"></div>`;
    el.querySelector('.dtabs').onclick = (e) => { const b = e.target.closest('button[data-tab]'); if (b) { detailTab = b.dataset.tab; renderDetail(state); } };
  }
  el.querySelectorAll('.dtabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === detailTab));
  const h3 = el.querySelector('h3');
  h3.textContent = a.name; h3.style.color = hex(a.color);
  el.querySelector('.drole').textContent = `${a.role} · ${a.alive ? 'żyje' : 'nie żyje'} · wyspa ${a.island + 1}`;
  const pct = (v) => `${Math.round(v * 100)}%`;
  const parts = {
    state: `
    <h4>Potrzeby</h4>${barsHtml(a)}
    <div class="temp">🌡️ Ciało <b class="${a.bodyT < 36 ? 'cold' : a.bodyT > 37.5 ? 'hot' : ''}">${a.bodyT.toFixed(1)}°C</b> · odczuwalnie ${Math.round(a.feltT)}°C · powietrze ${Math.round(state.world.airTemp(a.i, a.j))}°C${a.bodyT < 35 ? ' · 🥶 wychłodzenie!' : a.bodyT < 36 ? ' · zimno' : a.bodyT > 39 ? ' · 🥵 przegrzanie!' : a.bodyT > 37.5 ? ' · gorąco' : ''}</div>
    <h4>Teraz</h4><div>${!a.alive ? '💀' : a.asleep ? '😴 Śpi' : a.task ? a.task.label : '🤔'}${a.llmDriven ? ' <span title="Wybór modelu językowego">🤖</span>' : ''}</div>
    ${a.llmIntent ? `<div class="intent">🤖 Zamiar: „${esc(a.llmIntent.text || '…')}” ${a.llmIntent.label ? `→ ${a.llmIntent.label}` : '<span class="no">(nie da się teraz)</span>'}</div>` : ''}
    <div class="temp">✋ W prawej: ${a.held ? (TOOL_LABELS[a.held] || a.held) : '—'}, w lewej: ${a.heldL === 'torch' ? `🔥 płonąca pochodnia (jeszcze ${Math.ceil(a.torchBurn)} s)` : a.heldL ? (TOOL_LABELS[a.heldL] || a.heldL) : '—'} · 👁️ widzi na ${Math.round(a.viewR || 18)} pól${state.world.daylight() < 0.35 ? ' (ciemno)' : ''}</div>
    ${a.bubble ? `<div style="margin-top:4px;color:#cfe3f2">💬 „${esc(a.bubble.text)}”</div>` : ''}
    <h4>Statystyki</h4><div class="grid">
      <span>Przeżył(a) dni</span><b>${alive.toFixed(1)}</b><span>Kłody</span><b>${a.stats.wood}</b><span>Ryby</span><b>${a.stats.fish}</b>
      <span>Ptaki</span><b>${a.stats.birds}</b><span>Dziki</span><b>${a.stats.boars || 0}</b><span>Jagody</span><b>${a.stats.berries}</b><span>Deski na mosty</span><b>${a.stats.bridge}</b><span>Ruda żelaza</span><b>${a.stats.iron}</b>
    </div>`,
    pack: `
    <h4>Plecak · ${a.invTotal()}/30 rzeczy · ${a.invWeight().toFixed(1)}/25 kg</h4><div class="bars"><span>🎒</span><div class="b"><i style="width:${Math.min(100, a.invWeight() / 25 * 100)}%;background:${a.invWeight() > 17.5 ? '#e0904a' : '#8fb0c8'}"></i></div></div><div class="grid">${inv}</div>
    <h4>Narzędzia</h4><div class="tools">${tools}</div>`,
    know: `
    <h4>Wiedza</h4><div>🗺️ Zna ${(a.seenCount / (W * H) * 100).toFixed(0)}% mapy · 🧠 pamięta ${a.mem.size} miejsc z zasobami${a.memBirds.size ? ` · 🐦 ${a.memBirds.size} ptaków` : ''} · 📍 pamięta ${a.expect ? a.expect.size : 0} miejsc, gdzie coś zostawił(a)</div>
    <h4>Odkryte receptury (${[...a.known].filter((r) => RECIPE_NAMES[r]).length}/${Object.keys(RECIPE_NAMES).length})</h4><div class="tools">${Object.keys(RECIPE_NAMES).map((r) => `<span class="${a.known.has(r) ? '' : 'no'}">${a.known.has(r) ? RECIPE_NAMES[r] : '???'}</span>`).join('')}</div>
    <div style="margin-top:4px;color:#9fb2c8">Próby: ${a.tried.size} · jadalne: ${[...a.edible].filter(([, v]) => v).map(([k]) => FOOD[k].name).join(', ') || '—'}${a.saltKnown ? ' · 🧂 wie, że morska woda jest słona' : ''}</div>
    <h4>Doświadczenie</h4><div class="grid">${[['fish', '🎣 Łowienie'], ['hunt', '🔱 Polowanie'], ['chop', '🪓 Ścinanie'], ['mine', '⛏️ Górnictwo']].map(([k, n]) => `<span>${n}</span><b>${Math.round(a.skill[k] * 100)}%</b>`).join('')}</div>`,
    prio: (() => {
      const f = a.reactFactors ? a.reactFactors() : null;
      const sus = [...(a.suspect || new Map())].filter(([, n]) => n > 0).map(([id, n]) => `${esc((state.agents.find((x) => x.id === id) || {}).name || '?')} ×${n}`);
      return `
    <h4>Rozważane decyzje (użyteczność)</h4><div class="util">${util}</div>
    <div style="margin-top:4px;color:#9fb2c8">Najwyższa ocena wygrywa. Ocena rośnie z potrzebą (głód, pragnienie, zmęczenie, zimno), z wiedzą postaci i z jej wnioskami${a.llmDriven ? ', a model językowy może wybrać inną opcję z listy' : ''}.</div>
    <h4>Wnioski</h4><div style="color:#e6d3a3">${a.conclusions && a.conclusions.length ? a.conclusions.map((c) => '🤔 ' + esc(c)).join('<br>') : '<span style="opacity:.6">jeszcze żadnych</span>'}</div>
    ${sus.length ? `<div style="margin-top:4px">🕵️ Podejrzewa: ${sus.join(', ')}</div>` : ''}
    ${f ? `<h4>Czy odpowie, gdy ktoś coś powie? ${pct(f.chance)}</h4><div class="grid">
      <span>😊 Humor</span><b>×${f.mood.toFixed(2)}</b><span>❤️ Zdrowie</span><b>×${f.health.toFixed(2)}</b>
      <span>⚡ Zmęczenie</span><b>×${f.energy.toFixed(2)}</b><span>🚨 Pilne sprawy (głód, pragnienie, ucieczka)</span><b>×${f.busy.toFixed(2)}</b></div>
      <div style="margin-top:4px;color:#9fb2c8">Gdy ktoś mówi o ${a.f ? a.f('nim', 'niej') : 'niej'} po imieniu, szansa ×0,75. Po odpowiedzi postać przez 15 s się nie odzywa.</div>` : ''}
    <h4>Słyszy</h4><div style="color:#cfe3f2">${a.heard && a.heard.length && state.world.time - (a.heardT || 0) < 40 ? a.heard.map((h) => '👂 ' + esc(h)).join('<br>') : '<span style="opacity:.6">nic w ostatniej chwili</span>'}</div>`;
    })(),
  };
  el.querySelector('.dbody').innerHTML = parts[detailTab] || parts.state;
}
const TABS = [['state', '🧍 Stan'], ['prio', '⚖️ Priorytety'], ['pack', '🎒 Plecak'], ['know', '🧠 Wiedza']];
let detailTab = 'state';

let detailTick = 0;
export function updateHud(state) {
  const w = state.world;
  $('dayLbl').textContent = `Dzień ${w.day()}`;
  $('timeLbl').textContent = w.clock();
  $('phaseLbl').textContent = `${w.isNight() ? '🌙' : '☀️'} 🌡️${Math.round(w.airTemp())}°C`;
  $('phaseLbl').title = `Temperatura powietrza na poziomie morza: ${w.weatherWord(w.airTemp())}`;
  const { built, total } = w.bridgeTotals();
  $('bridgeBar').classList.toggle('hidden', total === 0);
  if (total) {
    const pl = w.bridges.reduce((s, b) => s + (b.complete ? 0 : b.planks), 0), rp = w.bridges.reduce((s, b) => s + (b.complete ? 0 : b.rope), 0);
    $('bridgeLbl').textContent = `🌉 Mosty ${w.bridges.filter((b) => b.complete).length}/${w.bridges.length} · segmenty ${built}/${total}${pl || rp ? ` · na budowie: ${pl} desek, ${rp} lin` : ''} · segment = 2 deski + 1 lina`;
    $('bridgeFill').style.width = (built / total * 100) + '%';
  }
  updateAgentCards(state);
  // karta postaci jest ciężka (pełne HTML), więc odświeża się raz na sekundę, a nie przy każdym odświeżeniu HUD
  if (state.selected && !$('detail').classList.contains('hidden') && (detailTick = (detailTick + 1) % 4) === 0) renderDetail(state);
}
