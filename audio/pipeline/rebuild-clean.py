#!/usr/bin/env python3
"""
rebuild-clean.py — rebuild the 7 shipped loops from the Udio masters in ONE encode.

WHY: the shipped tracks accumulated 4–5 lossy MP3 generations (Udio render → seamless
re-encode → loudnorm re-encode → outlier touch-up → …), and the payload is ~21 MB (every
player downloads all 7 at boot). This regenerates each final file from its ORIGINAL Udio
master (manifest `source_url`) through a SINGLE ffmpeg encode that does everything at once:
  trim to the sustained-energy loop region  +  click-safe fades  +  EBU R128 loudnorm
  (linear gain, target -15 LUFS / -1.5 dBFS TP)  +  web-appropriate VBR bitrate (q:a 6 ≈
  120 kbps).
Net: ONE lossy generation from the master (higher fidelity than the stacked chain) AND a
smaller download. Overwrites audio/tracks/<id>.mp3 + syncs game/assets/audio/.

This supersedes running make-seamless.py + normalize-loudness.py separately (kept for
reference / incremental tweaks); rebuild-clean.py is the canonical from-master build.

Usage:  python3 audio/pipeline/rebuild-clean.py            # all
        python3 audio/pipeline/rebuild-clean.py s5_foundry # subset
"""
import json
import os
import re
import subprocess
import sys
import urllib.request

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
AUDIO_DIR = os.path.normpath(os.path.join(HERE, ".."))
TRACKS_DIR = os.path.join(AUDIO_DIR, "tracks")
SERVED_DIR = os.path.normpath(os.path.join(AUDIO_DIR, "..", "game", "assets", "audio"))
MANIFEST = os.path.join(TRACKS_DIR, "manifest.json")
SR = 44100
FRAC = 0.5          # sustained-energy threshold = FRAC × median envelope
FADE_IN, FADE_OUT = 0.010, 0.060
TARGET_I, TARGET_TP, TARGET_LRA = -15.0, -1.5, 11.0
QUALITY = "6"       # libmp3lame VBR quality (~120 kbps) — transparent for looped BGM under SFX
WIN = int(0.050 * SR)


def download(url, dest):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 contra-audio/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r, open(dest, "wb") as f:
        f.write(r.read())


def decode(path):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path,
                        "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True)
    return np.frombuffer(r.stdout, dtype=np.float32)


def sustained_bounds(x):
    n = len(x) // WIN
    env = np.array([np.sqrt(np.mean(x[i * WIN:(i + 1) * WIN] ** 2)) for i in range(n)])
    if len(env) == 0:
        return 0.0, len(x) / SR
    ref = np.median(env[env > 1e-4]) if np.any(env > 1e-4) else 0.0
    active = np.where(env >= FRAC * ref)[0]
    if len(active) == 0:
        return 0.0, len(x) / SR
    return active[0] * WIN / SR, min((active[-1] + 1) * WIN, len(x)) / SR


def afade_chain(dur):
    return (f"afade=t=in:st=0:d={FADE_IN},"
            f"afade=t=out:st={max(0.0, dur - FADE_OUT):.3f}:d={FADE_OUT}")


def loudnorm_measure(src, start, end, af_pre):
    r = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-ss", f"{start:.3f}", "-to", f"{end:.3f}",
         "-i", src, "-af", f"{af_pre},loudnorm=I={TARGET_I}:TP={TARGET_TP}:LRA={TARGET_LRA}:print_format=json",
         "-f", "null", "-"], capture_output=True, text=True)
    m = re.search(r"\{[^{}]*\"input_i\"[\s\S]*?\}", r.stderr)
    if not m:
        raise RuntimeError(f"loudnorm measure failed {src}: {r.stderr[-300:]}")
    return json.loads(m.group(0))


