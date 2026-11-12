// Budowanie z pojedynczych desek: postać kładzie, zdejmuje, przenosi i nazywa deski.
// Model językowy może podać dokładne polecenia („deska” w odpowiedzi); bez nich postać majsterkuje sama.
import { idx, toWorld } from '../world/world.js';
import { PIECE_TYPES, SIDES } from '../world/pieces.js';

export const BUILD_LABEL = '🪵 Budować z desek';
const TYPE_WORD = { floor: 'podloga', wall: 'sciana', slope: 'skos' };
const DIR = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };

// zamiana polecenia modelu na wewnętrzną postać
function parseType(v) {
  const t = String(v || '').toLowerCase();
  if (/pod|floor|pł|pl/.test(t)) return 'floor';
  if (/[sś]cian|wall/.test(t)) return 'wall';
  if (/skos|dach|slope|roof/.test(t)) return 'slope';
  return null;
}
function parseSide(v) {
  const t = String(v || '').trim().toUpperCase();
  if (/PÓŁN|POLN|NORTH/.test(t)) return 'N';
  if (/WSCH|EAST/.test(t)) return 'E';
  if (/POŁUD|POLUD|SOUTH/.test(t)) return 'S';
  if (/ZACH|WEST/.test(t)) return 'W';
  return /^[NESW]$/.test(t) ? t : null;
}
export function parseBuildOps(raw) {
  let arr = raw;
  if (!Array.isArray(arr)) arr = arr && typeof arr === 'object' ? [arr] : [];
  const out = [];
  for (const o of arr.slice(0, 4)) {
    if (!o || typeof o !== 'object') continue;
    const a = String(o.akcja || o.action || o.op || '').toLowerCase();
    const op = /podn|zdejm|zabier|pick/.test(a) ? 'pick' : /przen|przes|move/.test(a) ? 'move' : /nazw|zmien|rename/.test(a) ? 'rename' : /po[lł][oó]|k[lł]ad|dodaj|place|wstaw/.test(a) ? 'place' : null;
    if (!op) continue;
    const num = (v) => (v == null || v === '' || !isFinite(+v) ? null : Math.round(+v));
    out.push({
      op, id: num(o.id), slot: num(o.miejsce ?? o.slot), type: parseType(o.typ ?? o.type), side: parseSide(o.strona ?? o.side),
      x: num(o.x), y: num(o.y), lvl: num(o.poziom ?? o.level) ?? 0, name: typeof (o.nazwa ?? o.name) === 'string' ? String(o.nazwa ?? o.name).trim().slice(0, 40) : '',
    });
  }
  return out;
}

