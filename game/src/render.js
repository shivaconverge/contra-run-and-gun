// Renderer. Draws the sim at logical VIEW_W x VIEW_H with procedural
// placeholders (swapped for real sprites automatically when they load).
// Nostalgic arcade look: parallax jungle, chunky pixels, muzzle flashes.
import { SIM, WEAPONS } from '../data/config.js';
import { TELEGRAPH_FRAMES } from './enemy.js';
import { HERO_GUN } from './player.js';

const SKY_TOP = '#1a2f4a';
const SKY_BOT = '#3a6b6e';
const TAU = Math.PI * 2;
// Fallback backdrop palette (== the JUNGLE biome). Used when a world has no
// resolved theme (defensive) so the backdrop is never blank; live stages pass
// their own world.theme.back so each biome reads distinct. See config THEMES.
const DEFAULT_BACK = {
  sky: ['#0f2036', '#1a2f4a', '#3a5f6b'], haze: 'rgba(120,160,170,0.10)',
  ridgeFar: '#23405a', ridgeNear: '#1c3446', canopy: '#173026', foliage: '#0e2119',
};
const themeBack = (theme) => (theme && theme.back) || DEFAULT_BACK;
// True when the on-screen touch overlay is active (touch.js flags the body), so
// prompts can say "TAP" instead of naming keyboard keys a phone player lacks.
// Headless capture has no such class → keeps the keyboard wording (desktop).
const isTouchUI = () => typeof document !== 'undefined' && !!document.body && document.body.classList.contains('touch-active');
// Contra somersault: the jump's rise (~17-frame fixed arc) plays as a forward
// tuck-spin — one full rotation over these frames — then settles to the aimed
// leap frame on the way down so the player can still read aim while descending.
const SOMERSAULT_FRAMES = 16;
// Landing squash duration — MUST mirror player.js LAND_SQUASH_FRAMES (render-side
// copy, like SOMERSAULT_FRAMES). Drives the touchdown squash ease-out.
const LAND_SQUASH_FRAMES = 7;

// FX strip metadata — mirrors assets/manifest.json sprites.{explosion,muzzle}.
// Each strip is a horizontal row of `frames` cells, cell size fw x fh. The sim
// runs at 60Hz and the strips are authored at 18fps, so ~3 sim steps per frame.
const FX = {
  explosion: { fw: 28, fh: 40, frames: 4, stepsPerFrame: 3, scale: 1.45 },
  muzzle: { fw: 22, fh: 25, frames: 2 },
};

// Player run cycle — 4-beat horizontal strip (22x31 native frames), mirrors
// assets/manifest.json sprites.player.animations.run. Blitted by drawPlayer via
// drawPlayerSprite when the player is grounded and moving; frame is selected off
// p.walkPhase so the stride cadence tracks run speed.
const PLAYER_RUN = { fw: 22, fh: 31, frames: 4 };

// Ground tileset rects — mirrors assets/manifest.json sprites.tiles. A 48x16
// sheet of three 16px tiles: `cap` (grass surface, top row) + two dirt fills
// (`dirt`/`dirt2`) checkerboarded below so the body doesn't read as one flat
// block. Consumed by drawGround/drawPlatform via assets.get('tiles').
const TILES = { size: 16, cap: { x: 0, y: 0 }, dirt: { x: 16, y: 0 }, dirt2: { x: 32, y: 0 } };
let bossPulse = 0; // cosmetic counter for the boss enrage heat-glow

export function render(ctx, world, assets) {
  const cam = world.camera;
  const shake = world.feel.shakeOffset();

  ctx.save();
  ctx.clearRect(0, 0, SIM.VIEW_W, SIM.VIEW_H);
  drawSky(ctx, world.frame, world.theme);
  drawParallax(ctx, cam.x, world.theme, assets);
  drawAmbient(ctx, cam.x, world.frame); // fireflies behind the action (depth/atmosphere)

  ctx.translate(-Math.round(cam.x) + shake.x, -Math.round(cam.y) + shake.y);

  drawWater(ctx, world, assets);   // behind the bridge deck (CR-1: bridge-over-water theme)
  drawSolids(ctx, world, assets);
  for (const e of world.enemies) drawEnemy(ctx, e, world, assets);
  for (const pk of world.pickups) drawPickup(ctx, pk, world.frame, assets);
  drawGoal(ctx, world);
  for (const pt of world.particles) drawParticle(ctx, pt);
  for (const fx of world.fx) drawFx(ctx, fx, assets);
  for (const b of world.bullets) drawBullet(ctx, b);
  if (!(world.player.dead) || world.respawnTimer > 0) drawPlayer(ctx, world.player, assets);

  ctx.restore();

  drawVignette(ctx); // subtle edge falloff for depth/mood (under the HUD)
  drawHud(ctx, world);
  drawBossUI(ctx, world);
  drawOverlays(ctx, world);
}

// Soft radial edge darkening — adds depth/mood without touching the bright centre
// where the action reads. Kept subtle so the hero silhouette stays crisp.
function drawVignette(ctx) {
  const g = ctx.createRadialGradient(
    SIM.VIEW_W / 2, SIM.VIEW_H / 2, SIM.VIEW_H * 0.36,
    SIM.VIEW_W / 2, SIM.VIEW_H / 2, SIM.VIEW_W * 0.62);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.26)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SIM.VIEW_W, SIM.VIEW_H);
}

