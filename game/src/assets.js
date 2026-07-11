// Tolerant image loader. Tries each manifest entry; any that fail to load
// (e.g. art not authored yet) are simply absent, and the renderer draws a
// placeholder. Never rejects, so boot is robust with zero art present.
export class AssetStore {
  constructor() {
    this.images = {};
    this.missing = [];
  }

  get(key) {
    return this.images[key] || null;
  }

  load(manifest) {
    const entries = Object.entries(manifest);
    return Promise.all(entries.map(([key, path]) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { this.images[key] = img; resolve(); };
      img.onerror = () => { this.missing.push(key); resolve(); };
      img.src = path;
    })));
  }
}
