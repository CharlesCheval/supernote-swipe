import {Dimensions, PixelRatio} from 'react-native';
import {NativePluginManager, NativeUIUtils, PluginCommAPI, PluginFileAPI, PluginManager} from 'sn-plugin-lib';
import {Frame, learnFrame, toLogical, watchedDirections} from './directions';
import {Motion, MultiFingerSwipe, TOOL_PEN} from './gesture';
import {kindOf, lastOfKind, loadRecent, previousFile, remember} from './recent';
import {Action, GESTURES, getOptions, getSettings} from './settings';
import {showView} from './view';

/** Screen size in pixels, natural (portrait) orientation: Manta 1920×2560, A6X 1404×1872. */
function screenPx(): {w: number; h: number} {
  const s = Dimensions.get('screen');
  const a = s.width * PixelRatio.get();
  const b = s.height * PixelRatio.get();
  return a > 0 && b > 0 ? {w: Math.min(a, b), h: Math.max(a, b)} : {w: 1404, h: 1872};
}

/** Each finger must travel at least 15% of the screen along the swipe axis. */
const MIN_DISTANCE_RATIO = 0.15;
/** No swipe while the pen is in use (e.g. a resting palm during a lasso). */
const PEN_QUIET_MS = 400;

// ---------------------------------------------------------------------------
// Orientation
// ---------------------------------------------------------------------------

/** Display rotation reported by the host (0, 1 = 90°, 2 = 180°, 3 = 270°), refreshed at each touch. */
let rotation = 0;
/** Coordinate frame used by the host in landscape, learned from touches. */
let frame: Frame = 'unknown';

/**
 * Landscape if the host reports a 90°/270° rotation, or, should it always report
 * 0, if the plugin's own window is wider than tall.
 */
export function isLandscape(): boolean {
  if (rotation === 1 || rotation === 3) {
    return true;
  }
  const w = Dimensions.get('window');
  return w.width > w.height;
}

/** Rotation used for direction mapping: landscape without a reported rotation is assumed to be 90°. */
function effectiveRotation(): number {
  return isLandscape() && rotation !== 1 && rotation !== 3 ? 1 : rotation;
}

/** Reads the display rotation from the host. */
export function refreshOrientation(): Promise<void> {
  return NativePluginManager.getOrientation()
    .then(r => {
      const next = typeof r === 'number' ? r : 0;
      if (next !== rotation) {
        frame = 'unknown'; // re-learn after a rotation change
      }
      rotation = next;
    })
    .catch(() => undefined);
}

/** What the plugin currently detects, shown on the settings screen. */
export function orientationInfo(): string {
  const w = Dimensions.get('window');
  return (
    `${isLandscape() ? 'landscape' : 'portrait'} · rotation ${rotation * 90}° · ` +
    `window ${Math.round(w.width)}×${Math.round(w.height)} · touch frame ${frame}`
  );
}

// ---------------------------------------------------------------------------
// Gesture detection
// ---------------------------------------------------------------------------

/** Gestures enabled in the current orientation. */
function activeGestures() {
  const s = getSettings();
  const landscape = isLandscape();
  return GESTURES.filter(g => {
    const setting = s[g.id];
    return setting.action !== 'none' && (landscape ? setting.landscape : setting.portrait);
  });
}

const detector = new MultiFingerSwipe(() => {
  const {w, h} = screenPx();
  const fingers = [...new Set(activeGestures().map(g => g.fingers))];
  return {
    fingers: fingers.length ? fingers : [99], // nothing enabled: nothing can match
    directions: watchedDirections(isLandscape(), frame),
    minDistance: d => (d.x !== 0 ? w : h) * MIN_DISTANCE_RATIO,
    maxDurationMs: 900,
    maxSlope: 0.7,
    maxLandingGapMs: n => (n >= 3 ? 450 : 300), // three fingers land a little less evenly
    minSeparation: w * 0.03,
    maxSeparation: w * 0.5,
    maxSeparationChange: 0.35,
  };
});

let lastPenAt = 0;

/** Last recognized swipe, shown on the settings screen to check the mapping. */
export let lastGesture = '';
const gestureListeners = new Set<() => void>();

export function subscribeGesture(fn: () => void): () => void {
  gestureListeners.add(fn);
  return () => gestureListeners.delete(fn);
}

// ---------------------------------------------------------------------------
// Current file tracking
// ---------------------------------------------------------------------------

async function currentFile(): Promise<string | null> {
  const res: any = await PluginCommAPI.getCurrentFilePath();
  return res?.success ? res.result ?? null : null;
}

let trackedDownTime = Number.NaN;
let tracked: Promise<string | null> = Promise.resolve(null);

