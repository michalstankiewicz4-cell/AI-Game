// Życie przyrody: odrastanie zasobów, ruch ryb i ptaków, upływ czasu.
import { W, H, T, idx, toWorld, toTile, DIRS4, DIRS8, BRIDGE_COST, BRIDGE_BUILD_TIME, heightToY } from './world.js';
import { makeNoise2D } from '../core/rng.js';

export const natureMethods = {
  update(dt) {
    this.time += dt;
    // odrastanie zasobów
    for (const r of this.resources) {
      if (r.kind === 'seaweed' && r.amount < r.max) {
        r.regrow += dt;
        if (r.regrow > 40) { r.regrow = 0; r.amount++; this.changed.add(r); }
      } else if (r.kind === 'bush' && r.berries < r.max) {
        r.regrow += dt;
        if (r.regrow > 50) { r.regrow = 0; r.berries++; this.changed.add(r); }
      } else if ((r.kind === 'tree' || r.kind === 'palm') && r.growth < 1) {
        r.growth = Math.min(1, r.growth + dt / 240);
        if (r.growth >= 1) r.wood = r.kind === 'tree' ? 3 : 2;
        this.changed.add(r);
      }
    }
    // ryby
    for (const f of this.fish) {
      f.dir += (this.rand() - 0.5) * dt * 1.5;
      const nx = f.x + Math.cos(f.dir) * f.speed * dt, nz = f.z + Math.sin(f.dir) * f.speed * dt;
      const t = toTile(nx, nz);
      if (this.inBounds(t.i, t.j) && this.type[idx(t.i, t.j)] === T.SEA && this.nearLand(t.i, t.j, 6)) { f.x = nx; f.z = nz; }
      else f.dir += Math.PI * (0.6 + this.rand() * 0.8);
      if (f.jump > 0) f.jump -= dt;
      else if (this.rand() < dt * 0.01) f.jump = 1;
    }
    if (this.fishRespawn > 0) {
      this.fishRespawnTimer = (this.fishRespawnTimer || 0) + dt;
      if (this.fishRespawnTimer > 25) { this.fishRespawnTimer = 0; this.fishRespawn--; this.fish.push(this.newFish()); }
    }
    // ptaki
    for (const b of this.birds) {
      b.timer -= dt;
      if (b.state === 'fly') {
        b.angle += b.speed * dt;
        const tx = b.cx + Math.cos(b.angle) * b.radius, tz = b.cz + Math.sin(b.angle) * b.radius;
        b.x += (tx - b.x) * Math.min(1, dt * 1.5); b.z += (tz - b.z) * Math.min(1, dt * 1.5);
        b.y += (b.alt - b.y) * Math.min(1, dt);
        if (b.timer <= 0) {
          const t = this.randomLandTile(Math.floor(this.rand() * this.islandCount));
          if (t) { const p = toWorld(t.i, t.j); b.state = 'landing'; b.lx = p.x + (this.rand() - 0.5) * 0.6; b.lz = p.z + (this.rand() - 0.5) * 0.6; b.lt = t; }
          else b.timer = 10;
        }
      } else if (b.state === 'landing') {
        const dx = b.lx - b.x, dz = b.lz - b.z, d = Math.hypot(dx, dz);
        const gy = this.groundHeight(b.lx, b.lz) + 0.15;
        if (d < 0.2) { b.state = 'landed'; b.timer = 25 + this.rand() * 35; b.y = gy; }
        else {
          const s = Math.min(d, 5 * dt);
          b.x += dx / d * s; b.z += dz / d * s;
          b.y += (gy - b.y) * Math.min(1, dt * 1.2);
        }
      } else if (b.state === 'landed') {
        if (b.timer <= 0) this.scareBird(b);
      }
    }
    if (this.birdRespawn > 0) {
      this.birdTimer -= dt;
      if (this.birdTimer <= 0) {
        this.birdRespawn--; this.birdTimer = 40;
        const isl = this.islandDefs[Math.floor(this.rand() * this.islandCount)];
        const p = toWorld(isl.ci, isl.cj);
        this.birds.push({ id: this.nextId++, state: 'fly', cx: p.x, cz: p.z, radius: 8 + this.rand() * 8, angle: 0, alt: 7, x: p.x + 30, z: p.z, y: 12, timer: 30, speed: 0.3, lx: 0, lz: 0 });
      }
    }
  },

  landedBirds() { return this.birds.filter((b) => b.state === 'landed' && !b.dead); },

  catchBird(bird) {
    bird.dead = true;
    this.birds.splice(this.birds.indexOf(bird), 1);
    this.birdRespawn = (this.birdRespawn || 0) + 1;
    this.birdTimer = 40;
  },

  scareBird(bird) {
    bird.state = 'fly';
    bird.timer = 20 + this.rand() * 30;
    bird.cx = bird.x; bird.cz = bird.z;
  },

  fishNear(x, z, r) {
    return this.fish.filter((f) => Math.hypot(f.x - x, f.z - z) < r);
  },

  catchFish(f) {
    this.fish.splice(this.fish.indexOf(f), 1);
    this.fishRespawn = (this.fishRespawn || 0) + 1;
  },

  randomLandTile(isl) {
    for (let tries = 0; tries < 200; tries++) {
      const i = Math.floor(this.rand() * W), j = Math.floor(this.rand() * H);
      const k = idx(i, j);
      if (this.type[k] === T.GRASS && (isl === undefined || this.island[k] === isl)) return { i, j };
    }
    return null;
  },

  nearLand(i, j, r) {
    for (let dj = -r; dj <= r; dj += 2) for (let di = -r; di <= r; di += 2) {
      const ni = i + di, nj = j + dj;
      if (this.inBounds(ni, nj) && this.island[idx(ni, nj)] >= 0) return true;
    }
    return false;
  },
};
