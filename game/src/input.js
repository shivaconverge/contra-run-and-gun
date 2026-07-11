// Input abstraction. Two backends feed the same per-step snapshot:
//   - KeyboardInput  : live play (WASD/arrows + Z/X/K/J).
//   - ScriptedInput  : deterministic timeline for headless verification.
// The snapshot exposes held booleans plus edge-triggered *Pressed flags.

const FIELDS = ['left', 'right', 'up', 'down', 'jump', 'fire', 'swap'];

function blank() {
  return { left: false, right: false, up: false, down: false, jump: false, fire: false, swap: false };
}

// Shared edge tracking: given held state, compute *Pressed since last poll.
class EdgeState {
  constructor() {
    this.prev = blank();
  }
  snapshot(held) {
    const out = { ...held, jumpPressed: false, swapPressed: false };
    out.jumpPressed = held.jump && !this.prev.jump;
    out.swapPressed = held.swap && !this.prev.swap;
    this.prev = { ...held };
    return out;
  }
}

const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  KeyZ: 'jump', KeyK: 'jump', Space: 'jump',
  KeyX: 'fire', KeyJ: 'fire',
  KeyC: 'swap', KeyL: 'swap',
};

export class KeyboardInput {
  constructor(target = window) {
    this.held = blank();
    this.edge = new EdgeState();
    this._onDown = (e) => {
      const f = KEYMAP[e.code];
      if (f) { this.held[f] = true; e.preventDefault(); }
    };
    this._onUp = (e) => {
      const f = KEYMAP[e.code];
      if (f) { this.held[f] = false; e.preventDefault(); }
    };
    target.addEventListener('keydown', this._onDown);
    target.addEventListener('keyup', this._onUp);
  }
  poll() {
    return this.edge.snapshot(this.held);
  }
}

// Merge several held-state sources (keyboard + on-screen touch) into ONE
// edge-tracked snapshot: a field is held if ANY source holds it, so both input
// methods work at once. Each source only needs a `.held` object of FIELDS.
// Null sources (e.g. no touch overlay on desktop) are ignored.
export class CombinedInput {
  constructor(sources) {
    this.sources = sources.filter(Boolean);
    this.edge = new EdgeState();
  }
  poll() {
    const held = blank();
    for (const s of this.sources) {
      const h = s.held;
      if (!h) continue;
      for (const k of FIELDS) if (h[k]) held[k] = true;
    }
    return this.edge.snapshot(held);
  }
}

// Timeline: array of { at: frame, set: {field:bool,...} }. State persists
// until changed, so you describe *transitions*, not every frame.
export class ScriptedInput {
  constructor(timeline) {
    this.timeline = [...timeline].sort((a, b) => a.at - b.at);
    this.i = 0;
    this.frame = 0;
    this.held = blank();
    this.edge = new EdgeState();
  }
  poll() {
    while (this.i < this.timeline.length && this.timeline[this.i].at <= this.frame) {
      const { set } = this.timeline[this.i];
      for (const k of FIELDS) if (k in set) this.held[k] = !!set[k];
      this.i++;
    }
    this.frame++;
    return this.edge.snapshot(this.held);
  }
}
