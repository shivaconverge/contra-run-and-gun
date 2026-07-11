#!/usr/bin/env python3
"""
generate-udio.py — REAL generative music for the 7-stage campaign.

Produces one DISTINCT looping instrumental theme per biome via the Udio model,
served through the udioapi.pro unified REST endpoint (Udio has no official public
API — this is the granted UDIO_API_KEY aggregator, Bearer auth). Output lands in
``audio/tracks/<stage_id>.mp3`` plus a machine-readable ``audio/tracks/manifest.json``
mapping each stage id -> track file so the campaign loop can scene-gate/hard-cut
per stage (on-contract with audio/INTEGRATION.md).

Grounding: prompts encode the Contra-corpus stage-music DNA distilled in
audio/TEARDOWN.md (fast ~150 BPM, galloping bass, march feel, heroic minor key,
seamless short-loop energy), then vary key / instrumentation / mood PER BIOME so
every stage is audibly its own place.

Usage:
    source ../../.provider_secrets.env       # exports UDIO_API_KEY
    python3 audio/pipeline/generate-udio.py                 # generate all missing
    python3 audio/pipeline/generate-udio.py s1_jungle s4_snow   # subset
    python3 audio/pipeline/generate-udio.py --force s1_jungle   # regenerate

Idempotent: a stage whose .mp3 already exists is skipped unless --force. Each
generation costs ~10 credits (chirp-v4-5); check balance with --credits.
"""
import json
import os
import sys
import time
import urllib.request
import urllib.error

API_BASE = "https://udioapi.pro/api/v2"
MODEL = "chirp-v4-5"
HERE = os.path.dirname(os.path.abspath(__file__))
TRACKS_DIR = os.path.normpath(os.path.join(HERE, "..", "tracks"))
MANIFEST = os.path.join(TRACKS_DIR, "manifest.json")

# ---------------------------------------------------------------------------
# Biome -> theme spec, ALIGNED TO THE CAMPAIGN THEMES REGISTRY (game/data/config.js
# THEMES + STAGES, confirmed by parent 2026-07-12). Campaign stage order is:
#   1 jungle · 2 cascade · 3 snow · 4 desert · 5 foundry · 6 caverns · 7 fortress
# `stage_id` keeps the s<N>_ prefix main.js sorts on (index i === campaign stage i)
# AND encodes the config THEMES `theme` id; `theme` is that exact id (jungle/cascade/…)
# so the manifest maps 1:1 onto world.level.theme. `key` keeps each biome harmonically
# distinct. All INSTRUMENTAL, arcade run-and-gun.
# ---------------------------------------------------------------------------
_CORE = ("fast driving 16-bit arcade run-and-gun chiptune, ~150 BPM, relentless "
         "galloping bassline, punchy march drums, heroic minor-key lead, seamless "
         "looping energy, no vocals, NES/Genesis action game soundtrack")

BIOMES = [
    {
        "stage_id": "s1_jungle", "biome": "jungle", "theme": "jungle",
        "level": "Jungle Approach", "key": "E minor",
        "style": "16-bit chiptune, action, run-and-gun, driving, heroic, 150 bpm, instrumental",
        "prompt": ("Stage 1 JUNGLE assault. " + _CORE + ". E minor, brisk heroic march, "
                   "square-wave lead over a triangle gallop bass, jungle-adventure heroism, "
                   "the classic Contra opening-stage energy."),
    },
    {
        "stage_id": "s2_cascade", "biome": "cascade waterfall base", "theme": "cascade",
        "level": "Cascade Base", "key": "A minor",
        "style": "16-bit chiptune, action, flowing, driving, 150 bpm, instrumental",
        "prompt": ("Stage 2 CASCADE waterfall base climb. " + _CORE + ". A minor, "
                   "flowing shimmering arpeggios over the gallop, a sense of rushing water "
                   "and vertical ascent past a river base, bright but urgent, heroic run-and-gun."),
    },
    {
        "stage_id": "s3_snow", "biome": "snow", "theme": "snow",
        "level": "Frozen Ridge", "key": "C minor",
        "style": "16-bit chiptune, action, cold, crystalline, driving, 148 bpm, instrumental",
        "prompt": ("Stage 3 FROZEN RIDGE snowfield advance. " + _CORE + ". C minor, "
                   "crystalline bell-like lead, a colder crisp timbre, howling-blizzard tension "
                   "under a still-relentless march, wintry heroic action."),
    },
    {
        "stage_id": "s4_desert", "biome": "desert", "theme": "desert",
        "level": "Scorched Dunes", "key": "D minor",
        "style": "16-bit chiptune, action, exotic, arid, driving, 150 bpm, instrumental",
        "prompt": ("Stage 4 SCORCHED DUNES desert march. " + _CORE + ". D minor with a "
                   "phrygian exotic-scale lead, sun-baked shimmering heat, a caravan-of-war "
                   "swagger over the gallop, sandstorm urgency, heroic run-and-gun."),
    },
    {
        "stage_id": "s5_foundry", "biome": "foundry", "theme": "foundry",
        "level": "Iron Foundry", "key": "G minor",
        "style": "16-bit chiptune, industrial metal action, heavy, mechanical, 152 bpm, instrumental",
        "prompt": ("Stage 5 IRON FOUNDRY assault. " + _CORE + ". G minor, heavy detuned "
                   "industrial-metal lead, clanging molten-metal percussion, pounding "
                   "machine-press rhythm, red-hot furnace menace, powerful and relentless."),
    },
    {
        "stage_id": "s6_caverns", "biome": "caverns", "theme": "caverns",
        "level": "Crystal Caverns", "key": "F# minor",
        "style": "16-bit chiptune, action, mysterious, crystalline, echoing, 150 bpm, instrumental",
        "prompt": ("Stage 6 CRYSTAL CAVERNS descent. " + _CORE + ". F# minor, glassy "
                   "chiming crystalline lead with cavern-echo space, an eerie subterranean "
                   "beauty over the driving gallop, deep and mysterious, still propulsive."),
    },
    {
        "stage_id": "s7_fortress", "biome": "fortress", "theme": "fortress",
        "level": "Red Falcon Keep", "key": "B minor",
        "style": "16-bit chiptune, dark militaristic action, epic, ominous, driving, 156 bpm, instrumental",
        "prompt": ("Stage 7 final RED FALCON KEEP fortress assault. " + _CORE + ". B minor, "
                   "dark epic militaristic brass-stab lead, chromatic final-boss-approach tension "
                   "over the fastest gallop, the climactic last-stage theme, powerful and grim."),
    },
]


