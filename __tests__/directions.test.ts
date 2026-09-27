import {learnFrame, toLogical, watchedDirections} from '../src/directions';
import {DOWN, LEFT, RIGHT, UP} from '../src/gesture';

test('portrait: vertical swipes map directly', () => {
  expect(toLogical(UP, 0, false, 'unknown')).toBe('up');
  expect(toLogical(DOWN, 0, false, 'unknown')).toBe('down');
  expect(toLogical(LEFT, 0, false, 'unknown')).toBeNull();
  expect(watchedDirections(false, 'unknown')).toEqual([UP, DOWN]);
});

test('landscape, rotated (view) coordinates: vertical is vertical', () => {
  expect(toLogical(UP, 1, true, 'view')).toBe('up');
  expect(toLogical(DOWN, 3, true, 'view')).toBe('down');
  expect(toLogical(RIGHT, 1, true, 'view')).toBeNull();
  expect(watchedDirections(true, 'view')).toEqual([UP, DOWN]);
});

test('landscape, panel (raw) coordinates: horizontal is the user vertical', () => {
  expect(toLogical(RIGHT, 1, true, 'raw')).toBe('up');
  expect(toLogical(LEFT, 1, true, 'raw')).toBe('down');
  expect(toLogical(LEFT, 3, true, 'raw')).toBe('up');
  expect(toLogical(RIGHT, 3, true, 'raw')).toBe('down');
  expect(toLogical(UP, 1, true, 'raw')).toBeNull();
  expect(watchedDirections(true, 'raw')).toEqual([LEFT, RIGHT]);
});

test('landscape, frame not learned yet: both readings, no overlap', () => {
  expect(watchedDirections(true, 'unknown')).toEqual([UP, DOWN, LEFT, RIGHT]);
  expect(toLogical(UP, 1, true, 'unknown')).toBe('up');
  expect(toLogical(RIGHT, 1, true, 'unknown')).toBe('up');
});

test('frame is learned from a coordinate beyond the portrait width', () => {
  expect(learnFrame('unknown', {x: 2400, y: 500}, 1920)).toBe('view');
  expect(learnFrame('unknown', {x: 500, y: 2400}, 1920)).toBe('raw');
  expect(learnFrame('unknown', {x: 500, y: 500}, 1920)).toBe('unknown');
  expect(learnFrame('raw', {x: 2400, y: 500}, 1920)).toBe('raw');
});
