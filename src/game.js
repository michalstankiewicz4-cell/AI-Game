// Tworzenie nowej gry i krok symulacji (bez DOM).
import { World, idx } from './world/world.js';
import { Agent, computeShores } from './ai/agent.js';
import { PERSONAS } from './ai/data.js';
import { Narrator } from './ai/commentary.js';
import { Social } from './ai/social.js';

export const STEP = 0.1; // krok symulacji (s)

export function createGame(cfg) {
  const world = new World(cfg.seed, cfg.islands);
  computeShores(world);
  world.agents = [];
  // start blisko środka wyspy 0
  const c = world.islandDefs[0];
  const spots = [];
  for (let r = 0; r < 12 && spots.length < 8; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    const i = Math.round(c.ci) + di, j = Math.round(c.cj) + dj;
    if (world.walkable(i, j) && world.island[idx(i, j)] === 0 && !world.res[idx(i, j)] && !spots.some((s) => s.i === i && s.j === j)) spots.push({ i, j });
  }
  for (let n = 0; n < cfg.agents; n++) {
    const s = spots[n * 2 % spots.length];
    world.agents.push(new Agent(world, PERSONAS[n], s.i, s.j, n));
  }
  return { world, agents: world.agents, narrator: new Narrator(world), social: new Social(world) };
}

// jeden krok symulacji; narrate(text) dostaje komentarze narratora
export function stepGame(game, narrate) {
  const w = game.world;
  w.update(STEP);
  for (const a of game.agents) { const wasAlive = a.alive; a.update(STEP); if (wasAlive && !a.alive) a.diedAt = w.time; }
  game.social.update(STEP);
  if (w.shoresDirty) { w.shoresDirty = false; computeShores(w); }
  game.narrator.update(STEP, narrate);
}
