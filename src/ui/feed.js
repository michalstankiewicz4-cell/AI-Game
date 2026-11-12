// Panel komentarzy na żywo i dziennika zdarzeń.
import { $ } from './dom.js';

export function addFeed(world, target, html, cls = '') {
  const el = $(target);
  const stick = el.scrollTop + el.clientHeight >= el.scrollHeight - 30;
  const d = document.createElement('div');
  d.className = 'm ' + cls;
  d.innerHTML = `<span class="t">D${world ? world.day() : 1} ${world ? world.clock() : ''}</span>${html}`;
  el.appendChild(d);
  while (el.childNodes.length > 200) el.removeChild(el.firstChild);
  if (stick) el.scrollTop = el.scrollHeight;
}

export function clearFeed() { $('chat').innerHTML = ''; $('log').innerHTML = ''; }

let renderErrors = null;
export function initFeed(errorsRenderer) {
  renderErrors = errorsRenderer;
  const tabs = document.querySelectorAll('#feed .tabs button[data-tab]');
  tabs.forEach((b) => b.onclick = () => {
    tabs.forEach((x) => x.classList.toggle('on', x === b));
    $('chat').classList.toggle('hidden', b.dataset.tab !== 'chat');
    $('log').classList.toggle('hidden', b.dataset.tab !== 'log');
    $('errors').classList.toggle('hidden', b.dataset.tab !== 'errors');
    if (b.dataset.tab === 'errors' && renderErrors) renderErrors();
    $('feed').classList.remove('min');
  });
  $('feedMin').onclick = () => $('feed').classList.toggle('min');
}
