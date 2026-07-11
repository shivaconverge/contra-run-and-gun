// game/src/feedback.js — In-game CREATOR-APPROVAL feedback panel.
//
// REFERENCE IMPLEMENTATION authored by root.E to prove feedback/SPEC.md is
// implementable and clears the shipped QA gate (creatorApproval.panelExists).
// root.B may drop this into game/src/ verbatim (or adapt) and add the ~5 wiring
// lines in main.js runLive per SPEC §3.2. Vanilla DOM + localStorage, zero deps,
// no canvas coupling — the overlay is a fixed <div> like #boot-help/#rotate-hint.
//
// Contract: mountFeedback(world, opts) -> controller (SPEC §3.1). Exposed by
// main.js as window.__approval (+ world.approval, + window.__feedback alias).

const PALETTE = { bg: '#0a0e14', panel: '#121a26', text: '#cdd6e0', accent: '#8ef0ff',
  ok: '#7CFC7C', bad: '#ff6b6b', dim: '#6b7a8d', gold: '#ffe36e' };

export function mountFeedback(world, opts = {}) {
  const hotkey = opts.hotkey || 'KeyF';            // documented; main.js owns the keydown
  const storageKey = opts.storageKey || 'contra:feedback:v1';
  const buildId = String(opts.buildId ?? (typeof window !== 'undefined' && window.__buildId) ?? 'dev');

  let entries = load();
  let rating = null;          // pending star selection for the next submit
  let open = false;

  function load() {
    try {
      const v = JSON.parse(localStorage.getItem(storageKey) || '[]');
      return Array.isArray(v) ? v : [];
    } catch { return []; }     // AC-10: corrupt storage -> [] (never throws)
  }
  function persist() {
    try { localStorage.setItem(storageKey, JSON.stringify(entries)); } catch { /* private mode */ }
  }

  // ---- DOM overlay (hidden by default) --------------------------------------
  const el = document.createElement('div');
  el.id = 'feedback-panel';
  el.hidden = true;
  Object.assign(el.style, {
    position: 'fixed', inset: '0', zIndex: '120', display: 'flex',
    alignItems: 'center', justifyContent: 'center',
    background: 'rgba(6,10,16,0.82)', fontFamily: 'monospace', color: PALETTE.text,
  });
  el.innerHTML = `
    <div style="min-width:320px;max-width:440px;background:${PALETTE.bg};
      border:2px solid #1c2a3a;box-shadow:0 8px 40px rgba(0,0,0,.6);padding:18px 20px;">
      <div style="color:${PALETTE.gold};letter-spacing:2px;font-size:14px;margin-bottom:4px;">
        BUILD FEEDBACK — creator approval</div>
      <div id="fb-context" style="color:${PALETTE.dim};font-size:11px;margin-bottom:12px;">build … · … · … · score …</div>
      <div style="font-size:11px;color:${PALETTE.dim};margin-bottom:4px;">RATE THIS BUILD (optional)</div>
      <div id="fb-stars" style="font-size:22px;letter-spacing:4px;margin-bottom:12px;cursor:pointer;user-select:none;">
        ${[1,2,3,4,5].map((n) => `<span data-star="${n}" style="color:${PALETTE.dim};">★</span>`).join('')}
      </div>
      <textarea id="fb-notes" rows="3" placeholder="notes (optional) — e.g. boss phase-2 reads unfair"
        style="width:100%;box-sizing:border-box;background:${PALETTE.panel};color:${PALETTE.text};
        border:1px solid #24344a;font-family:monospace;font-size:12px;padding:6px;margin-bottom:12px;"></textarea>
      <div style="display:flex;gap:10px;margin-bottom:8px;">
        <button id="fb-approve" style="flex:1;padding:9px;background:${PALETTE.ok};color:#062;border:0;
          font-family:monospace;font-weight:bold;font-size:12px;cursor:pointer;">✓ APPROVE FOR RELEASE</button>
        <button id="fb-reject" style="flex:1;padding:9px;background:${PALETTE.bad};color:#300;border:0;
          font-family:monospace;font-weight:bold;font-size:12px;cursor:pointer;">✗ REJECT</button>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="color:${PALETTE.dim};font-size:11px;">esc / F to close</span>
        <span id="fb-saved" style="color:${PALETTE.ok};font-size:11px;opacity:0;transition:opacity .2s;">feedback saved ✓</span>
      </div>
      <div id="fb-gate" style="margin-top:8px;color:${PALETTE.dim};font-size:11px;"></div>
    </div>`;
  document.body.appendChild(el);

  const $ = (sel) => el.querySelector(sel);
  const starsEl = $('#fb-stars');
  const notesEl = $('#fb-notes');
  const savedEl = $('#fb-saved');

  function paintStars() {
    starsEl.querySelectorAll('[data-star]').forEach((s) => {
      s.style.color = rating && Number(s.dataset.star) <= rating ? PALETTE.gold : PALETTE.dim;
    });
  }
  function paintContext() {
    $('#fb-context').textContent =
      `build ${buildId} · ${world.modeKey} · ${world.status} · score ${world.score}`;
    $('#fb-gate').textContent = controller.releaseApproved
      ? 'release gate: OPEN ✓ (approved)' : 'release gate: CLOSED';
  }

  // Overlay-local handlers stop propagation so keystrokes in the textarea and
  // clicks never leak to the game (main.js also swallows keys while open).
  el.addEventListener('keydown', (e) => e.stopPropagation());
  starsEl.addEventListener('click', (e) => {
    const n = e.target?.dataset?.star; if (!n) return;
    rating = Number(n); paintStars();
  });
  $('#fb-approve').addEventListener('click', () => submit({ verdict: 'approve' }));
  $('#fb-reject').addEventListener('click', () => submit({ verdict: 'reject' }));

  function submit(partial) {
    const entry = {
      verdict: partial.verdict,
      rating: partial.rating ?? rating ?? null,
      notes: (partial.notes ?? notesEl.value ?? '').toString(),
      context: {
        buildId,
        status: world.status,
        mode: world.modeKey,
        score: world.score,
        lives: world.lives,
      },
      ts: Date.now(),
    };
    entries.push(entry);
    persist();
    rating = null; notesEl.value = ''; paintStars();
    savedEl.style.opacity = '1'; setTimeout(() => { savedEl.style.opacity = '0'; }, 1200);
    paintContext();
    return entry;
  }

  // Release gate (SPEC §4): newest entry for THIS build wins; approve gates only
  // if rating is unset or >= 3. A later reject revokes. Default closed.
  function releaseApproved() {
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i];
      if (!e || !e.context || e.context.buildId !== buildId) continue;
      if (e.verdict === 'approve') return e.rating == null || e.rating >= 3;
      if (e.verdict === 'reject') return false;
    }
    return false;
  }

  const controller = {
    open() { open = true; el.hidden = false; paintStars(); paintContext(); },
    close() { open = false; el.hidden = true; },
    toggle() { open ? controller.close() : controller.open(); },
    isOpen() { return open; },
    submit,
    entries() { return entries.slice(); },
    latest() { return entries.length ? entries[entries.length - 1] : null; },
    clear() { entries = []; persist(); paintContext(); },
    get releaseApproved() { return releaseApproved(); },
    buildId,
  };
  return controller;
}
