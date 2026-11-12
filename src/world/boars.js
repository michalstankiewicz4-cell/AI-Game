// Dziki: chodzą po swojej wyspie, czasem szarżują na postać, którą zobaczą z bliska.
// Uzbrojona postać się broni (włócznia, miecz), tarcza zmniejsza obrażenia, a nieuzbrojona ucieka.
import { T, idx, toWorld, toTile } from './world.js';

// szarża jest wolniejsza niż bieg postaci (2,6), więc ucieczka się udaje, jeśli zacznie się na czas
export const BOAR = { hp: 40, speed: 1.1, charge: 2.4, sight: 4, hit: 7, hitCd: 2, respawn: 300, meat: 3 };

export const boarMethods = {
  spawnBoars() {
    this.boars = [];
    for (let n = 0; n < this.islandCount + 1; n++) this.boars.push(this.newBoar(n % this.islandCount, n === 0 ? 14 : 0));
  },

  // nowy dzik na wyspie isl, możliwie daleko od wyspy startowej postaci (minDist kafelków od środka wyspy 0)
  newBoar(isl, minDist = 0) {
    const c = this.islandDefs[0];
    let best = null;
    for (let tries = 0; tries < 400; tries++) {
      const i = Math.floor(this.rand() * this.W), j = Math.floor(this.rand() * this.H);
      if (this.island[idx(i, j)] !== isl || this.type[idx(i, j)] !== T.GRASS || this.res[idx(i, j)]) continue;
      const d = Math.hypot(i - c.ci, j - c.cj);
      if (d >= minDist) { best = { i, j }; break; }
      if (!best || d > best.d) best = { i, j, d };
    }
    if (!best) best = { i: Math.round(this.islandDefs[isl].ci), j: Math.round(this.islandDefs[isl].cj) };
    const p = toWorld(best.i, best.j);
    return { id: this.nextId++, isl, x: p.x, z: p.z, i: best.i, j: best.j, hp: BOAR.hp, state: 'roam', dir: this.rand() * Math.PI * 2, timer: 2, target: null, hitT: 0, calm: 180, dead: false, skinned: false }; // pierwszą dobę dziki są spokojne
  },

  boarWalkable(b, i, j) { return this.inBounds(i, j) && this.walkable(i, j) && this.type[idx(i, j)] !== T.BRIDGE && this.island[idx(i, j)] === b.isl; },

  updateBoars(dt) {
    if (!this.boars) return;
    for (const b of this.boars) {
      if (b.dead) {
        if ((b.respawnT -= dt) <= 0) Object.assign(b, this.newBoar(b.isl, 10), { id: b.id });
        continue;
      }
      b.calm -= dt; b.hitT -= dt;
      const prey = b.target && b.target.alive ? b.target : null;
      if (b.state === 'roam') {
        // spokojny spacer; zobaczona z bliska postać może sprowokować szarżę
        b.timer -= dt;
        if (b.timer <= 0) { b.dir += (this.rand() - 0.5) * 2.4; b.timer = 2 + this.rand() * 4; }
        this.moveBoar(b, Math.cos(b.dir), Math.sin(b.dir), BOAR.speed * dt);
        if (b.calm <= 0 && this.agents) {
          const a = this.agents.find((o) => o.alive && !o.asleep && Math.hypot(o.x - b.x, o.z - b.z) < BOAR.sight);
          if (a && this.rand() < dt * 0.15) { b.state = 'charge'; b.target = a; b.chargeT = 6; this.log(`🐗 Dzik szarżuje na ${a.name}!`, 'big'); }
        }
      } else if (b.state === 'charge') {
        b.chargeT -= dt;
        if (!prey || b.chargeT <= 0) { this.calmBoar(b); continue; }
        const dx = prey.x - b.x, dz = prey.z - b.z, d = Math.hypot(dx, dz);
        if (d > 0.8) this.moveBoar(b, dx / d, dz / d, BOAR.charge * dt);
        else if (b.hitT <= 0) {
          b.hitT = BOAR.hitCd; prey.hitByBoar(b, BOAR.hit);
          // często to tylko ostrzeżenie: po ciosie dzik odpuszcza, chyba że ktoś z nim walczy
          if (!prey.tools.sword && !prey.tools.spear && this.rand() < 0.6) this.calmBoar(b);
        }
      } else if (b.state === 'flee') {
        b.timer -= dt;
        const away = prey ? Math.atan2(b.z - prey.z, b.x - prey.x) : b.dir;
        b.dir = away;
        this.moveBoar(b, Math.cos(away), Math.sin(away), BOAR.charge * 0.8 * dt);
        if (b.timer <= 0) this.calmBoar(b);
      }
    }
  },

  calmBoar(b) { b.state = 'roam'; b.target = null; b.calm = 60 + this.rand() * 60; b.timer = 1; },

  moveBoar(b, ux, uz, step) {
    const nx = b.x + ux * step, nz = b.z + uz * step;
    const t = toTile(nx, nz);
    if (this.boarWalkable(b, t.i, t.j)) { b.x = nx; b.z = nz; b.i = t.i; b.j = t.j; b.dir = Math.atan2(uz, ux); }
    else { b.dir += Math.PI * (0.5 + this.rand()); b.timer = 1 + this.rand() * 2; }
  },

  // cios zadany przez postać; zwraca true, gdy dzik padł
  hurtBoar(b, dmg, by) {
    if (b.dead) return false;
    b.hp -= dmg;
    if (b.hp <= 0) {
      b.dead = true; b.respawnT = BOAR.respawn; b.state = 'dead'; b.target = null;
      this.log(`🐗 ${by.name} pokonuje dzika! Będzie mięso.`, 'big');
      return true;
    }
    if (b.hp < 15 && b.state !== 'flee') { b.state = 'flee'; b.timer = 6; b.target = by; }
    else if (b.state === 'roam') { b.state = 'charge'; b.target = by; b.chargeT = 9; }
    return false;
  },
};
