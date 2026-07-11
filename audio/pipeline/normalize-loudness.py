#!/usr/bin/env python3
"""
normalize-loudness.py — match the 7 per-biome loops to ONE integrated loudness.

MEASURED PROBLEM: the raw/seamless tracks span ~2.2 LU of integrated loudness
(EBU R128) — foundry ≈ −12.3 LUFS vs fortress ≈ −14.5 LUFS — so the campaign's
hard-cut from stage N→N+1 produces an audible VOLUME JUMP; two tracks also peak at
0.0 dBFS (clipping risk). Consistent BGM loudness across stages is standard game-audio
practice (the player shouldn't reach for the volume knob between stages).

FIX: two-pass EBU R128 `loudnorm` with **linear=true** (a single linear gain — it does
NOT dynamically compress, so the seamless-loop trim + fades from make-seamless.py are
preserved exactly, just scaled) to a common target that every track ATTENUATES to
(so no track needs make-up gain that would clip). Overwrites audio/tracks/<id>.mp3 and
syncs game/assets/audio/. Re-verify with analyze-tracks.py + the ebur128 report below.

Pipeline order:  generate-udio.py → make-seamless.py → normalize-loudness.py → analyze-tracks.py

Usage:  python3 audio/pipeline/normalize-loudness.py            # all tracks
        python3 audio/pipeline/normalize-loudness.py s5_foundry # subset
"""
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
AUDIO_DIR = os.path.normpath(os.path.join(HERE, ".."))
TRACKS_DIR = os.path.join(AUDIO_DIR, "tracks")
SERVED_DIR = os.path.normpath(os.path.join(AUDIO_DIR, "..", "game", "assets", "audio"))
MANIFEST = os.path.join(TRACKS_DIR, "manifest.json")

# Target chosen at/below the quietest track so every track only attenuates → linear gain
# stays truly linear (no limiter fallback, no clipping). TP headroom fixes the 0 dBFS peaks.
TARGET_I = -15.0    # LUFS integrated
TARGET_TP = -1.5    # dBFS true-peak ceiling
TARGET_LRA = 11.0


def measure(path):
    """Pass 1: EBU R128 loudnorm measurement as JSON."""
    r = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", path,
         "-af", f"loudnorm=I={TARGET_I}:TP={TARGET_TP}:LRA={TARGET_LRA}:print_format=json",
         "-f", "null", "-"],
        capture_output=True, text=True)
    m = re.search(r"\{[^{}]*\"input_i\"[\s\S]*?\}", r.stderr)
    if not m:
        raise RuntimeError(f"loudnorm measure failed for {path}: {r.stderr[-300:]}")
    return json.loads(m.group(0))


def normalize(path):
    d = measure(path)
    tmp = path + ".norm.mp3"
    af = (f"loudnorm=I={TARGET_I}:TP={TARGET_TP}:LRA={TARGET_LRA}:linear=true:"
          f"measured_I={d['input_i']}:measured_TP={d['input_tp']}:"
          f"measured_LRA={d['input_lra']}:measured_thresh={d['input_thresh']}")
    r = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-y", "-i", path,
         "-af", af, "-ar", "44100", "-c:a", "libmp3lame", "-q:a", "3", tmp],
        capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"loudnorm apply failed for {path}: {r.stderr[-300:]}")
    os.replace(tmp, path)
    return float(d["input_i"])


def verify_lufs(path):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path,
                        "-af", "ebur128=peak=true", "-f", "null", "-"],
                       capture_output=True, text=True)
    I = re.findall(r"I:\s*(-?\d+\.?\d*)\s*LUFS", r.stderr)
    TP = re.findall(r"Peak:\s*(-?\d+\.?\d*)\s*dBFS", r.stderr)
    return (float(I[-1]) if I else None), (float(TP[-1]) if TP else None)


def main():
    man = json.load(open(MANIFEST))
    tracks = man["tracks"]
    want = sys.argv[1:] or list(tracks.keys())
    print(f"target I={TARGET_I} LUFS, TP={TARGET_TP} dBFS (linear gain — loop preserved)\n")
    print(f"{'id':13s}{'before_LUFS':>12s}{'after_LUFS':>11s}{'after_TP':>9s}")
    after = []
    for tid in want:
        if tid not in tracks:
            print(f"  [skip] {tid} not in manifest"); continue
        src = os.path.join(AUDIO_DIR, tracks[tid]["file"])
        before = normalize(src)
        subprocess.run(["cp", src, os.path.join(SERVED_DIR, os.path.basename(tracks[tid]["file"]))], check=True)
        li, tp = verify_lufs(src)
        after.append(li)
        tracks[tid]["loudness_lufs"] = round(li, 1)
        tracks[tid]["normalized"] = f"EBU R128 linear loudnorm to {TARGET_I} LUFS / {TARGET_TP} dBFS TP"
        print(f"{tid:13s}{before:12.1f}{li:11.1f}{tp:9.1f}")
    with open(MANIFEST, "w") as f:
        json.dump(man, f, indent=2)
    subprocess.run(["cp", MANIFEST, os.path.join(SERVED_DIR, "manifest.json")], check=True)
    if after:
        print(f"\nafter spread: {max(after) - min(after):.2f} LU (was ~2.2 LU) — "
              f"stage-to-stage volume now consistent")
    print(f"updated + synced: {MANIFEST} -> {SERVED_DIR}")


if __name__ == "__main__":
    main()
