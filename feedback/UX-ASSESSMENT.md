# UX Assessment — creator-approval panel vs how shipped games surface feedback/ratings

Date: 2026-07-10 · root.E (creator-approval) · Grounds the SPEC mandate clause
"ground the UX against how shipped Contra-likes and comparable games surface
feedback/ratings." Judged by looking at the REAL shipped panel
(`feedback/frames/conformance-open.png`, `3b-play-panel.png`) against documented
shipped-game rating/feedback UX. Not a re-spec — a grounded conformance check with
concrete, non-aspirational recommendations.

## Reference basis (what shipped games actually do)

From current app/game rating-prompt practice (sources below) + the playtest-feedback
grounding in FINDINGS cycle 1 (gamedeveloper.com, Subnautica, Steam/Meta playtest):

- **Trigger at a positive/completion moment** (level clear, high score) — NOT on
  launch or mid-task; launch prompts raise quit rate ~50%.
- **Sentiment-first, two-path routing:** ask how the player feels, route happy →
  public store rating, unhappy → **private feedback form**. A conversation is
  5–10× more effective than a bare "rate us."
- **Minimal friction; native aesthetic:** the prompt should look like part of the
  game; 1–2 fields; frictionless submit.
- **Verdict-as-submit / emoji-verdict** (Subnautica) — the choice IS the submit.
- **Auto-attach hidden context** (level, version, build) so a terse note is
  actionable.
- **Don't beg for 5 stars** (lowers ratings, violates store rules); don't incentivize.

## Panel vs each pattern (verdict)

| Pattern | Shipped-game norm | Our panel (observed) | Verdict |
|---|---|---|---|
| Native aesthetic | looks like the game | dark `#0a0e14`/monospace/gold title, dimmed backdrop, matches HUD | **MATCH** |
| Minimal friction | 1–2 fields, easy submit | only the verdict is required; stars + notes optional | **MATCH** |
| Verdict-as-submit | choice is the submit | `✓ APPROVE FOR RELEASE` / `✗ REJECT` buttons ARE the submit | **MATCH** (Subnautica) |
| Auto-context | attach level/version | `build·mode·status·score` auto-captured per entry | **MATCH** |
| No 5-star begging | neutral rating | neutral 1–5 stars, no coercion; gate reads rating≥3 silently | **MATCH** |
| Private-feedback path | unhappy → private form | ALL feedback is private/local (localStorage), never auto-published | **MATCH** |
| Sentiment routing | happy→store / unhappy→form | single form for both verdicts (no store — this is a dev gate) | **N/A by design** |
| Trigger timing | at a win moment, not mid-task | hotkey-reachable from ANY state incl. mid-play | **DIVERGES — correct for a creator gate (see below)** |

## The one meaningful divergence — and why it's correct here

Shipped PLAYER prompts are carefully *timed* (win moments) and *rate-limited*
(cool-downs, lifetime caps) because they interrupt a player who did not ask to be
interrupted. Our panel is **creator-invoked** via a hotkey — the creator chooses
the moment, so "always reachable" is the right model, not a violation. The one
borrowed pattern that fits perfectly is the **private-feedback path**: a creator
approving/rejecting a build is exactly the "unhappy/among-us conversation" half of
the sentiment gate — captured privately, structured, actionable — never auto-posted
anywhere. The panel implements that half well.

Judged by looking: `conformance-open.png` / `3b-play-panel.png` show a legible,
on-brand overlay (gold title, context line, optional stars, notes, two clear
verdict buttons, Export, `esc to close`) dimmed over the frozen game. It reads as a
finished, native feature — consistent with the "native aesthetic / frictionless"
norm. No UX defects observed.

## Concrete, non-aspirational recommendations (root.B's call — all optional)

1. ~~**Prompt affordance at the win moment (low effort).**~~ **✅ DONE (root.B, verified
   2026-07-10).** Shipped games get their best feedback right after a
   `cleared`/`gameover`. root.B added a desktop-only cyan hint **"press F to rate
   this build"** on the GAME OVER / STAGE CLEAR overlay (`render.js:1112-1119`) —
   exactly this recommendation. Verified live by looking:
   `feedback/frames/4-gameover.png` shows it below "press R to restart". The
   creator is now nudged to log a verdict at the natural moment; discoverability no
   longer depends on knowing the F hotkey.
2. **Nothing else is needed for the creator gate.** The panel matches the shipped
   private-feedback UX on every applicable axis. Resist adding store-prompt
   machinery (cool-downs, eligibility gating) — those exist to protect *players*
   from interruption; they don't apply to a creator-invoked dev gate.

## Scope note (honest, ties to strategy task_obs_only_preference_channel_just_spawned)

This panel captures the **creator's** approval — necessary for the release gate,
but it is **not** evidence that *real players prefer* our game over competitors
(the GOAL's exit bar). Treat `releaseApproved` as a creator sign-off, not a
player-preference signal. IF a player-preference channel is later wanted, the same
panel could be extended (player-facing variant: win-moment trigger + a comparative
"prefer this over X?" question) — but that is a **separate deliverable**, not built
here, to keep this spec tight and grounded rather than aspirational. Surfaced as a
`need` for the parent.

## Sources
- polljoy.com — *In-game rating prompts are game changers* (win-moment timing;
  sentiment-first routing).
- alchemer.com — *App Ratings Prompts: When and How to Ask* (launch prompt raises
  quit ~50%; cool-downs).
- appfollow.io — *How To Get More Reviews* (sentiment gate; private path for
  unhappy users).
- mmaglobal.com / marketingprofs.com — *Dos and Don'ts* (don't beg for 5 stars;
  don't incentivize).
- (cycle-1 basis) gamedeveloper.com *In-game Feedback Forms*; Subnautica
  emoji-verdict; Steam/Meta playtest feedback flow.
