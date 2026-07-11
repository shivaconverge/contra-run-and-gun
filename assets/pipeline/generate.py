#!/usr/bin/env python3
"""Generative pixel-art sprite pipeline for the Contra-like game.

Produces REAL pixel-art sprite sheets via the PixelLab REST API, then
post-processes them into an engine-loadable atlas:

  generate -> background-strip -> palette-lock -> trim -> pack-strip -> manifest

Design goals
------------
* Deterministic & cheap: every API result is cached to disk under
  ``assets/pipeline/.cache/`` keyed by (endpoint, request-body hash + seed).
  Re-running the script never re-spends credits for an unchanged job -- delete
  the cache entry (or bump the seed) to regenerate.
* Metered spend: prints the balance before/after and refuses to run if the
  balance is below ``MIN_BALANCE_USD``.
* Engine-friendly output: each animation is a single horizontal strip PNG plus
  frame rectangles recorded in ``assets/manifest.json``.

Requires: PIXELLAB_API_KEY in the environment, Pillow.
See STYLE.md for the (currently ASSUMED) art-direction contract.
"""
from __future__ import annotations

import base64
import hashlib
import io
import json
import os
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

from PIL import Image, ImageChops

API_BASE = "https://api.pixellab.ai/v1"
ROOT = Path(__file__).resolve().parent.parent          # assets/
CACHE = Path(__file__).resolve().parent / ".cache"
SPRITES = ROOT / "sprites"
MANIFEST = ROOT / "manifest.json"
# Engine static-server asset root -- the browser fetches from here (see
# game/data/assets.js ASSET_MANIFEST). The pipeline syncs QA-PASS sprites into
# it so the source-of-truth (assets/sprites) and the engine copy never drift.
GAME_ASSETS = ROOT.parent / "game" / "assets"
MIN_BALANCE_USD = 0.20

# Engine world scale (confirmed against game/data/config.js + render.js, 2026-07-09):
#   player hitbox 12x20 px in a 480x270 logical view; render.js drawPlayerSprite
#   scales the sprite to p.h*1.4 = 28 px tall (nearest-neighbour, smoothing off).
# So sprites must be authored at NATIVE display resolution -- ~32 px tall -- not
# up-authored on a 64 px canvas and destructively decimated (scale 0.5) at draw
# time. Generating at 32x32 keeps the on-screen scale a gentle ~0.9x and the
# pixels uniform / Contra-crisp.
PLAYER_NATIVE = 32
PLAYER_HITBOX = {"w": 12, "h": 20}
VIEW = {"w": 480, "h": 270}


def sync_to_engine(src: Path) -> None:
    """Copy a QA-PASS sprite into the engine's static asset root."""
    GAME_ASSETS.mkdir(parents=True, exist_ok=True)
    dst = GAME_ASSETS / src.name
    dst.write_bytes(src.read_bytes())
    print(f"  synced -> {dst.relative_to(ROOT.parent)}")


# --------------------------------------------------------------------------- #
# HTTP
# --------------------------------------------------------------------------- #
def _key() -> str:
    k = os.environ.get("PIXELLAB_API_KEY", "").strip()
    if not k:
        sys.exit("PIXELLAB_API_KEY not set in environment.")
    return k


def _req(method: str, path: str, body: dict | None = None, timeout: int = 180) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        f"{API_BASE}{path}",
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {_key()}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")[:500]
        raise RuntimeError(f"{method} {path} -> HTTP {e.code}: {detail}") from None


def balance() -> float:
    return float(_req("GET", "/balance").get("usd", 0.0))


# --------------------------------------------------------------------------- #
# Cache
# --------------------------------------------------------------------------- #
def _cache_path(tag: str, body: dict) -> Path:
    h = hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()[:16]
    CACHE.mkdir(parents=True, exist_ok=True)
    return CACHE / f"{tag}_{h}.json"


def _post_cached(path: str, body: dict, tag: str) -> dict:
    cp = _cache_path(tag, body)
    if cp.exists():
        print(f"  cache hit  {tag} ({cp.name})")
        return json.loads(cp.read_text())
    print(f"  API call   {tag} ...", flush=True)
    t0 = time.time()
    out = _req("POST", path, body)
    cp.write_text(json.dumps(out))
    print(f"  API done   {tag} in {time.time()-t0:.1f}s")
    return out


# --------------------------------------------------------------------------- #
# Image helpers
# --------------------------------------------------------------------------- #
def _decode(b64: str) -> Image.Image:
    if b64.startswith("data:"):
        b64 = b64.split(",", 1)[1]
    return Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGBA")


def _encode(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


def strip_background(img: Image.Image, thresh: int = 12) -> Image.Image:
    """Flood-fill transparency from the border colour.

    PixelLab's ``no_background`` already returns alpha; this is a belt-and-braces
    pass that also knocks out a solid matte if one survives.
    """
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    # If any border pixel is already transparent, assume alpha is authoritative.
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    if any(c[3] < 250 for c in corners):
        return img
    bg = corners[0][:3]
    seen = set()
    stack = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
    while stack:
        x, y = stack.pop()
        if (x, y) in seen or not (0 <= x < w and 0 <= y < h):
            continue
        seen.add((x, y))
        r, g, b, a = px[x, y]
        if a == 0 or max(abs(r - bg[0]), abs(g - bg[1]), abs(b - bg[2])) <= thresh:
            px[x, y] = (r, g, b, 0)
            stack.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])
    return img


def palette(img: Image.Image) -> list[str]:
    img = img.convert("RGBA")
    counts = img.getcolors(maxcolors=1 << 20) or []
    cols = {}
    for n, (r, g, b, a) in counts:
        if a >= 8:
            cols[(r, g, b)] = cols.get((r, g, b), 0) + n
    ordered = sorted(cols, key=lambda c: -cols[c])
    return ["#%02x%02x%02x" % c for c in ordered]


def content_bbox(frames: list[Image.Image]) -> tuple[int, int, int, int]:
    """Union bbox of non-transparent content across all frames (keeps alignment)."""
    box = None
    for f in frames:
        b = f.convert("RGBA").getchannel("A").getbbox()
        if b is None:
            continue
        box = b if box is None else (
            min(box[0], b[0]), min(box[1], b[1]),
            max(box[2], b[2]), max(box[3], b[3]),
        )
    return box


def warm_clamp(img: Image.Image) -> Image.Image:
    """Remove cool (pink/magenta/purple) casts so FX stay a warm Contra palette.

    pixflux gives explosion flames hot-pink corona edges (B channel elevated above
    G). Clamping blue down to the green level turns pink -> red/orange while leaving
    genuinely warm pixels (B<=G), grey smoke and white (R≈G≈B) essentially
    untouched. Deterministic; preserves the good frame SHAPES (no re-prompt).
    """
    img = img.convert("RGBA")
    r, g, b, a = img.split()
    # new_b = min(b, g) implemented via ImageChops.darker
    from PIL import ImageChops
    b2 = ImageChops.darker(b, g)
    return Image.merge("RGBA", (r, g, b2, a))


def center_frames(frames: list[Image.Image], pad: int = 2) -> list[Image.Image]:
    """Co-register frames so their content centroids share one canvas centre.

    Kills the frame-to-frame centroid DRIFT of independently-generated explosion
    stages (parent flagged this): a radial blast should stay anchored and grow
    from a fixed point, not jump around.
    """
    metas = []  # (frame, cx, cy, bbox)
    for f in frames:
        f = f.convert("RGBA")
        bb = f.getchannel("A").getbbox()
        if bb is None:
            metas.append((f, f.width / 2, f.height / 2, (0, 0, f.width, f.height)))
            continue
        # alpha-weighted centroid within the bbox (mass centre of the blast)
        crop = f.crop(bb)
        ax = ay = tot = 0.0
        px = crop.getchannel("A").load()
        for yy in range(crop.height):
            for xx in range(crop.width):
                w = px[xx, yy]
                if w:
                    ax += (bb[0] + xx) * w
                    ay += (bb[1] + yy) * w
                    tot += w
        cx = ax / tot if tot else (bb[0] + bb[2]) / 2
        cy = ay / tot if tot else (bb[1] + bb[3]) / 2
        metas.append((f, cx, cy, bb))
    # canvas large enough to hold every frame's content around a shared centre
    half_w = max(max(cx - bb[0], bb[2] - cx) for _, cx, _, bb in metas)
    half_h = max(max(cy - bb[1], bb[3] - cy) for _, _, cy, bb in metas)
    W = int(2 * half_w) + 2 * pad
    H = int(2 * half_h) + 2 * pad
    out = []
    for f, cx, cy, _ in metas:
        canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        canvas.alpha_composite(f, (round(W / 2 - cx), round(H / 2 - cy)))
        out.append(canvas)
    return out


def multipuff_composite(cell: Image.Image, lobes) -> Image.Image:
    """Turn a single-burst FX frame into a billowing MULTI-LOBE cluster by
    lightening in scaled+offset copies of ITSELF, staying inside the cell bounds.

    Why: dim-2 (hit feedback) pinnacle headroom in reference/SCORECARD.md is
    "multi-puff explosion DENSITY" (Blazing Chrome / Metal Slug billow vs our single
    round burst). Single-prompt pixflux drifts to a bonfire / over-symmetric shape
    (cycle 28 experiment); compositing the ORGANIC burst shape that already reads
    well is the reliable route. Lobes overlap the main mass (small offsets, larger
    secondary scale) so there is no detached-ejecta flicker at 18fps. Per-lobe
    (scale, dx, dy). ImageChops.lighter keeps overlaps bright & additive-looking and
    preserves alpha; anything pushed past the edge is simply clipped (contract-safe:
    the cell size is unchanged, so the 4x28x40 frame contract holds exactly).
    """
    base = cell.convert("RGBA")
    for s, dx, dy in lobes:
        w = max(1, int(base.width * s)); h = max(1, int(base.height * s))
        small = base.resize((w, h), Image.NEAREST)
        layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
        layer.alpha_composite(small, (dx, dy))
        base = ImageChops.lighter(base, layer)
    return base


def apply_multipuff_strip(path, frame_w: int, frame_h: int, per_frame) -> None:
    """Rewrite a packed FX strip IN PLACE, applying multipuff_composite to each cell
    with that cell's lobe list. Frame dims are preserved, so the manifest/engine
    contract is untouched. per_frame[i] = list of (scale, dx, dy) lobes for frame i.
    """
    from PIL import Image as _I
    strip = _I.open(path).convert("RGBA")
    n = strip.width // frame_w
    out = _I.new("RGBA", strip.size, (0, 0, 0, 0))
    for i in range(n):
        cell = strip.crop((i * frame_w, 0, (i + 1) * frame_w, frame_h))
        lobes = per_frame[i] if i < len(per_frame) else []
        out.alpha_composite(multipuff_composite(cell, lobes), (i * frame_w, 0))
    out.save(path)


# Per-frame lobe recipe for the explosion (tuned by looking at the 28x40 cells,
# cycle 29): ignition light touch; peak fireball two connected lobes; flame+smoke
# a rising secondary puff; smoke a billowing offset puff. Verified a clear multi-
# puff-density gain over the single burst without detached ejecta.
EXPLOSION_MULTIPUFF = [
    [(0.50, 9, 0)],
    [(0.72, -4, -4), (0.66, 4, -1)],
    [(0.64, -5, -5), (0.54, 4, 2)],
    [(0.64, -4, -4), (0.56, 5, 0)],
]


