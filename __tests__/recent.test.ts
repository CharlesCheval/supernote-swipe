jest.mock('sn-plugin-lib', () => ({FileUtils: {}, PluginManager: {}}));
import {decodeName, encodeName, kindOf, lastOfKindIn, previousIn, pushHistory} from '../src/recent';

test('paths round-trip through folder names, with or without an order prefix', () => {
  const p = '/storage/emulated/0/Document/Maths/Calculus – séries.pdf';
  const name = encodeName(p)!;
  expect(name).not.toContain('/');
  expect(decodeName(`/data/x/recent/list/07~${name}/`)).toBe(p);
  expect(decodeName({path: `/data/x/recent/note/${name}`, type: 0})).toBe(p);
  expect(decodeName(name)).toBe(p);
  expect(decodeName(null)).toBeNull();
});

test('file kind', () => {
  expect(kindOf('/a/b.note')).toBe('note');
  expect(kindOf('/a/b.PDF')).toBe('doc');
});

test('history: newest first, no duplicates, bounded', () => {
  let h: string[] = [];
  for (const p of ['/a.note', '/b.pdf', '/c.note', '/b.pdf']) {
    h = pushHistory(h, p, 3);
  }
  expect(h).toEqual(['/b.pdf', '/c.note', '/a.note']);
  h = pushHistory(h, '/d.epub', 3);
  expect(h).toEqual(['/d.epub', '/b.pdf', '/c.note']);
});

test('previous file and last of a kind skip the current file', () => {
  const h = ['/now.note', '/b.pdf', '/c.note'];
  expect(previousIn(h, '/now.note')).toBe('/b.pdf');
  expect(lastOfKindIn(h, 'note', '/now.note')).toBe('/c.note');
  expect(lastOfKindIn(h, 'doc', '/now.note')).toBe('/b.pdf');
  expect(previousIn(['/now.note'], '/now.note')).toBeNull();
});
