import { SoundEngine } from "./src/audio.js";
import {
  buildPanoramaWorld,
  drawInteractiveProps,
  getZoneNameAtX,
  SECTOR_DEFS,
} from "./src/textures.js";
import { Rat, wrapX, wrappedDeltaX } from "./src/rats.js";

let VIEW_W = 1280;
let VIEW_H = 720;
const BASE_ZOOM_LEVELS = [1.2, 2.1, 3.4];
const ZOOM_LABELS = ["2.0x", "4.0x", "8.0x"];

const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d", { alpha: false })!;

let cachedIrGradHigh: CanvasGradient | null = null;
let cachedIrGradLow: CanvasGradient | null = null;
let grainPattern: CanvasPattern | null = null;

const isTouchDevice =
  "ontouchstart" in window ||
  navigator.maxTouchPoints > 0 ||
  window.matchMedia("(pointer: coarse)").matches;

const startOverlay = document.getElementById("start-overlay")!;
const debriefOverlay = document.getElementById("debrief-overlay")!;
const killBanner = document.getElementById("kill-banner")!;
const shotFeedback = document.getElementById("shot-feedback")!;
const statusPill = document.getElementById("status-pill")!;
const touchControls = document.getElementById("touch-controls")!;
const startBtn = document.getElementById("start-btn")!;
const nextSectorBtn = document.getElementById("next-sector-btn")!;
const replayBtn = document.getElementById("replay-btn")!;
const menuBtn = document.getElementById("menu-btn")!;
const sectorButtons = [...document.querySelectorAll<HTMLButtonElement>(".sector-btn")];

const tFire = document.getElementById("t-fire")!;
const tZoom = document.getElementById("t-zoom")!;
const tBreath = document.getElementById("t-breath")!;
const tReload = document.getElementById("t-reload")!;
const tIr = document.getElementById("t-ir")!;

const sound = new SoundEngine();

// Pre-bake tileable monochrome CMOS sensor noise for fast 60fps IR grain
const grainCanvas = document.createElement("canvas");
grainCanvas.width = 256;
grainCanvas.height = 256;
const grainCtx = grainCanvas.getContext("2d")!;
{
  const img = grainCtx.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 25;
  }
  grainCtx.putImageData(img, 0, 0);
  grainPattern = ctx.createPattern(grainCanvas, "repeat");
}

const state = {
  running: false,
  mode: "shift",
  selectedZone: 0,
  world: null as any,
  rats: [] as Rat[],
  nextRatId: 1,
  spawnTimer: 0.5,
  particles: [] as any[],
  pellets: [] as any[],
  impactDecals: [] as any[],

  // 360° cylindrical scope camera
  pointerLocked: false,
  touchAiming: false,
  sensitivity: 1.35,
  mouseNormX: 0.5,
  mouseNormY: 0.52,
  targetCamX: 640,
  targetCamY: 600,
  camX: 640,
  camY: 600,
  zoomIdx: 0,
  currentZoom: BASE_ZOOM_LEVELS[0],
  recoilX: 0,
  recoilY: 0,
  recoilBlur: 0,
  swayTime: 0,
  holdingBreath: false,
  breathStamina: 1.0,
  breathExhausted: false,
  irHigh: true,
  showHud: true,

  // Magazine & bolt
  magSize: 8,
  ammo: 8,
  reloading: false,
  reloadTimer: 0,
  boltTimer: 0,

  // Stats
  elapsed: 0,
  kills: 0,
  shotsFired: 0,
  shotsHit: 0,
  headshots: 0,
  longestShot: 0,
  distanceSum: 0,

  // UI timers
  killBannerTimer: 0,
  feedbackTimer: 0,
};

function rebuildScreenCaches() {
  const maxR = Math.hypot(VIEW_W, VIEW_H) * 0.62;
  cachedIrGradHigh = ctx.createRadialGradient(
    VIEW_W / 2, VIEW_H / 2, maxR * 0.22,
    VIEW_W / 2, VIEW_H / 2, maxR * 0.94
  );
  cachedIrGradHigh.addColorStop(0, "rgba(255,255,255,0.05)");
  cachedIrGradHigh.addColorStop(0.58, "rgba(8,10,12,0.14)");
  cachedIrGradHigh.addColorStop(1, "rgba(0,0,0,0.72)");

  cachedIrGradLow = ctx.createRadialGradient(
    VIEW_W / 2, VIEW_H / 2, maxR * 0.12,
    VIEW_W / 2, VIEW_H / 2, maxR * 0.68
  );
  cachedIrGradLow.addColorStop(0, "rgba(0,0,0,0.12)");
  cachedIrGradLow.addColorStop(0.55, "rgba(6,8,10,0.42)");
  cachedIrGradLow.addColorStop(1, "rgba(0,0,0,0.92)");
}

function getZoomLevel(idx: number) {
  const worldH = state.world?.worldHeight ?? 1120;
  const minCoverZoom = (VIEW_H + 8) / worldH;
  return Math.max(BASE_ZOOM_LEVELS[idx], minCoverZoom * (idx === 0 ? 1.08 : 1.0));
}