def tighten_palette(im: Image.Image, min_count: int = 3) -> Image.Image:
    """Snap rare anti-aliasing speckle (colours on < min_count opaque px) to the
    nearest DOMINANT colour, enforcing the STYLE-BIBLE limited-palette rule.

    pixflux edges carry many 1-2px near-duplicate AA colours that soften the
    pixel-art read. Remapping only the rare speckle to the nearest frequent colour
    crisps the edges WITHOUT touching the meaningful shading (verified by looking,
    cycle 20 -- most visible on the grunt; neutral-or-better on the rest). Applied
    to character/enemy/boss/pickup sprites; NOT to FX (soft additive gradients) or
    tiles (intentional pebble/mineral speckle). Deterministic.
    """
    im = im.convert("RGBA")
    px = list(im.getdata())
    cols = {}
    for r, g, b, a in px:
        if a >= 128:
            cols[(r, g, b)] = cols.get((r, g, b), 0) + 1
    keep = [c for c, k in cols.items() if k >= min_count]
    rare = [c for c, k in cols.items() if k < min_count]
    if not keep or not rare:
        return im
    remap = {c: min(keep, key=lambda p: (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2
                                         + (p[2] - c[2]) ** 2) for c in rare}
    out = []
    for r, g, b, a in px:
        if a >= 128 and (r, g, b) in remap:
            nr, ng, nb = remap[(r, g, b)]
            out.append((nr, ng, nb, a))
        else:
            out.append((r, g, b, a))
    ni = Image.new("RGBA", im.size)
    ni.putdata(out)
    return ni


def pack_strip(frames: list[Image.Image], out: Path, tighten: bool = False,
               cell: tuple[int, int] | None = None) -> dict:
    """Trim frames to a common content bbox, lay them out in a horizontal strip.

    tighten=True snaps AA speckle to the dominant palette (character/enemy/boss/
    pickup sprites); leave False for FX + tiles where fine colour variation is
    intentional.

    cell=(fw,fh) FORCES a fixed frame-cell size instead of the content bbox. This is
    the DROP-IN lever for a multi-frame sprite whose slice geometry the engine
    HARDCODES (render.js PLAYER_RUN {fw,fh}): the strip must be exactly fw*n wide or
    the engine mis-slices it (blit-meta gate). Content is bottom-CENTRE anchored in
    the cell (feet on the floor, matching drawPlayerSprite's feet-anchored draw), so a
    slightly-larger regenerated body stays a byte-compatible drop-in with NO engine
    change. Overflow is clipped symmetrically; use only when the clip is verified
    lossless by looking (else keep honest dims and coordinate the engine geometry).
    """
    if tighten:
        frames = [tighten_palette(f) for f in frames]
    box = content_bbox(frames)
    if box:
        frames = [f.crop(box) for f in frames]
    if cell:
        fw, fh = cell
        fitted = []
        for f in frames:
            c = Image.new("RGBA", (fw, fh), (0, 0, 0, 0))
            dx = (fw - f.width) // 2          # horizontal centre
            dy = fh - f.height               # bottom (feet) anchored
            c.paste(f, (dx, dy), f)          # paste clips overflow (neg offset ok)
            fitted.append(c)
        frames = fitted
    else:
        fw = max(f.width for f in frames)
        fh = max(f.height for f in frames)
    strip = Image.new("RGBA", (fw * len(frames), fh), (0, 0, 0, 0))
    rects = []
    for i, f in enumerate(frames):
        strip.paste(f, (i * fw, 0))
        rects.append({"x": i * fw, "y": 0, "w": fw, "h": fh})
    out.parent.mkdir(parents=True, exist_ok=True)
    strip.save(out)
    return {"frameWidth": fw, "frameHeight": fh, "frames": rects, "image": strip}


# --------------------------------------------------------------------------- #
# Generators
# --------------------------------------------------------------------------- #
def gen_pixflux(description: str, size: int, seed: int, tag: str,
                palette_lock: list | None = None,
                init_image: Image.Image | None = None,
                init_strength: int = 180) -> Image.Image:
    body = {
        "description": description,
        "image_size": {"width": size, "height": size},
        "no_background": True,
        "seed": seed,
    }
    if palette_lock:
        body["color_image"] = {"type": "base64", "base64": palette_lock}
    if init_image is not None:
        # anchor to an existing sprite (e.g. the base boss) so a variant stays the
        # SAME character; higher init_strength = closer to the anchor.
        body["init_image"] = {"type": "base64", "base64": _encode(init_image)}
        body["init_image_strength"] = init_strength
    out = _post_cached("/generate-image-pixflux", body, tag)
    return strip_background(_decode(out["image"]["base64"]))


def gen_pixflux_wh(description: str, w: int, h: int, seed: int, tag: str) -> Image.Image:
    """Non-square pixflux gen (transparent). For WIDE background scenery strips that a
    square canvas can't frame (a distant mountain range / skyline). Proven usable by
    looking (experiments/backgrounds/): pixflux renders detailed distant silhouettes at
    ~128x56 far better than the engine's procedural sine-band."""
    body = {
        "description": description,
        "image_size": {"width": w, "height": h},
        "no_background": True,
        "seed": seed,
    }
    out = _post_cached("/generate-image-pixflux", body, tag)
    return strip_background(_decode(out["image"]["base64"]))


# --------------------------------------------------------------------------- #
# Ground tileset (FID-5, reference/teardowns/environment-tileset-bar.md).
# Authored on a 16px grid per the bar; generated at 32px (pixflux native
# density, fully opaque -- a fill fills the frame so no_background removes
# nothing), then nearest-downscaled to 16px. OPAQUE (ground is not see-through):
# we deliberately DO NOT strip_background here. Packed into a horizontal tilesheet
# whose cells the engine can index (tile i at x=i*16). Roles are declared in the
# manifest so the engine maps cap->surface row, fill*->body (randomised for the
# bar's "tiles don't visibly loop" variation).
TILE_PX = 16
TILE_SPECS = [
    {"name": "cap", "role": "surface", "seed": 40,
     "prompt": "jungle ground surface top tile, bright green grass highlighted "
     "top edge with a few short grass blades, dark brown soil body underneath, "
     "earthy, chunky pixel art, seamless horizontal tile"},
    {"name": "dirt", "role": "fill", "seed": 41,
     "prompt": "seamless dirt and rock ground fill texture, dark brown packed "
     "earth with small grey pebbles and tiny yellow mineral speckle, three tone "
     "values, chunky pixel art, no character"},
    # NOTE: the 2nd fill variant `dirt2` is NOT generated -- ASSESS-3 found the
    # pixflux "dark packed earth" roll produced one big light CLOD that, checker-
    # boarded with `dirt`, read as a repeating face motif in-engine. It is now
    # DERIVED from `dirt` (circular offset + re-stipple) so it is the same
    # material/tone with a different pebble arrangement -> variation without a
    # visible repeat, and guaranteed cohesion. See run() and QA-NOTES.md.
]


def night_tint(im: Image.Image, sat: float = 0.6, bright: float = 0.72) -> Image.Image:
    """Desaturate + darken a tile for the NIGHT palette (the engine picked this muted
    water read over the bright cyan to sit right in the dark scene, cycle 42/45)."""
    from PIL import ImageEnhance
    rgb = ImageEnhance.Color(im.convert("RGB")).enhance(sat)
    rgb = ImageEnhance.Brightness(rgb).enhance(bright)
    out = rgb.convert("RGBA"); out.putalpha(255)
    return out


# Creator #1 bridge-over-water THEME tiles — WIRED (engine drawBridge/drawWater blit
# assets.get('theme_bridge'/'theme_water'/'theme_water_top'), render.js:213/214/320).
# Reproduces byte-identically to the shipped tiles (verified cycle 45). Water uses the
# NIGHT-muted variant the engine selected. gen_tile tags are `tile_{name}` (cached).
THEME_TILE_SPECS = [
    {"key": "theme_bridge", "name": "bridge_v2", "seed": 62, "night": False,
     "prompt": "elevated metal bridge span segment, riveted steel girder walkway, flat "
     "grey deck plate on top, dark cross-beam truss structure visible below the deck, "
     "industrial, chunky 16-bit pixel art, seamless horizontal tile"},
    {"key": "theme_water", "name": "water", "seed": 61, "night": True,
     "prompt": "deep blue water surface, gentle rippling waves with lighter cyan "
     "highlight flecks, seamless horizontal water tile, chunky 16-bit pixel art"},
    {"key": "theme_water_top", "name": "water_top", "seed": 63, "night": True,
     "prompt": "water surface edge tile, top row bright cyan-white foam ripple line, "
     "deep blue water below, seamless horizontal, chunky 16-bit pixel art"},
]


def gen_tile(spec: dict) -> Image.Image:
    """Generate one OPAQUE 16px ground tile (32px native -> downscale)."""
    body = {
        "description": spec["prompt"],
        "image_size": {"width": 32, "height": 32},
        "no_background": True,
        "seed": spec["seed"],
    }
    out = _post_cached("/generate-image-pixflux", body, f"tile_{spec['name']}")
    im = _decode(out["image"]["base64"]).convert("RGBA")
    # force fully opaque (fills are not see-through) then downscale to the grid
    im.putalpha(255)
    return im.resize((TILE_PX, TILE_PX), Image.NEAREST)


def cap_bevel(im: Image.Image) -> Image.Image:
    """Give the grass cap tile a chunky *surface* read (ASSESS-3 fix #1): a bright
    highlight on the very top grass row and a distinct dark under-lip band at the
    bottom, so the cap reads as a lit surface block with depth instead of a flat
    green line over uniform dirt."""
    import numpy as np
    a = np.array(im.convert("RGBA"), dtype=np.int16)
    h = a.shape[0]
    # top highlight: lift the top 1px row toward light (sunlit grass tips)
    a[0, :, :3] = np.clip(a[0, :, :3] * 1.35 + 26, 0, 255)
    # dark under-lip: the bottom 2px rows go to a deep shadow so the block's base
    # edge separates from the fill tiles stacked beneath it.
    a[h - 2, :, :3] = (a[h - 2, :, :3] * 0.45).clip(0, 255)
    a[h - 1, :, :3] = (a[h - 1, :, :3] * 0.30).clip(0, 255)
    return Image.fromarray(a.astype("uint8"), "RGBA")


def enhance_dirt(im: Image.Image, seed: int, contrast: float = 1.4,
                 speckle: tuple | None = None) -> Image.Image:
    """Denser, higher-contrast fill (ASSESS-3 fix #2). Contrast-stretch the base
    texture, then stipple deterministic higher-contrast detail keyed to a fixed seed
    so the tile is reproducible and stays horizontally tileable (no edge pixels
    touched).

    speckle = (dark, mid, light) RGB triple, tuned PER BIOME so the anti-repeat/
    density stipple stays ON-palette (brown pebbles on jungle dirt, but ice-blue on
    snow, molten-orange on foundry, etc.). Defaults to the jungle browns for
    backward-compatibility with the stage-1 `tiles` sheet."""
    import numpy as np
    from PIL import ImageEnhance
    im = ImageEnhance.Contrast(im.convert("RGBA")).enhance(contrast)
    a = np.array(im, dtype=np.uint8)
    h, w = a.shape[:2]
    rng = np.random.default_rng(seed)
    dark, mid, light = speckle or ((26, 18, 12), (92, 70, 46), (210, 168, 74))
    for color, n in ((dark, 16), (mid, 12), (light, 6)):
        ys = rng.integers(1, h - 1, n)   # keep 1px border clean for tiling
        xs = rng.integers(1, w - 1, n)
        for y, x in zip(ys, xs):
            a[y, x, :3] = color
    return Image.fromarray(a, "RGBA")


def pack_tiles(tiles: list[Image.Image], out: Path) -> dict:
    """Lay 16px tiles in a horizontal sheet; return per-tile rects."""
    n = len(tiles)
    sheet = Image.new("RGBA", (TILE_PX * n, TILE_PX), (0, 0, 0, 0))
    rects = []
    for i, t in enumerate(tiles):
        sheet.paste(t, (i * TILE_PX, 0))
        rects.append({"x": i * TILE_PX, "y": 0, "w": TILE_PX, "h": TILE_PX})
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)
    return {"tileSize": TILE_PX, "rects": rects}


# --------------------------------------------------------------------------- #
# PER-STAGE BIOME TILESET RECIPE  (deliverable #2 — the SCALING ENGINE)
# --------------------------------------------------------------------------- #
# The engine's config.js THEMES registry declares a `tileset: 'theme_<id>'` key for
# every one of the 7 stages (jungle/cascade/snow/desert/foundry/caverns/fortress) but
# render.js "currently draws the jungle tiles for all stages" (config.js:283) — the
# per-biome tileset ART does not exist yet. This recipe closes that gap: from a compact
# THEME SPEC it produces a distinct biome tileset in the EXACT SAME format as the
# stage-1 `tiles` sheet (48x16, three 16px tiles [cap@0, dirt@16, dirt2@32]) so the
# engine swap is a one-liner: assets.get('tiles') -> assets.get(world.theme.tileset),
# identical slicing (render.js TILES rects unchanged).
#
# Consistency-vs-distinct (strategy obs_consistency_vs_distinct_tension): every biome
# SHARES the coherent style via TILE_STYLE_BASE (chunky 16-bit, bold outline, three
# tone values, seamless) + the SAME cap_bevel/enhance_dirt/dirt2-derive pipeline; each
# is made DISTINCT by biome-specific material nouns + a palette keyed to that theme's
# config `ground`/`accent`. The dirt `speckle` triple is tuned per biome so the anti-
# repeat stipple stays on-palette (ice-blue on snow, molten-orange on foundry, ...).
TILE_STYLE_BASE = (", three tone values, chunky 16-bit pixel art, bold near-black "
                   "outline, seamless horizontal tile, no character, no creature")

