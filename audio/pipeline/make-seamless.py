#!/usr/bin/env python3
"""
make-seamless.py — turn the raw Udio songs into SEAMLESS game loops.

MEASURED PROBLEM (audio/pipeline, this workstream): the raw generated tracks are full
songs with an outro that fades to silence, so `MusicKit` looping the whole file (loop=true)
plays music → 1.5–3.4 s of DEAD AIR → restart. That breaks the corpus's "short seamless
loop" invariant (a loop that goes silent reads as a bug, see audio/TEARDOWN.md §1).

FIX (pure post-processing of the REAL generated audio — still real generated audio, just
loop-trimmed like every shipped game loop): for each track, measure a 50 ms RMS envelope,
find the sustained-energy region (envelope ≥ frac × median), trim to it (dropping the intro
lead-in and the outro fade/silence), and apply short click-safe fades at both ends so the
loop wrap is pop-free. Overwrites audio/tracks/<id>.mp3 and syncs game/assets/audio/.

The raw Udio render stays reproducible via generate-udio.py (source_url in the manifest);
this is the deterministic post-step. Re-verify seams with the printed report + analyze-tracks.py.

Usage:  python3 audio/pipeline/make-seamless.py            # process all tracks in manifest
        python3 audio/pipeline/make-seamless.py s5_foundry # subset
"""
import json
import os
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
AUDIO_DIR = os.path.normpath(os.path.join(HERE, ".."))
TRACKS_DIR = os.path.join(AUDIO_DIR, "tracks")
SERVED_DIR = os.path.normpath(os.path.join(AUDIO_DIR, "..", "game", "assets", "audio"))
MANIFEST = os.path.join(TRACKS_DIR, "manifest.json")
SR = 44100
FRAC = 0.5          # sustained-energy threshold = FRAC × median envelope
FADE_IN = 0.010     # 10 ms — kills the wrap click on entry
FADE_OUT = 0.060    # 60 ms — eases the tail into the wrap
WIN = int(0.050 * SR)


def decode(path):
    cmd = ["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"]
    r = subprocess.run(cmd, capture_output=True)
    if r.returncode != 0:
        raise RuntimeError(f"decode failed {path}: {r.stderr.decode()[-200:]}")
    return np.frombuffer(r.stdout, dtype=np.float32)


def envelope(x):
    """Windowed RMS envelope (hop = WIN)."""
    n = len(x) // WIN
    env = np.array([np.sqrt(np.mean(x[i * WIN:(i + 1) * WIN] ** 2)) for i in range(n)])
    return env


def sustained_bounds(x):
    """Return (start_s, end_s) of the sustained-energy region."""
    env = envelope(x)
    if len(env) == 0:
        return 0.0, len(x) / SR
    ref = np.median(env[env > 1e-4]) if np.any(env > 1e-4) else 0.0
    thr = FRAC * ref
    active = np.where(env >= thr)[0]
    if len(active) == 0:
        return 0.0, len(x) / SR
    start = active[0] * WIN / SR
    end = min((active[-1] + 1) * WIN, len(x)) / SR
    return start, end


def process(tid, src_path):
    x = decode(src_path)
    start, end = sustained_bounds(x)
    dur = end - start
    tmp = src_path + ".seamless.mp3"
    # -ss/-to slice, then fade in at 0 and fade out at (dur-FADE_OUT) on the sliced timeline.
    af = f"afade=t=in:st=0:d={FADE_IN},afade=t=out:st={max(0.0, dur - FADE_OUT):.3f}:d={FADE_OUT}"
    cmd = ["ffmpeg", "-hide_banner", "-nostats", "-y", "-ss", f"{start:.3f}", "-to", f"{end:.3f}",
           "-i", src_path, "-af", af, "-c:a", "libmp3lame", "-q:a", "3", tmp]
    r = subprocess.run(cmd, capture_output=True)
    if r.returncode != 0:
        raise RuntimeError(f"encode failed {tid}: {r.stderr.decode()[-300:]}")
    os.replace(tmp, src_path)
    return start, end, dur


def main():
    man = json.load(open(MANIFEST))
    tracks = man["tracks"]
    want = sys.argv[1:] or list(tracks.keys())
    print(f"{'id':13s}{'trim_start':>11s}{'trim_end':>10s}{'new_dur':>9s}")
    for tid in want:
        if tid not in tracks:
            print(f"  [skip] {tid} not in manifest")
            continue
        src = os.path.join(AUDIO_DIR, tracks[tid]["file"])
        start, end, dur = process(tid, src)
        # sync served copy
        served = os.path.join(SERVED_DIR, os.path.basename(tracks[tid]["file"]))
        subprocess.run(["cp", src, served], check=True)
        # stamp the manifest so it's clear these are loop-processed
        tracks[tid]["processed"] = "trimmed to sustained-energy loop + click-safe fades (make-seamless.py)"
        tracks[tid]["loop_dur_s"] = round(dur, 1)
        print(f"{tid:13s}{start:11.2f}{end:10.2f}{dur:9.1f}")
    with open(MANIFEST, "w") as f:
        json.dump(man, f, indent=2)
    # keep the served manifest in sync too
    subprocess.run(["cp", MANIFEST, os.path.join(SERVED_DIR, "manifest.json")], check=True)
    print(f"\nupdated + synced: {MANIFEST} -> {SERVED_DIR}")


if __name__ == "__main__":
    main()
