// Sterowanie: klawiatura, przyciski prędkości, wybór postaci kliknięciem, przesuwanie kamery WASD.
import { $ } from './dom.js';
import { W, H } from '../world/world.js';

export function initControls(state, renderer, api) {
  document.querySelectorAll('.speed button[data-speed]').forEach((b) => b.onclick = () => api.setSpeed(+b.dataset.speed));
  $('pauseBtn').onclick = () => { state.paused = !state.paused; api.updatePause(); };
  $('tLabels').onchange = (e) => { state.opts.labels = e.target.checked; };
  $('tBubbles').onchange = (e) => { state.opts.bubbles = e.target.checked; };
  $('aiViewBtn').onclick = () => api.toggleAiView();

  const keys = new Set();
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    keys.add(e.key.toLowerCase());
    if (e.key === ' ') { state.paused = !state.paused; api.updatePause(); e.preventDefault(); }
    if (['1', '2', '3', '4'].includes(e.key)) api.setSpeed([1, 2, 4, 8][+e.key - 1]);
    if (e.key.toLowerCase() === 'f') state.opts.follow = !state.opts.follow;
    if (e.key === 'Tab' && state.agents.length) {
      e.preventDefault();
      const list = state.agents.filter((a) => a.alive).length ? state.agents.filter((a) => a.alive) : state.agents;
      const k = list.indexOf(state.selected);
      api.select(list[(k + (e.shiftKey ? list.length - 1 : 1)) % list.length]);
    }
    if (e.key.toLowerCase() === 'v') api.toggleAiView();
    if (e.key.toLowerCase() === 'k') api.toggleWiki();
    if (e.key === 'Escape') { if (api.wikiOpen()) api.toggleWiki(false); else api.select(null); }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());

  let downAt = null;
  const canvas = renderer.renderer.domElement;
  canvas.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5 || e.button !== 0) return;
    const a = renderer.pick(e.clientX, e.clientY);
    if (a) api.select(a);
  });

  // przesuwanie kamery klawiszami (wywoływane co klatkę)
  return function panCamera(dt) {
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
    const sp = cam.position.distanceTo(tgt) * 0.9 * dt;
    const mx = (right.x * fx - fwd.x * fz) * sp, mz = (right.z * fx - fwd.z * fz) * sp;
    const lim = Math.max(W, H) * 0.7;
    const nx = Math.max(-lim, Math.min(lim, tgt.x + mx)) - tgt.x, nz = Math.max(-lim, Math.min(lim, tgt.z + mz)) - tgt.z;
    tgt.x += nx; tgt.z += nz; cam.position.x += nx; cam.position.z += nz;
  };
}