BIOME_TILESETS = {
    # id must match config.js THEMES keys. cap = lit surface top; dirt = body fill;
    # speckle = (dark, mid, light) RGB for the on-palette density stipple.
    "cascade": {
        "cap_seed": 301, "dirt_seed": 401, "dirt2_seed": 451,
        "speckle": ((22, 38, 50), (74, 110, 126), (120, 196, 208)),
        "cap": ("wet concrete dam walkway surface top tile, blue-grey weathered "
                "concrete deck with a teal-green moss highlight along the top edge, "
                "damp riveted metal trim"),
        "dirt": ("wet blue-grey concrete and riveted steel dam-wall fill texture, "
                 "dark vertical seams, small teal water-stain flecks"),
    },
    "snow": {
        # v2 (cycle: biome-recipe): v1 (seeds 302/402) leaned into dark rock shadow —
        # 24% near-black voids broke the seamless snow-ground read. Re-tuned to a
        # BRIGHT full-coverage snow/ice fill + lower contrast (1.4 default deepened the
        # darks). Verified by looking that the black voids are gone.
        "cap_seed": 312, "dirt_seed": 412, "dirt2_seed": 462, "contrast": 1.12,
        "speckle": ((96, 128, 158), (168, 196, 220), (224, 240, 250)),
        "cap": ("seamless solid snow and ice ground surface top tile, bright white "
                "packed snow covering the whole top edge to edge, pale ice-blue "
                "shading, a few tiny icicles, fully covered, no dark gaps"),
        "dirt": ("seamless solid packed snow and pale blue ice ground fill, bright "
                 "white and light ice-blue covering the whole tile edge to edge, "
                 "subtle ice cracks, no dark holes, no deep shadow"),
    },
    "desert": {
        "cap_seed": 303, "dirt_seed": 403, "dirt2_seed": 453,
        "speckle": ((92, 66, 30), (156, 116, 58), (232, 196, 112)),
        "cap": ("sun-baked desert sandstone ledge surface top tile, bright golden "
                "sand crest with wind ripples along the top edge, tan sandstone body "
                "underneath"),
        "dirt": ("tan sandstone and packed sand fill texture, warm gold and ochre "
                 "bands, small dark pebble flecks"),
    },
    "foundry": {
        "cap_seed": 304, "dirt_seed": 404, "dirt2_seed": 454,
        "speckle": ((26, 20, 22), (86, 80, 86), (255, 124, 60)),
        "cap": ("riveted iron foundry catwalk surface top tile, dark gunmetal steel "
                "plate deck with a glowing molten-orange hot edge along the top, "
                "industrial bolts"),
        "dirt": ("dark riveted iron and steel plating fill texture, gunmetal grey "
                 "panels with bolt studs and a few glowing molten-orange cracks"),
    },
    "caverns": {
        "cap_seed": 305, "dirt_seed": 405, "dirt2_seed": 455,
        "speckle": ((30, 24, 52), (92, 72, 124), (196, 148, 224)),
        "cap": ("crystal cavern rock ledge surface top tile, dark purple stone with "
                "glowing violet crystal shards clustered along the top edge"),
        "dirt": ("dark purple cavern rock fill texture, deep violet stone with small "
                 "glowing lavender crystal flecks"),
    },
    "fortress": {
        "cap_seed": 306, "dirt_seed": 406, "dirt2_seed": 456,
        "speckle": ((34, 20, 26), (92, 56, 64), (255, 92, 112)),
        "cap": ("fortress stone battlement surface top tile, dark grey-red carved "
                "stone block deck with a red banner-cloth trim highlight along the "
                "top edge, riveted metal"),
        "dirt": ("dark stone fortress wall fill texture, grey-red carved blocks with "
                 "mortar seams and small red rivet flecks"),
    },
}


def gen_theme_tileset(theme_id: str, spec: dict) -> dict:
    """Produce ONE biome's 48x16 [cap,dirt,dirt2] tileset PNG from a THEME SPEC.

    Same pipeline as run()'s stage-1 tiles (pixflux 32px opaque -> 16px downscale ->
    cap_bevel / enhance_dirt with the biome speckle -> dirt2 DERIVED from dirt by
    offset+re-stipple to kill a repeating-clod motif -> pack_tiles). Writes to
    assets/sprites/theme_<id>.png. Returns a manifest-ready tileset record."""
    from PIL import ImageChops
    cap_raw = gen_tile({"name": f"{theme_id}_cap", "seed": spec["cap_seed"],
                        "prompt": spec["cap"] + TILE_STYLE_BASE})
    dirt_raw = gen_tile({"name": f"{theme_id}_dirt", "seed": spec["dirt_seed"],
                         "prompt": spec["dirt"] + TILE_STYLE_BASE})
    ctr = spec.get("contrast", 1.4)   # per-biome (snow lowers it to avoid dark voids)
    cap = cap_bevel(cap_raw)
    dirt = enhance_dirt(dirt_raw, seed=spec["dirt_seed"], contrast=ctr,
                        speckle=spec["speckle"])
    dirt2 = enhance_dirt(ImageChops.offset(dirt_raw, 7, 5), contrast=ctr,
                         seed=spec["dirt2_seed"], speckle=spec["speckle"])
    out = SPRITES / f"theme_{theme_id}.png"
    tpack = pack_tiles([cap, dirt, dirt2], out)
    sync_to_engine(out)   # engine keys theme_<id> in assets.js (WIRED, commit 41e9563)
    meta = [("cap", "surface"), ("dirt", "fill"), ("dirt2", "fill")]
    return {
        "image": f"sprites/theme_{theme_id}.png",
        "type": "tileset",
        "tileSize": tpack["tileSize"],
        "tiles": [{"name": n, "role": r, **tpack["rects"][i]}
                  for i, (n, r) in enumerate(meta)],
        "note": (f"biome tileset for the '{theme_id}' stage (config THEMES.{theme_id}."
                 f"tileset). Drop-in same format as `tiles`; engine swaps "
                 f"assets.get('tiles') -> assets.get(world.theme.tileset)."),
    }


def gen_biome_tilesets(only: str | None = None) -> None:
    """Deliverable #2 FAST ITERATOR: regenerate one/all per-stage biome tilesets
    without a full run(). Writes assets/sprites/theme_<id>.png (synced to game/assets
    via gen_theme_tileset) + a fragment assets/pipeline/biome-tilesets.json for review.

    NOW FINALIZED + WIRED (commit 41e9563): the engine keys theme_<id> in
    game/data/assets.js and render.js drawGround blits assets.get(world.theme.tileset).
    The canonical manifest.json entries are produced by run() (fold-in, section 5c) so
    the full pipeline reproduces every shipped tileset; this command is just the quick
    per-biome loop (e.g. `biomes snow` to re-tune one). See READY-TO-WIRE.md."""
    bal0 = balance()
    print(f"Balance: ${bal0:.2f}")
    if bal0 < MIN_BALANCE_USD:
        sys.exit(f"Balance below ${MIN_BALANCE_USD}; aborting.")
    SPRITES.mkdir(parents=True, exist_ok=True)
    ids = [only] if only else list(BIOME_TILESETS)
    frag = {}
    for tid in ids:
        if tid not in BIOME_TILESETS:
            sys.exit(f"unknown biome '{tid}'; known: {', '.join(BIOME_TILESETS)}")
        print(f"[biome] {tid} tileset (48x16 [cap,dirt,dirt2])")
        frag[f"theme_{tid}"] = gen_theme_tileset(tid, BIOME_TILESETS[tid])
    fragpath = Path(__file__).resolve().parent / "biome-tilesets.json"
    fragpath.write_text(json.dumps({"sprites": frag}, indent=2))
    print(f"Wrote {fragpath.name} ({len(frag)} biome tileset(s))")
    bal1 = balance()
    print(f"Balance: ${bal1:.2f}  (spent ${bal0 - bal1:.2f})")


# --------------------------------------------------------------------------- #
# PER-STAGE SET-DRESSING PROPS  (deliverable #2 — the next art class after tilesets)
# --------------------------------------------------------------------------- #
# The GOAL wants each stage to have "its own set-dressing"; the creator's ROUND-1 note
# was literally "background looks very simple". Right now the biome distinctness is the
# tileset + a PROCEDURAL parallax band (render.js drawParallax recolours 2 sine-band
# silhouettes off world.theme.back) -- no generated decoration in the playfield. This
# recipe adds the missing class: one SIGNATURE prop per biome, a transparent free-
# standing pixel-art object the engine can place on the ground line for readable, biome-
# specific dressing (snow pine, desert cactus, foundry vat, cavern crystal, ...).
#
# ROUGH PASS (proportional to confidence): one prop per biome PROVES the recipe scales
# 1->7 and reads distinct-yet-coherent, WITHOUT mass-producing a guessed-size set before
# the engine's placement hook (a level `decor:[{x,key,...}]` array + a render blit) is
# confirmed. Authored transparent at a per-prop native size (props are taller than the
# 32px character tier -- a tree ~56px). Feet/base-anchored: the engine sits the prop's
# BOTTOM on the ground y. Same coherent style discipline as the tilesets (bold outline,
# chunky, on the biome's config palette). STAGED (fragment + assets/sprites, NOT manifest
# /game-assets) until the engine adds the decor hook -- keeps the contract gate green.
PROP_STYLE_BASE = (", single object centered, transparent background, no ground, no "
                   "character, bold near-black outline, chunky 16-bit pixel art, "
                   "high contrast, clear readable silhouette, side view")

SET_DRESSING = {
    # biome id -> signature prop {name, size, seed, prompt}. Palette keyed to the
    # biome's config THEMES ground/accent so props sit in their scene.
    "cascade": {"name": "valve", "size": 48, "seed": 511,
                "prompt": "a rusty industrial pipe junction with a large round red "
                "valve wheel and riveted blue-grey steel pipes, teal water stains, "
                "standing on the ground"},
    "snow":    {"name": "pine", "size": 56, "seed": 512,
                "prompt": "a tall snow-laden evergreen pine tree, dark green needles "
                "heavy with bright white snow, thin brown trunk, cold winter"},
    "desert":  {"name": "cactus", "size": 56, "seed": 513,
                "prompt": "a tall green saguaro desert cactus with two raised arms and "
                "small spines, warm sun-lit, standing in sand"},
    "foundry": {"name": "vat", "size": 48, "seed": 514,
                "prompt": "a heavy riveted dark steel industrial smelting vat brimming "
                "with glowing molten-orange metal, gunmetal grey, hot glow"},
    "caverns": {"name": "crystal", "size": 52, "seed": 515,
                "prompt": "a cluster of tall glowing violet-purple crystal shards "
                "growing up from a dark rock base, luminous lavender"},
    "fortress":{"name": "brazier", "size": 48, "seed": 516,
                "prompt": "a dark iron fortress brazier fire-basket on a stand with "
                "bright orange-red flames, grey-red stone base, riveted metal"},
}


def gen_set_dressing(only: str | None = None) -> None:
    """Deliverable #2 set-dressing driver: produce one signature transparent prop per
    biome (real PixelLab pixflux), staged for the engine's placement hook.

    Writes assets/sprites/decor_<biome>_<name>.png + a fragment set-dressing.json with
    manifest-ready records (key `decor_<biome>_<name>`, native frame dims, base-anchored
    note). NOT synced to game/assets or manifest.json -- there is no engine decor hook
    yet, so shipping would trip the cross-source gate (orphan). Same produce-ahead-of-
    wire pattern the biome tilesets used before the engine wired them. RESUMABLE: every
    API result is cached immediately, so a re-run after any interruption costs $0 and
    picks up where it left off (mitigates the full-kit-gen timeout risk)."""
    bal0 = balance()
    print(f"Balance: ${bal0:.2f}")
    if bal0 < MIN_BALANCE_USD:
        sys.exit(f"Balance below ${MIN_BALANCE_USD}; aborting.")
    SPRITES.mkdir(parents=True, exist_ok=True)
    ids = [only] if only else list(SET_DRESSING)
    frag = {}
    for tid in ids:
        if tid not in SET_DRESSING:
            sys.exit(f"unknown biome '{tid}'; known: {', '.join(SET_DRESSING)}")
        spec = SET_DRESSING[tid]
        key = f"decor_{tid}_{spec['name']}"
        print(f"[decor] {tid}: {spec['name']} ({spec['size']}px native)")
        im = gen_pixflux(spec["prompt"] + PROP_STYLE_BASE, spec["size"],
                         seed=spec["seed"], tag=key)
        pack = pack_strip([im], SPRITES / f"{key}.png", tighten=True)
        frag[key] = {
            "image": f"sprites/{key}.png",
            "type": "decor",
            "biome": tid,
            "frameWidth": pack["frameWidth"],
            "frameHeight": pack["frameHeight"],
            "frames": pack["frames"],
            "anchor": "bottom-center",
            "note": (f"biome set-dressing prop for '{tid}'. Base-anchored: engine sits "
                     f"the prop BOTTOM on the ground y. Place via a level "
                     f"decor:[{{x, key:'{key}', parallax?}}] array + a render blit."),
        }
    fragpath = Path(__file__).resolve().parent / "set-dressing.json"
    fragpath.write_text(json.dumps({"sprites": frag}, indent=2))
    print(f"Wrote {fragpath.name} ({len(frag)} prop(s))")
    bal1 = balance()
    print(f"Balance: ${bal1:.2f}  (spent ${bal0 - bal1:.2f})")


