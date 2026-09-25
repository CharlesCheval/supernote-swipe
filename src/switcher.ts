import {Dimensions, PixelRatio} from 'react-native';
import {NativeUIUtils, PluginCommAPI, PluginFileAPI, PluginManager} from 'sn-plugin-lib';
import {Motion, TwoFingerSwipeUp} from './gesture';
import {getRecent, kindOf, loadRecent, remember} from './recent';

/** Screen height in pixels (Manta 2560, A6X 1872). */
function screenHeightPx(): number {
  const h = Dimensions.get('screen').height * PixelRatio.get();
  return h > 0 ? h : 1872;
}

/** Each finger must travel at least 15% of the screen height. */
const MIN_DISTANCE_RATIO = 0.15;

const detector = new TwoFingerSwipeUp(() => ({
  minDistance: screenHeightPx() * MIN_DISTANCE_RATIO,
  maxDurationMs: 900,
  maxSlope: 0.7,
  maxLandingGapMs: 300,
}));

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
  if (e.downTime === trackedDownTime) {
    return;
  }
  trackedDownTime = e.downTime;
  tracked = currentFile().catch(() => null);
  tracked.then(path => remember(path));
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
      if (detector.feed(e)) {
        switchToLastOther();
      }
    },
  });
}
