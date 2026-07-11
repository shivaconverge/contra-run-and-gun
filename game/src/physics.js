// AABB body movement against the level's solid rects.
// Resolves X then Y so we can report grounded/ceiling/wall contacts cleanly.
import { aabbOverlap } from './util.js';

// body: mutable {x,y,w,h,vx,vy}. Returns contact flags for this step.
export function moveAndCollide(body, solids) {
  const contact = { grounded: false, ceiling: false, wallL: false, wallR: false };

  // --- X axis ---
  body.x += body.vx;
  for (const s of solids) {
    if (!aabbOverlap(body, s)) continue;
    if (body.vx > 0) {
      body.x = s.x - body.w;
      contact.wallR = true;
      body.vx = 0;
    } else if (body.vx < 0) {
      body.x = s.x + s.w;
      contact.wallL = true;
      body.vx = 0;
    }
  }

  // --- Y axis ---
  body.y += body.vy;
  for (const s of solids) {
    if (!aabbOverlap(body, s)) continue;
    if (body.vy > 0) {
      body.y = s.y - body.h;
      contact.grounded = true;
      body.vy = 0;
    } else if (body.vy < 0) {
      body.y = s.y + s.h;
      contact.ceiling = true;
      body.vy = 0;
    }
  }

  return contact;
}
