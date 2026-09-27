import {Dimensions, PixelRatio} from 'react-native';
import {NativePluginManager, NativeUIUtils, PluginCommAPI, PluginFileAPI, PluginManager} from 'sn-plugin-lib';
import {DOWN, LEFT, Motion, MultiFingerSwipe, RIGHT, TOOL_PEN, UP, Vec} from './gesture';
import {getRecent, kindOf, loadRecent, remember} from './recent';
import {getSettings} from './settings';

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

/**
 * Display rotation (0, 1 = 90°, 2 = 180°, 3 = 270°), refreshed at each touch.
 * The host may forward coordinates either in the rotated view or in the panel's
 * natural orientation, so in landscape both readings of "up" are accepted.
 */
let rotation = 0;

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

/** What the plugin currently detects, shown on the settings screen. */
export function orientationInfo(): string {
  const w = Dimensions.get('window');
  return `${isLandscape() ? 'landscape' : 'portrait'} (rotation ${rotation * 90}°, window ${Math.round(w.width)}×${Math.round(w.height)})`;
}

function directionsFor(r: number): Vec[] {
  switch (r) {
    case 1:
    case 3:
      return [UP, LEFT, RIGHT];
    case 2:
      return [UP, DOWN];
    default:
      return [UP];
  }
}

const detector = new MultiFingerSwipe(() => {
  const {w, h} = screenPx();
  const settings = getSettings();
  const fingers = isLandscape() ? settings.landscapeFingers : settings.portraitFingers;
  return {
    fingers,
    directions: directionsFor(isLandscape() && rotation === 0 ? 1 : rotation),
    minDistance: d => (d.x !== 0 ? w : h) * MIN_DISTANCE_RATIO,
    maxDurationMs: 900,
    maxSlope: 0.7,
    maxLandingGapMs: fingers >= 3 ? 450 : 300, // three fingers land a little less evenly
    minSeparation: w * 0.03,
    maxSeparation: w * 0.5,
    maxSeparationChange: 0.35,
  };
});

let lastPenAt = 0;

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
 * switch does not need to query the host again.
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

/** Reads the display rotation from the host (0, 1 = 90°, 2 = 180°, 3 = 270°). */
export function refreshOrientation(): Promise<void> {
  return NativePluginManager.getOrientation()
    .then(r => {
      rotation = typeof r === 'number' ? r : 0;
    })
    .catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Switching
// ---------------------------------------------------------------------------

let readGranted = false;

async function ensureReadPermission(): Promise<boolean> {
  if (readGranted) {
    return true;
  }
  const permission = 'plugin.permission.FILE:READ';
  if ((await PluginManager.hasPermission(permission)) < 1) {
    const choice = await PluginManager.requestPermission(
      permission,
      'The swipe gesture needs to open your notes and documents.',
    );
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

let switching = false;

/** From a note: last opened PDF. From a PDF: last opened note. */
async function switchToLastOther() {
  if (switching) {
    return;
  }
  switching = true;
  try {
    const [granted, current] = await Promise.all([ensureReadPermission(), tracked, loadRecent()]);
    if (!granted) {
      await notify('Read permission denied: the file cannot be opened.');
      return;
    }
    const wanted = current && kindOf(current) === 'note' ? 'doc' : 'note';
    const target = getRecent(wanted);
    if (!target) {
      await notify(
        wanted === 'doc'
          ? 'No recent PDF yet: open a PDF once, then come back.'
          : 'No recent note yet: open a note once, then come back.',
      );
      return;
    }
    const res: any = await PluginFileAPI.openFile(target, -1);
    if (!res?.success || !res.result) {
      await notify(`Cannot open (file moved or deleted?):\n${target}`);
    }
  } catch (e: any) {
    await notify(`Error: ${e?.message ?? e}`);
  } finally {
    switching = false;
  }
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

export function start() {
  loadRecent();
  PluginManager.registerMotionListener(1, {
    onMsg(msg: unknown) {
      const e = msg as Motion;
      if (!e || !Array.isArray(e.pointers)) {
        return;
      }
      track(e);
      if (e.toolType === TOOL_PEN || e.pointers.some(p => p.toolType === TOOL_PEN)) {
        lastPenAt = Date.now();
      }
      const fired = detector.feed(e);
      if (fired && Date.now() - lastPenAt > PEN_QUIET_MS) {
        switchToLastOther();
      }
    },
  });
}
