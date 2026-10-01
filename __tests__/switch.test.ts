const mockOrder: string[] = [];
let mockSaveResult: any = {success: true, result: true};
let mockCurrent = '/storage/emulated/0/Note/cours.note';
jest.mock('sn-plugin-lib', () => ({
  NativePluginManager: {getOrientation: jest.fn(async () => 0)},
  NativeUIUtils: {showRattaDialog: jest.fn(async () => true)},
  PluginCommAPI: {getCurrentFilePath: jest.fn(async () => ({success: true, result: mockCurrent}))},
  PluginFileAPI: {
    openFile: jest.fn(async () => {
      mockOrder.push('open');
      return {success: true, result: true};
    }),
  },
  PluginNoteAPI: {
    saveCurrentNote: jest.fn(async () => {
      mockOrder.push('save');
      return mockSaveResult;
    }),
  },
  PluginManager: {hasPermission: jest.fn(async () => 1), registerMotionListener: jest.fn(), getPluginDirPath: jest.fn(async () => null)},
  FileUtils: {},
}));
import {openPath} from '../src/switcher';

beforeEach(() => {
  mockOrder.length = 0;
  mockSaveResult = {success: true, result: true};
  mockCurrent = '/storage/emulated/0/Note/cours.note';
});

test('the open note is saved before another file is opened', async () => {
  await openPath('/storage/emulated/0/Document/livre.pdf');
  expect(mockOrder).toEqual(['save', 'open']);
});

test('if the note cannot be saved, nothing is opened', async () => {
  mockSaveResult = {success: false, error: {message: 'busy', code: 1}};
  await openPath('/storage/emulated/0/Document/livre.pdf');
  expect(mockOrder).toEqual(['save']);
});

test('leaving a PDF: nothing to save', async () => {
  mockCurrent = '/storage/emulated/0/Document/livre.pdf';
  await openPath('/storage/emulated/0/Note/cours.note');
  expect(mockOrder).toEqual(['open']);
});
