// Wchodzenie na piętro po schodach albo drabinie z desek.
// Postać na piętrze ma `lvl` > 0 i `floorY` (wysokość podłogi w świecie); dziki jej nie dosięgną, a z góry widać dalej.
// Chodzi tylko po połączonych podłogach tego poziomu; schodzi tą samą drogą, a gdy jej zabraknie, zeskakuje.
import { idx, toWorld } from '../world/world.js';
import { PIECE_LH } from '../world/pieces.js';

const DIR = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
const FLOOR_Y = 0.04; // podłoga leży minimalnie nad krawędzią poziomu
const CLIMB_T = { stairs: 1.6, ladder: 2.6 }; // s wchodzenia (po drabinie wolniej)
const sideTo = (di, dj) => (di === 1 ? 'E' : di === -1 ? 'W' : dj === 1 ? 'S' : 'N');

export const climbMethods = {
  // wysokość podłogi danego poziomu na polu
  floorLevelY(i, j, lvl) { return this.world.tileY(i, j) + lvl * PIECE_LH + FLOOR_Y; },

  // drogi na piętro: schody lub drabina na parterze, wolne pole u ich stóp i podłoga piętra na górze
  climbRoutes(bfs) {
    const w = this.world, out = [];
    if (!w.pieces.length) return out;
    for (const p of w.pieces) {
      if (p.lvl !== 0 || (p.type !== 'stairs' && p.type !== 'ladder')) continue;
      if (this.seen && !this.seen[idx(p.i, p.j)]) continue; // nie widziała tych schodów
      const [di, dj] = DIR[p.side];
      const fi = p.i - di, fj = p.j - dj; // od tej strony się wchodzi
      if (!w.walkable(fi, fj) || w.solid(idx(fi, fj))) continue;
      const top = w.pieceAt('floor', p.i + di, p.j + dj, 1) ? { i: p.i + di, j: p.j + dj } : w.pieceAt('floor', p.i, p.j, 1) ? { i: p.i, j: p.j } : null;
      if (!top) continue;
      const d = bfs ? bfs.dist[idx(fi, fj)] : Math.abs(fi - this.i) + Math.abs(fj - this.j);
      if (d < 0) continue;
      out.push({ piece: p, foot: { i: fi, j: fj }, top, d });
    }
    return out.sort((a, b) => a.d - b.d);
  },

  // połączone podłogi na danym poziomie (ściany tego poziomu rozdzielają pola)
  upperArea(i, j, lvl) {
    const w = this.world, seen = new Set([idx(i, j)]), q = [{ i, j }], out = [];
    while (q.length && out.length < 60) {
      const c = q.shift(); out.push(c);
      for (const s of ['N', 'E', 'S', 'W']) {
        const [di, dj] = DIR[s], ni = c.i + di, nj = c.j + dj, k = idx(ni, nj);
        if (seen.has(k) || !w.pieceAt('floor', ni, nj, lvl) || w.wallOn(c.i, c.j, s, lvl)) continue;
        seen.add(k); q.push({ i: ni, j: nj });
      }
    }
    return out;
  },

  // zadanie: dojść do schodów, wejść, pobyć na górze (rozejrzeć się albo przeczekać dzika) i zejść
  taskClimb(route, why = 'look') {
    const w = this.world, p = route.piece;
    const wait = why === 'boar' ? 12 : 8 + Math.random() * 6;
    const label = why === 'boar' ? '🪜 Ucieka na piętro przed dzikiem' : `🪜 Wchodzi na piętro (${p.type === 'ladder' ? 'po drabinie' : 'po schodach'})`;
    return {
      climb: true, urgent: why === 'boar', flee: why === 'boar', label,
      path: this.pathTo(route.foot.i, route.foot.j) || [],
      act: (dt, t) => {
        if (!t.phase) {
          if (this.i !== route.foot.i || this.j !== route.foot.j) return 'fail';
          // schody albo podłoga mogły zniknąć po drodze
          if (!w.pieces.includes(p) || !w.pieceAt('floor', route.top.i, route.top.j, 1)) return 'fail';
          t.phase = 'up'; t.k = 0; this.climbRoute = route;
          t.from = { x: this.x, z: this.z, y: w.groundHeight(this.x, this.z) };
        }
        t.rest = t.phase === 'top';
        if (t.phase === 'up') {
          const r = this.climbStep(dt, t, route, 1);
          if (r === 'gone') return 'fail';
          if (r) { t.phase = 'top'; t.stay = 0; }
          return null;
        }
        if (t.phase === 'top') {
          t.stay += dt;
          if (!t.looked) { t.looked = true; this.lookFromAbove(); }
          // krótki spacer po piętrze, jeśli jest dokąd
          if (why !== 'boar' && !t.walked && t.stay > 3) {
            t.walked = true;
            const area = this.upperArea(this.i, this.j, 1);
            if (area.length > 1) { const c = area[1 + Math.floor(Math.random() * (area.length - 1))]; t.walkTo = c; }
          }
          if (t.walkTo && this.walkUpper(dt, t.walkTo)) t.walkTo = null;
          const safe = why !== 'boar' || !w.boars || !w.boars.some((b) => !b.dead && b.state === 'charge' && b.target === this);
          if (t.stay > wait && safe && !t.walkTo) { t.phase = 'down'; t.k = 0; }
          return null;
        }
        if (t.phase === 'down') {
          // najpierw wraca nad schody, potem schodzi
          if (this.i !== route.top.i || this.j !== route.top.j) return this.walkBack(dt, route);
          return this.climbStep(dt, t, route, -1) ? 'done' : null;
        }
        return 'fail';
      },
    };
  },

  // jeden krok wchodzenia (dir 1) albo schodzenia (dir -1); zwraca true na końcu
  climbStep(dt, t, route, dir) {
    const w = this.world, p = route.piece;
    if (!w.pieces.includes(p)) { this.jumpDown(); return 'gone'; } // ktoś rozebrał schody: zeskok
    t.k = Math.min(1, t.k + dt / CLIMB_T[p.type]);
    const foot = toWorld(route.foot.i, route.foot.j), top = toWorld(route.top.i, route.top.j);
    const yFoot = w.tileY(route.foot.i, route.foot.j), yTop = this.floorLevelY(route.top.i, route.top.j, 1);
    const f = dir > 0 ? t.k : 1 - t.k;
    this.x = foot.x + (top.x - foot.x) * f; this.z = foot.z + (top.z - foot.z) * f;
    this.floorY = yFoot + (yTop - yFoot) * f;
    this.facing = Math.atan2((top.x - foot.x) * dir, (top.z - foot.z) * dir);
    this.working = true; this.anim += dt;
    if (t.k < 1) return false;
    if (dir > 0) {
      this.i = route.top.i; this.j = route.top.j; this.lvl = 1; this.floorY = yTop;
      if (!this.known.has('climbed')) { this.known.add('climbed'); this.say(`wchodzi pierwszy raz na piętro ${p.type === 'ladder' ? 'po drabinie' : 'po schodach'} 🪜`, 'learn'); }
    } else {
      this.i = route.foot.i; this.j = route.foot.j; this.lvl = 0; this.floorY = null; this.climbRoute = null;
    }
    return true;
  },

  // chodzenie po podłodze piętra (prosto do sąsiedniego pola, po kolei)
  walkUpper(dt, to) {
    const w = this.world;
    if (this.i === to.i && this.j === to.j) return true;
    const di = Math.sign(to.i - this.i), dj = di ? 0 : Math.sign(to.j - this.j);
    const ni = this.i + di, nj = this.j + dj;
    if (!w.pieceAt('floor', ni, nj, this.lvl) || w.wallOn(this.i, this.j, sideTo(di, dj), this.lvl)) return true; // nie ma przejścia: zostaje
    const c = toWorld(ni, nj), dx = c.x - this.x, dz = c.z - this.z, d = Math.hypot(dx, dz), step = 1.4 * dt;
    this.facing = Math.atan2(dx, dz);
    if (d <= step) { this.x = c.x; this.z = c.z; this.i = ni; this.j = nj; this.floorY = this.floorLevelY(ni, nj, this.lvl); }
    else { this.x += dx / d * step; this.z += dz / d * step; }
    return false;
  },

  // powrót nad schody; gdy nie ma przejścia, zeskok
  walkBack(dt, r) {
    if (this.walkUpper(dt, r.top) && (this.i !== r.top.i || this.j !== r.top.j)) { this.jumpDown(); return 'done'; }
    return null;
  },

  // z góry widać dalej: wzrok sięga ponad krzakami i ścianami parteru
  lookFromAbove() {
    this.see(true, 26);
    if (!this.known.has('lookout')) {
      this.known.add('lookout');
      this.say('zauważa, że z piętra widać o wiele dalej 👀🧠', 'learn');
      this.speak('Ale stąd widok! Widać całą okolicę.', true);
    }
  },

  // brak drogi w dół albo podłoga zniknęła: zeskok na wolne pole obok (boli)
  jumpDown() {
    const w = this.world;
    let spot = null;
    for (let r = 0; r < 4 && !spot; r++) for (let dj = -r; dj <= r && !spot; dj++) for (let di = -r; di <= r && !spot; di++) {
      const i = this.i + di, j = this.j + dj;
      if (w.walkable(i, j) && !w.solid(idx(i, j))) spot = { i, j };
    }
    if (spot) { const c = toWorld(spot.i, spot.j); this.x = c.x; this.z = c.z; this.i = spot.i; this.j = spot.j; }
    this.lvl = 0; this.floorY = null; this.climbRoute = null;
    this.health = Math.max(1, this.health - 6);
    this.say('zeskakuje z piętra i trochę się obija 🤕', 'info');
    this.speak('Uff, trzeba było zeskoczyć...', true);
  },

  // pilnuje, żeby postać nie została na piętrze bez powodu ani nie wisiała w powietrzu
  keepLevel() {
    if (!(this.lvl > 0)) return;
    const w = this.world;
    if (!w.pieceAt('floor', this.i, this.j, this.lvl) && !(this.task && this.task.climb && this.task.phase !== 'top')) { this.task = null; this.jumpDown(); return; }
    if (this.task && this.task.climb) return;
    // przerwane zadanie (pilna potrzeba): zejść tą samą drogą
    const r = this.climbRoute;
    if (r && w.pieces.includes(r.piece)) {
      this.task = { climb: true, urgent: true, label: '🪜 Schodzi z piętra', path: [], phase: 'down', k: 0, act: null };
      const t = this.task;
      t.act = (dt) => {
        if (this.i !== r.top.i || this.j !== r.top.j) return this.walkBack(dt, r);
        return this.climbStep(dt, t, r, -1) ? 'done' : null;
      };
    } else { this.task = null; this.jumpDown(); }
  },
};