function clampTargetCamY() {
  if (!state.world) return;
  const halfH = VIEW_H / (2 * state.currentZoom);
  const minY = Math.min(state.world.worldHeight * 0.5, halfH);
  const maxY = Math.max(state.world.worldHeight * 0.5, state.world.worldHeight - halfH);
  state.targetCamY = Math.max(minY, Math.min(maxY, state.targetCamY));
}

function resizeCanvas() {
  const scale = Math.min(1, 1280 / Math.max(window.innerWidth, 1));
  VIEW_W = Math.max(360, Math.round(window.innerWidth * scale));
  VIEW_H = Math.max(360, Math.round(window.innerHeight * scale));
  canvas.width = VIEW_W;
  canvas.height = VIEW_H;
  rebuildScreenCaches();
  if (state.world) {
    state.currentZoom = Math.max(state.currentZoom, getZoomLevel(state.zoomIdx));
    clampTargetCamY();
    state.camY = state.targetCamY;
  }
}

function updateTouchVisibility() {
  if (isTouchDevice && state.running) {
    touchControls.classList.remove("hidden");
  } else {
    touchControls.classList.add("hidden");
  }
}

function showStatus(text: string) {
  if (!text) {
    statusPill.classList.add("hidden");
    return;
  }
  statusPill.textContent = text;
  statusPill.classList.remove("hidden");
}

function triggerKillBanner(num: number, detail: string) {
  killBanner.textContent = `Number ${num}`;
  killBanner.classList.remove("hidden");
  killBanner.style.animation = "none";
  void killBanner.offsetWidth;
  killBanner.style.animation = "";
  state.killBannerTimer = 2.6;

  shotFeedback.textContent = detail;
  shotFeedback.classList.remove("hidden");
  state.feedbackTimer = 2.6;
}

function triggerFeedback(detail: string) {
  shotFeedback.textContent = detail;
  shotFeedback.classList.remove("hidden");
  state.feedbackTimer = 1.6;
}

function initWorld(startZone = 0) {
  if (!state.world) {
    state.world = buildPanoramaWorld();
  }
  state.selectedZone = startZone;
  state.rats = [];
  state.particles = [];
  state.pellets = [];
  state.impactDecals = [];
  state.spawnTimer = 0.8;

  const startX = SECTOR_DEFS[startZone]?.startX ?? 640;
  state.currentZoom = getZoomLevel(state.zoomIdx);
  state.camX = startX;
  state.targetCamX = startX;
  state.targetCamY = 600;
  clampTargetCamY();
  state.camY = state.targetCamY;
  state.recoilX = 0;
  state.recoilY = 0;
  state.ammo = state.magSize;
  state.reloading = false;
  state.boltTimer = 0;

  state.kills = 0;
  state.shotsFired = 0;
  state.shotsHit = 0;
  state.headshots = 0;
  state.longestShot = 0;
  state.distanceSum = 0;
  state.elapsed = 0;

  for (let i = 0; i < 9; i++) {
    spawnRat(true);
  }
}

function slewToZone(zoneIdx: number) {
  if (!state.world) return;
  const target = SECTOR_DEFS[zoneIdx]?.startX ?? 640;
  const W = state.world.worldWidth;
  const currentWrapped = wrapX(state.targetCamX, W);
  const delta = wrappedDeltaX(currentWrapped, target, W);
  state.targetCamX += delta;
  state.selectedZone = zoneIdx;
}

function spawnRat(initial = false) {
  const world = state.world;
  if (!world) return;
  const aliveCount = state.rats.filter((r) => r.alive).length;
  if (aliveCount >= 11) return;

  const lane = world.lanes[Math.floor(Math.random() * world.lanes.length)];
  const bx = lane.burrows[Math.floor(Math.random() * lane.burrows.length)];
  const spawnX = initial
    ? lane.feedSpots[Math.floor(Math.random() * lane.feedSpots.length)] + (Math.random() - 0.5) * 140
    : bx;

  const rat = new Rat(lane, spawnX, state.nextRatId++, world.worldWidth);
  if (initial) {
    rat.state = Math.random() < 0.5 ? "FEEDING" : "SCURRYING";
    rat.peekAmount = 1;
    rat.stateTimer = 1.8 + Math.random() * 2.8;
  }
  state.rats.push(rat);
}

function estimateDistanceAtY(worldY: number) {
  const world = state.world;
  if (!world) return 25;
  const t = Math.max(0, Math.min(1, (worldY - world.wallY) / (world.worldHeight - world.wallY)));
  return Math.round(35 - t * 19);
}

function getAimWorldPos() {
  const swayMult = state.holdingBreath && !state.breathExhausted ? 0.14 : 1.0;
  const zoomSway = 1.0 / Math.sqrt(state.currentZoom);
  const sx = Math.sin(state.swayTime * 1.18) * 11 * swayMult * zoomSway;
  const sy = Math.sin(state.swayTime * 2.36) * 7 * swayMult * zoomSway;
  return {
    x: state.camX + sx + state.recoilX,
    y: state.camY + sy + state.recoilY,
  };
}

function startReload() {
  if (state.reloading || state.ammo === state.magSize) return;
  state.reloading = true;
  state.reloadTimer = 1.35;
  sound.playReload();
  showStatus("RELOADING ROTARY MAG...");
}

