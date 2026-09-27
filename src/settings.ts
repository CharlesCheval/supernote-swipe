import {FileUtils, PluginManager} from 'sn-plugin-lib';

/**
 * Persistent settings. The SDK has no API to write a text file, so the JSON is
 * stored as the NAME of an empty folder in the plugin's private directory.
 */

export type Settings = {
  /** Fingers for the swipe in portrait. */
  portraitFingers: number;
  /** Fingers for the swipe in landscape, where two-finger swipes already scroll the page. */
  landscapeFingers: number;
};

export const DEFAULTS: Settings = {
  portraitFingers: 2,
  landscapeFingers: 3,
};

export const FINGER_CHOICES = [2, 3];

let current: Settings = {...DEFAULTS};
const listeners = new Set<() => void>();

export const getSettings = () => current;

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function settingsDir(): Promise<string | null> {
  const dir = await PluginManager.getPluginDirPath();
  return dir ? `${dir}/settings` : null;
}

export async function loadSettings() {
  try {
    const dir = await settingsDir();
    if (!dir || !(await FileUtils.exists(dir))) {
      return;
    }
    // Typed as strings, but the native module returns {path, type} objects.
    const entries: unknown[] = (await FileUtils.listFiles(dir)) ?? [];
    for (const entry of entries) {
      const path = typeof entry === 'string' ? entry : (entry as {path?: string} | null)?.path;
      if (typeof path !== 'string') {
        continue;
      }
      const name = path.replace(/\/+$/, '');
      try {
        const saved = JSON.parse(decodeURIComponent(name.slice(name.lastIndexOf('/') + 1)));
        current = {...DEFAULTS, ...saved};
        listeners.forEach(fn => fn());
        return;
      } catch {
        // unreadable entry: try the next one
      }
    }
  } catch (e) {
    console.warn('[SwipeSwitch] loadSettings', e);
  }
}

let writes: Promise<void> = Promise.resolve();

export function updateSettings(patch: Partial<Settings>) {
  current = {...current, ...patch};
  listeners.forEach(fn => fn());
  const snapshot = current;
  writes = writes
    .then(async () => {
      if (snapshot !== current) {
        return; // a newer value will be written
      }
      const dir = await settingsDir();
      if (!dir) {
        return;
      }
      await FileUtils.deleteDir(dir);
      await FileUtils.makeDir(dir);
      await FileUtils.makeDir(`${dir}/${encodeURIComponent(JSON.stringify(snapshot))}`);
    })
    .catch(e => console.warn('[SwipeSwitch] saveSettings', e));
}
