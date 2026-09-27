jest.mock('sn-plugin-lib', () => ({FileUtils: {}, PluginManager: {}}));
import {DEFAULTS, entryName, migrateLegacy} from '../src/settings';

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
