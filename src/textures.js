// Seamless 360-degree panoramic monochrome 850nm IR farmyard generator.
// World width = 3840px wraps seamlessly at 0 <-> 3840, uniting all three video zones:
//   - 0..1280   (North): Concrete Barn Wall, burrows, cinder blocks, dirt mounds, plastic jug
//   - 1280..2560 (East/South): Cracked Concrete Slab Ledge, Pillar & Dark Corrugated Doorway
//   - 2560..3840 (West): Timber Feed Rack, Wire Grate, PVC feed pipe & Foreground Weeds

function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function addSurfaceNoise(ctx, w, h, rand, intensity = 14, step = 3) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const n = (rand() - 0.5) * intensity * 2;
      for (let dy = 0; dy < step && y + dy < h; dy++) {
        for (let dx = 0; dx < step && x + dx < w; dx++) {
          const i = ((y + dy) * w + (x + dx)) * 4;
          const v = Math.max(0, Math.min(255, d[i] + n));
          d[i] = v;
          d[i + 1] = v;
          d[i + 2] = v;
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

function addSurfaceNoiseAlphaSafe(ctx, w, h, rand, intensity = 15, step = 3) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const n = (rand() - 0.5) * intensity * 2;
      for (let dy = 0; dy < step && y + dy < h; dy++) {
        for (let dx = 0; dx < step && x + dx < w; dx++) {
          const i = ((y + dy) * w + (x + dx)) * 4;
          if (d[i + 3] < 10) continue;
          const v = Math.max(0, Math.min(255, d[i] + n));
          d[i] = v;
          d[i + 1] = v;
          d[i + 2] = v;
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

function drawScatteredStones(ctx, rand, x0, y0, w, h, count, minR = 2, maxR = 9) {
  for (let i = 0; i < count; i++) {
    const x = x0 + rand() * w;
    const y = y0 + rand() * h;
    const rx = minR + rand() * (maxR - minR);
    const ry = rx * (0.45 + rand() * 0.4);
    const shade = 78 + Math.floor(rand() * 98);

    ctx.fillStyle = "rgba(10,12,14,0.5)";
    ctx.beginPath();
    ctx.ellipse(x + rx * 0.25, y + ry * 0.45, rx * 1.05, ry * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, (rand() - 0.5) * 0.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgba(225,230,235,${0.12 + rand() * 0.16})`;
    ctx.beginPath();
    ctx.ellipse(x - rx * 0.18, y - ry * 0.22, rx * 0.55, ry * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawDirtRidgesSeamless(ctx, rand, w, yStart, yEnd, count) {
  // Use periodic harmonics so the soil mounds match identically at x = 0 and x = w
  for (let i = 0; i < count; i++) {
    const baseY = yStart + (i / count) * (yEnd - yStart) + (rand() - 0.5) * 14;
    const phase1 = rand() * Math.PI * 2;
    const phase2 = rand() * Math.PI * 2;
    const amp1 = 6 + rand() * 10;
    const amp2 = 3 + rand() * 6;
    const freq1 = 2 + Math.floor(rand() * 4);
    const freq2 = 5 + Math.floor(rand() * 5);

    const pts = [];
    for (let x = 0; x <= w; x += 32) {
      const a = (x / w) * Math.PI * 2;
      const py = baseY + Math.sin(a * freq1 + phase1) * amp1 + Math.sin(a * freq2 + phase2) * amp2;
      pts.push([x, py]);
    }

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, pts[0][1] - 11);
    for (const [px, py] of pts) ctx.lineTo(px, py - 10);
    for (let j = pts.length - 1; j >= 0; j--) ctx.lineTo(pts[j][0], pts[j][1] + 15);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, baseY - 18, 0, baseY + 22);
    g.addColorStop(0, "rgba(190, 195, 200, 0.13)");
    g.addColorStop(0.45, "rgba(18, 20, 22, 0.32)");
    g.addColorStop(1, "rgba(18, 20, 22, 0)");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
  }
}

function drawCinderBlock(ctx, x, y, w, h, angle = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  ctx.fillStyle = "rgba(8, 9, 10, 0.84)";
  ctx.beginPath();
  ctx.ellipse(w * 0.1, h * 0.46, w * 0.62, h * 0.26, 0, 0, Math.PI * 2);
  ctx.fill();

  const topGrad = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  topGrad.addColorStop(0, "#8d9296");
  topGrad.addColorStop(1, "#62676b");
  ctx.fillStyle = topGrad;
  ctx.beginPath();
  ctx.moveTo(-w * 0.48, -h * 0.45);
  ctx.lineTo(w * 0.42, -h * 0.36);
  ctx.lineTo(w * 0.5, 0);
  ctx.lineTo(-w * 0.42, -h * 0.08);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#53585c";
  ctx.beginPath();
  ctx.moveTo(-w * 0.42, -h * 0.08);
  ctx.lineTo(w * 0.5, 0);
  ctx.lineTo(w * 0.46, h * 0.42);
  ctx.lineTo(-w * 0.46, h * 0.34);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#262a2d";
  ctx.fillRect(-w * 0.28, -h * 0.31, w * 0.2, h * 0.14);
  ctx.fillRect(w * 0.04, -h * 0.27, w * 0.2, h * 0.14);

  ctx.strokeStyle = "rgba(215, 220, 224, 0.28)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-w * 0.42, -h * 0.08);
  ctx.lineTo(w * 0.5, 0);
  ctx.stroke();

  ctx.restore();
}

function drawWeeds(ctx, rand, x0, spanW, yBase, count, heightMin = 45, heightMax = 140) {
  for (let i = 0; i < count; i++) {
    const bx = x0 + rand() * spanW;
    const blades = 4 + Math.floor(rand() * 6);
    for (let b = 0; b < blades; b++) {
      const h = heightMin + rand() * (heightMax - heightMin);
      const lean = (rand() - 0.5) * 44;
      const shade = 48 + Math.floor(rand() * 75);
      ctx.strokeStyle = `rgb(${shade},${shade},${shade})`;
      ctx.lineWidth = 1.4 + rand() * 2.2;
      ctx.beginPath();
      ctx.moveTo(bx + (rand() - 0.5) * 14, yBase + 16);
      ctx.quadraticCurveTo(bx + lean * 0.4, yBase - h * 0.55, bx + lean, yBase - h);
      ctx.stroke();

      if (rand() < 0.4) {
        ctx.fillStyle = `rgb(${shade + 24},${shade + 24},${shade + 24})`;
        ctx.beginPath();
        ctx.ellipse(bx + lean * 0.85, yBase - h * 0.82, 4, 2, lean * 0.02, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function drawGrainPile(ctx, rand, cx, cy, rx, ry) {
  for (let i = 0; i < 68; i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand());
    const gx = cx + Math.cos(a) * rx * r;
    const gy = cy + Math.sin(a) * ry * r;
    const shade = 155 + Math.floor(rand() * 65);
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.fillRect(gx, gy, 2.5, 1.5);
  }
}

function drawConcreteWall(ctx, rand, w, wallTop, wallBottom) {
  const grad = ctx.createLinearGradient(0, wallTop, 0, wallBottom);
  grad.addColorStop(0, "#7c8185");
  grad.addColorStop(0.65, "#9ea3a7");
  grad.addColorStop(1, "#797e82");
  ctx.fillStyle = grad;
  ctx.fillRect(0, wallTop, w, wallBottom - wallTop);

  // Evenly spaced concrete formwork seams so x=0 and x=w match seamlessly
  for (let x = 0; x < w; x += 320) {
    ctx.fillStyle = "rgba(25, 28, 30, 0.32)";
    ctx.fillRect(x, wallTop, 4, wallBottom - wallTop);
    ctx.fillStyle = "rgba(220, 225, 228, 0.14)";
    ctx.fillRect(x + 4, wallTop, 2, wallBottom - wallTop);
  }

  ctx.fillStyle = "rgba(35, 38, 40, 0.25)";
  ctx.fillRect(0, wallBottom - 54, w, 12);

  for (let c = 0; c < 14; c++) {
    let cx = 60 + rand() * (w - 120);
    let cy = wallTop + 30 + rand() * (wallBottom - wallTop - 100);
    ctx.strokeStyle = "rgba(20, 22, 24, 0.44)";
    ctx.lineWidth = 1.2 + rand() * 1.2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    for (let s = 0; s < 6; s++) {
      cx += (rand() - 0.5) * 26;
      cy += 12 + rand() * 24;
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
  }
}

export const SECTOR_DEFS = [
  { id: 0, name: "Barn Wall & Debris", shortName: "NORTH // BARN WALL", startX: 640 },
  { id: 1, name: "Ledge & Corrugated Door", shortName: "SOUTH // CORRUGATED DOOR", startX: 1920 },
  { id: 2, name: "Timber Feed Rack", shortName: "WEST // TIMBER FEED RACK", startX: 3200 },
];

export function getZoneNameAtX(x, worldWidth = 3840) {
  const wx = ((x % worldWidth) + worldWidth) % worldWidth;
  if (wx < 1280) return SECTOR_DEFS[0].shortName;
  if (wx < 2560) return SECTOR_DEFS[1].shortName;
  return SECTOR_DEFS[2].shortName;
}

export function buildPanoramaWorld() {
  const w = 3840;
  const h = 1120;
  const wallY = 470;
  const rand = seededRandom(8502026);

  const bgCanvas = document.createElement("canvas");
  bgCanvas.width = w;
  bgCanvas.height = h;
  const bg = bgCanvas.getContext("2d");

  const fgCanvas = document.createElement("canvas");
  fgCanvas.width = w;
  fgCanvas.height = h;
  const fg = fgCanvas.getContext("2d");

  // 1. Continuous 360° concrete perimeter wall & dirt/concrete ground
  drawConcreteWall(bg, rand, w, 0, wallY);

  const floorGrad = bg.createLinearGradient(0, wallY, 0, h);
  floorGrad.addColorStop(0, "#72767a");
  floorGrad.addColorStop(0.48, "#868a8e");
  floorGrad.addColorStop(1, "#575b5f");
  bg.fillStyle = floorGrad;
  bg.fillRect(0, wallY, w, h - wallY);

  // Wall-floor recessed rat highway seam all 360° around
  const seamGrad = bg.createLinearGradient(0, wallY - 12, 0, wallY + 42);
  seamGrad.addColorStop(0, "rgba(18, 20, 22, 0.72)");
  seamGrad.addColorStop(0.5, "rgba(38, 41, 44, 0.34)");
  seamGrad.addColorStop(1, "rgba(105, 108, 112, 0)");
  bg.fillStyle = seamGrad;
  bg.fillRect(0, wallY - 12, w, 54);

  // Seamless periodic soil ripples across the entire 360° yard
  drawDirtRidgesSeamless(bg, rand, w, wallY + 75, h - 85, 11);
  drawScatteredStones(bg, rand, 0, wallY + 10, w, h - wallY - 24, 760, 2, 10);

  // =========================================================================
  // ZONE 1 (0..1280): Concrete Barn Wall, Burrows, Cinder Blocks, Plastic Jug
  // =========================================================================
  for (const bx of [220, 560, 960, 1190]) {
    bg.fillStyle = "rgba(8, 10, 11, 0.88)";
    bg.beginPath();
    bg.ellipse(bx, wallY + 6, 36, 15, 0, 0, Math.PI * 2);
    bg.fill();
  }
  drawGrainPile(bg, rand, 410, 625, 62, 20);
  drawGrainPile(bg, rand, 820, 690, 72, 22);
  drawCinderBlock(fg, 960, 528, 185, 92, 0.13);
  drawCinderBlock(fg, 310, 542, 148, 70, -0.09);

  // =========================================================================
  // ZONE 2 (1280..2560): Cracked Concrete Slab, Pillar & Corrugated Doorway
  // =========================================================================
  // Recessed dark interior room (1980..2360)
  bg.fillStyle = "#151719";
  bg.fillRect(1980, 0, 380, wallY + 42);
  bg.fillStyle = "#3a3e42";
  bg.fillRect(2005, 290, 320, 190);
  drawScatteredStones(bg, rand, 2015, 300, 300, 170, 110, 2, 7);

  // Vertical concrete pillar left of doorway
  const pilGrad = bg.createLinearGradient(1810, 0, 1995, 0);
  pilGrad.addColorStop(0, "#83888c");
  pilGrad.addColorStop(0.55, "#a7acb0");
  pilGrad.addColorStop(1, "#62676b");
  bg.fillStyle = pilGrad;
  bg.fillRect(1810, 0, 185, wallY + 18);

  // Corrugated steel sliding door on right of doorway (2260..2540)
  for (let x = 2260; x < 2540; x += 48) {
    const cGrad = bg.createLinearGradient(x, 0, x + 48, 0);
    cGrad.addColorStop(0, "#6d7276");
    cGrad.addColorStop(0.45, "#b7bcc0");
    cGrad.addColorStop(0.85, "#595e62");
    cGrad.addColorStop(1, "#44484c");
    bg.fillStyle = cGrad;
    bg.fillRect(x, 0, 48, wallY - 10);
  }

  // Cracked concrete slab ledge on FG so rats run along the seam behind it
  fg.fillStyle = "#7a7f83";
  fg.beginPath();
  fg.moveTo(1310, 610);
  fg.lineTo(1920, 565);
  fg.lineTo(1985, 650);
  fg.lineTo(1290, 740);
  fg.closePath();
  fg.fill();

  fg.strokeStyle = "#16181a";
  fg.lineWidth = 4;
  fg.beginPath();
  fg.moveTo(1310, 610);
  fg.lineTo(1920, 565);
  fg.stroke();

  fg.fillStyle = "#4d5155";
  fg.beginPath();
  fg.moveTo(1290, 740);
  fg.lineTo(1985, 650);
  fg.lineTo(1985, 692);
  fg.lineTo(1290, 790);
  fg.closePath();
  fg.fill();

  drawGrainPile(bg, rand, 1640, 585, 56, 16);
  drawGrainPile(bg, rand, 2140, 575, 64, 18);

  // =========================================================================
  // ZONE 3 (2560..3840): Timber Feed Rack, Wire Grate, PVC Pipe & Weeds
  // =========================================================================
  bg.strokeStyle = "rgba(35, 38, 42, 0.42)";
  bg.lineWidth = 1.5;
  for (let x = 2590; x < 3790; x += 28) {
    bg.beginPath();
    bg.moveTo(x, 760);
    bg.lineTo(x + 84, 920);
    bg.stroke();
    bg.beginPath();
    bg.moveTo(x + 84, 760);
    bg.lineTo(x, 920);
    bg.stroke();
  }

  // White PVC feed pipe
  bg.fillStyle = "#c8cdd1";
  bg.fillRect(3590, 0, 58, 425);
  bg.fillStyle = "rgba(0,0,0,0.28)";
  bg.fillRect(3636, 0, 12, 425);

  const drawBeam = (x, y, bw, bh) => {
    const g = fg.createLinearGradient(x, y, x + bw, y);
    g.addColorStop(0, "#3b3f42");
    g.addColorStop(0.45, "#676c70");
    g.addColorStop(1, "#2a2d30");
    fg.fillStyle = g;
    fg.fillRect(x, y, bw, bh);
  };
  drawBeam(2740, 160, 42, 585);
  drawBeam(3180, 160, 42, 585);
  drawBeam(3620, 160, 42, 585);
  drawBeam(2640, 340, 1080, 32);
  drawBeam(2640, 505, 1080, 26);

  fg.strokeStyle = "#52575b";
  fg.lineWidth = 22;
  fg.beginPath();
  fg.moveTo(2761, 355);
  fg.lineTo(2910, 210);
  fg.moveTo(3201, 355);
  fg.lineTo(3050, 210);
  fg.moveTo(3641, 355);
  fg.lineTo(3490, 210);
  fg.stroke();

  drawGrainPile(bg, rand, 2940, 622, 72, 22);
  drawGrainPile(bg, rand, 3390, 615, 76, 22);

  // Foreground weeds across Zone 3 + sparse tufts along Zone 1
  drawWeeds(fg, rand, 2560, 1260, h, 80, 65, 175);
  drawWeeds(fg, rand, 40, 1200, h, 26, 38, 86);

  // Add matching IR surface grain to both layers
  addSurfaceNoise(bg, w, h, rand, 13, 3);
  addSurfaceNoiseAlphaSafe(fg, w, h, rand, 15, 3);

  const props = [
    {
      type: "jug",
      x: 840,
      y: 755,
      w: 170,
      h: 78,
      shake: 0,
      hits: 0,
    },
  ];

  const lanes = [
    {
      name: "wall-seam",
      y: 482,
      distance: 33,
      scale: 0.78,
      burrows: [220, 560, 960, 1190, 1995, 2240, 2820, 3440],
      feedSpots: [410, 760, 1640, 2140, 2940, 3390],
      behindFg: true,
    },
    {
      name: "mid-yard",
      y: 630,
      distance: 24,
      scale: 1.0,
      burrows: [310, 960, 1340, 2060, 2750, 3600],
      feedSpots: [450, 820, 1680, 2160, 2940, 3390],
      behindFg: true,
    },
    {
      name: "fore-ridge",
      y: 815,
      distance: 17,
      scale: 1.24,
      burrows: [120, 1150, 1850, 2520, 3150, 3760],
      feedSpots: [520, 960, 1580, 2320, 2980, 3480],
      behindFg: false,
    },
  ];

  return {
    name: "360° Farmyard",
    targetKills: 15,
    worldWidth: w,
    worldHeight: h,
    wallY,
    bgCanvas,
    fgCanvas,
    lanes,
    props,
  };
}

export function drawInteractiveProps(ctx, sector, dt, xOffset = 0) {
  for (const p of sector.props) {
    if (xOffset === 0 && p.shake > 0) p.shake = Math.max(0, p.shake - dt * 5);
    if (p.type === "jug") {
      ctx.save();
      const jx = p.x + xOffset + Math.sin(p.shake * 38) * p.shake * 7;
      const jy = p.y - Math.abs(Math.sin(p.shake * 22)) * p.shake * 6;
      ctx.translate(jx, jy);
      ctx.rotate(Math.sin(p.shake * 25) * p.shake * 0.08);

      ctx.fillStyle = "rgba(8, 10, 12, 0.62)";
      ctx.beginPath();
      ctx.ellipse(6, p.h * 0.44, p.w * 0.52, p.h * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();

      const grad = ctx.createLinearGradient(0, -p.h / 2, 0, p.h / 2);
      grad.addColorStop(0, "#707478");
      grad.addColorStop(0.35, "#9ea3a7");
      grad.addColorStop(0.75, "#5c6064");
      grad.addColorStop(1, "#3b3e42");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(-p.w / 2 + 18, -p.h / 2, p.w - 18, p.h, 16);
      ctx.fill();

      ctx.fillStyle = "#222528";
      ctx.fillRect(-p.w / 2, -13, 20, 26);

      ctx.fillStyle = "rgba(218, 222, 226, 0.58)";
      ctx.fillRect(-14, -p.h * 0.34, 58, p.h * 0.62);
      ctx.fillStyle = "rgba(50, 54, 58, 0.55)";
      ctx.fillRect(-8, -p.h * 0.2, 42, 6);
      ctx.fillRect(-8, -p.h * 0.05, 32, 4);
      ctx.fillRect(-8, p.h * 0.08, 38, 4);

      ctx.restore();
    }
  }
}
