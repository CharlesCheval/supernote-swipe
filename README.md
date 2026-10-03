# Swipe — Supernote plugin

Multi-finger swipes that move you around your files, in notes and PDFs. Formerly **SwipeSwitch** (and before that **PDF ⇄ Note Swipe**).

## Gestures

Four gestures: **2 or 3 fingers, up or down**. Each one gets an action, and you choose whether it is active in portrait, in landscape, or both.

| Action | What it opens |
|---|---|
| PDF ⇄ Note | From a note, the last PDF/document; from a PDF, the last note |
| Previous file | The file you had open before this one, whatever its type ("back") |
| Last note / Last PDF | The most recent file of that kind |
| Open a specific file | A file you pick in Supernote's file browser |
| Recent files list | Your 12 most recent files; tap one to open it |

Files open on the page you last read.

**Defaults** (same behaviour as earlier versions):
- 2 fingers ↑ in portrait: PDF ⇄ Note;
- 3 fingers ↑ in landscape: PDF ⇄ Note, since two-finger swipes already scroll the page in landscape.

Settings from earlier versions are migrated automatically.

The settings live under **Settings → Apps → Plugins → Swipe**. The plugin adds no toolbar button. The settings screen also shows the detected orientation and the last recognized swipe. It offers a **swap up/down in landscape** option, in case your device reports its rotation the other way round.

## Limitations

- **Plugins only run in the Note and Document apps.** Swipes are not detected in other apps (e-mail, calendar, KOReader).
- **No app launching.** The SDK has no API to open other apps, only files.
- **Supernote's own gestures:** two-finger up/down swipes also scroll the page in landscape (and when zoomed). Assign such gestures carefully.

## How it works

- **History:** the SDK does not expose Supernote's "Last Open" history. The plugin keeps its own: on every finger or pen touch, it records the displayed file (12 most recent).
- **Nothing written is lost:** the open note is saved (`saveCurrentNote`) before switching to another file. If it cannot be saved, the switch is cancelled.
- **Persistence:** history and settings survive restarts. They are stored in the plugin's private directory as folder names, because the SDK has no API to write a text file.
- **Detection:**
  - every finger travels at least 15% of the screen, in under 0.9 s, roughly straight;
  - fingers land within 300 ms (450 ms for three) and move together, a finger-spacing apart;
  - the pen has been idle for 400 ms;
  - each touch is tracked from its own start, so separate taps (e.g. right after waking up) never add up into a swipe.
- **Landscape:** the display rotation is read at each touch. The plugin learns whether the host forwards rotated or panel coordinates, so "up" follows the way you hold the device.

## Install

1. Download `Swipe.snplg` from the [latest release](https://github.com/CharlesCheval/supernote-swipe/releases/latest) and copy it to the device's `MyStyle` folder (USB, Supernote Partner or Browse & Access).
2. Open **Settings → Apps → Plugins → Add plugin**. It replaces SwipeSwitch in place, settings included.
3. On the first swipe, allow file access with **Always allow** (reading to open files, writing to save the open note first).

## Build

```bash
npm install
npm run build   # -> build/outputs/SwipeSwitch.snplg (the plugin key stays SwipeSwitch)
npx jest        # gesture, direction, history and settings tests
```

## Releasing

Bump `versionName` **and** `versionCode` in `PluginConfig.json` (the device only upgrades when `versionCode` increases), commit, then push a matching tag:

```bash
git tag v<versionName>
git push origin v<versionName>
```

GitHub Actions runs the tests, builds the plugin and attaches it to the release as `Swipe.snplg`.

## License

[MIT](LICENSE) © Charles Cheval. Not affiliated with Ratta / Supernote.