function fireShot() {
  if (!state.running || state.reloading || state.boltTimer > 0) return;

  if (state.ammo <= 0) {
    sound.playDryFire();
    showStatus(isTouchDevice ? "EMPTY — TAP RELOAD" : "MAGAZINE EMPTY — PRESS [R] TO RELOAD");
    return;
  }

  state.ammo -= 1;
  state.shotsFired += 1;
  state.boltTimer = 0.52;
  sound.playShot();
  setTimeout(() => {
    if (state.running && !state.reloading && state.ammo > 0) {
      sound.playBoltCycle();
    }
  }, 190);

  const W = state.world.worldWidth;
  const aim = getAimWorldPos();
  const aimWX = wrapX(aim.x, W);
  const distM = estimateDistanceAtY(aim.y);
  const flightTime = Math.max(0.055, distM / 265);
  const dropPx = (distM - 25) * 0.55;

  const startX = aimWX + (Math.random() - 0.5) * 3;
  const startY = aim.y + 85 / state.currentZoom;
  const targetX = aimWX + (Math.random() - 0.5) * 2.2;
  const targetY = aim.y + dropPx;

  state.pellets.push({
    startX, startY, targetX, targetY,
    x: startX, y: startY, prevX: startX, prevY: startY,
    t: 0, dur: flightTime, distM,
  });

  state.recoilY -= (18 + Math.random() * 8) / Math.sqrt(state.currentZoom);
  state.recoilX += ((Math.random() - 0.35) * 11) / Math.sqrt(state.currentZoom);
  state.recoilBlur = 1.0;

  for (let i = 0; i < 6; i++) {
    state.particles.push({
      x: wrapX(aimWX + (Math.random() - 0.5) * 40, W),
      y: aim.y + 70 / state.currentZoom,
      vx: (Math.random() - 0.5) * 60,
      vy: -20 - Math.random() * 40,
      r: 8 + Math.random() * 14,
      alpha: 0.16,
      life: 0.25,
      maxLife: 0.25,
      color: "225,232,238",
    });
  }

  if (state.ammo === 0) {
    showStatus(isTouchDevice ? "EMPTY — TAP RELOAD" : "MAGAZINE EMPTY — PRESS [R] TO RELOAD");
  }
}

function spawnImpactParticles(x: number, y: number, material: string) {
  const W = state.world.worldWidth;
  const count = material === "rat" || material === "headshot" ? 10 : 14;
  for (let i = 0; i < count; i++) {
    const a = -Math.PI * Math.random();
    const spd = (35 + Math.random() * 130) * (material === "concrete" ? 1.25 : 0.9);
    state.particles.push({
      x: wrapX(x, W),
      y,
      vx: Math.cos(a) * spd + (Math.random() - 0.5) * 40,
      vy: Math.sin(a) * spd - 20,
      r: material === "concrete" ? 1.5 + Math.random() * 2.5 : 3 + Math.random() * 6,
      alpha: material === "concrete" ? 0.85 : 0.48,
      life: 0.28 + Math.random() * 0.28,
      maxLife: 0.55,
      color: material === "concrete" ? "245,248,250" : material === "dirt" ? "175,180,185" : "210,215,220",
      gravity: material === "concrete" ? 260 : 120,
    });
  }
}

function resolvePelletImpact(pellet: any) {
  const W = state.world.worldWidth;
  const x = wrapX(pellet.targetX, W);
  const y = pellet.targetY;
  const distM = pellet.distM;
  const camWX = wrapX(state.camX, W);
  const pan = wrappedDeltaX(camWX, x, W) / (VIEW_W * 0.6);

  const sortedRats = [...state.rats].filter((r) => r.alive).sort((a, b) => b.y - a.y);
  for (const rat of sortedRats) {
    const res = rat.checkHit(x, y);
    if (res.hit) {
      state.shotsHit += 1;
      const outcome = rat.applyHit(res.headshot, camWX);
      sound.playImpact(res.headshot ? "headshot" : "rat", pan);
      spawnImpactParticles(x, y, res.headshot ? "headshot" : "rat");

      for (const other of state.rats) {
        if (other !== rat) other.alertFrom(x, y, 290);
      }

      if (outcome.killed) {
        state.kills += 1;
        if (res.headshot) state.headshots += 1;
        state.distanceSum += rat.distance;
        if (rat.distance > state.longestShot) state.longestShot = rat.distance;

        const tag = res.headshot ? `HEADSHOT • ${rat.distance}m` : `CLEAN HIT • ${rat.distance}m`;
        triggerKillBanner(state.kills, tag);

        if (state.mode === "shift" && state.kills >= state.world.targetKills) {
          setTimeout(() => {
            if (state.running) openDebrief();
          }, 950);
        }
      } else {
        triggerFeedback(`WOUNDED ALPHA • ${rat.distance}m`);
      }
      return;
    }
  }

  for (const prop of state.world.props) {
    const dx = Math.abs(wrappedDeltaX(prop.x, x, W));
    if (prop.type === "jug" && dx <= prop.w / 2 && Math.abs(y - prop.y) <= prop.h / 2) {
      prop.shake = 1.0;
      prop.hits += 1;
      sound.playImpact("jug", pan);
      spawnImpactParticles(x, y, "dirt");
      for (const r of state.rats) r.alertFrom(x, y, 420);
      triggerFeedback(`JUG HIT • ${distM}m`);
      return;
    }
  }

  const mat = y < state.world.wallY + 12 ? "concrete" : "dirt";
  sound.playImpact(mat, pan);
  spawnImpactParticles(x, y, mat);
  state.impactDecals.push({ x, y, r: mat === "concrete" ? 3.5 : 5, mat });
  if (state.impactDecals.length > 60) state.impactDecals.shift();

  for (const r of state.rats) {
    r.alertFrom(x, y, mat === "concrete" ? 440 : 340);
  }
}

