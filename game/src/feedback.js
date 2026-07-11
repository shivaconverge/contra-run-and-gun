// Creator-approval feedback panel — implements feedback/SPEC.md.
//
// A DOM overlay (NOT canvas, like #boot-help / #rotate-hint) toggled by F,
// reachable from ANY game state, that captures a structured creator verdict
// (approve/reject + optional 1–5 stars + optional notes) with auto-attached
// build/run context, persists it to localStorage, and exposes `releaseApproved`
// — the machine-readable ship gate a publish step reads before going wide.
//
// The shipped QA gate (playtest/e2e/playthrough.mjs) passes iff a DOM-text
// handle OR an API handle exists; main.js wires BOTH window.__approval and
// world.approval to this controller (§3.5), and the markup below carries the
// gate-matching text ("creator approval", "APPROVE FOR RELEASE").
//
// Live-only: mounted in runLive, never in headless/selftest, so nothing here
// touches sim determinism.

const DEFAULT_STORAGE_KEY = 'contra:feedback:v1';

function resolveBuildId(opts) {
  return opts.buildId || (typeof window !== 'undefined' && window.__buildId) || 'dev';
}

// Release gate (SPEC §4): the MOST-RECENT entry for the current build must be an
// approve whose rating is unset or >= 3. Newest verdict wins (a later reject
// revokes an earlier approve); scoped to buildId so a stale approval of an old
// build can't green-light a new one.
function computeGate(list, buildId) {
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i];
    if (e && e.context && e.context.buildId === buildId) {
      return e.verdict === 'approve' && (e.rating == null || e.rating >= 3);
    }
  }
  return false;
}

const CSS = `
#feedback-panel { position: fixed; inset: 0; z-index: 90; display: flex;
  align-items: center; justify-content: center; padding: 20px;
  background: rgba(6,10,16,0.86); font-family: monospace; color: #cdd6e0;
  -webkit-tap-highlight-color: transparent; }
#feedback-panel[hidden] { display: none !important; }
#feedback-panel .fb-card { background: #0a0e14; border: 2px solid #1c2a3a;
  box-shadow: 0 8px 40px rgba(0,0,0,0.6); border-radius: 8px; padding: 18px 20px;
  width: min(460px, 92vw); }
#feedback-panel h2 { margin: 0 0 4px; font-size: 15px; letter-spacing: 1px; color: #ffe36e; }
#feedback-panel .fb-ctx { font-size: 11px; color: #6b7a8d; margin: 0 0 14px; }
#feedback-panel .fb-row { margin: 10px 0; }
#feedback-panel .fb-label { font-size: 11px; color: #8a97a8; display: block; margin-bottom: 5px; }
#feedback-panel .fb-stars { font-size: 22px; letter-spacing: 3px; cursor: pointer; user-select: none; }
#feedback-panel .fb-star { color: #33465a; }
#feedback-panel .fb-star.on { color: #ffd166; }
#feedback-panel textarea { width: 100%; box-sizing: border-box; height: 62px; resize: none;
  background: #121a26; color: #cdd6e0; border: 1px solid #23384c; border-radius: 4px;
  font-family: monospace; font-size: 12px; padding: 7px; }
#feedback-panel .fb-verdicts { display: flex; gap: 10px; margin-top: 14px; }
#feedback-panel .fb-verdicts button { flex: 1; padding: 11px 8px; font-family: monospace;
  font-weight: bold; font-size: 12px; border-radius: 6px; cursor: pointer; border: 2px solid; }
#feedback-panel .fb-approve { background: rgba(124,252,124,0.12); border-color: #3fbf6a; color: #a6f5b8; }
#feedback-panel .fb-approve:hover { background: rgba(124,252,124,0.25); }
#feedback-panel .fb-reject { background: rgba(255,93,109,0.10); border-color: #d0455a; color: #ff9aa6; }
#feedback-panel .fb-reject:hover { background: rgba(255,93,109,0.22); }
#feedback-panel .fb-foot { display: flex; justify-content: space-between; align-items: center;
  margin-top: 12px; font-size: 10px; color: #6b7a8d; }
#feedback-panel .fb-saved { color: #7CFC7C; opacity: 0; transition: opacity 0.15s; }
#feedback-panel .fb-saved.show { opacity: 1; }
#feedback-panel .fb-export { background: none; border: 1px solid #33465a; color: #8ef0ff;
  font-family: monospace; font-size: 10px; padding: 3px 8px; border-radius: 4px; cursor: pointer; }
#feedback-panel .fb-export:hover { border-color: #8ef0ff; background: rgba(142,240,255,0.1); }
`;