/**
 * At the start of every touch (finger or pen), read the displayed file.
 * During a gesture this read completes before the swipe ends, so the
 * action does not need to query the host again.
 */
function track(e: Motion) {
  if (e.downTime === trackedDownTime && (e.action & 0xff) !== 0) {
    return; // same touch (a new ACTION_DOWN always counts, even with a stale downTime)
  }
  trackedDownTime = e.downTime;
  tracked = currentFile().catch(() => null);
  tracked.then(path => remember(path));
  refreshOrientation();
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

let readGranted = false;

async function ensureReadPermission(): Promise<boolean> {
  if (readGranted) {
    return true;
  }
  const permission = 'plugin.permission.FILE:READ';
  if ((await PluginManager.hasPermission(permission)) < 1) {
    const choice = await PluginManager.requestPermission(permission, 'SwipeSwitch needs to open your notes and documents.');
    if (choice !== 1 && choice !== 2) {
      return false;
    }
  }
  readGranted = true;
  return true;
}

async function notify(message: string) {
  try {
    await NativeUIUtils.showRattaDialog(message, '', 'OK', false);
  } catch {
    console.warn('[SwipeSwitch]', message);
  }
}

/** Opens a file at its last read page. */
export async function openPath(target: string): Promise<void> {
  if (!(await ensureReadPermission())) {
    await notify('Read permission denied: the file cannot be opened.');
    return;
  }
  const res: any = await PluginFileAPI.openFile(target, -1);
  if (!res?.success || !res.result) {
    await notify(`Cannot open (file moved or deleted?):\n${target}`);
  }
}

/** The file an action opens, or a message explaining why there is none. */
export function targetFor(action: Action, current: string | null, file?: string): {path?: string; missing?: string} {
  switch (action) {
    case 'toggle': {
      const wanted = current && kindOf(current) === 'note' ? 'doc' : 'note';
      const path = lastOfKind(wanted, current);
      return path ? {path} : {missing: wanted === 'doc' ? 'No recent PDF yet.' : 'No recent note yet.'};
    }
    case 'previous': {
      const path = previousFile(current);
      return path ? {path} : {missing: 'No previous file yet.'};
    }
    case 'lastNote': {
      const path = lastOfKind('note', current);
      return path ? {path} : {missing: 'No recent note yet.'};
    }
    case 'lastDoc': {
      const path = lastOfKind('doc', current);
      return path ? {path} : {missing: 'No recent PDF yet.'};
    }
    case 'file':
      return file ? {path: file} : {missing: 'No file chosen for this gesture yet (see the plugin settings).'};
    default:
      return {};
  }
}

let running = false;

async function runAction(action: Action, file?: string) {
  if (running || action === 'none') {
    return;
  }
  running = true;
  try {
    if (action === 'recent') {
      await loadRecent();
      showView('recent');
      return;
    }
    const [current] = await Promise.all([tracked, loadRecent()]);
    const {path, missing} = targetFor(action, current, file);
    if (path) {
      await openPath(path);
    } else if (missing) {
      await notify(missing);
    }
  } catch (e: any) {
    await notify(`Error: ${e?.message ?? e}`);
  } finally {
    running = false;
  }
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

export function start() {
  loadRecent();
  refreshOrientation();
  PluginManager.registerMotionListener(1, {
    onMsg(msg: unknown) {
      const e = msg as Motion;
      if (!e || !Array.isArray(e.pointers)) {
        return;
      }
      track(e);
      if (isLandscape()) {
        for (const p of e.pointers) {
          frame = learnFrame(frame, p, screenPx().w);
        }
      }
      if (e.toolType === TOOL_PEN || e.pointers.some(p => p.toolType === TOOL_PEN)) {
        lastPenAt = Date.now();
        return;
      }
      const swipe = detector.feed(e);
      if (!swipe || Date.now() - lastPenAt <= PEN_QUIET_MS) {
        return;
      }
      let logical = toLogical(swipe.direction, effectiveRotation(), isLandscape(), frame);
      if (logical && isLandscape() && getOptions().landscapeFlip) {
        logical = logical === 'up' ? 'down' : 'up';
      }
      const gesture = activeGestures().find(g => g.fingers === swipe.fingers && g.direction === logical);
      lastGesture = `${swipe.fingers} fingers ${logical === 'up' ? '↑' : logical === 'down' ? '↓' : '(sideways)'} ${
        gesture ? `→ ${getSettings()[gesture.id].action}` : '→ no action'
      }`;
      gestureListeners.forEach(fn => fn());
      if (gesture) {
        const setting = getSettings()[gesture.id];
        runAction(setting.action, setting.file);
      }
    },
  });
}
