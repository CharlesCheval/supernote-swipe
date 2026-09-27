import {FileUtils, PluginManager} from 'sn-plugin-lib';

/**
 * Gesture → action settings, persisted across restarts.
 *
 * The SDK has no API to write a text file, so each gesture's JSON is stored as
 * the NAME of an empty folder in the plugin's private directory:
 *   <pluginDir>/settings/gestures/<gesture id>/<encoded JSON>/
 * One folder per gesture keeps each name well under the 255-byte limit, even
 * with a file path inside.
 */

export type Action = 'none' | 'toggle' | 'previous' | 'lastNote' | 'lastDoc' | 'file' | 'recent';

export const ACTIONS: {id: Action; label: string}[] = [
  {id: 'none', label: 'Nothing'},
  {id: 'toggle', label: 'PDF ⇄ Note'},
  {id: 'previous', label: 'Previous file'},
  {id: 'lastNote', label: 'Last note'},
  {id: 'lastDoc', label: 'Last PDF / document'},
  {id: 'file', label: 'Open a specific file'},
  {id: 'recent', label: 'Recent files list'},
];

export type GestureId = '2-up' | '2-down' | '3-up' | '3-down';

export const GESTURES: {id: GestureId; fingers: number; direction: 'up' | 'down'; label: string}[] = [
  {id: '2-up', fingers: 2, direction: 'up', label: '2 fingers ↑'},
  {id: '2-down', fingers: 2, direction: 'down', label: '2 fingers ↓'},
  {id: '3-up', fingers: 3, direction: 'up', label: '3 fingers ↑'},
  {id: '3-down', fingers: 3, direction: 'down', label: '3 fingers ↓'},
];

export type GestureSetting = {
  action: Action;
  portrait: boolean;
  landscape: boolean;
  /** Path opened by the 'file' action. */
  file?: string;
};

export type Settings = Record<GestureId, GestureSetting>;

/** Same behaviour as before gestures were configurable. */
export const DEFAULTS: Settings = {
  '2-up': {action: 'toggle', portrait: true, landscape: false},
  '2-down': {action: 'none', portrait: true, landscape: false},
  '3-up': {action: 'toggle', portrait: false, landscape: true},
  '3-down': {action: 'none', portrait: false, landscape: true},
};

/** Global options, next to the per-gesture settings. */
export type Options = {
  /** Swap up and down in landscape, should the device report its rotation the other way round. */
  landscapeFlip: boolean;
};

export const DEFAULT_OPTIONS: Options = {landscapeFlip: false};

let current: Settings = clone(DEFAULTS);
let options: Options = {...DEFAULT_OPTIONS};

export const getOptions = () => options;
const listeners = new Set<() => void>();

function clone(s: Settings): Settings {
  return JSON.parse(JSON.stringify(s));
}

export const getSettings = () => current;

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const notify = () => listeners.forEach(fn => fn());

/** `listFiles` is typed as strings, but the native module returns {path, type} objects. */
export function entryName(entry: unknown): string | null {
  const path = typeof entry === 'string' ? entry : (entry as {path?: unknown} | null)?.path;
  if (typeof path !== 'string') {
    return null;
  }
  const trimmed = path.replace(/\/+$/, '');
  return trimmed.slice(trimmed.lastIndexOf('/') + 1);
}

function decodeJson(name: string | null): any {
  if (!name) {
    return null;
  }
  try {
    return JSON.parse(decodeURIComponent(name));
  } catch {
    return null;
  }
}

async function list(dir: string): Promise<string[]> {
  if (!(await FileUtils.exists(dir))) {
    return [];
  }
  const entries: unknown[] = (await FileUtils.listFiles(dir)) ?? [];
  return entries.map(entryName).filter((n): n is string => !!n);
}

/** Settings from the previous version: {portraitFingers, landscapeFingers}. */
export function migrateLegacy(legacy: {portraitFingers?: number; landscapeFingers?: number}): Settings {
  const s = clone(DEFAULTS);
  const p = legacy.portraitFingers === 3 ? 3 : 2;
  const l = legacy.landscapeFingers === 2 ? 2 : 3;
  for (const g of GESTURES.filter(x => x.direction === 'up')) {
    s[g.id] = {action: 'toggle', portrait: g.fingers === p, landscape: g.fingers === l};
  }
  return s;
}

let baseDir: string | null = null;

async function settingsDir(): Promise<string | null> {
  if (!baseDir) {
    const dir = await PluginManager.getPluginDirPath();
    baseDir = dir ? `${dir}/settings` : null;
  }
  return baseDir;
}

export async function loadSettings() {
  try {
    const dir = await settingsDir();
    if (!dir) {
      return;
    }
    const savedOptions = decodeJson((await list(`${dir}/options`))[0] ?? null);
    if (savedOptions) {
      options = {...DEFAULT_OPTIONS, ...savedOptions};
    }
    const next = clone(DEFAULTS);
    let found = false;
    for (const g of GESTURES) {
      const saved = decodeJson((await list(`${dir}/gestures/${g.id}`))[0] ?? null);
      if (saved) {
        next[g.id] = {...next[g.id], ...saved};
        found = true;
      }
    }
    if (!found) {
      // Previous version: a single folder named after the JSON, directly in settings/.
      const legacy = (await list(dir)).map(decodeJson).find(v => v && ('portraitFingers' in v || 'landscapeFingers' in v));
      if (legacy) {
        current = migrateLegacy(legacy);
        notify();
        GESTURES.forEach(g => persist(g.id));
        return;
      }
    }
    current = next;
    notify();
  } catch (e) {
    console.warn('[SwipeSwitch] loadSettings', e);
  }
}

let writes: Promise<void> = Promise.resolve();

function persist(id: GestureId) {
  const snapshot = current[id];
  writes = writes
    .then(async () => {
      if (snapshot !== current[id]) {
        return; // a newer value will be written
      }
      const dir = await settingsDir();
      const name = encodeURIComponent(JSON.stringify(snapshot));
      if (!dir || name.length > 240) {
        return; // keep in memory only (very long file path)
      }
      const gestureDir = `${dir}/gestures/${id}`;
      await FileUtils.deleteDir(gestureDir);
      await FileUtils.makeDir(gestureDir);
      await FileUtils.makeDir(`${gestureDir}/${name}`);
    })
    .catch(e => console.warn('[SwipeSwitch] saveSettings', e));
}

export function updateGesture(id: GestureId, patch: Partial<GestureSetting>) {
  current = {...current, [id]: {...current[id], ...patch}};
  notify();
  persist(id);
}

function persistOptions() {
  const snapshot = options;
  writes = writes
    .then(async () => {
      const dir = await settingsDir();
      if (!dir || snapshot !== options) {
        return;
      }
      await FileUtils.deleteDir(`${dir}/options`);
      await FileUtils.makeDir(`${dir}/options`);
      await FileUtils.makeDir(`${dir}/options/${encodeURIComponent(JSON.stringify(snapshot))}`);
    })
    .catch(e => console.warn('[SwipeSwitch] saveOptions', e));
}

export function updateOptions(patch: Partial<Options>) {
  options = {...options, ...patch};
  notify();
  persistOptions();
}

export function resetSettings() {
  current = clone(DEFAULTS);
  options = {...DEFAULT_OPTIONS};
  notify();
  GESTURES.forEach(g => persist(g.id));
  persistOptions();
}