function lockPointer() {
  if (isTouchDevice) return;
  try {
    const res = canvas.requestPointerLock?.() as any;
    if (res && typeof res.catch === "function") res.catch(() => {});
  } catch {}
}

function unlockPointer() {
  try {
    if (document.pointerLockElement) document.exitPointerLock?.();
  } catch {}
}

function openDebrief() {
  state.running = false;
  updateTouchVisibility();
  unlockPointer();
  const acc = state.shotsFired > 0 ? Math.round((state.shotsHit / state.shotsFired) * 100) : 0;
  const hsPct = state.kills > 0 ? Math.round((state.headshots / state.kills) * 100) : 0;
  const avgDist = state.kills > 0 ? Math.round(state.distanceSum / state.kills) : 0;

  document.getElementById("debrief-eyebrow")!.textContent = "360° NIGHT SHIFT COMPLETE";
  document.getElementById("debrief-title")!.textContent = "FARMYARD SECURED";
  nextSectorBtn.textContent = "NEW NIGHT SHIFT";

  document.getElementById("debrief-stats")!.innerHTML = `
    <div class="stat-card"><div class="stat-label">CONFIRMED KILLS</div><div class="stat-value">${state.kills}</div></div>
    <div class="stat-card"><div class="stat-label">ACCURACY</div><div class="stat-value">${acc}%</div></div>
    <div class="stat-card"><div class="stat-label">HEADSHOTS</div><div class="stat-value">${state.headshots} (${hsPct}%)</div></div>
    <div class="stat-card"><div class="stat-label">LONGEST SHOT</div><div class="stat-value">${state.longestShot}m</div></div>
    <div class="stat-card"><div class="stat-label">AVG DISTANCE</div><div class="stat-value">${avgDist}m</div></div>
    <div class="stat-card"><div class="stat-label">SHIFT TIME</div><div class="stat-value">${formatTime(state.elapsed)}</div></div>
  `;

  debriefOverlay.classList.remove("hidden");
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function update(dt: number, nowMs: number) {
  if (!state.world) return;
  if (!state.running) {
    // Live atmospheric 360° background pan & active rats behind the landing page
    state.swayTime += dt;
    state.targetCamX += dt * 36;
    state.camX += (state.targetCamX - state.camX) * Math.min(1, dt * 4);
    for (const r of state.rats) r.update(dt);
    state.rats = state.rats.filter((r) => !r.removed);
    return;
  }

  state.elapsed += dt;
  state.swayTime += dt;

  const targetZoom = getZoomLevel(state.zoomIdx);
  state.currentZoom += (targetZoom - state.currentZoom) * Math.min(1, dt * 11);

  if (!state.pointerLocked && !isTouchDevice) {
    if (state.mouseNormX < 0.18) {
      state.targetCamX -= (0.18 - state.mouseNormX) * 1400 * dt;
    } else if (state.mouseNormX > 0.82) {
      state.targetCamX += (state.mouseNormX - 0.82) * 1400 * dt;
    }
    const halfH = VIEW_H / (2 * state.currentZoom);
    const minY = halfH;
    const maxY = Math.max(halfH, state.world.worldHeight - halfH);
    state.targetCamY = minY + state.mouseNormY * (maxY - minY);
  }
  clampTargetCamY();

  const panSmooth = Math.min(1, dt * (state.pointerLocked || isTouchDevice ? 24 : 12));
  state.camX += (state.targetCamX - state.camX) * panSmooth;
  state.camY += (state.targetCamY - state.camY) * panSmooth;

  const halfHNow = VIEW_H / (2 * state.currentZoom);
  const safeMinY = halfHNow;
  const safeMaxY = Math.max(halfHNow, state.world.worldHeight - halfHNow);
  state.camY = Math.max(safeMinY, Math.min(safeMaxY, state.camY));

  state.recoilX *= Math.pow(0.015, dt);
  state.recoilY *= Math.pow(0.015, dt);
  state.recoilBlur = Math.max(0, state.recoilBlur - dt * 5.5);

  if (state.holdingBreath && !state.breathExhausted) {
    state.breathStamina = Math.max(0, state.breathStamina - dt * 0.27);
    sound.playHeartbeat(nowMs);
    if (state.breathStamina <= 0.01) state.breathExhausted = true;
  } else {
    state.breathStamina = Math.min(1, state.breathStamina + dt * 0.22);
    if (state.breathStamina > 0.35) state.breathExhausted = false;
  }

  if (state.boltTimer > 0) state.boltTimer = Math.max(0, state.boltTimer - dt);
  if (state.reloading) {
    state.reloadTimer -= dt;
    if (state.reloadTimer <= 0) {
      state.reloading = false;
      state.ammo = state.magSize;
      showStatus("");
    }
  }

  if (state.killBannerTimer > 0) {
    state.killBannerTimer -= dt;
    if (state.killBannerTimer <= 0) killBanner.classList.add("hidden");
  }
  if (state.feedbackTimer > 0) {
    state.feedbackTimer -= dt;
    if (state.feedbackTimer <= 0) shotFeedback.classList.add("hidden");
  }

  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0) {
    spawnRat(false);
    state.spawnTimer = 1.5 + Math.random() * 2.0;
  }

  for (const r of state.rats) r.update(dt);
  state.rats = state.rats.filter((r) => !r.removed);

  const deadRats = state.rats.filter((r) => !r.alive);
  if (deadRats.length > 40) {
    const camWX = wrapX(state.camX, state.world.worldWidth);
    const oldestOffscreen = deadRats.find(
      (r) => Math.abs(wrappedDeltaX(camWX, r.x, state.world.worldWidth)) > VIEW_W
    );
    if (oldestOffscreen) {
      state.rats = state.rats.filter((r) => r !== oldestOffscreen);
    }
  }

  for (let i = state.pellets.length - 1; i >= 0; i--) {
    const p = state.pellets[i];
    p.prevX = p.x;
    p.prevY = p.y;
    p.t += dt;
    const u = Math.min(1, p.t / p.dur);
    const arc = Math.sin(u * Math.PI) * -6;
    p.x = p.startX + (p.targetX - p.startX) * u;
    p.y = p.startY + (p.targetY - p.startY) * u + arc;
    if (u >= 1) {
      resolvePelletImpact(p);
      state.pellets.splice(i, 1);
    }
  }

  const W = state.world.worldWidth;
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const pt = state.particles[i];
    pt.life -= dt;
    pt.x = wrapX(pt.x + pt.vx * dt, W);
    pt.y += pt.vy * dt;
    if (pt.gravity) pt.vy += pt.gravity * dt;
    if (pt.life <= 0) state.particles.splice(i, 1);
  }
}

