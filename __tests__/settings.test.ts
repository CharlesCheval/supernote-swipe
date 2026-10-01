jest.mock('sn-plugin-lib', () => ({FileUtils: {}, PluginManager: {}}));
import {DEFAULTS, decodeGesture, encodeGesture, entryName, migrateLegacy} from '../src/settings';

test('defaults reproduce the previous behaviour', () => {
  expect(DEFAULTS['2-up']).toMatchObject({action: 'toggle', portrait: true, landscape: false});
  expect(DEFAULTS['3-up']).toMatchObject({action: 'toggle', portrait: false, landscape: true});
  expect(DEFAULTS['2-down'].action).toBe('none');
});

test('previous finger settings are migrated', () => {
  const s = migrateLegacy({portraitFingers: 3, landscapeFingers: 3});
  expect(s['3-up']).toMatchObject({action: 'toggle', portrait: true, landscape: true});
  expect(s['2-up']).toMatchObject({portrait: false, landscape: false});
});

test('listFiles entries ({path, type}) give the folder name', () => {
  expect(entryName({path: '/p/settings/gestures/2-up/abc', type: 0})).toBe('abc');
  expect(entryName('/p/settings/x/')).toBe('x');
  expect(entryName({type: 1})).toBeNull();
});

test('a gesture with a very long file path is saved as short names and read back', () => {
  const file = `/storage/emulated/0/Document/${'Very long folder name with accents éàü/'.repeat(12)}cours.pdf`;
  const g = {action: 'file' as const, portrait: true, landscape: false, file};
  const names = encodeGesture(g);
  expect(Math.max(...names.map(n => n.length))).toBeLessThanOrEqual(190);
  expect(decodeGesture(names)).toEqual(g);
  expect(decodeGesture([...names].reverse())).toEqual(g); // listing order does not matter
});

test('incomplete save ignored as such; the former one-name format still read', () => {
  const g = {action: 'toggle' as const, portrait: true, landscape: true};
  expect(decodeGesture(encodeGesture(g))).toEqual(g);
  expect(decodeGesture([encodeURIComponent(JSON.stringify(g))])).toEqual(g);
});
