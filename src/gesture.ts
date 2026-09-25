/**
 * Two-finger swipe-up detection from the MotionEvents forwarded by
 * PluginManager.registerMotionListener (screen pixel coordinates).
 *
 * Deliberately SDK-free so it can be unit-tested. It relies only on pointer
 * positions, not on the multi-touch action codes (5/6), whose forwarding by
 * the host is undocumented.
 */

export const TOOL_FINGER = 1;
export const TOOL_PEN = 2;
export const ACTION_UP = 1;
export const ACTION_CANCEL = 3;

export type Pointer = {x: number; y: number; pointerId: number; toolType: number};

export type Motion = {
  action: number;
  pointerCount: number;
  pointers: Pointer[];
  eventTime: number;
  downTime: number;
  toolType: number;
};

export type SwipeOptions = {
  /** Minimum vertical distance travelled by EACH of the two fingers (px). */
  minDistance: number;
  /** Max time between the second finger landing and the trigger (ms). */
  maxDurationMs: number;
  /** Allowed horizontal drift, as a fraction of the vertical travel. */
  maxSlope: number;
  /** Max delay between the two fingers landing (ms); a resting palm lands unevenly. */
  maxLandingGapMs: number;
};

export class TwoFingerSwipeUp {
  private downTime = Number.NaN;
  private starts = new Map<number, {x: number; y: number}>();
  private startTime = 0;
  private firstLanding = 0;
  private done = false; // fired or abandoned for this gesture

  constructor(private readonly options: () => SwipeOptions) {}

  /** Returns true at the exact moment the gesture is recognized (once per gesture). */
  feed(e: Motion): boolean {
    if (e.downTime !== this.downTime) {
      this.downTime = e.downTime;
      this.starts.clear();
      this.done = false;
      this.firstLanding = e.downTime;
    }
    const pointers = e.pointers ?? [];
    if (this.done || e.action === ACTION_CANCEL) {
      return false;
    }
    if (e.toolType === TOOL_PEN || pointers.some(p => p.toolType === TOOL_PEN)) {
      this.done = true;
      return false;
    }
    if (pointers.length < 2) {
      return false;
    }

    for (const p of pointers) {
      if (!this.starts.has(p.pointerId)) {
        this.starts.set(p.pointerId, {x: p.x, y: p.y});
        if (this.starts.size === 2) {
          this.startTime = e.eventTime;
        }
      }
    }
    if (this.starts.size === 2 && this.startTime - this.firstLanding > this.options().maxLandingGapMs) {
      this.done = true; // fingers landed too far apart in time: palm or accidental touch
      return false;
    }
    if (this.starts.size > 2) {
      this.done = true; // three fingers: another gesture
      return false;
    }

    const [a, b] = pointers;
    const sa = this.starts.get(a.pointerId)!;
    const sb = this.starts.get(b.pointerId)!;
    const dy: [number, number] = [sa.y - a.y, sb.y - b.y];
    const dx: [number, number] = [a.x - sa.x, b.x - sb.x];
    const durationMs = e.eventTime - this.startTime;
    const {minDistance, maxDurationMs, maxSlope} = this.options();

    if (durationMs > maxDurationMs) {
      this.done = true; // too slow
      return false;
    }
    if (Math.min(...dy) < minDistance) {
      return false; // not high enough yet
    }
    this.done = true;
    // Too diagonal: abandon this gesture without firing.
    return Math.abs(dx[0]) <= maxSlope * dy[0] && Math.abs(dx[1]) <= maxSlope * dy[1];
  }
}