# --------------------------------------------------------------------------- #
# PER-STAGE BACKGROUND PARALLAX ART  (deliverable #2 — "background layers")
# --------------------------------------------------------------------------- #
# render.js drawParallax is EXPLICITLY a "Procedural placeholder for the environment
# until authored background art lands" -- it recolours shared sine-band silhouettes off
# world.theme.back. The creator's ROUND-1 note was "background looks very simple". This
# recipe produces the authored art the engine is waiting for: one detailed DISTANT-
# SCENERY far-layer strip per biome, a transparent silhouette (sky area = alpha) the
# engine blits at the far parallax rate (drawParallax camx*0.15) over the sky gradient.
#
# PROVEN by looking (experiments/backgrounds/snow_far_strip): pixflux renders a detailed
# snow-capped mountain range + pine treeline at 128x56 -- far richer than the sine-band.
# So the wide-strip approach WORKS (a "hazy/flat" prompt gave a featureless band -> the
# prompt must name concrete distant landmarks). Authored transparent + wide (128x56) so
# the engine tiles it horizontally at the far rate; a per-biome palette keyed to config
# THEMES.back ridge colours keeps it coherent. Scope: the FAR layer only (the biggest
# fidelity carrier) -- the engine can keep its procedural near/canopy/foliage bands; a
# near-layer strip is an obvious follow-up. STAGED (fragment + assets/sprites, NOT
# manifest/game-assets) until the engine adds a background-image blit hook.
BG_STYLE_BASE = (", distant background scenery silhouette, two-to-three tone values, "
                 "misty and hazy, flat, chunky pixel art, bold outline, no characters, "
                 "no foreground, no ground line")
BG_W, BG_H = 128, 56

BIOME_BACKDROPS = {
    # biome id -> {seed, scene}. Scene must name CONCRETE distant landmarks (a vague
    # "hazy flat" prompt renders a featureless band -- verified by looking).
    "cascade": {"seed": 621, "scene": "seamless tileable horizontal strip of a distant "
        "concrete dam wall and industrial water towers with cascading blue-grey "
        "waterfalls, teal mist"},
    "snow":    {"seed": 622, "scene": "seamless tileable horizontal strip of a distant "
        "mountain range, jagged snow-capped blue-grey peaks with a dark pine treeline "
        "at the base"},
    "desert":  {"seed": 623, "scene": "seamless tileable horizontal strip of distant "
        "desert mesas and sandstone buttes with rolling dunes, warm tan and gold, a "
        "faint pyramid"},
    "foundry": {"seed": 624, "scene": "seamless tileable horizontal strip of a distant "
        "industrial skyline, dark steel smokestacks and factory towers with glowing "
        "molten-orange windows and rising smoke"},
    "caverns": {"seed": 625, "scene": "seamless tileable horizontal strip of a distant "
        "underground cavern wall, dark purple rock spires and hanging stalactites with "
        "glowing violet crystal veins"},
    "fortress":{"seed": 626, "scene": "seamless tileable horizontal strip of a distant "
        "dark fortress skyline, grey-red castle towers battlements and spires with red "
        "banners against a smoky sky"},
}


def gen_biome_backdrops(only: str | None = None) -> None:
    """Deliverable #2 background driver: produce one detailed far-layer parallax scenery
    strip per biome (real PixelLab pixflux, 128x56 transparent), staged for the engine's
    background-image blit hook. Writes assets/sprites/bg_<biome>.png + a fragment
    backgrounds.json. Same produce-ahead-of-wire pattern as tilesets/decor (kept out of
    manifest/game-assets so the contract gate stays green). RESUMABLE via the cache."""
    bal0 = balance()
    print(f"Balance: ${bal0:.2f}")
    if bal0 < MIN_BALANCE_USD:
        sys.exit(f"Balance below ${MIN_BALANCE_USD}; aborting.")
    SPRITES.mkdir(parents=True, exist_ok=True)
    ids = [only] if only else list(BIOME_BACKDROPS)
    frag = {}
    for tid in ids:
        if tid not in BIOME_BACKDROPS:
            sys.exit(f"unknown biome '{tid}'; known: {', '.join(BIOME_BACKDROPS)}")
        spec = BIOME_BACKDROPS[tid]
        key = f"bg_{tid}"
        print(f"[backdrop] {tid} far-layer ({BG_W}x{BG_H})")
        im = gen_pixflux_wh(spec["scene"] + BG_STYLE_BASE, BG_W, BG_H,
                            seed=spec["seed"], tag=key)
        # DO NOT trim/pack: a background strip must keep its full authored width so it
        # tiles horizontally on a fixed period; content sits transparent above the ridge.
        out = SPRITES / f"{key}.png"
        im.save(out)
        frag[key] = {
            "image": f"sprites/{key}.png",
            "type": "background",
            "biome": tid,
            "layer": "far",
            "frameWidth": im.width,
            "frameHeight": im.height,
            "parallax": 0.15,   # mirrors render.js drawParallax far-ridge rate
            "anchor": "horizon",
            "note": (f"biome far-parallax scenery for '{tid}'. Blit tiled horizontally "
                     f"at camx*0.15 over the sky gradient, ridge base ~y=158 "
                     f"(drawParallax far-ridge). Transparent above the silhouette."),
        }
    fragpath = Path(__file__).resolve().parent / "backgrounds.json"
    fragpath.write_text(json.dumps({"sprites": frag}, indent=2))
    print(f"Wrote {fragpath.name} ({len(frag)} backdrop(s))")
    bal1 = balance()
    print(f"Balance: ${bal1:.2f}  (spent ${bal0 - bal1:.2f})")


def gen_anim_text(description: str, action: str, ref: Image.Image,
                  seed: int, tag: str, n_frames: int = 4) -> list[Image.Image]:
    body = {
        "description": description,
        "action": action,
        "image_size": {"width": 64, "height": 64},
        "reference_image": {"type": "base64", "base64": _encode(ref)},
        "n_frames": n_frames,
        "seed": seed,
    }
    out = _post_cached("/animate-with-text", body, tag)
    return [strip_background(_decode(im["base64"])) for im in out["images"]]


# --------------------------------------------------------------------------- #
# Player run cycle via /animate-with-skeleton (cycle 7). Replaces the QA-FAILED
# /animate-with-text attempt (OPEN ISSUE #1: motion-blur + drift). Skeleton poses
# give explicit per-frame leg control with NO motion smear, and color_image
# (=idle) forces palette consistency so the commando is identical frame-to-frame.
# The endpoint takes exactly 3 pose skeletons + the reference image. Poses are a
# punchier v2 run gait: two wide contact strides + one upright passing frame; we
# loop them [contactL, pass, contactR, pass] into a 4-beat cycle. Coords are
# NORMALISED (0..1). Tuned + eyeballed at display scale, see QA-NOTES.md cycle 7.
RUN_POSES = [   # (lKneeX,lKneeY,lFootX,lFootY, rKneeX,rKneeY,rFootX,rFootY, bob, leanX, armDX)
    (0.62, 0.66, 0.74, 0.84, 0.40, 0.72, 0.24, 0.94,  0.00, 0.02,  0.02),  # contact: left fwd
    (0.50, 0.74, 0.44, 0.96, 0.58, 0.60, 0.60, 0.74, -0.04, 0.00, -0.02),  # passing: knee high
    (0.40, 0.72, 0.24, 0.94, 0.62, 0.66, 0.74, 0.84,  0.00, 0.02,  0.02),  # contact: right fwd
]
_RUN_UPPER = ["NOSE", "LEFT EYE", "RIGHT EYE", "LEFT EAR", "RIGHT EAR", "NECK",
              "LEFT SHOULDER", "RIGHT SHOULDER", "LEFT ELBOW", "RIGHT ELBOW",
              "LEFT ARM", "RIGHT ARM", "LEFT HIP", "RIGHT HIP"]
_RUN_ARMS = {"LEFT ELBOW", "LEFT ARM", "RIGHT ELBOW", "RIGHT ARM"}


def estimate_skeleton(img: Image.Image, tag: str) -> dict:
    """Estimate the humanoid skeleton of `img`; return {label: {x,y,z_index}}."""
    body = {"image": {"type": "base64", "base64": _encode(img)}}
    out = _post_cached("/estimate-skeleton", body, tag)
    return {k["label"]: k for k in out["keypoints"]}


def gen_run_cycle(idle_raw: Image.Image) -> list[Image.Image]:
    """3 skeleton-posed run frames -> a 4-beat loop [contactL, pass, contactR, pass]."""
    base = estimate_skeleton(idle_raw, "player_idle_skeleton")
    frames_kp = []
    for (lkx, lky, lfx, lfy, rkx, rky, rfx, rfy, bob, lean, adx) in RUN_POSES:
        kp = []
        for lbl in _RUN_UPPER:
            b = base[lbl]
            x = b["x"] + lean + (adx if lbl in _RUN_ARMS else 0)
            kp.append({"x": min(1.0, max(0.0, x)), "y": max(0.0, b["y"] + bob),
                       "label": lbl, "z_index": b.get("z_index", 0)})
        kp += [{"x": lkx, "y": lky, "label": "LEFT KNEE", "z_index": 0},
               {"x": lfx, "y": lfy, "label": "LEFT LEG", "z_index": -1},
               {"x": rkx, "y": rky, "label": "RIGHT KNEE", "z_index": 0},
               {"x": rfx, "y": rfy, "label": "RIGHT LEG", "z_index": -1}]
        frames_kp.append(kp)
    body = {
        "image_size": {"width": PLAYER_NATIVE, "height": PLAYER_NATIVE},
        "reference_image": {"type": "base64", "base64": _encode(idle_raw)},
        "color_image": {"type": "base64", "base64": _encode(idle_raw)},  # lock palette
        "skeleton_keypoints": frames_kp,
        "view": "side", "direction": "east",
        "guidance_scale": 5.5, "seed": 7,
    }
    out = _post_cached("/animate-with-skeleton", body, "player_run_skel_v2")
    f = [strip_background(_decode(im["base64"])) for im in out["images"]]
    return [f[0], f[1], f[2], f[1]]   # symmetric 4-beat loop


# READY (dim-1 lever) — a 6-frame run cycle, art-side DE-RISKED and proven by looking
# (cycle 36 candidate: experiments/run-6frame/, 6 distinct clean palette-locked poses).
# NOT wired into run() and NOT shipped: activating it needs the engine to bump
# render.js:31 PLAYER_RUN.frames 4->6 AND fix the :825 frame-select step (2pi/frames),
# else the strip is mis-sliced (my blit-meta gate enforces this). See READY-TO-WIRE.md
# lever 1. When greenlit: swap gen_run_cycle -> gen_run_cycle6 in run(), repack
# sprites.player.animations.run at 6 frames, sync. The /animate-with-skeleton 3-pose
# cap means 2 calls (poses 0-2, then 3-5 which mirror 0-2 by swapping L/R legs).
RUN_POSES_6 = [   # finer stride than RUN_POSES (3): contact/push/pass x2
    (0.62, 0.66, 0.74, 0.84, 0.40, 0.72, 0.24, 0.94,  0.00, 0.02,  0.02),  # contactL
    (0.55, 0.70, 0.60, 0.92, 0.50, 0.64, 0.42, 0.80, -0.02, 0.01,  0.00),  # pushL / R lifting
    (0.50, 0.74, 0.44, 0.96, 0.58, 0.60, 0.60, 0.74, -0.04, 0.00, -0.02),  # passing (R knee high)
    (0.40, 0.72, 0.24, 0.94, 0.62, 0.66, 0.74, 0.84,  0.00, 0.02,  0.02),  # contactR  (mirror 0)
    (0.50, 0.64, 0.42, 0.80, 0.55, 0.70, 0.60, 0.92, -0.02, 0.01,  0.00),  # pushR      (mirror 1)
    (0.58, 0.60, 0.60, 0.74, 0.50, 0.74, 0.44, 0.96, -0.04, 0.00, -0.02),  # passing2   (mirror 2)
]


def gen_run_cycle6(idle_raw: Image.Image) -> list[Image.Image]:
    """6 skeleton-posed run frames (denser stride) via TWO /animate-with-skeleton
    calls (endpoint caps at 3 poses/call). Same reference+color=idle palette lock as
    gen_run_cycle. Returns [f0..f5] for a 6-frame loop. Gated on the engine change
    above — do not call from run() until PLAYER_RUN.frames is 6."""
    base = estimate_skeleton(idle_raw, "player_idle_skeleton")

    def _kp(pose):
        lkx, lky, lfx, lfy, rkx, rky, rfx, rfy, bob, lean, adx = pose
        kp = []
        for lbl in _RUN_UPPER:
            b = base[lbl]
            x = b["x"] + lean + (adx if lbl in _RUN_ARMS else 0)
            kp.append({"x": min(1.0, max(0.0, x)), "y": max(0.0, b["y"] + bob),
                       "label": lbl, "z_index": b.get("z_index", 0)})
        kp += [{"x": lkx, "y": lky, "label": "LEFT KNEE", "z_index": 0},
               {"x": lfx, "y": lfy, "label": "LEFT LEG", "z_index": -1},
               {"x": rkx, "y": rky, "label": "RIGHT KNEE", "z_index": 0},
               {"x": rfx, "y": rfy, "label": "RIGHT LEG", "z_index": -1}]
        return kp

    def _call(poses, tag):
        body = {
            "image_size": {"width": PLAYER_NATIVE, "height": PLAYER_NATIVE},
            "reference_image": {"type": "base64", "base64": _encode(idle_raw)},
            "color_image": {"type": "base64", "base64": _encode(idle_raw)},
            "skeleton_keypoints": [_kp(p) for p in poses],
            "view": "side", "direction": "east", "guidance_scale": 5.5, "seed": 7,
        }
        out = _post_cached("/animate-with-skeleton", body, tag)
        return [strip_background(_decode(im["base64"])) for im in out["images"]]

    return _call(RUN_POSES_6[:3], "run6_a_v1") + _call(RUN_POSES_6[3:], "run6_b_v1")


