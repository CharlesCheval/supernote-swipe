import {DOWN, LEFT, RIGHT, UP, Vec} from './gesture';

/**
 * From a swipe direction in the forwarded coordinates to "up"/"down" as the user
 * sees the screen. Pure logic, unit-tested.
 *
 * In landscape the host may forward coordinates either in the rotated view
 * ("view" frame) or in the panel's natural portrait orientation ("raw" frame).
 * The frame is learned from touches: a coordinate beyond the portrait width on
 * the x axis means "view", on the y axis means "raw".
 */

export type Logical = 'up' | 'down';
export type Frame = 'view' | 'raw' | 'unknown';

const same = (a: Vec, b: Vec) => a.x === b.x && a.y === b.y;

/** Directions to watch: vertical only in portrait; in landscape, horizontal too (raw frame). */
export function watchedDirections(landscape: boolean, frame: Frame): Vec[] {
  if (!landscape || frame === 'view') {
    return [UP, DOWN];
  }
  return frame === 'raw' ? [LEFT, RIGHT] : [UP, DOWN, LEFT, RIGHT];
}

/**
 * `rotation` is Android's display rotation: 0, 1 (90°, device turned
 * counter-clockwise), 2 (180°), 3 (270°, device turned clockwise).
 */
export function toLogical(v: Vec, rotation: number, landscape: boolean, frame: Frame): Logical | null {
  const vertical = same(v, UP) || same(v, DOWN);
  if (vertical) {
    if (landscape && frame === 'raw') {
      return null; // in the raw frame, a vertical move is sideways for the user
    }
    const flipped = rotation === 2 && frame === 'raw';
    return same(v, UP) !== flipped ? 'up' : 'down';
  }
  if (!landscape || frame === 'view') {
    return null;
  }
  // Raw frame in landscape: the user's "up" is the panel's right edge when turned
  // counter-clockwise (rotation 1), its left edge when turned clockwise (rotation 3).
  if (rotation === 1) {
    return same(v, RIGHT) ? 'up' : 'down';
  }
  if (rotation === 3) {
    return same(v, LEFT) ? 'up' : 'down';
  }
  return null; // landscape detected without a rotation: horizontal moves are ambiguous
}

/** Learns the coordinate frame from a point seen in landscape. */
export function learnFrame(frame: Frame, p: Vec, portraitWidth: number): Frame {
  if (frame !== 'unknown') {
    return frame;
  }
  const margin = portraitWidth * 1.03;
  if (p.x > margin) {
    return 'view';
  }
  if (p.y > margin) {
    return 'raw';
  }
  return 'unknown';
}
