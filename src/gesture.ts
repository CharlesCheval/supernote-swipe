/**
 * Multi-finger swipe detection (2 or 3 fingers) from the MotionEvents forwarded by
 * PluginManager.registerMotionListener (screen pixel coordinates).
 *
 * Deliberately SDK-free so it can be unit-tested. The host's `downTime` is not
 * trusted on its own (after waking from sleep it may not change between two
 * touches): a gesture also starts on ACTION_DOWN and ends on any lift.
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

export type SwipeOptions = {
  /** Number of fingers the gesture uses (2 or 3); more or fewer never triggers. */
  fingers: number;
  /** Accepted swipe directions (unit vectors). */
  directions: Vec[];
  /** Minimum travel of EACH finger along a direction (px). */
  minDistance: (direction: Vec) => number;
  /** Max time between the last finger landing and the trigger (ms). */
  maxDurationMs: number;
  /** Allowed sideways drift, as a fraction of the travel. */
  maxSlope: number;
  /** Max delay between the first and last finger landing (ms); a resting palm lands unevenly. */
  maxLandingGapMs: number;
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
  private startTime = 0;
  private done = true; // fired, abandoned, or no gesture in progress

  constructor(private readonly options: () => SwipeOptions) {}

  private reset(e: Motion) {
    this.downTime = e.downTime;
    this.starts.clear();
    this.firstLanding = e.eventTime;
    this.done = false;
  }

  /** Returns true at the exact moment the gesture is recognized (once per gesture). */
  feed(e: Motion): boolean {
    const action = e.action & 0xff;
    if (action === ACTION_DOWN || e.downTime !== this.downTime) {
      this.reset(e);
    }
    const pointers = e.pointers ?? [];
    const lifted = action === ACTION_UP || action === ACTION_CANCEL || action === ACTION_POINTER_UP;
    if (this.done) {
      return false;
    }
    if (lifted) {
      this.done = true; // a finger left the screen: this gesture is over
      return false;
    }
    if (e.toolType === TOOL_PEN || pointers.some(p => p.toolType === TOOL_PEN)) {
      this.done = true;
      return false;
    }
    const o = this.options();
    if (pointers.length < o.fingers) {
      return false;
    }

    for (const p of pointers) {
      if (!this.starts.has(p.pointerId)) {
        this.starts.set(p.pointerId, {x: p.x, y: p.y});
        if (this.starts.size === o.fingers) {
          this.startTime = e.eventTime;
        }
      }
    }
    if (this.starts.size > o.fingers) {
      this.done = true; // more fingers than configured: another gesture
      return false;
    }
    const current = pointers.slice(0, o.fingers);
    const origins = current.map(p => this.starts.get(p.pointerId)!);
    const startSpread = Math.max(...pairDistances(origins));
    if (e.eventTime === this.startTime) {
      const gaps = pairDistances(origins);
      if (
        this.startTime - this.firstLanding > o.maxLandingGapMs ||
        Math.min(...gaps) < o.minSeparation ||
        startSpread > o.maxSeparation
      ) {
        this.done = true; // palm, ghost touch, or two hands
        return false;
      }
    }
    if (e.eventTime - this.startTime > o.maxDurationMs) {
      this.done = true; // too slow
      return false;
    }

    const moves = current.map((p, i) => ({x: p.x - origins[i].x, y: p.y - origins[i].y}));
    for (const d of o.directions) {
      const travels = moves.map(m => dot(m, d));
      if (Math.min(...travels) < o.minDistance(d)) {
        continue; // not far enough yet in this direction
      }
      this.done = true;
      const straight = moves.every((m, i) => Math.abs(cross(m, d)) <= o.maxSlope * travels[i]);
      const together = Math.abs(Math.max(...pairDistances(current)) - startSpread) <= o.maxSeparationChange * startSpread;
      return straight && together;
    }
    return false
  }
}