# --------------------------------------------------------------------------- #
# Jobs -- what to produce this run. Extend here; caching makes it idempotent.
# --------------------------------------------------------------------------- #
# Locked after a native-scale candidate bake-off (2026-07-09): this prompt+seed
# produced the most readable, highest-contrast silhouette at the engine's 28px
# display size -- judged by eye, raw + engine-sim + real in-engine render (see
# QA-NOTES.md). Bright tan bare arms against the dark backdrop are what make the
# hero pop; keep them explicit.
# WEAPONLESS hero body (creator round-2 fix — CREATOR_FEEDBACK.md §"ROUND 2"). The
# armed idle held "a rifle at his side pointing right"; combined with the engine's
# procedural aiming gun (render.js drawGun) that put TWO guns on screen (the creator's
# "second gun at the waist"). render.js:1169 explicitly waits for "weaponless hero
# sprites (same keys)" so drawGun becomes the SOLE weapon. So the hero art now carries
# NO baked weapon — just the body; the engine draws the one aiming rifle at the hands
# (gx=x+w/2, gy=y+h*0.28). Prompt+seed LOCKED after a 4-candidate bake-off judged by
# looking (experiments/weaponless/: hero_A..D) — hero_C won: cleanest 19-colour read,
# unmistakably unarmed, classic Contra proportions, clear silhouette for /estimate-
# skeleton (the run cycle derives from it).
STYLE = (
    "classic Contra arcade commando hero, muscular, bright tan bare muscular "
    "arms, blue tank top, red headband, dark green combat pants, brown boots, "
    "both arms extended straight forward to the right with empty open hands "
    "gripping nothing, unarmed, no weapon no gun no rifle, side view facing "
    "right, bold black outline, high contrast, saturated palette, clear "
    "readable silhouette, full body standing"
)
IDLE_SEED = 212

# Prone/duck frame (cycle 8). Gameplay-critical: the Stage-1 SENTINEL boss fires
# chest-height cannon volleys the player must go PRONE to duck (config.js proneH=11,
# level1 boss note). render.js drawProne is a procedural placeholder awaiting this.
# A low, flat lying-prone commando aiming right, palette-locked to the idle so it
# is the same character. Picked candidate A over a too-tall kneel by looking.
# WEAPONLESS (same round-2 fix): the prone body must not carry a rifle either, or the
# procedural drawGun re-introduces the two-gun defect while ducking. Arms propped on
# elbows, empty hands. Seed re-locked to 33 after looking (31 leaked a barrel silhouette).
PRONE_SEED = 33
PRONE_PROMPT = (
    "classic Contra arcade commando lying prone flat on the ground propped on his "
    "elbows, empty hands no weapon no gun no rifle, red headband, blue tank top, "
    "bare tan muscular arms, very low flat horizontal silhouette, side view, bold "
    "black outline, high contrast"
)

# Jump/leap frame (cycle 10). Arcade §2 signature airborne pose. drawPlayer
# currently falls back to the standing IDLE sprite when airborne (not grounded) --
# a real fidelity gap during the constant jumping of a run-and-gun. A compact
# airborne leap that aims the rifle forward (jump-and-gun), palette-locked to the
# idle so it's the same commando. Picked candidate A (compact forward-aim leap)
# over an extended lunge by looking. Pixflux won't curl a true somersault ball;
# a multi-frame spinning somersault is optional polish (see QA-NOTES.md).
JUMP_SEED = 61
JUMP_PROMPT = (
    "classic Contra arcade commando in a mid-air somersault jump, body tucked and "
    "curled into a ball, knees pulled up to chest, empty hands no weapon no gun no "
    "rifle, red headband, blue tank top, bare tan arms, compact round silhouette, "
    "side view, bold black outline, high contrast"
)

# Weapon pickup pod (cycle 12). render.js drawPickup is an explicit placeholder --
# a gold pill + the weapon LETTER (mandate: "no placeholder boxes"). Replace with
# the iconic Contra falcon-pod power-up: a golden winged pod with a dark central
# emblem window that the engine keeps overlaying the letter (S/M/L/R/F) onto.
# Picked candidate A (winged falcon) over a rounder gem-pod by looking. Pickup
# hitbox is 14x12 (entities.js); authored at 32px native, engine scales to fit.
PICKUP_SEED = 71
PICKUP_HITBOX = {"w": 14, "h": 12}
PICKUP_PROMPT = (
    "classic Contra arcade weapon power-up, a golden metallic flying falcon pod "
    "with outstretched wings and a dark round emblem window in the center, bold "
    "black outline, high contrast, pixel art icon, side view"
)

# Enemies -- display (hitbox) sizes CONFIRMED exact against game/data/config.js
# ENEMIES (2026-07-09). Authored at 32px native like the player (crisp, reusable
# source of truth) so the engine can scale them down to the hitbox like it does
# the hero. Palettes are chosen DISTINCT from the blue/tan/red-bandana hero so
# the teardown's "enemy and hero silhouettes never merge" invariant holds.
ENEMY_SPECS = {
    "grunt": {
        "seed": 3,
        "hitbox": {"w": 14, "h": 18},
        "prompt": (
            "classic Contra arcade enemy foot soldier, crimson-red military "
            "uniform and combat helmet, holding a rifle, charging to the left "
            "toward the hero, facing left, side view, bold black outline, high "
            "contrast, saturated palette, clear readable silhouette, full body "
            "standing"
        ),
    },
    # WEAPONLESS dome (creator round-2 fix). The armed turret's baked "single thick
    # cannon barrel" + the engine's rotating drawTurretBarrel = the creator's "phantom
    # turret" (two guns). render.js already draws a pixel-art-quality aiming barrel over
    # this sprite, so the art is now a BARE purple dome + base with an empty central
    # mount socket — the drawn barrel is the sole cannon. Prompt+seed = turret_A, the
    # cleaner of two candidates by looking (experiments/weaponless/turret_A|B).
    "turret": {
        "seed": 220,
        "hitbox": {"w": 18, "h": 16},
        "weaponless": True,
        "note": ("WEAPONLESS purple dome (no baked barrel) — the engine's rotating "
                 "drawTurretBarrel is the sole cannon. Fixes the CREATOR_FEEDBACK "
                 "round-2 phantom-turret (two-gun) defect. Barrel pivot is engine "
                 "data (config barrelPivotFromBottom/barrelLen), not baked in art."),
        "prompt": (
            "classic Contra arcade sentry turret base, dark purple armored "
            "rounded dome housing with no barrel and no gun, a bare bolted metal "
            "dome emplacement on a heavy riveted base plate, a small empty round "
            "socket mount in the center of the dome, menacing, side view, bold "
            "black outline, high contrast, clear readable silhouette"
        ),
    },
    # 3rd enemy (parent-confirmed content need). Adds the AERIAL threat axis the
    # roster lacked (ground grunt + fixed turret). Copper-orange metallic drone
    # with a glowing red eye -- palette-DISTINCT from hero-blue/grunt-crimson/
    # turret-purple/boss-gunmetal AND warm so it pops against the dark night-jungle
    # (a green alien would merge with the foliage -> violates the silhouette rule).
    # Faces left toward the incoming player, like the grunt. Hitbox is an ASSUMED
    # compact aerial size (16x14) until the engine adds the `flyer` kind+config.
    "flyer": {
        "seed": 102,
        "hitbox": {"w": 16, "h": 14},
        "prompt": (
            "classic Contra arcade aerial attack drone, a compact riveted "
            "copper-orange metal flying sphere with a single glowing red eye lens "
            "and a stubby cannon underneath, small angled wings, side view facing "
            "left, bold black outline, high contrast, menacing pixel art"
        ),
    },
    # 4th enemy — MORTAR emplacement (engine added the `mortar` kind: config.js
    # ENEMIES.mortar 20x12, level1 spawn @x=1040; it was rendering PROCEDURALLY —
    # a placeholder box the GOAL forbids). Fixed area-denial artillery that lobs
    # arcing shells. Palette-DISTINCT: olive-brass/military-green bunker — separate
    # from hero-blue / grunt-crimson / turret-purple / flyer-copper / boss-gunmetal,
    # and it reads on the night-jungle (brass highlights pop; the dark olive body is
    # grounded like a dug-in emplacement). SQUAT + WIDE (drawEnemySprite fits height
    # to ~e.h*1.4≈17px, so author low/wide, not tall). Static barrel angled up; the
    # engine overlays the fire telegraph on the wind-up beat.
    "mortar": {
        "seed": 202,
        "hitbox": {"w": 20, "h": 12},
        "prompt": (
            "classic Contra arcade mortar gun emplacement, squat wide olive-brass "
            "armored bunker with a short stubby thick mortar barrel angled upward "
            "to the sky, riveted metal, bolted base plate dug into the ground, "
            "low profile heavy artillery, side view, bold black outline, high "
            "contrast, clear readable silhouette"
        ),
    },
}

# Stage-1 boss (config.js boss `Sentinel`, 46x52, fires left-aimed cannon volleys;
# arcade §4: a fixed boss is the minimum that reads as Contra). Authored BIG at 64px
# native (≈ display size for the 52px hitbox) so it stays crisp. Candidate A (a
# steel gun-sentinel with a LEFT-aimed cannon barrel + glowing core) was picked over
# a twin-fist brawler by looking. render.js drawBoss is a procedural placeholder
# awaiting this; the cannon aims LEFT to match the player approaching from the left.
BOSS_SEED = 51
BOSS_NATIVE = 64
BOSS_HITBOX = {"w": 46, "h": 52}
BOSS_PROMPT = (
    "classic Contra arcade stage boss, huge menacing armored gun sentinel "
    "emplacement, heavy dark gunmetal steel hull with bolted armor plating, a "
    "massive central cannon barrel aimed to the left, glowing red core eye, red "
    "warning stripes, side view, bold black outline, high contrast, intimidating"
)
# Phase-2 ENRAGE variant (engine added a boss enrage phase, BOSS-1). Anchored to
# the base boss via init_image so it's unmistakably the SAME Sentinel, escalated:
# battle-damaged, big flaring exposed red core, red energy venting. Picked the
# init-anchored candidate A (a fresh non-anchored gen drifted off-model).
BOSS_ENRAGED_SEED = 71
BOSS_ENRAGED_PROMPT = (
    BOSS_PROMPT + ", PHASE 2 ENRAGED: battle-damaged cracked and scorched armor "
    "with glowing red-hot cracks, a huge exposed flaring red-orange core, red "
    "energy venting from the hull, furious and more menacing"
)

# READY (Stage-2 2nd boss) — the `chopper` GUNSHIP, assigned to root.C by
# content/stage2/SPEC.md §4/§6. A wide moving aerial boss, deliberately distinct from
# the tall fixed Sentinel wall-mech. Candidate proven by looking (cycle 43,
# experiments/chopper-boss/chopper_candidate.png — trimmed 76×52, faces left, gunmetal+
# red corpus palette). NOT yet in run()/manifest/assets.js: the engine hasn't added
# `ENEMIES.chopper` (config.js) nor spawned it (only content/stage2/level2.data.js
# references it, unwired), so shipping the key would fail my reachability gate. FINALIZE
# on the engine adding the chopper kind: gen_pixflux(CHOPPER_PROMPT, 80, CHOPPER_SEED)
# → pack → sync → manifest.sprites.chopper (hitbox from config, SPEC start box 64×34) →
# add `chopper` to game/data/assets.js. See READY-TO-WIRE.md.
CHOPPER_SEED = 81
CHOPPER_NATIVE = 80   # wider canvas for the wide aerial silhouette (boss is 64)
# CONFIRMED (content/stage2/WIRE.md Patch 1, cycle 47): SIM hitbox = 62x30 = the fuselage
# of the 76x52 art (rotor + tail-boom excluded from collision). Use this at finalize.
CHOPPER_HITBOX = {"w": 62, "h": 30}
CHOPPER_PROMPT = (
    "classic Contra arcade attack helicopter gunship boss, wide heavy armored aerial "
    "silhouette flying and facing left, spinning rotor blur on top, twin under-nose "
    "chin cannons pointing left, a belly bomb-bay hatch underneath, dark gunmetal steel "
    "hull with bolted plating and red warning stripes, glowing cockpit, side view, bold "
    "black outline, high contrast, intimidating, wider than tall"
)
# Phase-2 ENRAGE (optional per SPEC §6). Init-anchored to the base chopper (SAME gunship,
# escalated) exactly like boss_enraged. Candidate proven by looking (cycle 44,
# experiments/chopper-boss/chopper_enraged_candidate.png — same silhouette + glowing
# red belly ordnance/engines). Finalize alongside the base when the engine adds the kind.
CHOPPER_ENRAGED_SEED = 91
CHOPPER_ENRAGED_PROMPT = (
    CHOPPER_PROMPT + ", PHASE 2 ENRAGED: battle-damaged scorched hull, glowing red-hot "
    "engine exhausts, open belly bomb-bay hatch revealing glowing red ordnance, red "
    "energy venting, furious and more menacing"
)


