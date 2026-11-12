// Ekran startowy: wybór liczby AI i wysp, ziarno świata.
import { $ } from './dom.js';
import { PERSONAS } from '../ai/data.js';

export const rndSeed = () => { $('optSeed').value = 1 + Math.floor(Math.random() * 99999); };

function describeMode(cfg) {
  const { agents: a, islands: i } = cfg;
  const who = a === 1 ? 'Samotny rozbitek' : `${a} rozbitków`;
  let txt = `${who} na ${i === 1 ? 'jednej wyspie' : `wyspie startowej spośród ${i}`}. `
    + (cfg.knowledge === 'all'
      ? 'Od początku wiedzą wszystko: znają receptury, jedzenie, mapę świata i to, co grzeje, chroni i szkodzi. Zostaje im tylko zdobyć materiały i przeżyć. '
      : 'Na początku nie wiedzą nic: muszą zbadać okolicę, sprawdzić co jest jadalne i metodą prób odkryć, co da się zrobić z materiałów. ');
  if (i === 1) txt += 'Na wyspie jest wszystko: drewno, kamienie, wodorosty, kopalnia, ptaki i ryby.';
  else txt += `Wyspa startowa jest uboga w jedzenie. Trzeba wymyślić i zbudować ${i - 1 === 1 ? 'most' : `${i - 1} mosty`}, a kopalnia z rudą żelaza leży na najdalszej wyspie.`;
  if (a > 1) txt += ' Charaktery: ' + PERSONAS.slice(0, a).map((p) => `${p.name} (${p.role.toLowerCase()})`).join(', ') + '.';
  $('modeDesc').textContent = txt;
}

export function initMenu(cfg, onStart) {
  const segment = (id, key) => {
    const el = $(id);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      el.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      cfg[key] = isNaN(+b.dataset.v) ? b.dataset.v : +b.dataset.v;
      describeMode(cfg);
    });
  };
  segment('optAgents', 'agents');
  segment('optIslands', 'islands');
  segment('optKnow', 'knowledge');
  rndSeed();
  $('seedRnd').onclick = rndSeed;
  describeMode(cfg);
  $('startBtn').onclick = () => { cfg.seed = +$('optSeed').value || 1; onStart(); };
}

export function showMenu() { $('menu').classList.remove('hidden'); $('startBtn').textContent = '▶ Nowa gra'; }