// Drifting warm night-fireflies, parallax-tied to the camera and pulsing on the
// sim frame (deterministic — no RNG, so replay/headless stay identical). Drawn
// behind the world actors, so they never occlude the hero.
function drawAmbient(ctx, camx, frame) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const W = SIM.VIEW_W + 40;
  for (let i = 0; i < 16; i++) {
    const seedx = hash1(i * 5.3) * 1600;
    const px = ((seedx - camx * 0.6) % W + W) % W - 20;
    const py = 118 + hash1(i * 7.1) * 108 + Math.sin(frame * 0.02 + i * 1.7) * 8;
    const glow = Math.max(0, 0.22 + 0.24 * Math.sin(frame * 0.08 + i * 2.3));
    ctx.fillStyle = '#ffe6a0';
    ctx.globalAlpha = glow;
    ctx.beginPath(); ctx.arc(px, py, 1.5, 0, TAU); ctx.fill();
    ctx.globalAlpha = glow * 0.4;
    ctx.beginPath(); ctx.arc(px, py, 3.2, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

// Deterministic hash (0..1) of an integer — used for stable, non-flickering
// procedural detail (tufts, roots) keyed to WORLD position, never Math.random.
function hash1(n) {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

function drawSky(ctx, frame, theme) {
  // Backdrop gradient is DATA-DRIVEN off the stage's biome (world.theme.back.sky).
  // Jungle's stops reproduce the pre-wiring hardcoded values byte-for-byte, so
  // Stage 1 is unchanged; every other biome supplies its own sky.
  const back = themeBack(theme);
  const sky = back.sky;
  const g = ctx.createLinearGradient(0, 0, 0, SIM.VIEW_H);
  g.addColorStop(0, sky[0]);
  g.addColorStop(0.55, sky[1]);
  g.addColorStop(1, sky[2]); // hazy horizon
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SIM.VIEW_W, SIM.VIEW_H);

  // faint twinkling star field (upper sky only, above the ridgeline)
  ctx.save();
  for (let i = 0; i < 42; i++) {
    const sx = (hash1(i * 2.17) * SIM.VIEW_W) | 0;
    const sy = (hash1(i * 3.71) * 118) | 0;
    const tw = 0.35 + 0.5 * (0.5 + 0.5 * Math.sin(frame * 0.05 + i));
    ctx.globalAlpha = tw * 0.55;
    ctx.fillStyle = i % 5 === 0 ? '#cfe6ff' : '#93a9c8';
    ctx.fillRect(sx, sy, 1, 1);
  }
  ctx.restore();

  // soft moon (fixed in the sky — a focal celestial like the arcade backdrops)
  const mx = 372, my = 58;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const glow = ctx.createRadialGradient(mx, my, 2, mx, my, 34);
  glow.addColorStop(0, 'rgba(200,224,255,0.45)');
  glow.addColorStop(1, 'rgba(200,224,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(mx - 34, my - 34, 68, 68);
  ctx.restore();
  ctx.fillStyle = '#cdddf0';
  ctx.beginPath();
  ctx.arc(mx, my, 12, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#b7c9df';
  ctx.beginPath();
  ctx.arc(mx + 4, my - 3, 2.4, 0, TAU); ctx.fill();
  ctx.beginPath();
  ctx.arc(mx - 3, my + 4, 1.8, 0, TAU); ctx.fill();
}

// Far-parallax background scenery — 128×56 authored silhouette strip per biome,
// tiled behind the ridges at the far rate. Base sits at ~y=158 (the far-ridge
// horizon); a small overlap tucks the bottom edge under the near ridge. Mirrors
// manifest sprites.bg_<theme> (parallax 0.15, anchor horizon).
const BG = { w: 128, h: 56, base: 158, parallax: 0.15 };

// Multi-layer parallax jungle: distant ridges → treeline canopy → foreground
// ferns, each scrolling at its own rate for depth. The far ridge is either the
// authored per-biome background strip (assets.get('bg_'+theme.id)) or, when that
// isn't loaded/authored (jungle, or any missing strip), the procedural ridge —
// byte-identical to the pre-wiring look.
function drawParallax(ctx, camx, theme, assets) {
  // Layer COLORS come from the biome (world.theme.back); the silhouette SHAPES/
  // parallax rates are shared across stages. Jungle's palette is the pre-wiring
  // hardcoded set, so Stage 1 is byte-identical.
  const back = themeBack(theme);
  ctx.save();
  // distance haze band above the horizon
  ctx.fillStyle = back.haze;
  ctx.fillRect(0, 150, SIM.VIEW_W, 90);
  // far ridge (slow) — authored biome background strip when present, else procedural.
  const bg = theme && assets && assets.get('bg_' + theme.id);
  if (bg) {
    // Tile the strip horizontally at the far parallax rate over the sky gradient.
    // Transparent above the silhouette, so the sky reads through; base ~y=158 with
    // a 4px overlap under the near ridge. Deterministic (camx only) — no rng.
    const topY = BG.base - BG.h + 4;
    const off = ((camx * BG.parallax) % BG.w + BG.w) % BG.w;
    for (let x = -off; x < SIM.VIEW_W + BG.w; x += BG.w) {
      ctx.drawImage(bg, Math.round(x), topY, BG.w, BG.h);
    }
  } else {
    ctx.fillStyle = back.ridgeFar;
    drawHills(ctx, camx * 0.15, 158, 46, 260);
  }
  // near ridge
  ctx.fillStyle = back.ridgeNear;
  drawHills(ctx, camx * 0.3, 182, 40, 190);
  // treeline canopy (bumpy, denser)
  drawBumpBand(ctx, camx * 0.5, 206, back.canopy, 0.05, 0.13, 12, 6);
  // foreground foliage line just behind the ground front
  drawBumpBand(ctx, camx * 0.78, 232, back.foliage, 0.09, 0.21, 10, 5);
  ctx.restore();
}

function drawHills(ctx, off, base, amp, span) {
  ctx.beginPath();
  ctx.moveTo(0, SIM.VIEW_H);
  for (let x = -span; x <= SIM.VIEW_W + span; x += 2) {
    const wx = x + (off % span);
    const y = base - Math.abs(Math.sin((wx + off) * 0.012)) * amp;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(SIM.VIEW_W, SIM.VIEW_H);
  ctx.closePath();
  ctx.fill();
}

// Lumpy silhouette band (two summed sines) for foliage/canopy tops.
function drawBumpBand(ctx, off, baseY, color, coarse, fine, ampC, ampF) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-4, SIM.VIEW_H);
  for (let x = -4; x <= SIM.VIEW_W + 4; x += 3) {
    const wx = x + off;
    const y = baseY - Math.abs(Math.sin(wx * coarse)) * ampC - Math.abs(Math.sin(wx * fine + 1.7)) * ampF;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(SIM.VIEW_W + 4, SIM.VIEW_H);
  ctx.closePath();
  ctx.fill();
}

// Water channels under the bridge (CR-1 "bridge and water" motif). Drawn in world
// space, BEHIND the solids, so the plank deck (drawBridge) sits over a shimmering
// teal channel. Animation is deterministic (world.frame + world-x hash1), never
// rng — the sim/replay stream stays byte-identical whether or not water renders.
function drawWater(ctx, world, assets) {
  const chans = world.level && world.level.water;
  if (!chans || !chans.length) return;
  const camx = world.camera.x;
  const vx0 = camx - 8, vx1 = camx + SIM.VIEW_W + 8;
  const f = world.frame;
  // Authored NIGHT water tiles (art loop, CR-1). When loaded, tile the surface-foam
  // row + the deep body; else fall back to the procedural gradient below. A light
  // deterministic glint is kept over the top either way so the surface reads alive.
  const wTop = assets && assets.get('theme_water_top');
  const wBody = assets && assets.get('theme_water');
  const TS = TILES.size; // 16
  ctx.save();
  for (const wr of chans) {
    const x0 = Math.max(wr.x, vx0), x1 = Math.min(wr.x + wr.w, vx1);
    if (x1 <= x0) continue;
    if (wTop && wBody) {
      // clip to the channel so partial edge tiles cut cleanly
      ctx.save();
      ctx.beginPath(); ctx.rect(wr.x, wr.y, wr.w, wr.h); ctx.clip();
      const startX = Math.floor(x0 / TS) * TS;
      for (let x = startX; x < x1; x += TS) {
        ctx.drawImage(wTop, x, wr.y, TS, TS);            // foam surface row
        for (let y = wr.y + TS; y < wr.y + wr.h; y += TS) ctx.drawImage(wBody, x, y, TS, TS);
      }
      ctx.restore();
    } else {
      // deep base gradient (dark at depth → teal near the surface)
      const g = ctx.createLinearGradient(0, wr.y, 0, wr.y + wr.h);
      g.addColorStop(0, '#1c5c6e');
      g.addColorStop(1, '#0a2b38');
      ctx.fillStyle = g;
      ctx.fillRect(wr.x, wr.y, wr.w, wr.h);
      for (let y = wr.y + 2; y < wr.y + wr.h; y += 4) {
        const yy = y;
        for (let x = Math.floor(x0 / 4) * 4; x < x1; x += 4) {
          const ph = Math.sin(x * 0.06 + yy * 0.5 + f * 0.05);
          if (ph > 0.55) {
            ctx.fillStyle = ph > 0.85 ? 'rgba(150,214,224,0.55)' : 'rgba(90,168,182,0.4)';
            ctx.fillRect(x, yy, 3, 1);
          }
        }
      }
      ctx.fillStyle = 'rgba(176,232,240,0.5)';
      ctx.fillRect(wr.x, wr.y, wr.w, 1);
    }
    // sliding specular glint on the surface (both paths) — deterministic, no rng.
    const glintX = wr.x + ((f * 0.6) % (wr.w + 40)) - 20;
    if (glintX > x0 - 20 && glintX < x1) {
      ctx.globalAlpha = 0.35; ctx.fillStyle = 'rgba(210,245,250,1)';
      ctx.fillRect(Math.max(x0, glintX), wr.y + 1, 14, 1);
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}

// Ground + platforms. Blits the real 16px tileset (assets.get('tiles')) when it
// has loaded, falling back to the procedural strata below when art is absent.
// Detail loops are clamped to the visible camera window for efficiency.
function drawSolids(ctx, world, assets) {
  const camx = world.camera.x;
  const vx0 = camx - 8, vx1 = camx + SIM.VIEW_W + 8;
  // Per-stage BIOME tileset: resolve the theme's tileset key first, fall back to the
  // jungle default `tiles` when a biome has no dedicated sheet (jungle) or it hasn't
  // loaded. Same 48×16 [cap,dirt,dirt2] format, so blitTiles/TILES slicing is unchanged.
  const themeKey = world.theme && world.theme.tileset;
  const biomeTiles = themeKey && assets && assets.get(themeKey);
  const tiles = (biomeTiles || (assets && assets.get('tiles'))) || null;
  // Green grass tufts read as jungle set-dressing; only sprout them on the jungle
  // default sheet, not on a distinct biome tileset (snow/desert/foundry/etc.).
  const tufts = !biomeTiles;
  for (const s of world.solids) {
    if (s.kind === 'ground') drawGround(ctx, s, vx0, vx1, tiles, assets, tufts);
    else if (s.kind === 'barrier') drawBarrier(ctx, s, world.frame);
    else drawPlatform(ctx, s, vx0, vx1, tiles);
  }
}

// Boss-arena barrier: a faint pulsing energy pillar (actors stop, shots pass).
function drawBarrier(ctx, s, frame) {
  ctx.save();
  const pulse = 0.25 + 0.15 * Math.sin(frame * 0.15);
  ctx.globalAlpha = pulse;
  ctx.fillStyle = '#7ad0ff';
  ctx.fillRect(s.x, s.y, s.w, s.h);
  ctx.globalAlpha = pulse + 0.25;
  ctx.fillStyle = '#cdeaff';
  ctx.fillRect(s.x + s.w / 2 - 1, s.y, 2, s.h);
  for (let y = s.y; y < s.y + s.h; y += 8) {
    ctx.fillStyle = '#bfeaff';
    ctx.fillRect(s.x, y + ((frame >> 1) % 8), s.w, 1);
  }
  ctx.restore();
}

// Blit the tileset across a solid's visible span: `cap` on the surface row, the
// two dirt fills checkerboarded below. Tiles are aligned to a WORLD 16px grid
// (so neighbouring solids share the grid and don't seam), drawn at native 16px
// for crisp pixels, and clipped to the solid rect so partial edge tiles are cut
// cleanly instead of overhanging.
function blitTiles(ctx, img, s, vx0, vx1) {
  const TS = TILES.size;
  const x0 = Math.max(s.x, vx0), x1 = Math.min(s.x + s.w, vx1);
  ctx.save();
  ctx.beginPath();
  ctx.rect(s.x, s.y, s.w, s.h);
  ctx.clip();
  const startX = Math.floor(x0 / TS) * TS;
  for (let x = startX; x < x1; x += TS) {
    const col = Math.floor(x / TS);
    ctx.drawImage(img, TILES.cap.x, TILES.cap.y, TS, TS, x, s.y, TS, TS);
    let row = 0;
    for (let y = s.y + TS; y < s.y + s.h; y += TS, row++) {
      const f = ((col + row) & 1) ? TILES.dirt2 : TILES.dirt;
      ctx.drawImage(img, f.x, f.y, TS, TS, x, y, TS, TS);
    }
  }
  ctx.restore();
}

function drawGround(ctx, s, vx0, vx1, tiles, assets, tufts) {
  // Bridge span: a plank deck on trusses over the water channel (CR-1). Only the
  // deck + supports are painted (no dirt column) so the water behind shows below.
  if (s.bridge) { drawBridge(ctx, s, vx0, vx1, assets && assets.get('theme_bridge')); return; }

  if (tiles) {
    blitTiles(ctx, tiles, s, vx0, vx1);
    // grass tufts sticking up above the tiled cap — same juice as the fallback,
    // keyed to world position so they don't flicker. Jungle-only (see drawSolids).
    if (tufts) {
      const gx0 = Math.max(s.x, vx0), gx1 = Math.min(s.x + s.w, vx1);
      for (let x = Math.floor(gx0 / 6) * 6; x < gx1; x += 6) {
        const r = hash1(x);
        const th = 1 + Math.floor(r * 3);
        ctx.fillStyle = r > 0.5 ? '#6ba045' : '#588a3a';
        ctx.fillRect(x + (r * 3 | 0), s.y - th, 2, th);
      }
    }
    return;
  }

  // dirt body with horizontal strata for depth
  ctx.fillStyle = '#3a2a1c';
  ctx.fillRect(s.x, s.y, s.w, s.h);
  ctx.fillStyle = '#46331f';
  ctx.fillRect(s.x, s.y + 4, s.w, 6);
  ctx.fillStyle = '#2e2016';
  ctx.fillRect(s.x, s.y + 16, s.w, s.h - 16);

  // grass cap: bright top line + body + shadow underline
  ctx.fillStyle = '#5f9440';
  ctx.fillRect(s.x, s.y, s.w, 4);
  ctx.fillStyle = '#77b356';
  ctx.fillRect(s.x, s.y, s.w, 1);
  ctx.fillStyle = '#2f4a22';
  ctx.fillRect(s.x, s.y + 4, s.w, 1);

  // visible-window detail: varied grass tufts + scattered roots/pebbles
  const x0 = Math.max(s.x, vx0), x1 = Math.min(s.x + s.w, vx1);
  for (let x = Math.floor(x0 / 6) * 6; x < x1; x += 6) {
    const r = hash1(x);
    const th = 1 + Math.floor(r * 3); // tuft height 1..3
    ctx.fillStyle = r > 0.5 ? '#6ba045' : '#588a3a';
    ctx.fillRect(x + (r * 3 | 0), s.y - th, 2, th);
  }
  for (let x = Math.floor(x0 / 14) * 14; x < x1; x += 14) {
    const r = hash1(x * 1.7);
    ctx.fillStyle = r > 0.5 ? '#5a4230' : '#241811';
    ctx.fillRect(x + (r * 8 | 0), s.y + 12 + (r * 14 | 0), 2, 2);
  }
}

// BRIDGE deck over the water channel (CR-1). When the authored metal-grate tile
// (`theme_bridge`, art loop) is loaded it tiles that across the span over cool
// steel piers; else it falls back to the procedural wooden plank deck. Either way
// only the deck + supports are painted (no dirt column) so the water behind shows
// through. The collision rect is the full `kind:'ground'` solid — footing is
// identical to normal ground.
function drawBridge(ctx, s, vx0, vx1, bridgeImg) {
  const x0 = Math.max(s.x, vx0), x1 = Math.min(s.x + s.w, vx1);
  if (bridgeImg) {
    const TS = TILES.size; // 16
    // steel support piers dropping into the water (X-braced) for over-water depth
    ctx.strokeStyle = 'rgba(96,116,136,0.7)';
    ctx.lineWidth = 2;
    for (let x = Math.floor(s.x / 40) * 40; x < s.x + s.w; x += 40) {
      if (x < x0 - 40 || x > x1 + 40) continue;
      const px = x + 20;
      ctx.beginPath(); ctx.moveTo(px, s.y + 10); ctx.lineTo(px, s.y + 34); ctx.stroke();
      ctx.strokeStyle = 'rgba(72,90,108,0.6)';
      ctx.beginPath(); ctx.moveTo(px - 16, s.y + 11); ctx.lineTo(px + 16, s.y + 30); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px + 16, s.y + 11); ctx.lineTo(px - 16, s.y + 30); ctx.stroke();
      ctx.strokeStyle = 'rgba(96,116,136,0.7)';
    }
    // grate deck: tile the authored 16px bridge across the span (walk surface at
    // s.y), clipped so partial edge tiles cut cleanly; ~11px tall so it sits ABOVE
    // the waterline (s.y+8) rather than looking submerged.
    ctx.save();
    ctx.beginPath(); ctx.rect(s.x, s.y - 2, s.w, 12); ctx.clip();
    for (let x = Math.floor(x0 / TS) * TS; x < x1; x += TS) ctx.drawImage(bridgeImg, x, s.y - 2, TS, TS);
    ctx.restore();
    return;
  }
  const deckH = 8;                 // plank deck thickness
  // support trusses: X-braced posts dropping from the deck into the water
  ctx.strokeStyle = '#3a2a1a';
  ctx.lineWidth = 2;
  for (let x = Math.floor(s.x / 40) * 40; x < s.x + s.w; x += 40) {
    if (x < x0 - 40 || x > x1 + 40) continue;
    const px = x + 20;
    ctx.beginPath(); ctx.moveTo(px, s.y + deckH); ctx.lineTo(px, s.y + 34); ctx.stroke();      // vertical pile
    ctx.strokeStyle = 'rgba(58,42,26,0.7)';
    ctx.beginPath(); ctx.moveTo(px - 18, s.y + deckH); ctx.lineTo(px + 18, s.y + 30); ctx.stroke(); // X-brace
    ctx.beginPath(); ctx.moveTo(px + 18, s.y + deckH); ctx.lineTo(px - 18, s.y + 30); ctx.stroke();
    ctx.strokeStyle = '#3a2a1a';
  }
  // deck body: dark underside + warm plank top
  ctx.fillStyle = '#2c1d0f';
  ctx.fillRect(s.x, s.y + deckH - 2, s.w, 2);          // under-beam shadow
  ctx.fillStyle = '#6b4a2a';
  ctx.fillRect(s.x, s.y, s.w, deckH);                  // plank body
  ctx.fillStyle = '#8a6338';
  ctx.fillRect(s.x, s.y, s.w, 2);                      // lit top edge
  // individual plank seams (clamped to view)
  ctx.fillStyle = '#4a3320';
  for (let x = Math.floor(x0 / 12) * 12; x < x1; x += 12) ctx.fillRect(x, s.y, 1, deckH);
  // rope hand-rail posts along the far edge
  ctx.fillStyle = '#4a3320';
  for (let x = Math.floor(x0 / 40) * 40; x < x1; x += 40) ctx.fillRect(x + 20 - 1, s.y - 9, 2, 9);
  ctx.strokeStyle = 'rgba(120,96,58,0.8)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(Math.max(s.x, x0), s.y - 7); ctx.lineTo(Math.min(s.x + s.w, x1), s.y - 7); ctx.stroke();
}

function drawPlatform(ctx, s, vx0, vx1, tiles) {
  if (s.catwalk) { drawCatwalk(ctx, s, vx0, vx1); return; }
  if (tiles) {
    blitTiles(ctx, tiles, s, vx0, vx1);
    // grassy accent on the cap edge to match the jungle floor
    const gx0 = Math.max(s.x, vx0), gx1 = Math.min(s.x + s.w, vx1);
    for (let x = Math.floor(gx0 / 7) * 7; x < gx1; x += 7) {
      if (hash1(x * 2.3) > 0.5) { ctx.fillStyle = '#6ba045'; ctx.fillRect(x, s.y - 2, 2, 2); }
    }
    return;
  }

  // stone/earth ledge body
  ctx.fillStyle = '#5c4630';
  ctx.fillRect(s.x, s.y, s.w, s.h);
  ctx.fillStyle = '#7a5c3c';
  ctx.fillRect(s.x, s.y + 1, s.w, 2);
  // grassy fringe on top to match the jungle floor
  ctx.fillStyle = '#5f9440';
  ctx.fillRect(s.x, s.y - 1, s.w, 2);
  ctx.fillStyle = '#2e2013';
  ctx.fillRect(s.x, s.y + s.h - 1, s.w, 1); // underside shadow

  const x0 = Math.max(s.x, vx0), x1 = Math.min(s.x + s.w, vx1);
  for (let x = Math.floor(x0 / 7) * 7; x < x1; x += 7) {
    if (hash1(x * 2.3) > 0.5) { ctx.fillStyle = '#6ba045'; ctx.fillRect(x, s.y - 2, 2, 2); }
  }
}

// Rope-and-plank CATWALK — the high route over the bridge (CR-1 multi-height).
// A slatted plank walkway on rope rails, reading as an elevated tier distinct
// from the solid ground/ledges below.
function drawCatwalk(ctx, s, vx0, vx1) {
  const x0 = Math.max(s.x, vx0), x1 = Math.min(s.x + s.w, vx1);
  // rope suspension rail arcing above the deck, with drop-lines to the walkway
  ctx.strokeStyle = 'rgba(150,120,72,0.85)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = s.x; x <= s.x + s.w; x += 4) {
    const sag = Math.sin(((x - s.x) / s.w) * Math.PI) * 5;
    const y = s.y - 14 + sag;
    if (x === s.x) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(120,96,58,0.6)';
  for (let x = Math.floor(x0 / 14) * 14; x < x1; x += 14) {
    const sag = Math.sin(((x - s.x) / s.w) * Math.PI) * 5;
    ctx.beginPath(); ctx.moveTo(x, s.y - 14 + sag); ctx.lineTo(x, s.y); ctx.stroke();
  }
  // plank walkway body + lit edge
  ctx.fillStyle = '#5a3f24';
  ctx.fillRect(s.x, s.y, s.w, s.h);
  ctx.fillStyle = '#7a5733';
  ctx.fillRect(s.x, s.y, s.w, 2);
  ctx.fillStyle = '#3a2817';
  for (let x = Math.floor(x0 / 8) * 8; x < x1; x += 8) ctx.fillRect(x, s.y, 1, s.h); // slats
}

function drawGoal(ctx, world) {
  if (world.boss) return; // the boss IS the objective when the stage has one
  const gx = world.level.goalX;
  const t = (world.frame % 40) / 40;
  ctx.save();
  ctx.globalAlpha = 0.5 + 0.4 * Math.sin(t * Math.PI * 2);
  ctx.fillStyle = '#ffd166';
  ctx.fillRect(gx, 120, 3, 116);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  ctx.moveTo(gx + 3, 122); ctx.lineTo(gx + 22, 128); ctx.lineTo(gx + 3, 134);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

// Weapon power-up capsule: the real Contra golden falcon-pod sprite
// (assets.get('pickup'), native 32×15) scaled to fit the pickup rect, with the
// arcade blink and the per-weapon letter overlaid on its dark emblem window.
// Falls back to a procedural gold pill when the sprite hasn't loaded. S = Spread.
const PICKUP_LETTER = { rifle: 'R', spread: 'S', machine: 'M', laser: 'L', fire: 'F' };
function drawPickup(ctx, pk, frame, assets) {
  const cx = pk.x + pk.w / 2, cy = pk.y + pk.h / 2;
  const blink = 0.6 + 0.4 * Math.sin(frame * 0.2);
  ctx.save();
  ctx.globalAlpha = blink;

  const img = assets && assets.get('pickup');
  if (img) {
    // Fit the falcon pod to the rect width, preserving aspect, centered on the
    // capsule center so the wide winged pod reads at native proportions.
    const dw = pk.w + 2;
    const dh = dw * (img.height / img.width);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
  } else {
    ctx.fillStyle = '#12202b';
    ctx.fillRect(pk.x - 1, pk.y - 1, pk.w + 2, pk.h + 2);
    ctx.fillStyle = '#ffd166';           // capsule shell
    ctx.fillRect(pk.x, pk.y, pk.w, pk.h);
    ctx.fillStyle = '#12202b';           // window
    ctx.fillRect(pk.x + 2, pk.y + 2, pk.w - 4, pk.h - 4);
  }

  ctx.globalAlpha = 1;
  // Letter in the WEAPON'S identity color (same color as its bullets + HUD name),
  // so the pickup you grab, the HUD readout, and the shots you fire all share one
  // color — a consistent weapon-identity language (was a fixed cyan for all guns).
  ctx.fillStyle = (WEAPONS[pk.weapon] && WEAPONS[pk.weapon].color) || '#8ef0ff';
  ctx.font = '8px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(PICKUP_LETTER[pk.weapon] || '?', cx, cy + 1);
  ctx.restore();
}

function drawEnemy(ctx, e, world, assets) {
  const white = e.flash > 0;

  // Real sprite (from the art pipeline) if it has loaded; otherwise fall through
  // to the procedural placeholder below. Native enemy art is ~26px roughly
  // square, so scale-to-fit-height (like the player) rather than stretching to
  // the small e.w×e.h hitbox, which would squish it.
  const img = assets && assets.get(e.kind);

  // Boss gets a dedicated draw so the animated telegraph/core FX (which the
  // static sprite can't animate) stay overlaid on top of its art. It blits the
  // real Sentinel sprite when loaded and falls back to the procedural hull.
  // Per-stage THEMED boss art: a themed stage swaps in its OWN boss sprite
  // (boss_snow/foundry/fortress for the sentinel, boss_desert/caverns for the
  // chopper) — mirrors the tileset/bg theme swap. Untamed stages (jungle/cascade,
  // no boss_<id> key) resolve to null and keep the base boss/chopper art.
  const themedBoss = assets && world.theme && assets.get('boss_' + world.theme.id);
  if (e.kind === 'boss') {
    // Themed boss wins; else phase-2 swaps to the distinct ENRAGED Sentinel
    // sprite (flaring core, cracked reactor, scorched hull); else base boss.
    // (Themed stages have no per-biome enrage art yet — the pulsing red-glow
    // overlay in drawBoss still reads the enrage on top of the themed sprite.)
    const bossImg = themedBoss || (e.enraged && assets && assets.get('boss_enraged')) || img;
    drawBoss(ctx, e, bossImg);
    return;
  }
  // Stage-2 chopper boss: dedicated draw (blits assets.get('chopper') when it lands,
  // else a procedural gunship). Animated rotor/telegraph the static art can't show.
  if (e.kind === 'chopper') {
    const chImg = themedBoss || (e.enraged && assets && assets.get('chopper_enraged')) || img;
    drawChopper(ctx, e, chImg, world);
    if (e.telegraph > 0) drawFireTelegraph(ctx, e, world);
    return;
  }

  if (img) {
    // Turret: draw a WEAPONLESS dome — the pipeline's real turret_base sprite, else
    // weaponlessTurret(img) which GUARANTEES a barrel-less body in code (identity on
    // the already-clean dome; strips a barrel if one ever slips in) — so the ONLY
    // weapon is the single procedural rotating barrel (CREATOR round-2 fix, CR-3).
    if (e.kind === 'turret') {
      const base = (assets && assets.get('turret_base')) || weaponlessTurret(img);
      drawEnemySprite(ctx, e, base, white);
      drawTurretBarrel(ctx, e, world);
    } else {
      drawEnemySprite(ctx, e, img, white);
    }
    if (e.telegraph > 0) drawFireTelegraph(ctx, e, world);
    return;
  }

  if (e.kind === 'grunt') {
    ctx.fillStyle = white ? '#ffffff' : e.def.color;
    ctx.fillRect(e.x, e.y, e.w, e.h);
    ctx.fillStyle = white ? '#ffffff' : '#7a1f22';
    ctx.fillRect(e.x, e.y + e.h - 4, e.w, 4); // boots
    // eye faces travel dir
    ctx.fillStyle = '#111';
    const ex = e.dir < 0 ? e.x + 3 : e.x + e.w - 6;
    ctx.fillRect(ex, e.y + 4, 3, 3);
  } else if (e.kind === 'mortar') {
    // squat olive-brass emplacement + stubby barrel angled UP toward the player
    ctx.fillStyle = white ? '#ffffff' : '#2c2718';
    ctx.fillRect(e.x, e.y + e.h - 5, e.w, 5);            // base slab
    ctx.fillStyle = white ? '#ffffff' : e.def.color;
    ctx.fillRect(e.x + 2, e.y + 3, e.w - 4, e.h - 6);    // body block
    const towardP = (world.player.x + world.player.w / 2) < (e.x + e.w / 2) ? -1 : 1;
    const bx = e.x + e.w / 2, by = e.y + 3;
    ctx.strokeStyle = white ? '#ffffff' : '#1c1810';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(bx, by + 1);
    ctx.lineTo(bx + towardP * 5, by - 7);                // short barrel, angled up
    ctx.stroke();
  } else {
    // turret dome + barrel aimed at player
    ctx.fillStyle = white ? '#ffffff' : '#4a3a5a';
    ctx.fillRect(e.x, e.y + e.h - 6, e.w, 6); // base
    ctx.fillStyle = white ? '#ffffff' : e.def.color;
    ctx.beginPath();
    ctx.arc(e.x + e.w / 2, e.y + e.h - 6, e.w / 2, Math.PI, 0);
    ctx.fill();
    drawTurretBarrel(ctx, e, world);
  }
  if (e.telegraph > 0) drawFireTelegraph(ctx, e, world);
}

// Pre-fire wind-up glow for aimed enemies (turret barrel tip / flyer eye),
// mirroring the boss telegraph so an incoming AIMED shot is READABLE and the
// player can jump/prone it — not a cheap no-warning hit. Intensifies as the
// shot nears (e.telegraph counts down to 0 on fire). Deterministic: derived
// from e.telegraph only, no rng, so replays/self-tests stay byte-identical.
function drawFireTelegraph(ctx, e, world) {
  const p = world.player;
  let mx, my;
  if (e.kind === 'turret') {
    // Telegraph glows at the barrel TIP — same data-driven geometry the barrel
    // is drawn with and the shot fires from (config CR-3), so the wind-up flash
    // sits exactly where the bullet will emerge.
    const cx = e.x + e.w / 2, cy = e.y + e.h - e.def.barrelPivotFromBottom;
    const ang = Math.atan2((p.y + p.h / 2) - cy, (p.x + p.w / 2) - cx);
    mx = cx + Math.cos(ang) * e.def.barrelLen; my = cy + Math.sin(ang) * e.def.barrelLen;
  } else if (e.kind === 'mortar') { // glow at the muzzle (top of the barrel)
    mx = e.x + e.w / 2; my = e.y - 4;
  } else { // flyer: glow the eye on the side facing the player
    mx = e.x + e.w / 2 + (e.dir < 0 ? -e.w * 0.34 : e.w * 0.34);
    my = e.y + e.h * 0.5;
  }
  const g = 1 - e.telegraph / TELEGRAPH_FRAMES; // 0 → 1 as the shot nears
  const r = 2 + g * 3;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.35 + 0.5 * g; ctx.fillStyle = '#ffd66a';
  ctx.beginPath(); ctx.arc(mx, my, r, 0, TAU); ctx.fill();
  ctx.globalAlpha = 0.5 + 0.4 * g; ctx.fillStyle = '#ff7a2a';
  ctx.beginPath(); ctx.arc(mx, my, r * 0.5, 0, TAU); ctx.fill();
  ctx.restore();
}

// Barrel aimed at the player, drawn from just above the turret centre. Shared by
// the procedural turret and the sprite path so the shot is always telegraphed.
function drawTurretBarrel(ctx, e, world) {
  const p = world.player;
  // The turret's ROTATING cannon barrel, aimed at the player. Barrel geometry is
  // DATA (config CR-3) so the drawn barrel and the fired muzzle (enemy.js) read the
  // identical pivot/length. Per CREATOR_FEEDBACK ROUND 2 this rotating barrel is the
  // canonical turret solution (over a weaponless dome — art loop's half); authored
  // to pixel-art quality (shaded gunmetal cannon + collar + muzzle ring), not a line.
  const cx = e.x + e.w / 2, cy = e.y + e.h - e.def.barrelPivotFromBottom;
  const len = e.def.barrelLen;
  const ang = Math.atan2((p.y + p.h / 2) - cy, (p.x + p.w / 2) - cx);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(ang);
  if (Math.cos(ang) < 0) ctx.scale(1, -1); // keep the highlight on top when aimed left
  ctx.fillStyle = '#181b20';                 // silhouette / under-shadow
  ctx.fillRect(-3, -3, len + 4, 6);
  ctx.fillStyle = '#3a424c';                 // collar / mount at the pivot
  ctx.fillRect(-3, -3, 4, 6);
  ctx.fillStyle = '#4c5560';                 // barrel body (mid gunmetal)
  ctx.fillRect(1, -2, len - 1, 4);
  ctx.fillStyle = '#79838f';                 // top highlight
  ctx.fillRect(1, -2, len - 1, 1);
  ctx.fillStyle = '#232830';                 // bottom shade
  ctx.fillRect(1, 1, len - 1, 1);
  ctx.fillStyle = '#6a7480';                 // muzzle ring
  ctx.fillRect(len - 1, -3, 2, 6);
  ctx.restore();
}

// Boss draw. Blits the real Sentinel sprite (assets.get('boss')) when it has
// loaded — cannon aimed LEFT toward the incoming player, so NO mirror — feet-
// anchored to the hitbox floor and scaled to ~fit height. On top it overlays
// the animated telegraph the static art can't show: the core brightens and the
// three cannon ports flash on the wind-up beat so the player still gets the
// "about to fire — DUCK" read. Falls back to the procedural armored hull below
// when the sprite is absent. `img` is the boss sprite or null/undefined.
function drawBoss(ctx, e, img) {
  const { x, y, w, h } = e;
  const gt = y + h; // ground top / feet
  const tel = (e.telegraph || 0) > 0;

  if (img) {
    const scale = (h * 1.4) / img.height; // like the player: art > hitbox height
    const dw = img.width * scale, dh = img.height * scale;
    const cx = x + w / 2;
    const dx = cx - dw / 2;
    const dy = gt - dh; // feet on the hitbox floor
    ctx.drawImage(img, dx, dy, dw, dh);
    // phase-2 enrage: a pulsing red heat-glow masked to the boss SILHOUETTE
    // (not its bounding rect) so a transparent sprite doesn't get a red matte
    // rectangle behind it — BOSS-3. Additive so it reads as heat.
    if (e.enraged) {
      bossPulse++;
      const pa = 0.22 + 0.16 * Math.sin(bossPulse * 0.2);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = pa;
      ctx.drawImage(tintedSilhouette(_bossScratch, img, '#ff2a30'), dx, dy, dw, dh);
      ctx.globalAlpha = pa + 0.25; ctx.fillStyle = '#ff6a4a';
      ctx.beginPath(); ctx.arc(cx, y + h * 0.4, 8, 0, TAU); ctx.fill(); // molten core hot-spot
      ctx.restore();
    }
    // white hit-flash, also masked to the silhouette (a bbox fill would wash a
    // rectangle over the transparent boss — same BOSS-3 class of defect).
    if (e.flash > 0) {
      ctx.save(); ctx.globalAlpha = 0.4;
      ctx.drawImage(tintedSilhouette(_bossScratch, img, '#ffffff'), dx, dy, dw, dh);
      ctx.restore();
    }
    // telegraph: additive core glow + hot flashes at the left cannon ports
    // (volley heights gt-22/-18/-15, fired from the sprite's left edge).
    if (tel) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.9; ctx.fillStyle = '#ffec8a';
      ctx.beginPath(); ctx.arc(cx, y + h * 0.4, 12, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.8; ctx.fillStyle = '#ff9a30';
      for (const cy of [gt - 22, gt - 18, gt - 15]) { ctx.beginPath(); ctx.arc(dx + 3, cy, 3, 0, TAU); ctx.fill(); }
      ctx.restore();
    }
    return;
  }

  // hull + dome + treads (real colors — the boss is too big to fully white-flash)
  ctx.fillStyle = '#3a2f42';
  ctx.fillRect(x, y + 6, w, h - 6);
  ctx.fillStyle = '#524465';
  ctx.fillRect(x + 6, y, w - 12, 10);
  ctx.fillStyle = '#2a2233';
  ctx.fillRect(x, y + 6, w, 2);
  ctx.fillRect(x + 4, y + h - 12, w - 8, 2);
  ctx.fillStyle = '#241d2e';
  ctx.fillRect(x - 2, y + h - 8, w + 4, 8);
  // rivet detail so the hull doesn't read as a flat slab
  ctx.fillStyle = '#6a5880';
  for (let rx = x + 6; rx < x + w - 4; rx += 10) { ctx.fillRect(rx, y + 12, 2, 2); ctx.fillRect(rx, y + h - 20, 2, 2); }
  // glowing core (brightens on telegraph)
  const core = tel ? '#ffec8a' : e.def.color;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = tel ? 0.9 : 0.5;
  ctx.fillStyle = core;
  ctx.beginPath(); ctx.arc(x + w * 0.5, y + h * 0.4, tel ? 12 : 9, 0, TAU); ctx.fill();
  ctx.restore();
  ctx.fillStyle = core;
  ctx.beginPath(); ctx.arc(x + w * 0.5, y + h * 0.4, 5, 0, TAU); ctx.fill();
  // player-facing cannon ports at the volley heights
  ctx.fillStyle = '#1c1626';
  for (const cy of [gt - 22, gt - 18, gt - 15]) ctx.fillRect(x - 3, cy - 2, 5, 4);
  if (tel) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.7; ctx.fillStyle = '#ff9a30';
    for (const cy of [gt - 22, gt - 18, gt - 15]) { ctx.beginPath(); ctx.arc(x - 3, cy, 3, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
  // subtle white hit-flash overlay (does NOT wash out the whole boss)
  if (e.flash > 0) {
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }
}

// Blit an enemy sprite feet-anchored to the hitbox floor, centred on the hitbox,
// scaled to ~1.4× hitbox height so the native ~26px art reads at arcade
// proportions instead of being squished to the small hitbox. Grunt art natively
// aims LEFT, so mirror it when travelling right (e.dir > 0). Turrets don't
// mirror. White-tints on hit-flash to match the player's feel.
function drawEnemySprite(ctx, e, img, white) {
  const scale = (e.h * 1.4) / img.height;
  const dw = img.width * scale, dh = img.height * scale;
  const cx = e.x + e.w / 2;
  const dx = cx - dw / 2;
  const dy = (e.y + e.h) - dh; // feet on the hitbox floor
  const src = white ? whiteTinted(img) : img;

  ctx.save();
  // Grunt and flyer sprites face LEFT natively → mirror when travelling right.
  if ((e.kind === 'grunt' || e.kind === 'flyer') && e.dir > 0) { ctx.translate(cx * 2, 0); ctx.scale(-1, 1); }
  ctx.drawImage(src, dx, dy, dw, dh);
  ctx.restore();
}

// Glowing tracer: additive glow halo + a motion streak tail + a white-hot core,
// so projectiles read as light/energy (competitor "juice" bar) not plain dots.
function drawBullet(ctx, b) {
  const m = Math.hypot(b.vx, b.vy) || 1;
  const ux = b.vx / m, uy = b.vy / m;
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;

  // Laser: a long, thick, bright piercing beam rather than a round tracer.
  if (b.pierce) {
    const len = 22;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.strokeStyle = b.color;
    ctx.globalAlpha = 0.4; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(cx - ux * len, cy - uy * len); ctx.lineTo(cx + ux * 4, cy + uy * 4); ctx.stroke();
    ctx.globalAlpha = 0.9; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx - ux * len, cy - uy * len); ctx.lineTo(cx + ux * 4, cy + uy * 4); ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = 1; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(cx - ux * len, cy - uy * len); ctx.lineTo(cx + ux * 4, cy + uy * 4); ctx.stroke();
    ctx.restore();
    return;
  }

  const tail = 8 + m * 0.4; // faster rounds streak longer

  ctx.save();
  ctx.globalCompositeOperation = 'lighter'; // additive → real glow on the dark bg
  ctx.lineCap = 'round';

  // outer glow halo
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = b.color;
  ctx.beginPath();
  ctx.arc(cx, cy, 3.4, 0, TAU);
  ctx.fill();

  // tracer tail
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = b.color;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx - ux * tail, cy - uy * tail);
  ctx.stroke();

  // white-hot core
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx, cy, 1.4, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawParticle(ctx, pt) {
  const a = Math.max(0, pt.life / pt.maxLife);
  ctx.globalAlpha = a;
  ctx.fillStyle = pt.color;
  ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
  ctx.globalAlpha = 1;
}

// Blit one horizontal cell of an FX strip, centred on (cx, cy). `frame` is
// clamped to the strip length. Pixel-crisp (ctx.imageSmoothing already off).
function drawFxCell(ctx, img, meta, frame, cx, cy, scale, alpha, blend) {
  const f = Math.max(0, Math.min(meta.frames - 1, frame | 0));
  const sw = meta.fw, sh = meta.fh, sx = f * sw;
  const dw = sw * scale, dh = sh * scale;
  ctx.save();
  ctx.globalAlpha = alpha;
  if (blend) ctx.globalCompositeOperation = blend;
  ctx.drawImage(img, sx, 0, sw, sh, cx - dw / 2, cy - dh / 2, dw, dh);
  ctx.restore();
}

// Enemy-death explosion: play the 4-frame strip over the debris burst, fading
// out on the last frame. Falls back silently to the particle burst (already
// drawn) if the strip hasn't loaded.
function drawFx(ctx, fx, assets) {
  // LAND DUST (touchdown after a jump/fall). A low puff of dirt kicked out to both
  // sides along the ground, rising slightly then settling. Deterministic (fx.t +
  // world-x hash, no rng) so it never touches determinism/self-tests.
  if (fx.kind === 'landdust') {
    const k = fx.t / fx.life;               // 0 → 1
    const spread = 3 + k * 13;
    ctx.save();
    const puffs = 6;
    for (let i = 0; i < puffs; i++) {
      const side = (i % 2) ? 1 : -1;
      const j = i >> 1;                      // 0,0,1,1,2,2
      const hx = hash1(fx.x + i * 13.7);
      const px = fx.x + side * spread * (0.4 + j * 0.32) * (0.7 + hx * 0.6);
      const py = fx.y - 2 - k * 3 - hx * 2;  // hug the ground, drift up a touch
      const r = Math.max(0.6, 3 - k * 2.4) + hx * 1.4;
      ctx.globalAlpha = Math.max(0, 0.5 * (1 - k));
      ctx.fillStyle = (i % 2) ? '#b8a88f' : '#8f8069';
      ctx.beginPath(); ctx.arc(px, py, r, 0, TAU); ctx.fill();
    }
    ctx.restore();
    return;
  }
  // WATER SPLASH (player fell into the bridge water). Expanding surface ripple
  // rings + an upward droplet plume that arcs back down. Deterministic (fx.t only,
  // no rng, no sim state) so it never touches determinism/self-tests.
  if (fx.kind === 'splash') {
    const k = fx.t / fx.life;               // 0 → 1 over the fx lifetime
    ctx.save();
    // impact flash on the first few steps
    if (fx.t < 4) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.7 * (1 - fx.t / 4);
      ctx.fillStyle = '#dff6fa';
      ctx.beginPath(); ctx.arc(fx.x, fx.y, 4 + fx.t * 2, 0, TAU); ctx.fill();
    }
    // two flattened ripple rings spreading on the surface
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = '#bfeff5';
    ctx.lineWidth = 1;
    for (let ri = 0; ri < 2; ri++) {
      const rk = k - ri * 0.22;
      if (rk <= 0 || rk > 1) continue;
      const rr = 3 + rk * 17;
      ctx.globalAlpha = 0.55 * (1 - rk);
      ctx.beginPath(); ctx.ellipse(fx.x, fx.y, rr, rr * 0.34, 0, 0, TAU); ctx.stroke();
    }
    // upward droplet plume — outer drops launch shallower, gravity arcs them back
    const drops = 7;
    for (let i = 0; i < drops; i++) {
      const a = i / (drops - 1) - 0.5;      // -0.5 … 0.5
      const vx0 = a * 4.6;
      const vy0 = -(2.7 + (0.5 - Math.abs(a)) * 2.6); // centre flies highest
      const px = fx.x + vx0 * fx.t;
      const py = fx.y + vy0 * fx.t + 0.16 * fx.t * fx.t; // rise then fall
      if (py > fx.y) continue;              // gone once it re-enters the water
      ctx.globalAlpha = Math.max(0, 1 - fx.t / (fx.life * 0.8));
      ctx.fillStyle = (i % 2) ? '#e6f9fc' : '#7fc9d6';
      const s = Math.max(1, 2 - k * 1.4);
      ctx.fillRect(px - s / 2, py - s / 2, s, s);
    }
    ctx.restore();
    return;
  }
  if (fx.kind !== 'explosion') return;
  const meta = FX.explosion;
  // (1) FLASH POP — a bright radial burst on the first few steps so a kill READS
  //     as an explosion, not a faint sprite on the dark bg. Additive; expands +
  //     fades. Deterministic (fx.t only — no rng, no sim state), so it never
  //     touches determinism/self-tests. This is the punch the strip alone lacked.
  if (fx.t < 7) {
    const k = fx.t / 7;                 // 0 → 1
    const r = 7 + k * 20;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(fx.x, fx.y, 0, fx.x, fx.y, r);
    g.addColorStop(0, `rgba(255,255,232,${0.95 * (1 - k)})`);
    g.addColorStop(0.35, `rgba(255,196,96,${0.7 * (1 - k)})`);
    g.addColorStop(1, 'rgba(255,110,40,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(fx.x, fx.y, r, 0, TAU); ctx.fill();
    // a thin hot shock ring riding the leading edge
    ctx.globalAlpha = 0.5 * (1 - k);
    ctx.strokeStyle = '#fff4c8'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(fx.x, fx.y, r * 0.92, 0, TAU); ctx.stroke();
    ctx.restore();
  }
  // (2) the authored 4-frame strip over the debris (slightly larger for presence).
  const img = assets && assets.get('explosion');
  if (!img) return;
  const frame = Math.floor(fx.t / meta.stepsPerFrame);
  const last = meta.frames - 1;
  const alpha = frame >= last ? Math.max(0, 1 - (fx.t - last * meta.stepsPerFrame) / meta.stepsPerFrame) : 1;
  drawFxCell(ctx, img, meta, frame, fx.x, fx.y, meta.scale, alpha, 'lighter');
}

// Build a solid-color SILHOUETTE of a sprite on a scratch canvas: the sprite's
// OPAQUE pixels filled with `color`, transparent pixels left clear (source-atop).
// Blit it additively for a glow or alpha'd for a flash so an overlay follows the
// sprite SHAPE, not its bounding rect — a rectangular matte over a transparent
// sprite is the BOSS-3 defect. `scratch` lets callers keep separate canvases so
// two silhouettes built in one frame don't clobber each other.
function tintedSilhouette(scratch, img, color) {
  const c = scratch.c || (scratch.c = document.createElement('canvas'));
  if (c.width !== img.width || c.height !== img.height) { c.width = img.width; c.height = img.height; }
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'source-atop'; // paint only over opaque sprite pixels
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'source-over';
  return c;
}
// White hit-flash silhouette (players/enemies). Own scratch canvas.
const _flashScratch = {};
function whiteTinted(img) { return tintedSilhouette(_flashScratch, img, '#ffffff'); }
// Boss enrage/flash silhouettes get their own scratch (drawn on the same frame
// as player flashes, so a shared canvas would clobber).
const _bossScratch = {};

// CODE-SIDE weaponless guarantee for the turret body (CR-3): return a turret
// sprite that carries NO baked barrel, so the ONLY weapon is the single procedural
// drawTurretBarrel. The art route already ships a weaponless base turret (clean
// 32×32 dome), so this is normally an identity pass-through — but it ALSO defends
// against a baked-barrel sprite ever slipping in at this key: if a NARROW barrel
// protrusion is detected it is erased.
//
// Detection is calibrated to the DOME's real silhouette (not a raw pixel count —
// that was the old bug that false-stripped the wide dome). A barrel is a narrow
// mid-height band that juts LEFT past the dome rows both above AND below it; the
// smooth dome curve (and its wide base) never does. VERIFIED: flags 0 rows on the
// shipped clean dome ⇒ returned untouched. Cached per source image.
const _turretBaseCache = new WeakMap();
function weaponlessTurret(img) {
  if (!img) return null;
  const hit = _turretBaseCache.get(img);
  if (hit) return hit;
  const w = img.width, h = img.height;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  let data;
  try { data = g.getImageData(0, 0, w, h); } catch (e) { return img; } // tainted → leave as-is
  const d = data.data;
  // leftmost opaque x per row
  const lm = new Array(h).fill(-1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 8) { lm[y] = x; break; }
  const gap = Math.max(3, Math.round(h * 0.18)); // vertical reach to the dome above/below a barrel
  const jut = 3;                                  // px a barrel must protrude past both neighbors
  const yLo = Math.round(h * 0.15), yHi = Math.round(h * 0.55); // dome/barrel band (excludes wide base)
  let stripped = false;
  for (let y = yLo; y < yHi; y++) {
    if (lm[y] < 0 || y - gap < 0 || y + gap >= h) continue;
    const above = lm[y - gap], below = lm[y + gap];
    if (above >= 0 && below >= 0 && lm[y] <= above - jut && lm[y] <= below - jut) {
      const edge = Math.min(above, below) - 1;   // erase left of the dome silhouette
      for (let x = 0; x <= edge && x < w; x++) d[(y * w + x) * 4 + 3] = 0;
      stripped = true;
    }
  }
  if (!stripped) { _turretBaseCache.set(img, img); return img; } // already weaponless
  g.putImageData(data, 0, 0);
  _turretBaseCache.set(img, c);
  return c;
}

// STYLE-BIBLE hero palette (assets/STYLE-BIBLE.md §2) for the procedural
// weaponless commando body used until the pipeline ships weaponless hero art.
const HERO_PAL = {
  outline: '#0f0f0d', boot: '#141212', pants: '#443e8d', pantsHi: '#656cdc',
  pantsSh: '#3c3982', vest: '#443e8d', vestHi: '#656cdc', vestSh: '#3c3982',
  armSh: '#9e511a', arm: '#b86634', armHi: '#e69e7f', skin: '#e8b098',
  skinHi: '#ffd89e', band: '#ed1711', bandSh: '#a11a1d',
};

// Draw the hero as a WEAPONLESS commando (no baked gun) so the single procedural
// rifle (drawGun) is the only weapon in every one of the 8 aim directions — a
// baked sprite gun points one fixed way and reads as a SECOND gun whenever the
// aim differs, so the body must carry none. Feet-anchored + mirrored by facing,
// drawn to the STYLE-BIBLE palette (hero blues + bare tan arms + red bandana,
// near-black outline). `pose` ∈ idle|run|jump; `frame` drives the run stride.
// This is the interim; a weaponless `player_*_noweapon` sprite supersedes it.
function drawHeroBody(ctx, p, x, y, pose, frame) {
  const H = p.h * 1.3;                 // on-screen height (feet-anchored, ~26px standing)
  const white = p.flash > 0;
  const C = (c) => (white ? '#ffffff' : c);
  const P = HERO_PAL;
  ctx.save();
  ctx.translate(Math.round(x + p.w / 2), Math.round(y + p.h)); // origin at feet-centre
  if (p.facing < 0) ctx.scale(-1, 1);                          // +x = facing-forward
  // rect in the feet-origin frame: (leftX, topAboveFeet, w, h). y grows UP.
  const R = (lx, top, w, h, c) => { ctx.fillStyle = C(c); ctx.fillRect(Math.round(lx), Math.round(-top), Math.round(w), Math.round(h)); };

  // proportions (px above the feet)
  const hipY = H * 0.44, waistY = H * 0.50, chestY = H * 0.74, shoulderY = H * 0.70, headTop = H;
  const legW = 3;

  // --- legs + boots (stride/tuck by pose) ---
  let fX = 1, bX = -legW - 1, fTop = hipY, bTop = hipY;   // idle default
  if (pose === 'run') {
    const s = (frame === 1 ? 1 : frame === 3 ? -1 : 0) * (H * 0.11);
    fX = 1 + Math.max(0, s); bX = -legW - 1 + Math.min(0, s);
    fTop = hipY - Math.abs(s) * 0.3; bTop = hipY - Math.abs(s) * 0.3;
  } else if (pose === 'jump') {
    fX = 0; bX = -legW - 1; fTop = hipY * 0.62; bTop = hipY * 0.5;   // tucked knees
  }
  R(bX - 1, bTop, legW + 1, bTop - 3, P.outline);        // back leg outline
  R(bX, bTop, legW, bTop - 3, P.pantsSh);
  R(bX - 1, 3, legW + 2, 3, P.boot);                     // back boot
  R(fX - 1, fTop, legW + 1, fTop - 3, P.outline);        // front leg outline
  R(fX, fTop, legW, fTop - 3, P.pants);
  R(fX, fTop, 1, fTop - 3, P.pantsHi);                   // knee highlight
  R(fX - 1, 3, legW + 2, 3, P.boot);                     // front boot

  // --- torso / vest ---
  const tH = chestY - hipY, tHalf = H * 0.20;
  R(-tHalf - 1, chestY, tHalf * 2 + 2, tH + 2, P.outline);   // torso outline
  R(-tHalf, chestY, tHalf * 2, tH, P.vest);
  R(-tHalf, chestY, tHalf * 2, 2, P.vestHi);                 // top-lit shoulders line
  R(tHalf - 2, chestY - 1, 2, tH - 1, P.vestSh);             // back-edge shade
  R(-1, chestY - 2, 2, tH - 2, P.vestHi);                    // centre seam highlight

  // --- back arm (tan, along the torso) ---
  R(-tHalf - 2, shoulderY, 2, shoulderY - waistY, P.armSh);

  // --- head: skin face + red bandana + dark hair ---
  const hW = H * 0.22, hH = headTop - chestY + 1;
  R(-hW / 2 - 1, headTop, hW + 2, hH + 1, P.outline);        // head outline
  R(-hW / 2, headTop, hW, hH, P.skin);                       // face
  R(-hW / 2, headTop, hW, 2, P.bandSh);                      // bandana band
  R(-hW / 2, headTop - 1, hW, 1, P.band);                    // bandana lit edge
  R(hW / 2 - 2, headTop - 2, 2, hH - 1, P.skinHi);           // cheek highlight (facing side)
  R(-hW / 2, headTop - hH + 1, 2, 2, P.outline);             // back-of-head hair

  // --- front shoulder/upper-arm stub (bare tan). The forearm + gripping hands
  //     travel WITH the rifle in drawGun (rotated to the aim), so they always
  //     connect to the single weapon no matter which way it points — no floating
  //     forearm on the up/down aims. ---
  const armY = p.h * (1 - HERO_GUN.pivotY);   // gun pivot height above feet (matches drawGun)
  R(-1, shoulderY, 3, shoulderY - armY + 1, P.outline);      // shoulder outline
  R(0, shoulderY, 2, shoulderY - armY, P.arm);
  R(0, shoulderY, 1, shoulderY - armY, P.armHi);             // top-lit

  ctx.restore();
}

// The hero body is drawn WEAPONLESS in every branch and the ONE rifle is added
// by drawGun — the CREATOR round-2 invariant (exactly one weapon, aiming). We
// prefer a weaponless SPRITE from the art pipeline (player_*_noweapon keys) when
// it has loaded, and otherwise draw the procedural weaponless commando
// (drawHeroBody / drawProne). The gun-baked sprites (player_idle/run/jump/prone)
// are NEVER drawn for the hero, so no baked gun can appear beside the aiming one.
// VERIFIED BY LOOKING (one weapon, all axes): 8-way idle fire + turret; every
// armed enemy (see enemy.js audit); 1× vs the arcade reference; across biome
// backdrops (jungle/snow/desert); and RUN-AND-GUN motion — the real 4-frame
// weaponless run strip (player_run.png, confirmed gunless) under the single
// procedural rifle across all 4 run frames (2026-07-12). No baked gun in motion.
function drawPlayer(ctx, p, assets) {
  const get = (k) => (assets && assets.get(k)) || null;

  // Death throw: the flung commando spins around its centre as it arcs (Contra's
  // signature death). Weapon reverts on death, so NO gun overlay here.
  if (p.dying) {
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(p.deathAngle);
    ctx.translate(-cx, -cy);
    const nw = get('player_idle_noweapon');
    if (nw) drawPlayerSprite(ctx, p, nw, p.x, p.y);
    else drawHeroBody(ctx, p, p.x, p.y, 'idle', 0);
    ctx.restore();
    return;
  }

  // blink while invulnerable
  if (p.iframe > 0 && Math.floor(p.iframe / 4) % 2 === 0) return;

  const kx = -p.aim.x * p.recoilKick; // visual recoil push
  const ky = -p.aim.y * p.recoilKick;
  const x = p.x + kx, y = p.y + ky;

  // Prone: a purpose-built low silhouette (drawProne is already weaponless), or a
  // weaponless prone sprite if the pipeline ships one. The ONE gun on top.
  if (p.prone) {
    const nw = get('player_prone_noweapon');
    if (nw) drawPlayerSprite(ctx, p, nw, x, y);
    else drawProne(ctx, p, x, y);
    drawGun(ctx, p, x, y, assets);
    return;
  }

  // Airborne (jumping/falling): weaponless leap sprite if present, else the
  // procedural jump body. Somersault on the RISE (Contra tuck) spins a clean
  // silhouette with the gun suppressed; on descent the gun shows again.
  const jumpNw = get('player_jump_noweapon');
  if (!p.grounded) {
    const drawBody = () => jumpNw ? drawPlayerSprite(ctx, p, jumpNw, x, y) : drawHeroBody(ctx, p, x, y, 'jump', 0);
    const tucking = p.vy < 0 && p.airborneT <= SOMERSAULT_FRAMES;
    if (tucking) {
      const prog = Math.min(1, p.airborneT / SOMERSAULT_FRAMES);
      const cx = x + p.w / 2, cy = y + p.h / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(p.facing * prog * TAU); // forward roll in the travel direction
      ctx.translate(-cx, -cy);
      drawBody();
      ctx.restore();
    } else {
      drawBody();
      drawGun(ctx, p, x, y, assets);
    }
    return;
  }

  // Landing SQUASH (movement-cadence feel): on touchdown after a jump/fall the
  // commando briefly compresses vertically + bulges out, anchored at the feet,
  // easing out over landT. Applies only to the grounded stances below (the prone
  // and airborne branches already returned). The player is the LAST actor drawn
  // this frame, so the transform is cleaned up by render()'s outer ctx.restore().
  if (p.landT > 0) {
    const k = p.landT / LAND_SQUASH_FRAMES;      // 1 → 0
    const sy = 1 - 0.22 * k, sx = 1 + 0.16 * k;  // squat down, spread out
    const fxc = x + p.w / 2, fyc = y + p.h;      // feet anchor
    ctx.translate(fxc, fyc); ctx.scale(sx, sy); ctx.translate(-fxc, -fyc);
  }

  // Grounded: run cycle when moving, else idle stance. Weaponless sprite (with
  // the 4-beat run strip) if the pipeline ships it, else the procedural body.
  const running = p.grounded && Math.abs(p.vx) > 0.2;
  if (running) {
    const frame = Math.floor(p.walkPhase / (Math.PI / 2)) % PLAYER_RUN.frames;
    const runNw = get('player_run_noweapon');
    if (runNw) drawPlayerSprite(ctx, p, runNw, x, y, PLAYER_RUN, frame);
    else drawHeroBody(ctx, p, x, y, 'run', frame);
  } else {
    const idleNw = get('player_idle_noweapon');
    if (idleNw) drawPlayerSprite(ctx, p, idleNw, x, y);
    else drawHeroBody(ctx, p, x, y, 'idle', 0);
  }
  drawGun(ctx, p, x, y, assets);
}

// Draw the real commando sprite anchored feet-to-hitbox-bottom, centred on the
// hitbox, mirrored by facing. Scaled so the taller-than-hitbox sprite reads at
// arcade proportions. White-tints on hit-flash to match the placeholder feel.
// `meta`/`frame` are optional: pass them to slice one cell of a horizontal
// strip (e.g. the run cycle); omit for a single-frame sprite (idle) and the
// whole image is used. whiteTinted mirrors the full source, so slicing the
// tinted copy by the same rect keeps the hit-flash aligned per frame.
function drawPlayerSprite(ctx, p, img, x, y, meta, frame) {
  const fw = meta ? meta.fw : img.width;
  const fh = meta ? meta.fh : img.height;
  const sx = meta ? (frame | 0) * fw : 0;
  const scale = (p.h * 1.4) / fh; // sprite stands a bit taller than the hitbox
  const dw = fw * scale, dh = fh * scale;
  const cx = x + p.w / 2;
  const dx = cx - dw / 2;
  const dy = (y + p.h) - dh; // feet on the hitbox floor
  const src = p.flash > 0 ? whiteTinted(img) : img;

  ctx.save();
  if (p.facing < 0) { ctx.translate(cx * 2, 0); ctx.scale(-1, 1); } // mirror about cx
  ctx.drawImage(src, sx, 0, fw, fh, dx, dy, dw, dh);
  ctx.restore();
}

// Low prone silhouette: a flattened commando lying forward, head + headband at
// the facing edge, legs trailing back. Reads clearly as "ducked under fire".
function drawProne(ctx, p, x, y) {
  const f = p.facing;
  const body = p.flash > 0 ? '#ffffff' : '#3f7bd6';
  const skin = p.flash > 0 ? '#ffffff' : '#e8c39a';
  // torso extends slightly forward past the hitbox for a prone read
  ctx.fillStyle = body;
  ctx.fillRect(x - 1, y + 3, p.w + 2, p.h - 3);
  // legs trailing behind the facing direction
  ctx.fillStyle = '#20304a';
  const legX = f > 0 ? x - 3 : x + p.w - 1;
  ctx.fillRect(legX, y + p.h - 4, 4, 3);
  // head at the front
  ctx.fillStyle = skin;
  const hx = f > 0 ? x + p.w - 4 : x;
  ctx.fillRect(hx, y + 2, 4, 4);
  // headband
  ctx.fillStyle = '#d23b3b';
  ctx.fillRect(hx, y + 2, 4, 1);
}

// Aim indicator + muzzle flash, drawn on top of body/sprite so the 8-way aim
// stays readable regardless of which art is underneath.
function drawGun(ctx, p, x, y, assets) {
  // The hero's ONE rifle, drawn along the 8-way AIM from the chest/hands pivot
  // (HERO_GUN, the SAME geometry player.shoot() spawns the bullet from), so the
  // weapon you SEE and the weapon that FIRES are the same one — the CREATOR
  // round-2 fix for CR-2. The body underneath is weaponless (drawHeroBody /
  // weaponless sprite), so this is the ONLY gun on the hero. Authored to real
  // pixel-art quality (shaded gunmetal receiver + barrel + stock + fore-grip),
  // muzzle ending exactly at HERO_GUN.muzzle so the shot leaves the drawn tip.
  // The gripping hands/forearm are drawn in THIS rotated frame (below) so they
  // travel with the aim — the intentional single-weapon design that bridges the
  // weaponless body + one procedural gun (vs the arcade's 8 baked aim frames).
  // VERIFIED BY LOOKING at TRUE 1× gameplay scale, 8 directions, side-by-side vs
  // reference/frames/arcade-contra-1987/stage1/hero-8way-aim-native-~53s.png
  // (2026-07-12): exactly ONE rifle per aim, pointing where the bullet leaves,
  // reads at least as clearly as the arcade original. Do NOT reintroduce a baked
  // sprite weapon under this (see enemy.js ONE-WEAPON audit) — that is the reject.
  const gx = x + p.w / 2, gy = y + p.h * HERO_GUN.pivotY;
  const ang = Math.atan2(p.aim.y, p.aim.x);
  const muzzle = HERO_GUN.muzzle; // barrel tip distance from the pivot (== bullet spawn)
  ctx.save();
  ctx.translate(gx, gy);
  ctx.rotate(ang);
  if (p.aim.x < 0) ctx.scale(1, -1); // keep the rifle upright when aiming left
  // Local space: barrel points +x, tip at `muzzle`. Layered dark→mid→light for
  // shading (no flat outline-following — STYLE-BIBLE §hue-shift discipline).
  // LOAD-BEARING (do not flatten): the DARK under-shadow (below) + the LIGHT top
  // highlight (further down) give the gun DUAL contrast — the dark edge reads on
  // pale biomes (snow ground #4a5a6a), the light edge reads on dark biomes
  // (night jungle). VERIFIED BY LOOKING across jungle/snow/desert (2026-07-12):
  // the single rifle stays legible on every biome backdrop. Collapsing this to a
  // single mid-tone would make the gun vanish into the snow/desert terrain.
  ctx.fillStyle = '#181b21';                 // under-shadow silhouette (stock→muzzle)
  ctx.fillRect(-5, -1, muzzle + 6, 4);
  ctx.fillStyle = '#3d444e';                 // wooden/dark stock behind the grip
  ctx.fillRect(-5, 0, 4, 3);
  ctx.fillStyle = '#4c5560';                 // receiver body (mid gunmetal)
  ctx.fillRect(-1, -1, 5, 4);
  ctx.fillStyle = '#5a6470';                 // barrel (thin, to the tip)
  ctx.fillRect(4, -1, muzzle - 4, 2);
  ctx.fillStyle = '#828d9a';                 // top highlight edge along the whole gun
  ctx.fillRect(-4, -1, muzzle + 4, 1);
  ctx.fillStyle = '#2b313a';                 // magazine below the receiver
  ctx.fillRect(0, 3, 2, 2);
  ctx.fillStyle = '#c9d2dc';                 // muzzle tip glint
  ctx.fillRect(muzzle - 1, -1, 1, 1);
  // gripping hands + forearm — bare tan, drawn IN the gun's frame so they follow
  // the aim and always connect the body to the single rifle (no floating arm on
  // up/down aims). Rear hand at the trigger, front hand on the fore-grip.
  if (p.flash <= 0) {
    ctx.fillStyle = '#9e511a';               // forearm underside (shade)
    ctx.fillRect(-5, 1, 8, 2);
    ctx.fillStyle = '#b86634';               // forearm
    ctx.fillRect(-5, 1, 8, 1);
    ctx.fillStyle = '#e69e7f';               // rear fist (trigger hand)
    ctx.fillRect(-2, 0, 2, 3);
    ctx.fillStyle = '#e8b098';               // front fist (fore-grip hand)
    ctx.fillRect(3, 0, 2, 3);
  }
  ctx.restore();

  if (p.muzzle > 0) {
    const mx = gx + Math.cos(ang) * (muzzle + 1), my = gy + Math.sin(ang) * (muzzle + 1);
    const flash = assets && assets.get('muzzle');
    // Real 2-frame muzzle strip if it loaded, sliced off the p.muzzle timer
    // (set to 4 on fire, counts down): frame 0 for the hot first steps, then 1.
    // Falls back to the procedural spark-star when the sprite is absent.
    if (flash) drawMuzzleSprite(ctx, flash, mx, my, ang, p.muzzle, p.weapon.pellets > 1);
    else drawMuzzleFlash(ctx, mx, my, ang, p.muzzle, p.weapon.pellets > 1);
  }
}

// Blit a frame of the muzzle strip at the barrel tip, rotated to the aim so the
// flash points down the barrel. Anchored so its inner edge sits at the tip and
// the flare extends forward. Additive so it reads as light on the dark stage.
// Spread (multi-pellet) gets a slightly bigger flare, matching the procedural feel.
function drawMuzzleSprite(ctx, img, x, y, ang, t, big) {
  const meta = FX.muzzle;
  const frame = t > 2 ? 0 : 1;
  const scale = (big ? 0.85 : 0.65);
  const sw = meta.fw, sh = meta.fh, sx = frame * sw;
  const dw = sw * scale, dh = sh * scale;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(img, sx, 0, sw, sh, -dw * 0.2, -dh / 2, dw, dh);
  ctx.restore();
}

// Chunky warm muzzle flash: additive warm glow + a 4-point spark star oriented
// along the aim + a white core. Bigger for multi-pellet weapons (Spread).
function drawMuzzleFlash(ctx, x, y, ang, t, big) {
  const r = 3 + t * 1.0 + (big ? 1.8 : 0);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.globalCompositeOperation = 'lighter';

  // warm glow
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#ff9a30';
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.5, 0, TAU);
  ctx.fill();

  // 4-point star (long axis along the barrel)
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = '#ffe36e';
  const R = r * 1.9, r2 = r * 0.45;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const rad = i % 2 ? r2 : R;
    const px = Math.cos(a) * rad * (i % 4 === 0 ? 1.25 : 1); // stretch fore/aft
    ctx.lineTo(px, Math.sin(a) * rad);
  }
  ctx.closePath();
  ctx.fill();

  // white-hot core
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.55, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawHud(ctx, world) {
  ctx.save();
  ctx.font = '8px monospace';
  ctx.textBaseline = 'top';
  // score
  ctx.fillStyle = '#ffe36e';
  ctx.fillText('SCORE ' + String(world.score).padStart(6, '0'), 6, 5);
  // HI-SCORE (arcade HUD convention) — top-right, above the weapon. Ticks up live
  // as you pass your best (main.js keeps world.highScore = max(best, score)). Dim
  // gold so SCORE stays primary. 0 in headless (highScore is a live-only field).
  ctx.textAlign = 'right';
  ctx.fillStyle = '#b89a3a';
  ctx.fillText('HI ' + String(world.highScore || 0).padStart(6, '0'), SIM.VIEW_W - 6, 5);
  ctx.textAlign = 'left';
  // lives
  ctx.fillStyle = '#fff';
  ctx.fillText('LIVES', 6, 16);
  for (let i = 0; i < Math.max(0, world.lives); i++) {
    ctx.fillStyle = '#5b9bff';
    ctx.fillRect(38 + i * 8, 16, 5, 7);
  }
  // ARCADE shows NO health pips (one-hit-death invariant). CASUAL draws its
  // opt-in shield as distinct blue pips so it never reads as an arcade health bar.
  const p = world.player;
  if (world.modeKey === 'casual') {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#7ad0ff';
    ctx.fillText('SHLD', 92, 16);
    for (let i = 0; i < Math.max(0, p.shield); i++) {
      ctx.fillStyle = '#7ad0ff';
      ctx.fillRect(120 + i * 7, 16, 5, 7);
    }
  }
  // mode label (small, top-centre) — the run is arcade-purist by default
  ctx.textAlign = 'center';
  ctx.fillStyle = world.modeKey === 'casual' ? '#7ad0ff' : '#8a97a8';
  ctx.fillText(world.modeDef.label, SIM.VIEW_W / 2, 5);
  // weapon — color-coded to the gun's OWN identity color (the same colors the
  // pickup capsules use) + a chip, so which weapon you hold reads at a glance and
  // matches the pickup you grabbed (HUD-1). Falls back to cyan if a gun lacks one.
  const wc = p.weapon.color || '#8ef0ff';
  const wname = p.weapon.name.toUpperCase();
  ctx.textAlign = 'right';
  ctx.fillStyle = wc;
  ctx.fillText(wname, SIM.VIEW_W - 6, 16);
  const nameW = ctx.measureText(wname).width;
  ctx.fillRect(SIM.VIEW_W - 6 - nameW - 9, 16, 6, 7); // identity chip left of the name
  ctx.restore();
}

// Boss HP bar (top, when the arena is active) + a brief "BOSS" callout so the
// encounter reads as staged (competitor bar: staged bosses, not bigger enemies).
// Stage-2 ATTACK CHOPPER "GUNSHIP". Blits the authored sprite (assets.get('chopper'),
// facing LEFT toward the incoming player) feet-anchored to the hitbox when loaded;
// else a procedural gunship — fuselage + cockpit + main rotor (spins on world.frame,
// deterministic) + tail boom/rotor + a chin gun. Phase-2 tints hotter. `img` may be
// the base or enraged sprite (chosen by the caller), or null/undefined.
function drawChopper(ctx, e, img, world) {
  const white = e.flash > 0;
  if (img) {
    const scale = (e.h * 1.9) / img.height; // art taller than the fuselage hitbox
    const dw = img.width * scale, dh = img.height * scale;
    const dx = e.x + e.w / 2 - dw / 2, dy = e.y + e.h / 2 - dh / 2;
    if (white) { ctx.save(); ctx.globalAlpha = 0.9; ctx.drawImage(whiteTinted(img), dx, dy, dw, dh); ctx.restore(); }
    else ctx.drawImage(img, dx, dy, dw, dh);
    return;
  }
  const { x, y, w, h } = e;
  const cx = x + w / 2, cy = y + h / 2;
  const body = white ? '#ffffff' : (e.enraged ? '#9a6a6a' : e.def.color);
  const dark = white ? '#ffffff' : (e.enraged ? '#5a3030' : '#3a4048');
  ctx.save();
  // tail boom (to the RIGHT — nose faces left toward the player) + tail rotor
  ctx.fillStyle = dark;
  ctx.fillRect(x + w * 0.62, cy - 3, w * 0.42, 6);
  ctx.fillRect(x + w + w * 0.04 - 2, cy - 9, 3, 18); // vertical tail rotor
  // fuselage (rounded) + belly
  ctx.fillStyle = body;
  ctx.fillRect(x + 4, y + 6, w * 0.72, h - 10);
  ctx.beginPath(); ctx.arc(x + 8, cy, h * 0.42, 0, TAU); ctx.fill(); // rounded nose
  ctx.fillStyle = dark;
  ctx.fillRect(x + 6, y + h - 6, w * 0.6, 3); // belly shadow / skid mount
  // cockpit glass (front-left)
  ctx.fillStyle = white ? '#ffffff' : '#bfeaff';
  ctx.beginPath(); ctx.arc(x + 12, y + 11, 4, 0, TAU); ctx.fill();
  // chin gun (points down-left toward the player below)
  ctx.strokeStyle = dark; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x + 8, y + h - 3); ctx.lineTo(x + 2, y + h + 3); ctx.stroke();
  // main rotor mast + spinning blades (deterministic: phase from world.frame)
  ctx.fillStyle = dark;
  ctx.fillRect(cx - 1, y + 1, 2, 6);
  const ph = (world.frame * 0.9) % Math.PI;
  const span = w * 0.9, sy = y + 2;
  ctx.strokeStyle = white ? '#ffffff' : 'rgba(210,220,230,0.85)';
  ctx.lineWidth = 2;
  const dxr = Math.cos(ph) * span / 2;
  ctx.beginPath(); ctx.moveTo(cx - dxr, sy); ctx.lineTo(cx + dxr, sy); ctx.stroke();
  // enrage: a hot exhaust glow at the tail
  if (e.enraged) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5 + 0.3 * Math.sin(world.frame * 0.3);
    ctx.fillStyle = '#ff5a3c';
    ctx.beginPath(); ctx.arc(x + w * 0.62, cy, 4, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function drawBossUI(ctx, world) {
  const boss = world.boss;
  if (!boss || !world.bossActive || boss.dead) return;
  const bw = SIM.VIEW_W - 80, bx = 40, by = 30;
  ctx.save();
  ctx.fillStyle = '#2a1420';
  ctx.fillRect(bx - 1, by - 1, bw + 2, 8);
  const frac = Math.max(0, boss.hp) / boss.def.hp;
  ctx.fillStyle = boss.enraged ? '#ff2a2a' : '#ff4d6d'; // bar runs hotter in phase 2
  ctx.fillRect(bx, by, bw * frac, 6);
  ctx.fillStyle = '#ffd166';
  ctx.font = '7px monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText(boss.def.name.toUpperCase() + (boss.enraged ? ' — ENRAGED' : ''), SIM.VIEW_W / 2, by - 2);
  if (world.bossCallout > 0) {
    ctx.globalAlpha = Math.min(1, world.bossCallout / 20);
    ctx.fillStyle = '#ff4d6d';
    ctx.font = '20px monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText('BOSS', SIM.VIEW_W / 2, SIM.VIEW_H / 2 - 30);
  }
  if (world.enrageFlash > 0) {
    ctx.globalAlpha = Math.min(1, world.enrageFlash / 25);
    ctx.fillStyle = '#ff3a3a';
    ctx.font = '18px monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText('ENRAGED!', SIM.VIEW_W / 2, SIM.VIEW_H / 2 - 30);
  }
  ctx.restore();
}

let titleBlink = 0;
// Arcade title / start screen (live only — headless never enters 'title').
function drawTitle(ctx, world) {
  titleBlink++;
  const cx = SIM.VIEW_W / 2;
  ctx.save();
  ctx.fillStyle = 'rgba(4,8,14,0.5)'; // lighter scrim so the live attract demo shows through
  ctx.fillRect(0, 0, SIM.VIEW_W, SIM.VIEW_H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // title
  ctx.fillStyle = '#ffe36e';
  ctx.font = '22px monospace';
  ctx.fillText('RUN & GUN', cx, 70);
  ctx.font = '8px monospace';
  ctx.fillStyle = '#8ef0ff';
  ctx.fillText('· A CONTRA-LINEAGE VERTICAL SLICE ·', cx, 92);
  // HI-SCORE on the attract screen (arcade "beat your best" hook) — persisted
  // best across runs (main.js localStorage). 0 until a run ends with a score.
  ctx.font = '9px monospace';
  ctx.fillStyle = '#ffd23c';
  ctx.fillText('HI-SCORE  ' + String(world.highScore || 0).padStart(6, '0'), cx, 110);
  // mode select
  const arcade = world.modeKey === 'arcade';
  ctx.font = '9px monospace';
  ctx.fillStyle = arcade ? '#ffd166' : '#5b6b7a';
  ctx.fillText((arcade ? '▶ ' : '  ') + 'ARCADE', cx - 46, 138);
  ctx.fillStyle = !arcade ? '#7ad0ff' : '#5b6b7a';
  ctx.fillText((!arcade ? '▶ ' : '  ') + 'CASUAL', cx + 52, 138);
  ctx.fillStyle = '#8a97a8';
  ctx.font = '7px monospace';
  ctx.fillText('1 / 2 select mode', cx, 154);
  ctx.fillText(arcade ? 'one hit = one life — the 1987 way'
    : 'shield + extra lives', cx, 166);
  // blinking start prompt
  if (Math.floor(titleBlink / 30) % 2 === 0) {
    ctx.fillStyle = '#ffffff';
    ctx.font = '11px monospace';
    ctx.fillText(isTouchUI() ? 'TAP TO START' : 'PRESS  Z / SPACE  TO START', cx, 200);
  }
  ctx.restore();
}

function drawOverlays(ctx, world) {
  if (world.status === 'title') { drawTitle(ctx, world); return; }
  // PAUSED (live only): dim the frozen scene + a centered PAUSED banner with the
  // resume hint. Drawn during 'playing' since pause doesn't change world.status.
  if (world.paused) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, SIM.VIEW_W, SIM.VIEW_H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cx = SIM.VIEW_W / 2, cy = SIM.VIEW_H / 2;
    ctx.font = '16px monospace';
    ctx.fillStyle = '#8ef0ff';
    ctx.fillText('PAUSED', cx, cy - 6);
    ctx.font = '8px monospace';
    ctx.fillStyle = '#cfe';
    ctx.fillText(isTouchUI() ? 'tap ❚❚ to resume' : 'press P to resume', cx, cy + 12);
    ctx.restore();
    return;
  }
  if (world.status === 'playing') return;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, SIM.VIEW_W, SIM.VIEW_H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cx = SIM.VIEW_W / 2, cy = SIM.VIEW_H / 2;
  ctx.font = '16px monospace';
  ctx.fillStyle = world.status === 'cleared' ? '#7CFC7C' : '#ff6b6b';
  ctx.fillText(world.status === 'cleared' ? 'STAGE CLEAR' : 'GAME OVER', cx, cy - 24);
  // Final SCORE — the arcade payoff (Contra shows your score on clear/game-over).
  ctx.font = '10px monospace';
  ctx.fillStyle = '#ffe36e';
  ctx.fillText('SCORE ' + String(world.score).padStart(6, '0'), cx, cy - 8);
  // HI-SCORE / new-record flourish — the "beat your best" hook. When this run set
  // a new record, celebrate it in place of the plain HI line (blinks via frame).
  const hi = world.highScore || 0;
  if (world.newHigh) {
    ctx.font = '9px monospace';
    ctx.fillStyle = '#ffd23c'; // celebratory gold (end screen is static; no blink)
    ctx.fillText('★ NEW HIGH SCORE ★', cx, cy + 5);
  } else {
    ctx.font = '8px monospace';
    ctx.fillStyle = '#8a97a8';
    ctx.fillText('HI ' + String(hi).padStart(6, '0'), cx, cy + 5);
  }
  // Cleared a stage with another to go → offer CONTINUE (player-initiated advance,
  // main.js). Otherwise (game over, or final clear) the usual restart prompt.
  ctx.font = '8px monospace';
  if (world.status === 'cleared' && world.hasNextStage) {
    ctx.fillStyle = '#7CFC7C';
    ctx.fillText(isTouchUI() ? 'TAP TO CONTINUE  ▶  STAGE 2' : 'press N to continue  ▶  STAGE 2', cx, cy + 20);
  } else {
    ctx.fillStyle = '#fff';
    ctx.fillText(isTouchUI() ? 'TAP TO RESTART' : 'press R to restart', cx, cy + 20);
  }
  // Game-over / stage-clear is the natural verdict moment (feedback/FINDINGS.md):
  // surface the creator-approval panel so it's discoverable, not F-key-only.
  // Desktop only (the panel + F key are the desktop creator's channel).
  if (!isTouchUI()) {
    ctx.font = '7px monospace';
    ctx.fillStyle = '#8ef0ff';
    ctx.fillText('press F to rate this build', cx, cy + 33);
  }
  ctx.restore();
}