// Build the overlay + wire it, returning the controller (SPEC §3.1). `world` is
// read (never mutated) for the auto-captured context snapshot.
export function mountFeedback(world, opts = {}) {
  const storageKey = opts.storageKey || DEFAULT_STORAGE_KEY;
  const buildId = resolveBuildId(opts);

  const load = () => {
    try { const v = JSON.parse(localStorage.getItem(storageKey)); return Array.isArray(v) ? v : []; }
    catch (_) { return []; }               // AC-10: corrupt/missing → []
  };
  const persist = (l) => { try { localStorage.setItem(storageKey, JSON.stringify(l)); } catch (_) {} };
  let list = load();
  let rating = null; // current star selection (null = unset)

  // --- DOM (idempotent: reuse if a prior mount left one) ---
  let panel = document.getElementById('feedback-panel');
  if (!panel) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    panel = document.createElement('div');
    panel.id = 'feedback-panel';
    panel.hidden = true;
    panel.innerHTML = `
      <div class="fb-card">
        <h2>BUILD FEEDBACK — creator approval</h2>
        <p class="fb-ctx" id="fb-ctx"></p>
        <div class="fb-row">
          <span class="fb-label">RATING (optional)</span>
          <span class="fb-stars" id="fb-stars">
            <span class="fb-star" data-v="1">★</span><span class="fb-star" data-v="2">★</span><span class="fb-star" data-v="3">★</span><span class="fb-star" data-v="4">★</span><span class="fb-star" data-v="5">★</span>
          </span>
        </div>
        <div class="fb-row">
          <span class="fb-label">NOTES (optional)</span>
          <textarea id="fb-notes" placeholder="e.g. boss phase-2 reads unfair; explosions feel great"></textarea>
        </div>
        <div class="fb-verdicts">
          <button class="fb-approve" id="fb-approve">✓ APPROVE FOR RELEASE</button>
          <button class="fb-reject" id="fb-reject">✗ REJECT</button>
        </div>
        <div class="fb-foot"><button class="fb-export" id="fb-export">⤓ EXPORT JSON</button><span class="fb-saved" id="fb-saved">feedback saved ✓</span><span>esc to close</span></div>
      </div>`;
    document.body.appendChild(panel);
  }

  const ctxLine = panel.querySelector('#fb-ctx');
  const starsEl = panel.querySelector('#fb-stars');
  const notesEl = panel.querySelector('#fb-notes');
  const savedEl = panel.querySelector('#fb-saved');

  const paintStars = () => {
    starsEl.querySelectorAll('.fb-star').forEach((s) => {
      s.classList.toggle('on', rating != null && Number(s.dataset.v) <= rating);
    });
  };
  starsEl.addEventListener('click', (e) => {
    const v = Number(e.target && e.target.dataset && e.target.dataset.v);
    if (v) { rating = (rating === v) ? null : v; paintStars(); } // click same star again → clear
  });

  const refreshContext = () => {
    ctxLine.textContent = `build ${buildId} · ${world.modeKey} · ${world.status} · score ${world.score}`;
  };

  let savedTimer = null;
  const flashSaved = () => {
    savedEl.classList.add('show');
    if (savedTimer) clearTimeout(savedTimer);
    savedTimer = setTimeout(() => savedEl.classList.remove('show'), 1400);
  };

  // Persist a verdict (SPEC §3.4 schema). Used by the buttons AND the harness
  // `submit()` path — identical behavior.
  const submit = (entry) => {
    const e = {
      verdict: entry && entry.verdict === 'reject' ? 'reject' : 'approve',
      rating: entry && entry.rating >= 1 && entry.rating <= 5 ? (entry.rating | 0) : null,
      notes: entry && typeof entry.notes === 'string' ? entry.notes : '',
      context: {
        buildId,
        status: world.status,
        mode: world.modeKey,
        score: world.score,
        lives: world.lives,
      },
      ts: Date.now(),
    };
    list.push(e);
    persist(list);
    flashSaved();
    refreshContext();
    return e;
  };

  panel.querySelector('#fb-approve').addEventListener('click', () => submit({ verdict: 'approve', rating, notes: notesEl.value }));
  panel.querySelector('#fb-reject').addEventListener('click', () => submit({ verdict: 'reject', rating, notes: notesEl.value }));

  // One-click EXPORT (feedback/approvals/README.md OI-3): download the persisted
  // entries() as `<buildId>.json` so a creator can commit the durable approval
  // record that feedback/release-gate.mjs consumes — no console copy/paste. Also
  // exposed programmatically (returns the JSON string) for a harness path.
  const exportJson = () => {
    const json = JSON.stringify(list, null, 2);
    try {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${buildId}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (_) { /* download unsupported → the return value is still usable */ }
    flashSaved();
    return json;
  };
  panel.querySelector('#fb-export').addEventListener('click', exportJson);

  // Keep keystrokes typed into the panel from leaking to the game's window-level
  // KeyboardInput / main listeners (SPEC §2.6, §3.3). Escape closes.
  panel.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.code === 'Escape') close();
  });

  const isOpen = () => !panel.hidden;
  const open = () => { refreshContext(); paintStars(); panel.hidden = false; };
  const close = () => { panel.hidden = true; };
  const toggle = () => { if (isOpen()) close(); else open(); };

  const controller = {
    open, close, toggle, isOpen, submit,
    entries: () => list.slice(),
    latest: () => (list.length ? list[list.length - 1] : null),
    exportJson,                        // one-click export affordance (OI-3)
    clear: () => { list = []; persist(list); },
    get releaseApproved() { return computeGate(list, buildId); },
  };
  return controller;
}