def ebur128(path):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path,
                        "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True)
    I = re.findall(r"I:\s*(-?\d+\.?\d*)\s*LUFS", r.stderr)
    TP = re.findall(r"Peak:\s*(-?\d+\.?\d*)\s*dBFS", r.stderr)
    return (float(I[-1]) if I else None), (float(TP[-1]) if TP else None)


def build(tid, url, dest):
    raw = os.path.join(TRACKS_DIR, f".raw_{tid}.mp3")
    download(url, raw)
    x = decode(raw)
    start, end = sustained_bounds(x)
    dur = end - start
    af_pre = afade_chain(dur)
    d = loudnorm_measure(raw, start, end, af_pre)
    af = (f"{af_pre},loudnorm=I={TARGET_I}:TP={TARGET_TP}:LRA={TARGET_LRA}:linear=true:"
          f"measured_I={d['input_i']}:measured_TP={d['input_tp']}:"
          f"measured_LRA={d['input_lra']}:measured_thresh={d['input_thresh']}")
    tmp = dest + ".tmp.mp3"
    r = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-y", "-ss", f"{start:.3f}", "-to", f"{end:.3f}",
         "-i", raw, "-af", af, "-ar", str(SR), "-c:a", "libmp3lame", "-q:a", QUALITY, tmp],
        capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"encode failed {tid}: {r.stderr[-300:]}")
    os.replace(tmp, dest)
    os.remove(raw)
    # loudnorm's internal gating can disagree with the ebur128 meter by up to ~1 LU; if the
    # verified integrated loudness is off target, apply ONE corrective linear gain so the
    # whole set stays within a tight (inaudible) spread. Second encode only for outliers.
    li, _ = ebur128(dest)
    if li is not None and abs(li - TARGET_I) > 0.4:
        corr = TARGET_I - li
        tmp2 = dest + ".corr.mp3"
        subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-y", "-i", dest,
                        "-af", f"volume={corr:.2f}dB", "-ar", str(SR),
                        "-c:a", "libmp3lame", "-q:a", QUALITY, tmp2],
                       capture_output=True, text=True, check=True)
        os.replace(tmp2, dest)
    return start, end, dur


def main():
    man = json.load(open(MANIFEST))
    tracks = man["tracks"]
    want = sys.argv[1:] or list(tracks.keys())
    print(f"clean from-master rebuild: trim+fade+loudnorm(-15 LUFS)+q:a{QUALITY} in one encode\n")
    print(f"{'id':13s}{'loop_s':>8s}{'LUFS':>8s}{'peak':>7s}{'size_MB':>9s}")
    tot = 0
    for tid in want:
        if tid not in tracks:
            print(f"  [skip] {tid}"); continue
        meta = tracks[tid]
        url = meta.get("source_url")
        if not url:
            print(f"  [skip] {tid} (no source_url)"); continue
        dest = os.path.join(AUDIO_DIR, meta["file"])
        start, end, dur = build(tid, url, dest)
        subprocess.run(["cp", dest, os.path.join(SERVED_DIR, os.path.basename(meta["file"]))], check=True)
        li, tp = ebur128(dest)
        sz = os.path.getsize(dest)
        tot += sz
        meta["loop_dur_s"] = round(dur, 1)
        meta["loudness_lufs"] = round(li, 1)
        meta["build"] = f"from-master single-encode (trim+fade+loudnorm+q:a{QUALITY})"
        print(f"{tid:13s}{dur:8.1f}{li:8.1f}{tp:7.1f}{sz/1048576:9.2f}")
    with open(MANIFEST, "w") as f:
        json.dump(man, f, indent=2)
    subprocess.run(["cp", MANIFEST, os.path.join(SERVED_DIR, "manifest.json")], check=True)
    print(f"\ntotal served payload: {tot/1048576:.2f} MB (was ~21.4 MB)")
    print(f"updated + synced: {TRACKS_DIR} -> {SERVED_DIR}")


if __name__ == "__main__":
    main()