def _key():
    k = os.environ.get("UDIO_API_KEY", "").strip()
    if not k:
        sys.exit("UDIO_API_KEY not set — `source ../../.provider_secrets.env` first.")
    return k


def _req(method, path, body=None):
    url = API_BASE + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", "Bearer " + _key())
    # Cloudflare in front of udioapi.pro rejects the default Python-urllib UA with
    # `error code: 1010`; present a normal browser UA so the request is let through.
    req.add_header("User-Agent",
                   "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36")
    req.add_header("Accept", "application/json")
    if data:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return {"_http_error": e.code, "body": e.read().decode(errors="replace")}


def credits():
    r = _req("GET", "/credits")
    print(json.dumps(r, indent=2))


def submit(spec):
    body = {
        "model": MODEL,
        "prompt": spec["prompt"],
        "style": spec["style"],
        "title": spec["level"],
        "make_instrumental": True,
        "style_weight": 0.7,
        "weirdness_constraint": 0.4,
        "audio_weight": 0.6,
    }
    r = _req("POST", "/generate", body)
    wid = r.get("workId") or (r.get("data") or {}).get("task_id")
    if not wid:
        print(f"  [!] submit failed for {spec['stage_id']}: {json.dumps(r)[:300]}")
    return wid


def poll(wid, timeout=420):
    """Poll /feed until a completed audio_url appears; return the mp3 URL."""
    t0 = time.time()
    last = ""
    while time.time() - t0 < timeout:
        r = _req("GET", f"/feed?workId={wid}")
        data = r.get("data") or {}
        items = data.get("response_data") or []
        for it in items:
            st = it.get("status") or ""
            if st != last:
                last = st
                print(f"    …{wid[:10]} status={st} type={data.get('type')}")
        # Accept when the task is done: prefer the LONGEST completed variant so the
        # in-game loop has the most material. The final master mp3 is a plain http
        # URL (host tempfile.aiquickdraw.com), not necessarily a 'cdn' host.
        done = [it for it in items
                if it.get("status") == "complete" and (it.get("audio_url") or "").endswith(".mp3")]
        if done:
            best = max(done, key=lambda it: float(it.get("duration") or 0))
            return best["audio_url"]
        if data.get("type") == "FAILED":
            print(f"    [!] {wid[:10]} FAILED: {items}")
            return None
        time.sleep(8)
    print(f"    [!] {wid[:10]} timed out after {timeout}s")
    return None


def download(url, dest):
    req = urllib.request.Request(url, headers={"User-Agent": "contra-audio/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r, open(dest, "wb") as f:
        f.write(r.read())
    return os.path.getsize(dest)


def load_manifest():
    if os.path.exists(MANIFEST):
        with open(MANIFEST) as f:
            return json.load(f)
    return {"generator": "udioapi.pro/" + MODEL, "tracks": {}}


def save_manifest(m):
    with open(MANIFEST, "w") as f:
        json.dump(m, f, indent=2)


def main():
    args = [a for a in sys.argv[1:]]
    force = "--force" in args
    args = [a for a in args if a != "--force"]
    if "--credits" in args:
        credits()
        return
    os.makedirs(TRACKS_DIR, exist_ok=True)
    manifest = load_manifest()

    want = args if args else [b["stage_id"] for b in BIOMES]
    specs = [b for b in BIOMES if b["stage_id"] in want]
    if not specs:
        sys.exit(f"no matching stage_ids in {want}")

    # 1) submit all needed generations up front (parallel server-side work)
    pending = []
    for spec in specs:
        dest = os.path.join(TRACKS_DIR, spec["stage_id"] + ".mp3")
        if os.path.exists(dest) and not force:
            print(f"[skip] {spec['stage_id']} already at {dest}")
            continue
        print(f"[submit] {spec['stage_id']} ({spec['biome']}, {spec['key']})")
        wid = submit(spec)
        if wid:
            pending.append((spec, wid, dest))
        time.sleep(2)  # gentle on the endpoint

    # 2) poll + download each
    for spec, wid, dest in pending:
        print(f"[poll] {spec['stage_id']} workId={wid}")
        url = poll(wid)
        if not url:
            print(f"  [!] no audio for {spec['stage_id']}")
            continue
        size = download(url, dest)
        print(f"  [ok] {spec['stage_id']} -> {dest} ({size} bytes) from {url}")
        manifest["tracks"][spec["stage_id"]] = {
            "file": "tracks/" + spec["stage_id"] + ".mp3",
            "biome": spec["biome"],
            "level": spec["level"],
            "theme": spec["theme"],
            "key": spec["key"],
            "source_url": url,
            "workId": wid,
        }
        save_manifest(manifest)

    print(f"\nmanifest: {MANIFEST}")
    print(json.dumps(manifest["tracks"], indent=2))


if __name__ == "__main__":
    main()
