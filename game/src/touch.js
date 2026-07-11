// On-screen touch controls for phones/tablets (the goal targets web/Android).
// A keyboard-only build is unplayable on a touchscreen, so this mounts a DOM
// overlay — a left D-pad (move / aim-up / prone) and right JUMP + FIRE buttons —
// and exposes a `.held` snapshot in the SAME shape as KeyboardInput, so main.js
// merges the two (CombinedInput). Live-only: headless/selftest never mount this,
// so determinism is untouched. Multitouch (Pointer Events) allows run+aim+fire
// at once — e.g. hold →, ↑ and FIRE for a diagonal shot on the move.

const FIELDS = ['left', 'right', 'up', 'down', 'jump', 'fire', 'swap'];

export class TouchInput {
  constructor() {
    this.held = {};
    for (const f of FIELDS) this.held[f] = false;
  }
}

export function isTouchDevice() {
  return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
}

const CSS = `
#touch-controls { position: fixed; inset: 0; z-index: 60; pointer-events: none;
  font-family: monospace; -webkit-user-select: none; user-select: none;
  -webkit-tap-highlight-color: transparent; touch-action: none; }
#touch-controls .cluster { position: absolute; bottom: max(4vh, 14px);
  display: grid; pointer-events: none; }
#touch-controls .dpad { left: max(3vw, 12px);
  grid-template-columns: repeat(3, 56px); grid-template-rows: repeat(3, 56px); gap: 6px; }
#touch-controls .actions { right: max(3vw, 12px);
  grid-template-columns: repeat(2, 76px); align-items: end; gap: 14px; }
#touch-controls button { pointer-events: auto; touch-action: none;
  border: 2px solid rgba(142,240,255,0.55); border-radius: 12px;
  background: rgba(18,26,38,0.55); color: #cdd6e0; font-size: 20px; font-weight: bold;
  display: flex; align-items: center; justify-content: center; }
#touch-controls button.active { background: rgba(142,240,255,0.35); border-color: #8ef0ff; color: #fff; }
#touch-controls .actions button { width: 76px; height: 76px; border-radius: 50%; font-size: 15px; }
#touch-controls .actions .jump { border-color: rgba(255,227,110,0.6); }
#touch-controls .actions .fire { border-color: rgba(255,93,109,0.7); height: 84px; width: 84px; }
#touch-controls .lbl { position: absolute; left: max(3vw,12px); bottom: calc(max(4vh,14px) + 178px);
  color: #6b7a8d; font-size: 11px; pointer-events: none; }
#touch-controls .pause { position: absolute; top: max(6vh, 30px); right: max(3vw, 12px);
  width: 38px; height: 38px; border-radius: 50%; font-size: 13px; pointer-events: auto; }
@media (min-aspect-ratio: 3/1) { #touch-controls .cluster { bottom: max(2vh, 8px); } }
`;

// Mount the overlay + wire pointer events. Shows on touch devices, or when
// forced (?touch=1) so the layout can be captured/verified on desktop. Returns
// the TouchInput (or null when not mounted). `world`/`audio` let the first tap
// start play from the title and unlock WebAudio (browsers gate it on a gesture).
export function mountTouchControls(world, audio, opts = {}) {
  if (!opts.force && !isTouchDevice()) return null;
  if (document.getElementById('touch-controls')) return null;

  const touch = new TouchInput();
  // Flag the body so index.html's mobile layout kicks in (hide desktop chrome,
  // fill the screen with the canvas, show the portrait rotate hint).
  document.body.classList.add('touch-active');
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const wrap = document.createElement('div');
  wrap.id = 'touch-controls';

  const dpad = document.createElement('div');
  dpad.className = 'cluster dpad';
  const actions = document.createElement('div');
  actions.className = 'cluster actions';

  // Bind a button so ALL listed fields are held while a pointer is down on it.
  // setPointerCapture keeps it held if the finger slides slightly off the glyph.
  const bind = (el, fields) => {
    const setDown = (down) => {
      for (const f of fields) touch.held[f] = down;
      el.classList.toggle('active', down);
      if (down) {
        if (audio && audio.resume) audio.resume();
        // Touch flow control: a press starts from the title and RESTARTS from
        // game-over / stage-clear, so a keyboard-less phone player is never
        // stranded (there is no R key to hit). ▼ (prone) is excluded so ducking
        // can't accidentally trigger it. Mirrors the keyboard START/R keys.
        if (world && !fields.includes('down')) {
          const s = world.status;
          if (s === 'title') world.start();
          // Cleared a stage with another to go → CONTINUE; else restart (mirrors
          // the desktop N / R split so a phone player can reach Stage 2 too).
          else if (s === 'cleared' && world.hasNextStage && world.requestNextStage) world.requestNextStage();
          else if (s === 'gameover' || s === 'cleared') world.reset();
        }
      }
    };
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch (_) {} setDown(true); });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, (e) => { e.preventDefault(); setDown(false); });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  };

  const mk = (label, fields, cls, col, row) => {
    const b = document.createElement('button');
    b.textContent = label;
    if (cls) b.className = cls;
    if (col) b.style.gridColumn = col;
    if (row) b.style.gridRow = row;
    bind(b, fields);
    return b;
  };

  // D-pad: 3×3 grid, cross layout. Up = aim up; Down = prone/aim-down.
  dpad.appendChild(mk('▲', ['up'], 'up', '2', '1'));
  dpad.appendChild(mk('◀', ['left'], 'left', '1', '2'));
  dpad.appendChild(mk('▶', ['right'], 'right', '3', '2'));
  dpad.appendChild(mk('▼', ['down'], 'down', '2', '3'));

  actions.appendChild(mk('JUMP', ['jump'], 'jump'));
  actions.appendChild(mk('FIRE', ['fire'], 'fire'));

  const lbl = document.createElement('div');
  lbl.className = 'lbl';
  lbl.textContent = 'TOUCH';

  // Pause: a TAP toggle (not a hold), top-right — the phone player's equivalent of
  // the desktop P key. Only meaningful during play; ignored on title/end screens.
  const pause = document.createElement('button');
  pause.className = 'pause';
  pause.textContent = '❚❚';
  pause.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (audio && audio.resume) audio.resume();
    if (world && world.status === 'playing') {
      world.paused = !world.paused;
      pause.textContent = world.paused ? '►' : '❚❚';
      pause.classList.toggle('active', world.paused);
    }
  });
  pause.addEventListener('contextmenu', (e) => e.preventDefault());

  wrap.appendChild(dpad);
  wrap.appendChild(actions);
  wrap.appendChild(lbl);
  wrap.appendChild(pause);
  document.body.appendChild(wrap);

  return touch;
}
