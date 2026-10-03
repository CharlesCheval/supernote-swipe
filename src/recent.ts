import {FileUtils, PluginManager} from 'sn-plugin-lib';

/**
 * History of the last opened files (notes and documents), newest first.
 *
 * The SDK exposes neither Supernote's "Last Open" history nor an API to write a
 * text file. Each entry is therefore persisted as the NAME of an empty folder in
 * the plugin's private directory (the only place accessible without permission):
 *
 *   <pluginDir>/recent/list/<order>~<encoded path>/
 */

export type Kind = 'note' | 'doc';

export const HISTORY_SIZE = 12;
const MAX_NAME_LENGTH = 240; // ext4 limit: 255 bytes per name

let history: string[] = [];
let baseDir: string | null = null;
let loaded: Promise<void> | null = null;
const listeners = new Set<() => void>();

export function kindOf(path: string): Kind {
  return path.toLowerCase().endsWith('.note') ? 'note' : 'doc';
}

export function encodeName(path: string): string | null {
  const name = encodeURIComponent(path);
  return name.length <= MAX_NAME_LENGTH - 10 ? name : null;
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

/** Folder name → decoded file path, with or without the "<order>~" prefix. */
export function decodeName(entry: unknown): string | null {
  const path = entryPath(entry);
  if (!path) {
    return null;
  }
  const trimmed = path.replace(/\/+$/, '');
  const name = trimmed.slice(trimmed.lastIndexOf('/') + 1);
  const tilde = name.indexOf('~');
  try {
    return decodeURIComponent(tilde >= 0 ? name.slice(tilde + 1) : name);
  } catch {
    return null;
  }
}

/** Moves `path` to the front of the history, without duplicates. */
export function pushHistory(list: string[], path: string, max = HISTORY_SIZE): string[] {
  return [path, ...list.filter(p => p !== path)].slice(0, max);
}

/** Most recent file other than `current` (the "back" target). */
export function previousIn(list: string[], current: string | null): string | null {
  return list.find(p => p !== current) ?? null;
}

/** Most recent file of a kind, other than `current`. */
export function lastOfKindIn(list: string[], kind: Kind, current: string | null): string | null {
  return list.find(p => p !== current && kindOf(p) === kind) ?? null;
}

export const getHistory = () => history;
export const previousFile = (current: string | null) => previousIn(history, current);
export const lastOfKind = (kind: Kind, current: string | null = null) => lastOfKindIn(history, kind, current);

export function subscribeHistory(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function dir(): Promise<string | null> {
  if (!baseDir) {
    const pluginDir = await PluginManager.getPluginDirPath();
    baseDir = pluginDir ? `${pluginDir}/recent` : null;
  }
  return baseDir;
}

async function listNames(path: string): Promise<unknown[]> {
  if (!(await FileUtils.exists(path))) {
    return [];
  }
  return (await FileUtils.listFiles(path)) ?? [];
}

/** Reloads the persisted history (once per plugin session), migrating the old format. */
export function loadRecent(): Promise<void> {
  if (!loaded) {
    loaded = (async () => {
      const base = await dir();
      if (!base) {
        return;
      }
      const entries = (await listNames(`${base}/list`))
        .map(e => entryPath(e))
        .filter((p): p is string => !!p)
        .sort()
        .reverse(); // "<order>~" prefixes sort newest first once reversed
      let saved = entries.map(decodeName).filter((p): p is string => !!p);
      if (!saved.length) {
        // Previous versions kept one note and one document: recent/note/<path>, recent/doc/<path>.
        const legacy = [...(await listNames(`${base}/note`)), ...(await listNames(`${base}/doc`))];
        saved = legacy.map(decodeName).filter((p): p is string => !!p);
      }
      // Paths seen during this session (before loading finished) stay in front.
      history = [...history, ...saved.filter(p => !history.includes(p))].slice(0, HISTORY_SIZE);
      listeners.forEach(fn => fn());
    })().catch(e => console.warn('[Swipe] loadRecent', e));
  }
  return loaded;
}

let writes: Promise<void> = Promise.resolve();

async function persist(snapshot: string[]) {
  if (snapshot !== history) {
    return; // a newer history will be written
  }
  const base = await dir();
  if (!base) {
    return;
  }
  const listDir = `${base}/list`;
  await FileUtils.deleteDir(listDir);
  await FileUtils.makeDir(listDir);
  // Newest entry gets the highest order number.
  for (let i = 0; i < snapshot.length; i++) {
    const name = encodeName(snapshot[i]);
    if (name) {
      await FileUtils.makeDir(`${listDir}/${String(snapshot.length - i).padStart(2, '0')}~${name}`);
    }
  }
}

export function remember(path: string | null | undefined) {
  if (!path || history[0] === path) {
    return;
  }
  history = pushHistory(history, path);
  listeners.forEach(fn => fn());
  const snapshot = history;
  writes = writes.then(() => persist(snapshot)).catch(e => console.warn('[Swipe] remember', e));
}
