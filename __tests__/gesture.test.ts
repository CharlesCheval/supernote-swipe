import {LEFT, Motion, RIGHT, SwipeOptions, TwoFingerSwipe, UP, Vec} from '../src/gesture';

const opts = (directions: Vec[] = [UP]) => (): SwipeOptions => ({
  directions,
  minDistance: () => 300,
  maxDurationMs: 900,
  maxSlope: 0.7,
  maxLandingGapMs: 300,
  minSeparation: 60,
  maxSeparation: 960,
  maxSeparationChange: 0.35,
});

type SwipeParams = {
  dir?: Vec;
  dist?: number;
  drift?: number;
  duration?: number;
  downTime?: number;
  tool?: number;
  steps?: number;
  landingGap?: number;
  gap?: number;
  spread?: number;
};

/** Two fingers `gap` px apart, moving `dist` px along `dir`; the gap grows by `spread` px. */
function swipe({dir = UP, dist = 500, drift = 0, duration = 300, downTime = 1000, tool = 1, steps = 6, landingGap = 0, gap = 300, spread = 0}: SwipeParams = {}): Motion[] {
  const perp = {x: -dir.y, y: dir.x};
  const at = (i: number, count: number, action: number): Motion => {
    const f = i / steps;
    const move = {x: dir.x * dist * f + perp.x * drift * f, y: dir.y * dist * f + perp.y * drift * f};
    const pts = [
      {pointerId: 0, x: 900 + move.x, y: 1300 + move.y, toolType: tool},
      {pointerId: 1, x: 900 + move.x + perp.x * (gap + spread * f), y: 1300 + move.y + perp.y * (gap + spread * f), toolType: tool},
    ].slice(0, count);
    return {action, pointerCount: count, pointers: pts, eventTime: downTime + (count > 1 ? landingGap : 0) + duration * f, downTime, toolType: tool};
  };
  const events = [at(0, 1, 0)];
  for (let i = 0; i <= steps; i++) {
    events.push(at(i, 2, 2));
  }
  events.push(at(steps, 1, 1));
  return events;
}

const run = (d: TwoFingerSwipe, events: Motion[]) => events.filter(e => d.feed(e)).length;

test('clean two-finger swipe up: recognized exactly once', () => {
  expect(run(new TwoFingerSwipe(opts()), swipe())).toBe(1);
});

test('too short, downwards, too slow, diagonal: ignored', () => {
  expect(run(new TwoFingerSwipe(opts()), swipe({dist: 200}))).toBe(0);
  expect(run(new TwoFingerSwipe(opts()), swipe({dist: -500}))).toBe(0);
  expect(run(new TwoFingerSwipe(opts()), swipe({duration: 2000}))).toBe(0);
  expect(run(new TwoFingerSwipe(opts()), swipe({dist: 400, drift: 400}))).toBe(0);
});

test('the pen never triggers', () => {
  expect(run(new TwoFingerSwipe(opts()), swipe({tool: 2}))).toBe(0);
});

test('two successive gestures: two triggers', () => {
  const d = new TwoFingerSwipe(opts());
  expect(run(d, [...swipe({downTime: 1000}), ...swipe({downTime: 5000})])).toBe(2);
});

test('a single finger does not trigger', () => {
  const one = swipe().map(e => ({...e, pointerCount: 1, pointers: e.pointers.slice(0, 1)}));
  expect(run(new TwoFingerSwipe(opts()), one)).toBe(0);
});

test('palm-like touches are ignored', () => {
  expect(run(new TwoFingerSwipe(opts()), swipe({landingGap: 800}))).toBe(0); // uneven landing
  expect(run(new TwoFingerSwipe(opts()), swipe({gap: 20}))).toBe(0); // one blob
  expect(run(new TwoFingerSwipe(opts()), swipe({gap: 1400}))).toBe(0); // two hands
  expect(run(new TwoFingerSwipe(opts()), swipe({spread: 400}))).toBe(0); // fingers drifting apart
  expect(run(new TwoFingerSwipe(opts()), swipe({landingGap: 100}))).toBe(1);
});

test('a stale downTime does not chain separate touches into a swipe', () => {
  // After waking up, two unrelated touches may report the same downTime.
  const first = swipe({dist: 0}).map(e => ({...e, downTime: 42}));
  const second = swipe({dist: 0}).map(e => ({
    ...e,
    downTime: 42,
    pointers: e.pointers.map(p => ({...p, y: p.y - 700})),
  }));
  expect(run(new TwoFingerSwipe(opts()), [...first, ...second])).toBe(0);
});

test('landscape: sideways swipes accepted only when allowed', () => {
  expect(run(new TwoFingerSwipe(opts()), swipe({dir: LEFT}))).toBe(0);
  expect(run(new TwoFingerSwipe(opts([UP, LEFT, RIGHT])), swipe({dir: LEFT}))).toBe(1);
  expect(run(new TwoFingerSwipe(opts([UP, LEFT, RIGHT])), swipe({dir: RIGHT}))).toBe(1);
});