function drawCroppedLayer(layerCanvas: HTMLCanvasElement, aimWX: number, aimY: number, z: number, tileOffsets: number[]) {
  const W = layerCanvas.width;
  const H = layerCanvas.height;
  const halfW = VIEW_W / (2 * z) + 8;
  const halfH = VIEW_H / (2 * z) + 8;
  const sy = Math.max(0, Math.floor(aimY - halfH));
  const ey = Math.min(H, Math.ceil(aimY + halfH));
  const sh = ey - sy;
  if (sh <= 0) return;

  for (const off of tileOffsets) {
    const sx = Math.max(0, Math.floor(aimWX - halfW - off));
    const ex = Math.min(W, Math.ceil(aimWX + halfW - off));
    const sw = ex - sx;
    if (sw > 0) {
      ctx.drawImage(layerCanvas, sx, sy, sw, sh, sx + off, sy, sw, sh);
    }
  }
}

function render(dt: number) {
  if (!state.world) return;

  const W = state.world.worldWidth;
  const H = state.world.worldHeight;
  const aim = getAimWorldPos();
  const aimWX = wrapX(aim.x, W);
  const z = state.currentZoom;
  const halfH = VIEW_H / (2 * z);
  const renderAimY = Math.max(halfH, Math.min(H - halfH, aim.y));
  const irBoost = state.irHigh ? 1.15 : 0.72;

  const halfViewW = VIEW_W / (2 * z) + 120;
  const tileOffsets: number[] = [];
  for (const off of [-W, 0, W]) {
    if (off + W > aimWX - halfViewW && off < aimWX + halfViewW) {
      tileOffsets.push(off);
    }
  }

  const sortedRats = [...state.rats].sort((a, b) => a.y - b.y);

  ctx.save();
  ctx.translate(VIEW_W / 2, VIEW_H / 2);
  ctx.scale(z, z);
  ctx.translate(-aimWX, -renderAimY);

  drawCroppedLayer(state.world.bgCanvas, aimWX, renderAimY, z, tileOffsets);

  for (const off of tileOffsets) {
    for (const d of state.impactDecals) {
      const dx = d.x + off;
      if (dx < aimWX - halfViewW || dx > aimWX + halfViewW) continue;
      ctx.fillStyle = d.mat === "concrete" ? "rgba(235, 240, 244, 0.55)" : "rgba(22, 24, 26, 0.55)";
      ctx.beginPath();
      ctx.arc(dx, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  for (const off of tileOffsets) {
    for (const r of sortedRats) {
      if (!r.lane.behindFg) continue;
      const rx = r.x + off;
      if (rx < aimWX - halfViewW || rx > aimWX + halfViewW) continue;
      r.draw(ctx, aimWX, renderAimY, irBoost, off);
    }
  }

  drawCroppedLayer(state.world.fgCanvas, aimWX, renderAimY, z, tileOffsets);

  for (const off of tileOffsets) {
    drawInteractiveProps(ctx, state.world, dt, off);
  }

  for (const off of tileOffsets) {
    for (const r of sortedRats) {
      if (r.lane.behindFg) continue;
      const rx = r.x + off;
      if (rx < aimWX - halfViewW || rx > aimWX + halfViewW) continue;
      r.draw(ctx, aimWX, renderAimY, irBoost, off);
    }
  }

  for (const off of tileOffsets) {
    for (const p of state.pellets) {
      const grad = ctx.createLinearGradient(p.prevX + off, p.prevY, p.x + off, p.y);
      grad.addColorStop(0, "rgba(255, 255, 255, 0)");
      grad.addColorStop(1, "rgba(255, 255, 255, 0.92)");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2.4 / Math.sqrt(z);
      ctx.beginPath();
      ctx.moveTo(p.prevX + off, p.prevY);
      ctx.lineTo(p.x + off, p.y);
      ctx.stroke();

      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(p.x + off, p.y, 2.2 / Math.sqrt(z), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  for (const off of tileOffsets) {
    for (const pt of state.particles) {
      const a = Math.max(0, (pt.life / pt.maxLife) * pt.alpha);
      ctx.fillStyle = `rgba(${pt.color},${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(pt.x + off, pt.y, pt.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();

  if (cachedIrGradHigh && cachedIrGradLow) {
    ctx.fillStyle = state.irHigh ? cachedIrGradHigh : cachedIrGradLow;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  if (state.recoilBlur > 0.01) {
    ctx.fillStyle = `rgba(210, 220, 228, ${state.recoilBlur * 0.08})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  if (grainPattern) {
    const gx = Math.floor(Math.random() * 256);
    const gy = Math.floor(Math.random() * 256);
    ctx.save();
    ctx.translate(-gx, -gy);
    ctx.fillStyle = grainPattern;
    ctx.fillRect(gx, gy, VIEW_W, VIEW_H);
    ctx.restore();
  }

  drawReticle(ctx);

  if (state.showHud && state.running) {
    drawScopeHud(ctx, aimWX, renderAimY);
  }
}

function drawReticle(ctx: CanvasRenderingContext2D) {
  const cx = VIEW_W / 2;
  const cy = VIEW_H / 2;
  const gap = 5;
  const armH = Math.min(58, VIEW_W * 0.085);
  const armV = Math.min(58, VIEW_H * 0.1);

  ctx.save();
  ctx.strokeStyle = "#48eb5a";
  ctx.shadowColor = "rgba(72, 235, 90, 0.55)";
  ctx.shadowBlur = 4;
  ctx.lineWidth = 1.6;

  ctx.beginPath();
  ctx.moveTo(cx - armH, cy);
  ctx.lineTo(cx - gap, cy);
  ctx.moveTo(cx + gap, cy);
  ctx.lineTo(cx + armH, cy);
  ctx.moveTo(cx, cy + gap);
  ctx.lineTo(cx, cy + armV);
  ctx.stroke();

  if (state.zoomIdx > 0) {
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy + armV * 0.36);
    ctx.lineTo(cx + 4, cy + armV * 0.36);
    ctx.moveTo(cx - 3, cy + armV * 0.66);
    ctx.lineTo(cx + 3, cy + armV * 0.66);
    ctx.stroke();
  }

  ctx.restore();
}

function drawCompassTape(ctx: CanvasRenderingContext2D, headingDeg: number) {
  const cx = VIEW_W / 2;
  const tapeW = Math.min(300, VIEW_W * 0.44);
  const y = 24;
  const pxPerDeg = 3.8;

  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - tapeW / 2, 4, tapeW, 38);
  ctx.clip();

  ctx.font = '600 10px ui-monospace, "SF Mono", Menlo, monospace';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const labels: Record<number, string> = {
    0: "N", 45: "NE", 90: "E", 135: "SE",
    180: "S", 225: "SW", 270: "W", 315: "NW",
  };

  const startDeg = Math.floor((headingDeg - 45) / 5) * 5;
  for (let d = startDeg; d <= headingDeg + 45; d += 5) {
    const norm = ((d % 360) + 360) % 360;
    const x = cx + (d - headingDeg) * pxPerDeg;
    const isMajor = norm % 15 === 0;

    ctx.strokeStyle = isMajor ? "rgba(215, 225, 232, 0.72)" : "rgba(180, 190, 196, 0.32)";
    ctx.lineWidth = isMajor ? 1.4 : 1;
    ctx.beginPath();
    ctx.moveTo(x, y + (isMajor ? 2 : 5));
    ctx.lineTo(x, y + 11);
    ctx.stroke();

    if (labels[norm]) {
      ctx.fillStyle = "#5ee26e";
      ctx.fillText(labels[norm], x, y - 6);
    } else if (norm % 30 === 0) {
      ctx.fillStyle = "rgba(205, 214, 220, 0.72)";
      ctx.fillText(String(norm).padStart(3, "0"), x, y - 6);
    }
  }
  ctx.restore();

  ctx.fillStyle = "#5ee26e";
  ctx.beginPath();
  ctx.moveTo(cx, y + 12);
  ctx.lineTo(cx - 4, y + 18);
  ctx.lineTo(cx + 4, y + 18);
  ctx.closePath();
  ctx.fill();
}

function drawScopeHud(ctx: CanvasRenderingContext2D, aimWX: number, aimY: number) {
  const W = state.world.worldWidth;
  const headingDeg = Math.round((aimWX / W) * 360) % 360;
  const distM = estimateDistanceAtY(aimY);
  const zoneName = getZoneNameAtX(aimWX, W);
  const compact = VIEW_W < 640;

  drawCompassTape(ctx, headingDeg);

  ctx.save();
  ctx.font = compact
    ? '600 10px ui-monospace, "SF Mono", Menlo, monospace'
    : '600 12px ui-monospace, "SF Mono", Menlo, monospace';
  ctx.textBaseline = "middle";

  const recPulse = Math.floor(state.elapsed * 2) % 2 === 0;
  ctx.fillStyle = recPulse ? "#ef3b3b" : "rgba(239, 59, 59, 0.35)";
  ctx.beginPath();
  ctx.arc(VIEW_W - (compact ? 90 : 122), 24, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(220, 228, 232, 0.85)";
  ctx.textAlign = "right";
  ctx.fillText(`REC ${formatTime(state.elapsed)}`, VIEW_W - 16, 24);
  ctx.fillStyle = state.irHigh ? "rgba(116, 238, 130, 0.85)" : "rgba(180, 190, 196, 0.65)";
  ctx.fillText(`IR [${state.irHigh ? "HI" : "LO"}]`, VIEW_W - 16, 42);

  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(210, 218, 224, 0.82)";
  const goalStr =
    state.mode === "shift"
      ? `${state.kills}/${state.world.targetKills}`
      : `KILLS ${state.kills}`;
  const leftLabel = compact
    ? `${String(headingDeg).padStart(3, "0")}° • ${goalStr}`
    : `${zoneName}  •  HDG ${String(headingDeg).padStart(3, "0")}°  •  TARGETS ${goalStr}`;
  ctx.fillText(leftLabel, 16, VIEW_H - 42);

  ctx.fillStyle = "rgba(165, 174, 180, 0.72)";
  ctx.fillText(".22", 16, VIEW_H - 22);
  const pipStart = compact ? 44 : 52;
  for (let i = 0; i < state.magSize; i++) {
    ctx.fillStyle = i < state.ammo ? "#5ee26e" : "rgba(255, 255, 255, 0.16)";
    ctx.fillRect(pipStart + i * 10, VIEW_H - 28, 6, 11);
  }

  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(220, 228, 232, 0.88)";
  ctx.fillText(`LRF ${distM}m  ${ZOOM_LABELS[state.zoomIdx]}`, VIEW_W - 16, VIEW_H - 22);

  if (state.holdingBreath || state.breathStamina < 0.99) {
    const barW = compact ? 76 : 110;
    const bx = VIEW_W - 16 - barW;
    const by = VIEW_H - 44;
    ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
    ctx.fillRect(bx, by, barW, 5);
    ctx.fillStyle = state.breathExhausted ? "#ef5350" : "#5ee26e";
    ctx.fillRect(bx, by, barW * state.breathStamina, 5);
  }

  ctx.restore();
}

// Desktop Pointer Lock + Mouse handlers
document.addEventListener("pointerlockchange", () => {
  state.pointerLocked = document.pointerLockElement === canvas;
  if (state.pointerLocked) {
    if (!state.reloading && state.ammo > 0) showStatus("");
  } else if (state.running && !isTouchDevice) {
    showStatus("CLICK SCOPE TO LOCK 360° AIM  •  [ESC] MENU");
  }
});

document.addEventListener("mousemove", (e) => {
  if (state.pointerLocked && state.running && state.world) {
    const sens = state.sensitivity / state.currentZoom;
    state.targetCamX += e.movementX * sens;
    state.targetCamY += e.movementY * sens;
    clampTargetCamY();
    return;
  }
  const rect = canvas.getBoundingClientRect();
  state.mouseNormX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  state.mouseNormY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
});

canvas.addEventListener("mousedown", (e) => {
  if (!state.running || isTouchDevice) return;
  sound.init();
  if (!state.pointerLocked) {
    lockPointer();
    if (e.button === 0) return;
  }
  if (e.button === 0) {
    fireShot();
  } else if (e.button === 2) {
    state.zoomIdx = (state.zoomIdx + 1) % BASE_ZOOM_LEVELS.length;
    sound.playZoomClick();
  }
});

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

canvas.addEventListener(
  "wheel",
  (e) => {
    if (!state.running) return;
    e.preventDefault();
    if (e.deltaY < 0 && state.zoomIdx < BASE_ZOOM_LEVELS.length - 1) {
      state.zoomIdx += 1;
      sound.playZoomClick();
    } else if (e.deltaY > 0 && state.zoomIdx > 0) {
      state.zoomIdx -= 1;
      sound.playZoomClick();
    }
  },
  { passive: false }
);

// Mobile Multi-Touch 360° Aiming on Canvas (independent of touch buttons!)
let activeAimTouchId: number | null = null;
let lastTouchX = 0;
let lastTouchY = 0;

canvas.addEventListener(
  "touchstart",
  (e) => {
    if (!state.running) return;
    e.preventDefault();
    sound.init();
    if (activeAimTouchId === null && e.changedTouches.length > 0) {
      const t = e.changedTouches[0];
      activeAimTouchId = t.identifier;
      lastTouchX = t.clientX;
      lastTouchY = t.clientY;
      state.touchAiming = true;
    }
  },
  { passive: false }
);

canvas.addEventListener(
  "touchmove",
  (e) => {
    if (!state.running || activeAimTouchId === null) return;
    e.preventDefault();
    for (const t of [...e.changedTouches]) {
      if (t.identifier === activeAimTouchId) {
        const dx = t.clientX - lastTouchX;
        const dy = t.clientY - lastTouchY;
        lastTouchX = t.clientX;
        lastTouchY = t.clientY;
        const sens = 1.65 / state.currentZoom;
        state.targetCamX += dx * sens;
        state.targetCamY += dy * sens;
        clampTargetCamY();
      }
    }
  },
  { passive: false }
);

function endAimTouch(e: TouchEvent) {
  for (const t of [...e.changedTouches]) {
    if (t.identifier === activeAimTouchId) {
      activeAimTouchId = null;
      state.touchAiming = false;
    }
  }
}
canvas.addEventListener("touchend", endAimTouch);
canvas.addEventListener("touchcancel", endAimTouch);

// Mobile Touch Buttons (multi-touch safe)
tFire.addEventListener(
  "touchstart",
  (e) => {
    e.preventDefault();
    e.stopPropagation();
    sound.init();
    fireShot();
  },
  { passive: false }
);

tZoom.addEventListener(
  "touchstart",
  (e) => {
    e.preventDefault();
    e.stopPropagation();
    sound.init();
    state.zoomIdx = (state.zoomIdx + 1) % BASE_ZOOM_LEVELS.length;
    tZoom.textContent = `ZOOM ${ZOOM_LABELS[state.zoomIdx]}`;
    sound.playZoomClick();
  },
  { passive: false }
);

tBreath.addEventListener(
  "touchstart",
  (e) => {
    e.preventDefault();
    e.stopPropagation();
    state.holdingBreath = true;
    tBreath.classList.add("active");
  },
  { passive: false }
);

const releaseBreath = (e: Event) => {
  e.preventDefault();
  state.holdingBreath = false;
  tBreath.classList.remove("active");
};
tBreath.addEventListener("touchend", releaseBreath, { passive: false });
tBreath.addEventListener("touchcancel", releaseBreath, { passive: false });

tReload.addEventListener(
  "touchstart",
  (e) => {
    e.preventDefault();
    e.stopPropagation();
    sound.init();
    startReload();
  },
  { passive: false }
);

tIr.addEventListener(
  "touchstart",
  (e) => {
    e.preventDefault();
    e.stopPropagation();
    sound.init();
    state.irHigh = !state.irHigh;
    tIr.textContent = state.irHigh ? "IR HI" : "IR LO";
    sound.playZoomClick();
  },
  { passive: false }
);

// Keyboard handlers
window.addEventListener("keydown", (e) => {
  if (e.code === "ShiftLeft" || e.code === "ShiftRight" || e.code === "Space") {
    state.holdingBreath = true;
    if (e.code === "Space" && state.running) e.preventDefault();
  }
  if (!state.running) return;

  if (e.code === "KeyR") startReload();
  if (e.code === "KeyF") {
    state.irHigh = !state.irHigh;
    sound.playZoomClick();
  }
  if (e.code === "KeyH") state.showHud = !state.showHud;
  if (e.code === "Digit1") slewToZone(0);
  if (e.code === "Digit2") slewToZone(1);
  if (e.code === "Digit3") slewToZone(2);
  if (e.code === "Escape" && !state.pointerLocked) {
    state.running = false;
    updateTouchVisibility();
    startOverlay.classList.remove("hidden");
    showStatus("");
  }
});

window.addEventListener("keyup", (e) => {
  if (e.code === "ShiftLeft" || e.code === "ShiftRight" || e.code === "Space") {
    state.holdingBreath = false;
  }
});

// Menu buttons
sectorButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    sectorButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.selectedZone = Number(btn.dataset.sector);
    slewToZone(state.selectedZone);
  });
});

startBtn.addEventListener("click", () => {
  sound.init();
  const checkedMode = document.querySelector<HTMLInputElement>('input[name="mode"]:checked');
  state.mode = checkedMode ? checkedMode.value : "shift";
  initWorld(state.selectedZone);
  startOverlay.classList.add("hidden");
  debriefOverlay.classList.add("hidden");
  showStatus("");
  state.running = true;
  updateTouchVisibility();
  lockPointer();
});

nextSectorBtn.addEventListener("click", () => {
  sound.init();
  initWorld(state.selectedZone);
  debriefOverlay.classList.add("hidden");
  state.running = true;
  updateTouchVisibility();
  lockPointer();
});

replayBtn.addEventListener("click", () => {
  sound.init();
  initWorld(state.selectedZone);
  debriefOverlay.classList.add("hidden");
  state.running = true;
  updateTouchVisibility();
  lockPointer();
});

menuBtn.addEventListener("click", () => {
  unlockPointer();
  debriefOverlay.classList.add("hidden");
  startOverlay.classList.remove("hidden");
  updateTouchVisibility();
});

// Initialize viewport & preview background
resizeCanvas();
window.addEventListener("resize", resizeCanvas);
initWorld(0);

let lastTime = performance.now();
function loop(now: number) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  update(dt, now);
  render(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