# Weapon-juice FX. The competitor visual-bar teardown rates weapon juice "very
# high" and calls it the cheapest lever to close perceived-fidelity fast, favouring
# WARM muzzle-flash palettes (our Spread is cold cyan). Multi-frame strips the
# engine can blit + scale + fade on fire / enemy-death (currently plain squares +
# red particles). Authored transparent, chunky, centred; frame extents grow so
# pack_strip's common-bbox keeps them aligned.
FX_STYLE = ("16-bit arcade pixel-art effect, chunky bold pixels, high contrast, "
            "warm palette, centred, transparent background, no ground")
FX_SPECS = {
    "explosion": {
        "seed": 11,
        "size": PLAYER_NATIVE,
        "register": True,   # co-register frame centroids (kill blast drift)
        "multipuff": True,  # post-pack: composite organic multi-lobe billow (dim-2)
        "stages": [
            "small bright white-yellow spark flash, explosion igniting",
            "bright yellow and orange fireball bursting outward",
            "large orange fireball with flames and rising grey smoke",
            "fading grey smoke puff with a few dim orange embers",
        ],
    },
    "muzzle": {
        # v2: the v1 prompt ("...at a gun barrel") made pixflux draw a whole GUN.
        # The engine already draws the gun; this key must be the ISOLATED flash
        # only, horizontal, so it overlays at the muzzle tip. No gun, no barrel.
        "seed": 23,
        "size": PLAYER_NATIVE,
        "stages": [
            "isolated small yellow-white flash burst, only fire and light, no "
            "gun, no barrel, no weapon, pointing right",
            "isolated bright yellow-orange star-shaped flash burst, only fire "
            "and light, no gun, no barrel, no weapon, horizontal, pointing right",
        ],
    },
}


def gen_fx(name: str, spec: dict) -> list:
    """Generate an FX strip: one pixflux frame per stage, then post-process to a
    warm palette and (for radial blasts) centroid-register the frames.

    Quality fixes for the parent-flagged risks (cycle 4): warm_clamp removes the
    hot-pink flame edges; center_frames kills the frame-to-frame centroid drift so
    the blast stays anchored. Applied deterministically to the SAME cached frames
    (no re-prompt), so the good shapes are preserved.
    """
    frames = []
    for i, stage in enumerate(spec["stages"]):
        prompt = f"{FX_STYLE}, {stage}"
        im = gen_pixflux(prompt, spec["size"], seed=spec["seed"] + i,
                         tag=f"fx_{name}_{i}")
        frames.append(im)
    if spec.get("warm", True):
        frames = [warm_clamp(f) for f in frames]
    if spec.get("register"):
        frames = center_frames(frames)
    return frames


def run() -> None:
    bal0 = balance()
    print(f"Balance: ${bal0:.2f}")
    if bal0 < MIN_BALANCE_USD:
        sys.exit(f"Balance below ${MIN_BALANCE_USD}; aborting.")

    SPRITES.mkdir(parents=True, exist_ok=True)
    manifest = {
        "meta": {
            "generator": "pixellab:pixflux+animate-with-text",
            # Style CONFIRMED (2026-07-09, cycle 11) by direct multimodal
            # comparison against the now-landed reference corpus: the competitor
            # visual-bar (gunslugs/blazing-chrome/galuga stills) grounds fidelity,
            # and the arcade-contra-1987 Stage-1 grabs ground the nostalgic
            # identity. Our sprites read as in-lineage Contra run-and-gun and clear
            # the competitor character bar. See STYLE.md "Style verification" +
            # QA-NOTES.md cycle 11.
            "style": "corpus-confirmed: Contra-lineage (arcade-1987 feel anchor + competitor visual-bar fidelity)",
            "styleConfirmed": True,
            "styleGrounding": "corpus (arcade-1987 stage1 frames + competitor stills), verified by looking",
            "playerHitboxPx": PLAYER_HITBOX,
            "viewPx": VIEW,
            "spriteNativePx": PLAYER_NATIVE,
            # CREATOR_FEEDBACK round-2 two-gun defect fix: hero + turret sprites are
            # WEAPONLESS bodies (no baked weapon). The engine's procedural drawGun /
            # drawTurretBarrel is the SOLE weapon per entity. Same sprite keys.
            "weaponlessContract": True,
        },
        "sprites": {},
    }

    # 1) Player idle/base frame -- also the animation reference. Authored at the
    # engine's NATIVE display scale (~32 px) so render.js blits it near 1:1
    # (~0.9x) with uniform, Contra-crisp pixels -- NOT up-authored + decimated.
    print("[player] idle base (native scale)")
    idle = gen_pixflux(STYLE, PLAYER_NATIVE, seed=IDLE_SEED,
                       tag="player_idle_native")
    idle_pack = pack_strip([idle], SPRITES / "player_idle.png", tighten=True)
    sync_to_engine(SPRITES / "player_idle.png")

    # 2) Player run cycle via /animate-with-skeleton (cycle 7) -- REPLACES the
    # QA-FAILED /animate-with-text attempt (OPEN ISSUE #1: motion-blur + drift).
    # Consistent commando (palette-locked to the idle), native 32px, no smear.
    # gen_run_cycle returns a 4-beat loop [contactL, pass, contactR, pass].
    print("[player] run cycle (skeleton, native scale)")
    run_frames = gen_run_cycle(idle)
    # Pin the run to the engine's HARDCODED slice cell (render.js PLAYER_RUN {fw:22,
    # fh:31}) so the weaponless regen is a byte-compatible DROP-IN with NO engine
    # change — a larger regenerated body would otherwise mis-slice the strip (blit-meta
    # gate). Feet-anchored fit; verified the clip is lossless by looking (cycle: weapon-
    # defect). If a future gait needs more width, coordinate a PLAYER_RUN bump instead.
    ENGINE_RUN_CELL = (22, 31)
    run_pack = pack_strip(run_frames, SPRITES / "player_run.png", tighten=True,
                          cell=ENGINE_RUN_CELL)
    sync_to_engine(SPRITES / "player_run.png")

    # 2b) Prone/duck frame -- gameplay-critical for ducking the boss cannon.
    print("[player] prone frame (native scale, palette-locked)")
    prone = gen_pixflux(PRONE_PROMPT, PLAYER_NATIVE, seed=PRONE_SEED,
                        tag="player_prone", palette_lock=_encode(idle))
    prone_pack = pack_strip([prone], SPRITES / "player_prone.png", tighten=True)
    sync_to_engine(SPRITES / "player_prone.png")

    # 2c) Jump/leap frame -- airborne pose (drawPlayer falls back to idle in air).
    print("[player] jump frame (native scale, palette-locked)")
    jump = gen_pixflux(JUMP_PROMPT, PLAYER_NATIVE, seed=JUMP_SEED,
                       tag="player_jump", palette_lock=_encode(idle))
    jump_pack = pack_strip([jump], SPRITES / "player_jump.png", tighten=True)
    sync_to_engine(SPRITES / "player_jump.png")

    manifest["sprites"]["player"] = {
        "weaponless": True,
        "note": ("WEAPONLESS hero body across ALL poses (idle/run/prone/jump) — no "
                 "baked rifle. The engine's procedural drawGun (render.js) is the sole "
                 "aiming weapon, mounted at the hands (gx=x+w/2, gy=y+h*0.28). Fixes "
                 "the CREATOR_FEEDBACK round-2 two-gun defect; same sprite keys, so no "
                 "engine wiring change — dropping these in removes the second gun."),
        "animations": {
            "idle": {
                "image": "sprites/player_idle.png",
                "frameWidth": idle_pack["frameWidth"],
                "frameHeight": idle_pack["frameHeight"],
                "frames": idle_pack["frames"],
                "fps": 1, "loop": True,
            },
            # Low prone/duck silhouette. Engine drawProne is a procedural
            # placeholder -- wire it to blit this (scaled to the proneH=11 hitbox,
            # feet/belly on the floor, mirrored by facing). See QA-NOTES.md.
            "prone": {
                "image": "sprites/player_prone.png",
                "frameWidth": prone_pack["frameWidth"],
                "frameHeight": prone_pack["frameHeight"],
                "frames": prone_pack["frames"],
                "fps": 1, "loop": True,
            },
            # Airborne leap frame. Engine drawPlayer currently blits idle when
            # not grounded -- wire it to blit this when !p.grounded (mirrored by
            # facing), so the jump reads airborne. See QA-NOTES.md OPEN ISSUE #7.
            "jump": {
                "image": "sprites/player_jump.png",
                "frameWidth": jump_pack["frameWidth"],
                "frameHeight": jump_pack["frameHeight"],
                "frames": jump_pack["frames"],
                "fps": 1, "loop": True,
            },
            # Real run cycle: 4 frames, native ~22x31, palette-consistent, no
            # motion-blur. Engine should blit this (by walkPhase) when the player
            # is grounded + moving; drawPlayer currently only uses `idle` (needs
            # wiring -- see QA-NOTES.md).
            "run": {
                "image": "sprites/player_run.png",
                "frameWidth": run_pack["frameWidth"],
                "frameHeight": run_pack["frameHeight"],
                "frames": run_pack["frames"],
                "fps": 10, "loop": True,
            },
        },
    }
    # 3) Enemies -- grunt + turret, native 32px, synced for the engine to blit
    # once render.js drawEnemy is wired to consult assets (see QA-NOTES.md
    # OPEN ISSUES: enemy sprites are produced but not yet consumed by the engine).
    for kind, spec in ENEMY_SPECS.items():
        print(f"[enemy] {kind} (native scale)")
        em = gen_pixflux(spec["prompt"], PLAYER_NATIVE, seed=spec["seed"],
                         tag=f"{kind}_native")
        em_pack = pack_strip([em], SPRITES / f"{kind}.png", tighten=True)
        sync_to_engine(SPRITES / f"{kind}.png")
        manifest["sprites"][kind] = {
            "image": f"sprites/{kind}.png",
            "frameWidth": em_pack["frameWidth"],
            "frameHeight": em_pack["frameHeight"],
            "hitboxPx": spec["hitbox"],   # engine draw size (from config.js)
            **({"note": spec["note"]} if spec.get("note") else {}),
            **({"weaponless": True} if spec.get("weaponless") else {}),
            "frames": em_pack["frames"],
        }

    # 3b) Stage boss (Sentinel) -- big 64px native sprite. Synced; render.js
    # drawBoss is a procedural placeholder awaiting this (needs engine wiring to
    # blit assets.get('boss') scaled to the 46x52 hitbox, cannon facing left).
    print("[boss] Sentinel (64px native)")
    boss = gen_pixflux(BOSS_PROMPT, BOSS_NATIVE, seed=BOSS_SEED, tag="boss")
    boss_pack = pack_strip([boss], SPRITES / "boss.png", tighten=True)
    sync_to_engine(SPRITES / "boss.png")
    manifest["sprites"]["boss"] = {
        "image": "sprites/boss.png",
        "frameWidth": boss_pack["frameWidth"],
        "frameHeight": boss_pack["frameHeight"],
        "hitboxPx": BOSS_HITBOX,
        "facing": "left",   # cannon aims left toward the incoming player
        "frames": boss_pack["frames"],
    }

    # 3b-ii) Phase-2 ENRAGED boss -- same Sentinel escalated (init-anchored to the
    # base boss). Engine should swap to this during the enrage phase (BOSS-1).
    print("[boss] Sentinel ENRAGED phase-2 (init-anchored)")
    boss_rage = gen_pixflux(BOSS_ENRAGED_PROMPT, BOSS_NATIVE,
                            seed=BOSS_ENRAGED_SEED, tag="boss_enraged",
                            init_image=boss, init_strength=180)
    rage_pack = pack_strip([boss_rage], SPRITES / "boss_enraged.png", tighten=True)
    sync_to_engine(SPRITES / "boss_enraged.png")
    manifest["sprites"]["boss_enraged"] = {
        "image": "sprites/boss_enraged.png",
        "frameWidth": rage_pack["frameWidth"],
        "frameHeight": rage_pack["frameHeight"],
        "hitboxPx": BOSS_HITBOX,
        "facing": "left",
        "note": "swap in during the boss enrage/phase-2 state (same hitbox as boss)",
        "frames": rage_pack["frames"],
    }

    # 3c) Weapon pickup pod -- replaces the placeholder lettered pill (drawPickup).
    print("[pickup] weapon falcon-pod (native scale)")
    pod = gen_pixflux(PICKUP_PROMPT, PLAYER_NATIVE, seed=PICKUP_SEED, tag="pickup")
    pod_pack = pack_strip([pod], SPRITES / "pickup.png", tighten=True)
    sync_to_engine(SPRITES / "pickup.png")
    manifest["sprites"]["pickup"] = {
        "image": "sprites/pickup.png",
        "frameWidth": pod_pack["frameWidth"],
        "frameHeight": pod_pack["frameHeight"],
        "hitboxPx": PICKUP_HITBOX,
        "note": "engine overlays the per-weapon letter (S/M/L/R/F) on the dark center",
        "frames": pod_pack["frames"],
    }

    # 3d) Stage-2 2nd boss -- chopper GUNSHIP (FINALIZED + LIVE cycle 48). The engine
    # added the `chopper` kind (config/assets.js/enemy.js/world.js/render.js) and spawns
    # it in level2; drawEnemy routes kind==='chopper' through drawBoss, swapping to
    # chopper_enraged on the enrage phase. Both phases regenerate from cached gens ($0):
    # base is a wide gunmetal+red attack helicopter facing left (76x52); enraged is
    # init-anchored to it (78x51). Hitbox 62x30 = the fuselage (rotor/boom excluded).
    # This block lives in run() so the canonical pipeline reproduces the FULL shipped
    # manifest (previously chopper was finalized outside run(), so a bare run() dropped
    # it -- fixed here). See READY-TO-WIRE.md + content/stage2/WIRE.md.
    print("[boss2] chopper gunship (80px native, wide)")
    chopper = gen_pixflux(CHOPPER_PROMPT, CHOPPER_NATIVE, seed=CHOPPER_SEED,
                          tag="chopper")
    chop_pack = pack_strip([chopper], SPRITES / "chopper.png", tighten=True)
    sync_to_engine(SPRITES / "chopper.png")
    manifest["sprites"]["chopper"] = {
        "image": "sprites/chopper.png",
        "frameWidth": chop_pack["frameWidth"],
        "frameHeight": chop_pack["frameHeight"],
        "hitboxPx": CHOPPER_HITBOX,
        "frames": chop_pack["frames"],
    }
    print("[boss2] chopper ENRAGED phase-2 (init-anchored)")
    chopper_rage = gen_pixflux(CHOPPER_ENRAGED_PROMPT, CHOPPER_NATIVE,
                               seed=CHOPPER_ENRAGED_SEED, tag="chopper_enraged",
                               init_image=chopper, init_strength=180)
    chrage_pack = pack_strip([chopper_rage], SPRITES / "chopper_enraged.png",
                             tighten=True)
    sync_to_engine(SPRITES / "chopper_enraged.png")
    manifest["sprites"]["chopper_enraged"] = {
        "image": "sprites/chopper_enraged.png",
        "frameWidth": chrage_pack["frameWidth"],
        "frameHeight": chrage_pack["frameHeight"],
        "hitboxPx": CHOPPER_HITBOX,
        "frames": chrage_pack["frames"],
    }

    # 4) Weapon-juice FX -- explosion + muzzle flash strips. Synced for the engine
    # to blit on fire / enemy-death once render.js is wired to consult them (see
    # QA-NOTES.md: FX produced, engine consumption pending).
    for name, spec in FX_SPECS.items():
        print(f"[fx] {name} ({len(spec['stages'])} frames)")
        frames = gen_fx(name, spec)
        fx_pack = pack_strip(frames, SPRITES / f"{name}.png")
        if spec.get("multipuff") and name == "explosion":
            # Post-pack, per-cell: break the single burst into a billowing multi-
            # lobe cluster (dim-2 pinnacle-density). Preserves frameWidth/Height,
            # so the manifest + engine contract is unchanged. Deterministic ($0).
            apply_multipuff_strip(SPRITES / f"{name}.png",
                                  fx_pack["frameWidth"], fx_pack["frameHeight"],
                                  EXPLOSION_MULTIPUFF)
        sync_to_engine(SPRITES / f"{name}.png")
        manifest["sprites"][name] = {
            "image": f"sprites/{name}.png",
            "type": "fx",
            "frameWidth": fx_pack["frameWidth"],
            "frameHeight": fx_pack["frameHeight"],
            "frames": fx_pack["frames"],
            "fps": 18, "loop": False,
        }
        # QA preview GIF
        box = content_bbox(frames)
        prev = [f.crop(box) if box else f for f in frames]
        prev[0].save(SPRITES / f"{name}_preview.gif", save_all=True,
                     append_images=prev[1:], duration=70, loop=0, disposal=2)

    # 5) Ground tileset (FID-5). LIVE in-engine (drawGround/drawPlatform blit
    # assets.get('tiles')). ASSESS-3 refinement pass: bevel the cap so it reads as
    # a lit surface block, densify+contrast the dirt, and DERIVE dirt2 from dirt
    # (offset + re-stipple) to kill the repeating-clod motif. Sheet order stays
    # [cap, dirt, dirt2] to match the engine's TILES{cap:x0,dirt:x16,dirt2:x32}.
    from PIL import ImageChops
    print("[tiles] ground tileset (16px, ASSESS-3 refinement)")
    raw = {s["name"]: gen_tile(s) for s in TILE_SPECS}   # cap, dirt
    cap = cap_bevel(raw["cap"])
    dirt = enhance_dirt(raw["dirt"], seed=41)
    dirt2 = enhance_dirt(ImageChops.offset(raw["dirt"], 7, 5), seed=99)
    tiles = [cap, dirt, dirt2]
    tile_meta = [("cap", "surface"), ("dirt", "fill"), ("dirt2", "fill")]
    tpack = pack_tiles(tiles, SPRITES / "tiles.png")
    sync_to_engine(SPRITES / "tiles.png")
    manifest["sprites"]["tiles"] = {
        "image": "sprites/tiles.png",
        "type": "tileset",
        "tileSize": tpack["tileSize"],
        "tiles": [{"name": n, "role": r, **tpack["rects"][i]}
                  for i, (n, r) in enumerate(tile_meta)],
    }

    # 5b) Creator #1 bridge-over-water THEME tiles -- WIRED (engine drawBridge/drawWater
    # consume assets.get('theme_bridge'/'theme_water'/'theme_water_top')). One opaque
    # 16px PNG per key (the engine keyed them separately, not a sheet). Water = night-muted.
    print("[theme] bridge-over-water tiles (creator #1)")
    for s in THEME_TILE_SPECS:
        t = gen_tile({"name": s["name"], "seed": s["seed"], "prompt": s["prompt"]})
        if s["night"]:
            t = night_tint(t)
        t.save(SPRITES / f"{s['key']}.png")
        sync_to_engine(SPRITES / f"{s['key']}.png")
        manifest["sprites"][s["key"]] = {
            "image": f"sprites/{s['key']}.png",
            "type": "tileset", "tileSize": 16,
            "frameWidth": 16, "frameHeight": 16,
            "note": f"creator #1 bridge-over-water theme tile ({s['key']}); wired via "
                    f"render.js drawBridge/drawWater assets.get('{s['key']}').",
        }

    # 5c) PER-STAGE BIOME TILESETS (deliverable #2) -- FINALIZED + WIRED (the engine
    # added the theme_<id> loader keys in game/data/assets.js and render.js drawGround
    # now blits assets.get(world.theme.tileset) with the jungle `tiles` fallback, commit
    # 41e9563). Fold the 6 biome tilesets into the canonical run so manifest.json is the
    # complete shipped source of truth (previously staged in biome-tilesets.json; now
    # first-class like the chopper finalize). Each is the same 48x16 [cap,dirt,dirt2]
    # format as `tiles`; `python generate.py biomes [id]` stays the fast per-biome
    # iterator. Jungle intentionally has NO theme_jungle key (Stage 1 keeps `tiles`).
    print("[biomes] per-stage tilesets (6 biomes, 48x16 [cap,dirt,dirt2])")
    for tid, spec in BIOME_TILESETS.items():
        rec = gen_theme_tileset(tid, spec)           # writes assets/sprites + syncs
        manifest["sprites"][f"theme_{tid}"] = rec

    manifest["meta"]["knownIssues"] = [
        "boss_enraged: real phase-2 enraged Sentinel sprite produced + synced + "
        "loads, but drawBoss doesn't swap to it yet -- wire it to blit "
        "assets.get('boss_enraged') during the enrage/phase-2 state (same 46x52 "
        "hitbox, faces left) so the escalation is a visible form change, not only a "
        "red tint (see QA-NOTES.md #11).",
        "LOW/stretch (not blocking): weapon HUD icon (HUD-1, deferred pending a real "
        "icon slot -- current HUD is 8px text) and the arcade tucked-somersault jump "
        "(LEAP-1, stylistic). All other produced sprites are WIRED + LIVE.",
    ]

    # Palette recorded from the CLEAN idle art.
    manifest["meta"]["palette"] = palette(idle.crop(content_bbox([idle])))[:32]

    MANIFEST.write_text(json.dumps(manifest, indent=2))
    print(f"Wrote {MANIFEST.relative_to(ROOT.parent)}")

    # QA preview GIF for run cycle.
    if run_frames:
        box = content_bbox(run_frames)
        preview = [f.crop(box) if box else f for f in run_frames]
        (SPRITES / "player_run_preview.gif")
        preview[0].save(
            SPRITES / "player_run_preview.gif", save_all=True,
            append_images=preview[1:], duration=90, loop=0, disposal=2,
        )
        print("Wrote sprites/player_run_preview.gif")

    bal1 = balance()
    print(f"Balance: ${bal1:.2f}  (spent ${bal0 - bal1:.2f})")


