/**
 * Multi-finger swipe detection from the MotionEvents forwarded by
 * PluginManager.registerMotionListener (screen pixel coordinates).
 *
 * It reports WHICH swipe happened (finger count + direction); deciding what to do
 * with it belongs to the caller. Deliberately SDK-free so it can be unit-tested.
 *
 * The host's `downTime` is not trusted on its own (after waking from sleep it may
 * not change between two touches): a gesture also starts on ACTION_DOWN and ends
 * on any lift.
 */

export const TOOL_FINGER = 1;
export const TOOL_PEN = 2;
export const ACTION_DOWN = 0;
export const ACTION_UP = 1;
export const ACTION_CANCEL = 3;
export const ACTION_POINTER_UP = 6;

export type Pointer = {x: number; y: number; pointerId: number; toolType: number};

export type Motion = {
  action: number;
  pointerCount: number;
  pointers: Pointer[];
  eventTime: number;
  downTime: number;
  toolType: number;
};

export type Vec = {x: number; y: number};

/** Screen directions, in the forwarded coordinates (y grows downwards). */
export const UP: Vec = {x: 0, y: -1};
export const DOWN: Vec = {x: 0, y: 1};
export const LEFT: Vec = {x: -1, y: 0};
export const RIGHT: Vec = {x: 1, y: 0};

export type Swipe = {fingers: number; direction: Vec};

export type SwipeOptions = {
  /** Finger counts that can form a gesture (e.g. [2, 3]); any other count never triggers. */
  fingers: number[];
  /** Directions to watch (unit vectors). */
  directions: Vec[];
  /** Minimum travel of EACH finger along a direction (px). */
  minDistance: (direction: Vec) => number;
  /** Max time between the last finger landing and the trigger (ms). */
  maxDurationMs: number;
  /** Allowed sideways drift, as a fraction of the travel. */
  maxSlope: number;
  /** Max delay between the first and last finger landing (ms); a resting palm lands unevenly. */
  maxLandingGapMs: (fingers: number) => number;
  /** Allowed distance between fingers at landing (px): closest pair not a single blob, widest pair not both hands. */
  minSeparation: number;
  maxSeparation: number;
  /** Fingers of one hand move together: their spread may change by at most this fraction. */
  maxSeparationChange: number;
};

const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y;
const cross = (a: Vec, b: Vec) => a.x * b.y - a.y * b.x;
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

function pairDistances(points: Vec[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      out.push(dist(points[i], points[j]));
    }
  }
  return out;
}

export class MultiFingerSwipe {
  private downTime = Number.NaN;
  private starts = new Map<number, Vec>();
  private firstLanding = 0;
  private lastLanding = 0;
  private checkedCount = 0;
  private done = true; // fired, abandoned, or no gesture in progress

  constructor(private readonly options: () => SwipeOptions) {}

  private reset(e: Motion) {
    this.downTime = e.downTime;
    this.starts.clear();
    this.firstLanding = e.eventTime;
    this.lastLanding = e.eventTime;
    this.checkedCount = 0;
    this.done = false;
  }

  /** Returns the swipe at the exact moment it is recognized (once per gesture), else null. */
  feed(e: Motion): Swipe | null {
    const action = e.action & 0xff;
    if (action === ACTION_DOWN || e.downTime !== this.downTime) {
      this.reset(e);
    }
    if (this.done) {
      return null;
    }
    if (action === ACTION_UP || action === ACTION_CANCEL || action === ACTION_POINTER_UP) {
      this.done = true; // a finger left the screen: this gesture is over
      return null;
    }
    const pointers = e.pointers ?? [];
    if (e.toolType === TOOL_PEN || pointers.some(p => p.toolType === TOOL_PEN)) {
      this.done = true;
      return null;
    }
    const o = this.options();

    for (const p of pointers) {
      if (!this.starts.has(p.pointerId)) {
        this.starts.set(p.pointerId, {x: p.x, y: p.y});
        this.lastLanding = e.eventTime;
      }
    }
    const n = this.starts.size;
    if (n > Math.max(...o.fingers)) {
      this.done = true; // more fingers than any gesture uses
      return null;
    }
    if (!o.fingers.includes(n) || pointers.length !== n) {
      return null; // not a gesture's finger count (yet)
    }
    const origins = pointers.map(p => this.starts.get(p.pointerId)!);
    const startSpread = Math.max(...pairDistances(origins));
    if (this.checkedCount !== n) {
      this.checkedCount = n;
      if (
        this.lastLanding - this.firstLanding > o.maxLandingGapMs(n) ||
        Math.min(...pairDistances(origins)) < o.minSeparation ||
        startSpread > o.maxSeparation
      ) {
        this.done = true; // palm, ghost touch, or two hands
        return null;
      }
    }
    if (e.eventTime - this.lastLanding > o.maxDurationMs) {
      this.done = true; // too slow
      return null;
    }

    const moves = pointers.map((p, i) => ({x: p.x - origins[i].x, y: p.y - origins[i].y}));
    for (const d of o.directions) {
      const travels = moves.map(m => dot(m, d));
      if (Math.min(...travels) < o.minDistance(d)) {
        continue; // not far enough yet in this direction
      }
      this.done = true;
      const straight = moves.every((m, i) => Math.abs(cross(m, d)) <= o.maxSlope * travels[i]);
      const together = Math.abs(Math.max(...pairDistances(pointers)) - startSpread) <= o.maxSeparationChange * startSpread;
      return straight && together ? {fingers: n, direction: d} : null;
    }
    return null;
  }
}
