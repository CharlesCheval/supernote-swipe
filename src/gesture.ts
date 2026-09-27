/**
 * Two-finger swipe detection from the MotionEvents forwarded by
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
  /** Accepted swipe directions (unit vectors). */
  directions: Vec[];
  /** Minimum travel of EACH finger along a direction (px). */
  minDistance: (direction: Vec) => number;
  /** Max time between the second finger landing and the trigger (ms). */
  maxDurationMs: number;
  /** Allowed sideways drift, as a fraction of the travel. */
  maxSlope: number;
  /** Max delay between the two fingers landing (ms); a resting palm lands unevenly. */
  maxLandingGapMs: number;
  /** Allowed distance between the two fingers at landing (px): not a single blob, not both hands. */
  minSeparation: number;
  maxSeparation: number;
  /** Two fingers of one hand move together: their gap may change by at most this fraction. */
  maxSeparationChange: number;
};

const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y;
const cross = (a: Vec, b: Vec) => a.x * b.y - a.y * b.x;
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

export class TwoFingerSwipe {
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
    if (pointers.length < 2) {
      return false;
    }

    const o = this.options();
    for (const p of pointers) {
      if (!this.starts.has(p.pointerId)) {
        this.starts.set(p.pointerId, {x: p.x, y: p.y});
        if (this.starts.size === 2) {
          this.startTime = e.eventTime;
        }
      }
    }
    if (this.starts.size > 2) {
      this.done = true; // three fingers: another gesture
      return false;
    }
    const [a, b] = pointers;
    const sa = this.starts.get(a.pointerId)!;
    const sb = this.starts.get(b.pointerId)!;
    if (this.starts.size === 2 && e.eventTime === this.startTime) {
      const gap = dist(sa, sb);
      if (this.startTime - this.firstLanding > o.maxLandingGapMs || gap < o.minSeparation || gap > o.maxSeparation) {
        this.done = true; // palm, ghost touch, or two hands
        return false;
      }
    }
    if (e.eventTime - this.startTime > o.maxDurationMs) {
      this.done = true; // too slow
      return false;
    }

    const da = {x: a.x - sa.x, y: a.y - sa.y};
    const db = {x: b.x - sb.x, y: b.y - sb.y};
    for (const d of o.directions) {
      const ta = dot(da, d);
      const tb = dot(db, d);
      const min = o.minDistance(d);
      if (ta < min || tb < min) {
        continue; // not far enough yet in this direction
      }
      this.done = true;
      const straight = Math.abs(cross(da, d)) <= o.maxSlope * ta && Math.abs(cross(db, d)) <= o.maxSlope * tb;
      const together = Math.abs(dist(a, b) - dist(sa, sb)) <= o.maxSeparationChange * dist(sa, sb);
      return straight && together;
    }
    return false;
  }
}
