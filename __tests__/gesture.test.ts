import {Motion, TwoFingerSwipeUp} from '../src/gesture';

const opts = () => ({minDistance: 300, maxDurationMs: 900, maxSlope: 0.7, maxLandingGapMs: 300});

/** Two fingers at (x1, y) and (x2, y), moved by (dx, -dy) in `steps` steps. */
function swipe(dy: number, {dx = 0, duration = 300, downTime = 1000, tool = 1, steps = 6, landingGap = 0} = {}): Motion[] {
  const events: Motion[] = [];
  const at = (i: number, count: number, action: number): Motion => {
    const f = i / steps;
    const pts = [
      {pointerId: 0, x: 600 + dx * f, y: 1800 - dy * f, toolType: tool},
      {pointerId: 1, x: 900 + dx * f, y: 1820 - dy * f, toolType: tool},
    ].slice(0, count);
    return {action, pointerCount: count, pointers: pts, eventTime: downTime + landingGap + duration * f, downTime, toolType: tool};
  };
  events.push(at(0, 1, 0)); // first finger
  for (let i = 0; i <= steps; i++) {
    events.push(at(i, 2, 2));
  }
  events.push(at(steps, 1, 1));
  return events;
}

const run = (d: TwoFingerSwipeUp, events: Motion[]) => events.filter(e => d.feed(e)).length;

test('clean two-finger swipe: recognized exactly once', () => {
  expect(run(new TwoFingerSwipeUp(opts), swipe(500))).toBe(1);
});

test('too short, downwards, too slow, diagonal: ignored', () => {
  expect(run(new TwoFingerSwipeUp(opts), swipe(200))).toBe(0);
  expect(run(new TwoFingerSwipeUp(opts), swipe(-500))).toBe(0);
  expect(run(new TwoFingerSwipeUp(opts), swipe(500, {duration: 2000}))).toBe(0);
  expect(run(new TwoFingerSwipeUp(opts), swipe(400, {dx: 400}))).toBe(0);
});

test('the pen never triggers', () => {
  expect(run(new TwoFingerSwipeUp(opts), swipe(500, {tool: 2}))).toBe(0);
});

test('two successive gestures: two triggers', () => {
  const d = new TwoFingerSwipeUp(opts);
  expect(run(d, [...swipe(500, {downTime: 1000}), ...swipe(500, {downTime: 5000})])).toBe(2);
});

test('a single finger does not trigger', () => {
  const one = swipe(500).map(e => ({...e, pointerCount: 1, pointers: e.pointers.slice(0, 1)}));
  expect(run(new TwoFingerSwipeUp(opts), one)).toBe(0);
});

test('fingers landing far apart in time (resting palm): ignored', () => {
  expect(run(new TwoFingerSwipeUp(opts), swipe(500, {landingGap: 800}))).toBe(0);
  expect(run(new TwoFingerSwipeUp(opts), swipe(500, {landingGap: 100}))).toBe(1);
});