def verify_contract() -> int:
    """Automated STYLE-BIBLE contract gate (no API). For every shipped sprite,
    compute MECHANICAL contract FACTS (not a fidelity verdict -- that stays the
    by-looking check) and report violations, so future content can't silently
    drift off-spec (would have caught the cycle-20 AA-palette bloat automatically).

    Checks, per asset class:
      - transparency: character/enemy/boss/pickup/FX must be background-removed
        (transparent corners); tiles must be fully OPAQUE (ground isn't see-through).
      - palette budget: character/enemy/boss/pickup opaque colours <= PALETTE_CAP
        (flags un-tightened AA bloat). FX/tiles exempt (soft gradients / texture).
      - dims: native frame <= 64px (boss tier) and matches the manifest.
      - engine sync: assets/sprites/X.png is byte-identical to game/assets/X.png.
    Returns the violation count (0 = gate green).
    """
    PALETTE_CAP = 48   # generous: characters land ~12-26, boss ~48 (64px detailed)
    manifest = json.loads(MANIFEST.read_text())
    sprites = manifest["sprites"]
    # (name, image_path, klass, frameW, frameH) -- frame dims from the manifest, NOT
    # the strip-file width (a 4-frame strip is 4*fw wide; per-FRAME is the tier check).
    items = []
    for key, spec in sprites.items():
        if "animations" in spec:
            for an, a in spec["animations"].items():
                items.append((f"{key}.{an}", a["image"], "char",
                              a.get("frameWidth"), a.get("frameHeight")))
        else:
            klass = "tile" if spec.get("tileSize") else ("fx" if spec.get("type") == "fx" else "char")
            items.append((key, spec.get("image"), klass,
                          spec.get("frameWidth"), spec.get("frameHeight")))

    viol = []
    print(f"{'asset':22}{'class':7}{'sync':6}{'transp%':8}{'colors':8}{'frame':10} verdict")
    for name, rel, klass, fw, fh in items:
        p = ROOT / rel
        gp = GAME_ASSETS / Path(rel).name
        im = Image.open(p).convert("RGBA")
        data = list(im.getdata())
        opaque_cols = len({(r, g, b) for r, g, b, a in data if a >= 128})
        trans = sum(1 for _, _, _, a in data if a == 0)
        transpct = round(100 * trans / max(1, len(data)))
        synced = gp.exists() and gp.read_bytes() == p.read_bytes()
        fdim = f"{fw}x{fh}" if fw else f"{im.width}x{im.height}"
        maxframe = max(fw or im.width, fh or im.height)
        probs = []
        if not synced:
            probs.append("UNSYNCED")
        # transparency: bg-removed sprites HAVE transparent pixels (cut-out shape);
        # a tile must be fully opaque. This is robust to tight trims (unlike corners).
        if klass == "tile":
            if trans > 0:
                probs.append(f"NOT-OPAQUE({trans}px)")
        elif trans == 0:
            probs.append("OPAQUE-BG(no transparency = bg not removed)")
        if klass == "char" and opaque_cols > PALETTE_CAP:
            probs.append(f"PALETTE>{PALETTE_CAP}({opaque_cols})")
        # per-FRAME native-tier cap. Standard sprites (char/enemy/FX/tile) author at
        # the 32/16px display tier -> <=64px. BOSS-class set-pieces are a larger tier:
        # the Sentinel is native 64, the WIDE chopper gunship is native 80 (62x30
        # fuselage hitbox + rotor/boom overhang) -> allow <=80 for boss/chopper keys.
        frame_cap = 80 if ("boss" in name or "chopper" in name) else 64
        if maxframe > frame_cap:
            probs.append(f"OVERSIZE-FRAME({fdim}>{frame_cap})")
        verdict = "OK" if not probs else "FAIL " + ",".join(probs)
        if probs:
            viol.append((name, probs))
        print(f"{name:22}{klass:7}{('yes' if synced else 'NO'):6}{str(transpct)+'%':8}"
              f"{opaque_cols:<8}{fdim:10} {verdict}")
    # --- cross-source consistency: manifest <-> engine ASSET_MANIFEST <-> shipped
    # PNGs. Catches orphan/missing/unreferenced assets so only WIRED, reachable
    # sprites ship (a real drift class as content scales). game/data/assets.js is
    # the engine's flat load map; a key with no shipped PNG loads nothing, and a
    # shipped PNG no key references is dead weight the engine never reaches.
    import re as _re
    xprob = []
    try:
        js = (ROOT.parent / "game" / "data" / "assets.js").read_text()
        eng_files = {m.group(1) for m in _re.finditer(r":\s*'assets/([\w.]+\.png)'", js)}
        shipped = {p.name for p in GAME_ASSETS.glob("*.png")}
        man_imgs = set()
        for spec in sprites.values():
            if "animations" in spec:
                man_imgs |= {Path(a["image"]).name for a in spec["animations"].values()}
            elif spec.get("image"):
                man_imgs.add(Path(spec["image"]).name)
        for f in sorted(eng_files - shipped):
            xprob.append(f"engine key -> MISSING shipped PNG: {f}")
        for f in sorted(shipped - eng_files):
            xprob.append(f"shipped PNG not referenced by engine (orphan): {f}")
        for f in sorted(eng_files - man_imgs):
            xprob.append(f"engine-referenced file not in manifest: {f}")
        print(f"\nCross-source: engine keys={len(eng_files)} shipped={len(shipped)} "
              f"manifest={len(man_imgs)} -> {'consistent' if not xprob else str(len(xprob))+' mismatch'}")
        for x in xprob:
            print(f"  MISMATCH: {x}")
    except FileNotFoundError:
        print("\nCross-source: game/data/assets.js not found (skipped)")

    # --- draw-path reachability: it is not enough for a key to be declared +
    # shipped -- render.js must actually BLIT it, else it is shipped-but-unreachable
    # (the "score the reachable graph, not just generated content" concern). A key
    # is reachable iff render.js consumes it as a literal assets.get('key') OR, for
    # an enemy kind, via the dynamic assets.get(e.kind) path (grunt/turret/flyer
    # route through e.kind, not a literal). This reads render.js/config.js (owned by
    # the engine loop) READ-ONLY to compute the fact -- it never edits them.
    rprob = []
    try:
        render_src = (ROOT.parent / "game" / "src" / "render.js").read_text()
        cfg_src = (ROOT.parent / "game" / "data" / "config.js").read_text()
        js2 = (ROOT.parent / "game" / "data" / "assets.js").read_text()
        eng_keys = {m.group(1) for m in _re.finditer(r"(\w+):\s*'assets/[\w.]+\.png'", js2)}
        literal = set(_re.findall(r"assets\.get\('([\w.]+)'\)", render_src))
        # Assets-access WRAPPERS: the engine may indirect through a local helper like
        # `const get = (k) => assets && assets.get(k)` and then call get('player_idle')
        # -- a LITERAL key reached via the wrapper, not `assets.get('literal')`. Detect
        # single-arg wrappers that forward their param straight to assets.get(), harvest
        # the literal keys passed to them, and treat the wrapper's param as a modeled arg
        # form (else its `assets.get(k)` indirection false-trips the staleness warn AND
        # every wrapper-drawn key false-fails as unreachable). Master's render.js added
        # exactly this for the weaponless `player_*_noweapon` sprites (cycle: biome-recipe).
        wrappers = _re.findall(
            r"(\w+)\s*=\s*\(\s*(\w+)\s*\)\s*=>[^\n;]*?assets\.get\(\s*\2\s*\)", render_src)
        wrapper_params = set()
        for wname, wparam in wrappers:
            wrapper_params.add(wparam)
            literal |= set(_re.findall(rf"\b{wname}\(\s*'([\w.]+)'\s*\)", render_src))
        has_dynamic_kind = "assets.get(e.kind)" in render_src
        enemies_block = cfg_src.split("ENEMIES", 1)[-1]
        enemy_kinds = set(_re.findall(r"^  (\w+):\s*\{", enemies_block, _re.M))
        # PER-STAGE BIOME TILESET path: render.js drawGround resolves the stage's biome
        # tileset via `const themeKey = world.theme.tileset; assets.get(themeKey)` (commit
        # 41e9563). The arg is a VAR, not a literal -- so model it: collect every var
        # assigned from `<x>.tileset`, and if any is passed to assets.get(), the theme
        # `tileset:'theme_<id>'` keys declared in config THEMES are reachable via that
        # path. (Same shape the engine confirmed to the parent this cycle.)
        theme_tileset_keys = set(_re.findall(r"tileset:\s*'([\w.]+)'", cfg_src))
        tileset_vars = set(_re.findall(r"(\w+)\s*=\s*[^;\n]*\.tileset\b", render_src))
        has_theme_tileset_path = any(f"assets.get({v})" in render_src
                                     for v in tileset_vars)
        # Self-grounding guard: this reachability model KNOWS only two consumption
        # forms -- a literal 'key' and the dynamic e.kind. If the engine later adds
        # ANY other dynamic argument form (a var, a lookup, fx.kind, ...), the model
        # is silently incomplete and a truly-drawn key could false-fail. So enumerate
        # every assets.get(...) arg and WARN on any form we don't model, rather than
        # assume the shape holds forever (verified sole routes = literal + e.kind,
        # cycle 26). This is not a violation (no false red) -- it's a staleness alarm.
        all_args = {a.strip() for a in _re.findall(r"assets\.get\(([^)]*)\)", render_src)}
        modeled = ({"e.kind"} | {f"'{k}'" for k in literal} | wrapper_params
                   | (tileset_vars if has_theme_tileset_path else set()))
        unmodeled = {a for a in all_args if a not in modeled}
        if unmodeled:
            print("\n  MODEL-WARN: unmodeled assets.get() arg form(s) in render.js "
                  f"-> {sorted(unmodeled)}; reachability may be incomplete "
                  "(extend the model in generate.py verify_contract).")
        for key in sorted(eng_keys):
            if key in literal or (has_dynamic_kind and key in enemy_kinds):
                continue
            if has_theme_tileset_path and key in theme_tileset_keys:
                continue   # drawn via assets.get(world.theme.tileset)
            how = "spawned-enemy-kind" if has_dynamic_kind else "no dynamic e.kind path"
            rprob.append(f"engine key '{key}' NOT blitted by render.js "
                         f"(no literal assets.get; {how}) -> shipped-but-unreachable")
        drawn = len(eng_keys) - len(rprob)
        print(f"\nDraw-reachability: {drawn}/{len(eng_keys)} engine keys reach a "
              f"render.js draw path (literal={len(literal & eng_keys)}, "
              f"dynamic-kind={'on' if has_dynamic_kind else 'off'}) -> "
              f"{'all reachable' if not rprob else str(len(rprob))+' unreachable'}")
        for r in rprob:
            print(f"  UNREACHABLE: {r}")

        # REVERSE reachability (the gap that let the `mortar` placeholder ship,
        # cycle 30): a SPAWNED enemy kind with no sprite key renders via render.js's
        # procedural fallback -> a placeholder box, which the GOAL forbids. Compute
        # spawned kinds from level1.js (type: '...') and flag any that is not keyed
        # in assets.js. `boss` is exempt (its sprite key is 'boss'/'boss_enraged',
        # not the bare kind, and drawBoss handles it) -- but a spawned boss must
        # still have the 'boss' key, which the forward check already covers.
        pprob = []
        try:
            # scan ALL shipped levels (the chopper was a level2 spawn my level1-only
            # scan missed, cycle 48 -- now covers every level*.js so a placeholder in
            # any stage is caught).
            gdata = ROOT.parent / "game" / "data"
            lvl = "".join(f.read_text() for f in sorted(gdata.glob("level*.js")))
            spawned = set(_re.findall(r"type:\s*'([a-z_]+)'", lvl))
            for kind in sorted(spawned):
                need = "boss" if kind == "boss" else kind
                if need not in eng_keys:
                    pprob.append(f"spawned enemy kind '{kind}' has NO sprite key "
                                 f"'{need}' in assets.js -> renders PROCEDURALLY "
                                 f"(placeholder box; GOAL forbids). Produce + key it.")
            print(f"No-placeholder-enemy: {len(spawned)} spawned kind(s) "
                  f"({', '.join(sorted(spawned))}) -> "
                  f"{'all have real sprites' if not pprob else str(len(pprob))+' PLACEHOLDER'}")
            for pp in pprob:
                print(f"  PLACEHOLDER: {pp}")
            rprob.extend(pprob)
        except FileNotFoundError:
            print("No-placeholder-enemy: level1.js not found (skipped)")
    except FileNotFoundError:
        print("\nDraw-reachability: render.js/config.js/assets.js not found (skipped)")

    # Blit-meta alignment: the engine HARDCODES the frame geometry it slices for the
    # multi-frame sprites (render.js PLAYER_RUN + FX{}) SEPARATELY from this manifest
    # (the source of truth). If they drift — e.g. a run re-gen changes frameWidth, or
    # a denser run bumps frames 4->6 without the engine following — the strip is
    # mis-sliced and the animation renders BROKEN (wrong frame, wrong crop). The other
    # checks won't catch it (dims/keys all look fine). So assert render.js's hardcoded
    # (fw,fh,frames) == this manifest's (frameWidth,frameHeight,#frames) for each.
    mprob = []
    try:
        rsrc = (ROOT.parent / "game" / "src" / "render.js").read_text()

        def _eng_meta(name):
            m = _re.search(name + r"\s*[:=]\s*\{[^}]*?fw:\s*(\d+)[^}]*?fh:\s*(\d+)"
                           r"[^}]*?frames:\s*(\d+)", rsrc)
            return (int(m.group(1)), int(m.group(2)), int(m.group(3))) if m else None

        def _man_meta(spec):
            return (spec["frameWidth"], spec["frameHeight"], len(spec["frames"]))

        checks = {
            "PLAYER_RUN": (_eng_meta("PLAYER_RUN"),
                           _man_meta(sprites["player"]["animations"]["run"])),
            "explosion": (_eng_meta("explosion"), _man_meta(sprites["explosion"])),
            "muzzle": (_eng_meta("muzzle"), _man_meta(sprites["muzzle"])),
        }
        oks = 0
        for label, (eng, man) in checks.items():
            if eng is None:
                mprob.append(f"blit-meta '{label}' not found in render.js "
                             "(engine slice geometry changed? re-check the parser)")
            elif eng != man:
                mprob.append(f"blit-meta DRIFT '{label}': render.js (fw,fh,frames)="
                             f"{eng} != manifest {man} -> strip mis-sliced, animation "
                             "renders broken. Align render.js to the manifest.")
            else:
                oks += 1
        print(f"\nBlit-meta alignment: {oks}/{len(checks)} multi-frame sprites match "
              f"render.js hardcoded geometry -> "
              f"{'aligned' if not mprob else str(len(mprob))+' DRIFT'}")
        for mp in mprob:
            print(f"  DRIFT: {mp}")
    except (FileNotFoundError, KeyError) as e:
        print(f"\nBlit-meta alignment: skipped ({type(e).__name__})")

    total = len(viol) + len(xprob) + len(rprob) + len(mprob)
    print(f"\nContract gate: {len(items)-len(viol)}/{len(items)} sprites pass, "
          f"{total} violation(s) (per-sprite {len(viol)} + cross-source {len(xprob)} "
          f"+ unreachable {len(rprob)} + blit-meta {len(mprob)}).")
    print("(Mechanical contract only; fidelity is the by-looking verdict, not this gate.)")
    return total


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else None
    if cmd == "verify":
        sys.exit(1 if verify_contract() else 0)
    elif cmd == "biomes":
        # produce the per-stage biome tilesets (deliverable #2). `biomes` = all 6;
        # `biomes <id>` = just that biome (e.g. `biomes snow`).
        gen_biome_tilesets(sys.argv[2] if len(sys.argv) > 2 else None)
    elif cmd == "decor":
        # produce the per-stage set-dressing props (deliverable #2). `decor` = all 6;
        # `decor <id>` = just that biome (e.g. `decor snow`). Staged for the engine hook.
        gen_set_dressing(sys.argv[2] if len(sys.argv) > 2 else None)
    elif cmd == "backdrops":
        # produce the per-stage background parallax scenery (deliverable #2). `backdrops`
        # = all 6; `backdrops <id>` = one biome. Staged for the engine bg-blit hook.
        gen_biome_backdrops(sys.argv[2] if len(sys.argv) > 2 else None)
    else:
        run()