export const buildingMethods = {
  // środek budowy: najbliższa deska w okolicy, a gdy ich nie ma, wolne pole obok obozu
  siteCenter() {
    const w = this.world;
    let best = null;
    for (const p of w.pieces) {
      const d = Math.abs(p.i - this.i) + Math.abs(p.j - this.j);
      if (d < 18 && (!best || d < best.d)) best = { i: p.i, j: p.j, d };
    }
    if (best) return { i: best.i, j: best.j, site: true };
    let camp = null;
    for (const s of w.structures) {
      if (!this.knownStructs.has(s.id) || !['campfire', 'shelter', 'tent', 'chest', 'workbench'].includes(s.kind)) continue;
      const d = Math.abs(s.i - this.i) + Math.abs(s.j - this.j);
      if (d < 20 && (!camp || d < camp.d)) camp = { i: s.i, j: s.j, d };
    }
    const c = camp || { i: this.i, j: this.j };
    // pierwsze pole: wolny ląd 2-3 kafelki od obozu
    for (let r = 2; r < 6; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const i = c.i + di, j = c.j + dj;
      if (!w.placeProblem({ type: 'floor', i, j, lvl: 0 }) && this.bfsCache && this.bfsCache.dist[idx(i, j)] >= 0) return { i, j, site: false };
    }
    return { i: c.i, j: c.j, site: false };
  },

  // opis budowy dla modelu językowego: kształt, czego brakuje, deski z nazwami i wolne miejsca
  buildContext() {
    const w = this.world;
    if (!this.known.has('planks')) return null;
    const c = this.siteCenter();
    const site = w.analyzeSite(c.i, c.j);
    if (this.inv.planks < 1 && !(site && Math.abs(c.i - this.i) + Math.abs(c.j - this.j) < 8)) return null;
    const o = site ? site.origin : { i: c.i, j: c.j };
    const rel = (i, j) => `x${i - o.i} y${j - o.j}`;
    const slots = w.snapSlots(c.i, c.j, 6);
    this.buildSnap = { origin: o, slots, t: w.time };
    const L = ['Budowanie z desek: każda deska to jeden element (podłoga, ściana albo skos), który przyciąga się do siatki pól. x rośnie na wschód, y na południe, poziom 0 to ziemia, strona N/E/S/W to krawędź pola.'];
    if (site) {
      const miss = site.missingWalls.slice(0, 5).map((m) => `${rel(m.i, m.j)} strona ${m.side}`).join(', ');
      const unr = site.unroofed.slice(0, 5).map((t) => rel(t.i, t.j)).join(', ');
      L.push(`Twoja budowa: podłoga ${site.floor.length} pól (obrys ${site.w}×${site.h}). Ściany na obwodzie podłogi: ${site.walls} z ${site.perim}${miss ? `, luki: ${miss}${site.missingWalls.length > 5 ? '…' : ''}` : ''}. `
        + `Pola podłogi przykryte z góry: ${site.roofed} z ${site.floor.length}${unr ? `, odkryte: ${unr}${site.unroofed.length > 5 ? '…' : ''}` : ''}.`);
      L.push('Deski: ' + site.pieces.slice(0, 8).map((p) => `#${p.id} „${p.name}” ${PIECE_TYPES[p.type]} ${rel(p.i, p.j)} poziom ${p.lvl}${p.side ? ' strona ' + p.side : ''}`).join('; ') + (site.pieces.length > 8 ? '; …' : '') + '.');
    }
    if (slots.length) L.push('Wolne miejsca: ' + slots.map((s, n) => `${n + 1}) ${PIECE_TYPES[s.type]} ${rel(s.i, s.j)} poziom ${s.lvl}${s.side ? ' strona ' + s.side : ''}`).join('; ') + '.');
    const n = this.inv.planks, word = n === 1 ? 'deskę' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'deski' : 'desek';
    L.push(`Masz ${n} ${word}. Jeśli chcesz coś zrobić z deskami, dodaj do odpowiedzi "deska": lista do 4 poleceń, np. [{"akcja":"poloz","miejsce":1,"nazwa":"podłoga 1"}], `
      + '{"akcja":"poloz","typ":"sciana","x":1,"y":0,"poziom":0,"strona":"E","nazwa":"ściana kuchni"}, {"akcja":"podnies","id":3}, {"akcja":"przenies","id":3,"miejsce":2}, {"akcja":"nazwij","id":3,"nazwa":"drzwi"}. Bez desek pomiń "deska".');
    return L.join('\n');
  },

  // odpowiedź modelu: nazwy zmienia od razu, resztę ustawia w kolejce zadań
  applyBuildOps(ops) {
    const w = this.world;
    const snap = this.buildSnap;
    const queue = [];
    for (const op of ops) {
      if (op.op === 'rename') {
        const p = op.id != null && w.pieceById(op.id);
        if (p && op.name && w.renamePiece(p, op.name)) this.say(`nazywa deskę #${p.id}: „${p.name}” ✏️`);
        continue;
      }
      let spec = null;
      if (op.op === 'place' || op.op === 'move') {
        if (op.slot != null && snap && snap.slots[op.slot - 1]) { const s = snap.slots[op.slot - 1]; spec = { type: s.type, i: s.i, j: s.j, lvl: s.lvl, side: s.side }; }
        else if (op.type && op.x != null && op.y != null) {
          const o = snap ? snap.origin : { i: this.i, j: this.j };
          spec = { type: op.type, i: o.i + op.x, j: o.j + op.y, lvl: Math.max(0, op.lvl || 0), side: op.type === 'floor' ? null : (op.side || 'N') };
        }
        if (!spec) continue;
        spec.name = op.name;
      }
      queue.push({ op: op.op, id: op.id, spec, from: 'llm' });
    }
    if (queue.length) { this.buildQueue = queue; this.buildQueueT = w.time; }
    return queue.length > 0;
  },

  // co dołożyć bez podpowiedzi modelu: mała podłoga, potem ściany (jedna luka zostaje na wejście), potem przykrycie
  scriptBuildOp() {
    const w = this.world;
    const c = this.siteCenter();
    const site = w.analyzeSite(c.i, c.j);
    const slots = w.snapSlots(c.i, c.j, 16);
    if (!slots.length) return null;
    if (!site) return { op: 'place', spec: slots[0] };
    // podłoga jak najbardziej zwarta (2×2); gdy nie ma miejsca, zostaje mniejsza
    const fl = site.floor.length < 4 ? slots.filter((s) => s.type === 'floor' && s.lvl === 0) : [];
    if (fl.length) {
      const dims = (s) => [Math.max(site.origin.i + site.w - 1, s.i) - Math.min(site.origin.i, s.i) + 1, Math.max(site.origin.j + site.h - 1, s.j) - Math.min(site.origin.j, s.j) + 1];
      const rank = (s) => { const [a, b] = dims(s); return Math.max(a, b) * 10 + a * b; }; // najpierw kwadrat
      fl.sort((a, b) => rank(a) - rank(b));
      return { op: 'place', spec: fl[0] };
    }
    if (site.missingWalls.length > 1) { const s = slots.find((x) => x.type === 'wall' && x.lvl === 0); if (s) return { op: 'place', spec: s }; }
    if (site.unroofed.length) { const s = slots.find((x) => x.type === 'slope' || (x.type === 'floor' && x.lvl === 1)); if (s) return { op: 'place', spec: s }; }
    return null;
  },

  // jedno polecenie: podejść do miejsca i położyć, zdjąć albo przenieść deskę
  taskPlank(cmd) {
    const w = this.world;
    const bfs = this.bfsCache;
    const piece = cmd.id != null ? w.pieceById(cmd.id) : null;
    const at = cmd.op === 'pick' || cmd.op === 'move' ? piece : cmd.spec;
    const finish = () => { if (this.buildQueue && this.buildQueue[0] === cmd) this.buildQueue.shift(); };
    if (!at) { finish(); return null; }
    // stanąć na polu albo obok niego
    let stand = null;
    for (const [di, dj] of [[0, 0], ...Object.values(DIR)]) {
      const i = at.i + di, j = at.j + dj;
      if (w.walkable(i, j) && bfs.dist[idx(i, j)] >= 0) { stand = { i, j }; break; }
    }
    if (!stand) { finish(); return null; }
    const name = (cmd.spec && cmd.spec.name) || (piece && piece.name) || '';
    const label = cmd.op === 'pick' ? '✋ Zdejmuje deskę' : cmd.op === 'move' ? '🔁 Przenosi deskę' : `🪵 Kładzie deskę (${PIECE_TYPES[cmd.spec.type]})`;
    return {
      path: this.pathTo(stand.i, stand.j) || [], face: toWorld(at.i, at.j), label,
      onEnd: finish,
      act: (dt, t) => {
        if (t.elapsed < 2.5) return null;
        if (cmd.op === 'pick' || cmd.op === 'move') {
          if (!piece || !w.pieceById(piece.id)) return 'fail';
          const why = w.removeProblem(piece);
          if (why) { this.speak(`Nie zdejmę jej, ${why}.`); return 'fail'; }
          if (!this.roomFor(1, 1.5)) return 'fail';
          w.removePiece(piece);
          this.inv.planks++;
          if (cmd.op === 'pick') { this.say(`zdejmuje deskę „${piece.name}” ✋`); return 'done'; }
        }
        const spec = cmd.op === 'move' ? { ...cmd.spec, name: cmd.spec.name || piece.name } : cmd.spec;
        if (this.inv.planks < 1) return 'fail';
        const why = w.placeProblem(spec);
        if (why) { if (cmd.from === 'llm') this.speak(`Tu deska nie wejdzie: ${why}.`); return 'fail'; }
        this.inv.planks--;
        const p = w.placePiece(spec, this);
        this.say(`${cmd.op === 'move' ? 'przekłada' : 'kładzie'} deskę „${p.name}” (${PIECE_TYPES[p.type]}${p.lvl ? ', poziom ' + p.lvl : ''}) 🪵`);
        this.joy = Math.min(30, this.joy + 2);
        return 'done';
      },
    };
  },
};

export { TYPE_WORD, SIDES };
