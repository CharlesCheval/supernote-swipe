import {FileUtils, PluginManager} from 'sn-plugin-lib';

/**
 * Remembers the last displayed PDF/document and the last displayed note.
 *
 * The SDK exposes neither Supernote's "Last Open" history nor an API to write a
 * text file. Each path is therefore persisted as the NAME of an empty folder in
 * the plugin's private directory (the only place accessible without permission):
 *
 *   <pluginDir>/recent/note/<encoded path>/
 *   <pluginDir>/recent/doc/<encoded path>/
 */

export type Kind = 'note' | 'doc';

const MAX_NAME_LENGTH = 240; // ext4 limit: 255 bytes per name

const memory: Record<Kind, string | null> = {note: null, doc: null};
let baseDir: string | null = null;
let loaded: Promise<void> | null = null;

export function kindOf(path: string): Kind {
  return path.toLowerCase().endsWith('.note') ? 'note' : 'doc';
}

export function encodeName(path: string): string | null {
  const name = encodeURIComponent(path);
  return name.length <= MAX_NAME_LENGTH ? name : null;
}

/**
 * `FileUtils.listFiles` is typed as returning strings, but the native module
 * returns `{path, type}` objects (type 0 = folder, 1 = file). Accept both.
 */
export function entryPath(entry: unknown): string | null {
  if (typeof entry === 'string') {
    return entry;
  }
  const path = (entry as {path?: unknown} | null)?.path;
  return typeof path === 'string' ? path : null;
}

export function decodeName(entry: unknown): string | null {
  const path = entryPath(entry);
  if (!path) {
    return null;
  }
  const name = path.replace(/\/+$/, '');
  try {
    return decodeURIComponent(name.slice(name.lastIndexOf('/') + 1));
  } catch {
    return null;
  }
}

async function dirFor(kind: Kind): Promise<string | null> {
  if (!baseDir) {
    const pluginDir = await PluginManager.getPluginDirPath();
    if (!pluginDir) {
      return null;
    }
    baseDir = `${pluginDir}/recent`;
  }
  return `${baseDir}/${kind}`;
}

async function loadKind(kind: Kind) {
  const dir = await dirFor(kind);
  if (!dir || !(await FileUtils.exists(dir))) {
    return;
  }
  const entries: unknown[] = (await FileUtils.listFiles(dir)) ?? [];
  const path = entries.map(decodeName).find(Boolean);
  if (path && !memory[kind]) {
    memory[kind] = path;
  }
}

/** Reloads the persisted paths (once per plugin session). */
export function loadRecent(): Promise<void> {
  if (!loaded) {
    loaded = Promise.all([loadKind('note'), loadKind('doc')])
      .then(() => undefined)
      .catch(e => console.warn('[SwipeSwitch] loadRecent', e));
  }
  return loaded;
}

export function getRecent(kind: Kind): string | null {
  return memory[kind];
}

export async function remember(path: string | null | undefined) {
  if (!path) {
    return;
  }
  const kind = kindOf(path);
  if (memory[kind] === path) {
    return;
  }
  memory[kind] = path;
  // Serialized writes: two close calls must not interleave.
  writes = writes.then(() => persist(kind, path)).catch(e => console.warn('[SwipeSwitch] remember', e));
  return writes;
}

let writes: Promise<void> = Promise.resolve();

async function persist(kind: Kind, path: string) {
  if (memory[kind] !== path) {
    return; // already replaced by a newer path
  }
  const dir = await dirFor(kind);
  const name = encodeName(path);
  if (!dir || !name) {
    return; // keep in memory only
  }
  await FileUtils.deleteDir(dir);
  await FileUtils.makeDir(dir);
  await FileUtils.makeDir(`${dir}/${name}`);
}
