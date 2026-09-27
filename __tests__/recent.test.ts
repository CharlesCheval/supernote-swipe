jest.mock('sn-plugin-lib', () => ({FileUtils: {}, PluginManager: {}}));
import {decodeName, encodeName, kindOf} from '../src/recent';

test('paths round-trip through folder names', () => {
  const p = '/storage/emulated/0/Document/Maths/Poly S1 – séries.pdf';
  const name = encodeName(p)!;
  expect(name).not.toContain('/');
  expect(decodeName(`/data/x/recent/doc/${name}/`)).toBe(p);
  expect(decodeName(name)).toBe(p);
});

test('file kind', () => {
  expect(kindOf('/a/b.note')).toBe('note');
  expect(kindOf('/a/b.PDF')).toBe('doc');
});

test('listFiles entries as returned by the native module ({path, type})', () => {
  const p = '/storage/emulated/0/Note/Maths.note';
  const name = encodeName(p)!;
  expect(decodeName({path: `/data/x/recent/note/${name}`, type: 0})).toBe(p);
  expect(decodeName(null)).toBeNull();
  expect(decodeName({type: 1})).toBeNull();
});
