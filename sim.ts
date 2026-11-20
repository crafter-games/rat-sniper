// Deterministic dotframe simulation contract for Rat Sniper (60Hz headless sim, replay & checksum)
import { defineSim, type SimPlatform, type SimRun } from "dotframe/src/sim";

const WORLD_W = 3840;
const WORLD_H = 1120;
const TARGET_KILLS = 15;
const MAG_SIZE = 8;

const BIT_LEFT = 1;
const BIT_RIGHT = 2;
const BIT_UP = 4;
const BIT_DOWN = 8;
const BIT_FIRE = 16;
const BIT_ZOOM = 32;
const BIT_BREATH = 64;
const BIT_RELOAD = 128;

interface SimRat {
  id: number;
  x: number;
  y: number;
  dir: number;
  speed: number;
  alive: boolean;
  hp: number;
}

interface SimState {
  seed: number;
  rng: number;
  frame: number;
  camX: number;
  camY: number;
  zoomIdx: number;
  ammo: number;
  boltFrames: number;
  reloadFrames: number;
  kills: number;
  shots: number;
  hits: number;
  headshots: number;
  nextRatId: number;
  rats: SimRat[];
}

function nextRand(s: SimState): number {
  s.rng = (Math.imul(s.rng, 1664525) + 1013904223) >>> 0;
  return s.rng / 4294967296;
}

function wrapX(x: number): number {
  return ((x % WORLD_W) + WORLD_W) % WORLD_W;
}

function wrappedDx(a: number, b: number): number {
  let d = b - a;
  if (d > WORLD_W / 2) d -= WORLD_W;
  if (d < -WORLD_W / 2) d += WORLD_W;
  return d;
}

function createSimState(seed: number): SimState {
  const s: SimState = {
    seed,
    rng: (seed || 1) >>> 0,
    frame: 0,
    camX: 640,
    camY: 600,
    zoomIdx: 0,
    ammo: MAG_SIZE,
    boltFrames: 0,
    reloadFrames: 0,
    kills: 0,
    shots: 0,
    hits: 0,
    headshots: 0,
    nextRatId: 1,
    rats: [],
  };
  const lanesY = [482, 630, 815];
  for (let i = 0; i < 9; i++) {
    s.rats.push({
      id: s.nextRatId++,
      x: Math.floor(nextRand(s) * WORLD_W),
      y: lanesY[i % lanesY.length],
      dir: nextRand(s) < 0.5 ? 1 : -1,
      speed: 1.6 + nextRand(s) * 1.4,
      alive: true,
      hp: 1,
    });
  }
  return s;
}

function stepSim(s: SimState, input: number): void {
  s.frame += 1;
  const panSpeed = s.zoomIdx === 0 ? 12 : s.zoomIdx === 1 ? 6 : 3;
  if (input & BIT_LEFT) s.camX = wrapX(s.camX - panSpeed);
  if (input & BIT_RIGHT) s.camX = wrapX(s.camX + panSpeed);
  if (input & BIT_UP) s.camY = Math.max(300, s.camY - panSpeed);
  if (input & BIT_DOWN) s.camY = Math.min(WORLD_H - 220, s.camY + panSpeed);
  if (input & BIT_ZOOM) s.zoomIdx = (s.zoomIdx + 1) % 3;

  if (s.boltFrames > 0) s.boltFrames -= 1;
  if (s.reloadFrames > 0) {
    s.reloadFrames -= 1;
    if (s.reloadFrames === 0) s.ammo = MAG_SIZE;
  } else if ((input & BIT_RELOAD) && s.ammo < MAG_SIZE) {
    s.reloadFrames = 80;
  }

  if ((input & BIT_FIRE) && s.boltFrames === 0 && s.reloadFrames === 0 && s.ammo > 0) {
    s.ammo -= 1;
    s.shots += 1;
    s.boltFrames = 32;
    for (const r of s.rats) {
      if (!r.alive) continue;
      const dx = wrappedDx(r.x, s.camX);
      const dy = s.camY - r.y;
      if (Math.hypot(dx - r.dir * 22, dy + 14) <= 16) {
        r.alive = false;
        s.hits += 1;
        s.headshots += 1;
        s.kills += 1;
        break;
      }
      if (Math.abs(dx) <= 30 && Math.abs(dy + 12) <= 18) {
        r.alive = false;
        s.hits += 1;
        s.kills += 1;
        break;
      }
    }
  }

  for (const r of s.rats) {
    if (!r.alive) continue;
    r.x = wrapX(r.x + r.dir * r.speed);
    if (nextRand(s) < 0.006) r.dir *= -1;
  }
}

function checksumSim(s: SimState): number {
  let h = 2166136261 >>> 0;
  const mix = (n: number) => {
    h ^= Math.imul(Math.round(n), 16777619) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  };
  mix(s.frame);
  mix(s.camX);
  mix(s.camY);
  mix(s.ammo);
  mix(s.kills);
  mix(s.shots);
  for (const r of s.rats) {
    mix(r.id);
    mix(r.x);
    mix(r.alive ? 1 : 0);
  }
  return h >>> 0;
}

export default defineSim({
  players: 1,
  window: { width: 1280, height: 720, title: "NIGHT SHIFT // Rat Sniper" },
  options: {},
  neutral: 0,
  rollbackWindow: 20,
  encode: (mask: number) => mask & 255,
  random: (rng: () => number) => {
    let m = 0;
    const r = rng();
    if (r < 0.25) m |= BIT_LEFT;
    else if (r < 0.5) m |= BIT_RIGHT;
    if (rng() < 0.08) m |= BIT_FIRE;
    if (rng() < 0.02) m |= BIT_RELOAD;
    if (rng() < 0.02) m |= BIT_BREATH;
    return m;
  },
  create: (_platform: SimPlatform): SimRun => {
    let sim = createSimState(1);
    return {
      ready: Promise.resolve(),
      start: (seed: number) => {
        sim = createSimState(seed);
      },
      step: (inputs: number[]) => stepSim(sim, inputs[0] ?? 0),
      checksum: () => checksumSim(sim),
      state: () => ({
        frame: sim.frame,
        kills: sim.kills,
        shots: sim.shots,
        hits: sim.hits,
        headshots: sim.headshots,
        ammo: sim.ammo,
      }),
      over: () => sim.kills >= TARGET_KILLS,
      save: () => structuredClone(sim),
      restore: (saved: unknown) => {
        sim = structuredClone(saved as SimState);
      },
      inspect: () => sim,
    };
  },
});
