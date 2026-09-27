# PDF ⇄ Note Swipe — Supernote plugin

**Swipe up with two fingers** to jump between your last PDF and your last note:

- **In a note:** the swipe reopens the **last PDF/document** you viewed.
- **In a PDF:** the swipe reopens the **last note** you viewed.

The file opens on the page you last read. The plugin adds no button and no screen; it only shows up in **Settings → Apps → Plugins**.

## How it works

- **History:** the SDK does not expose Supernote's "Last Open" history. The plugin keeps its own: on every finger or pen touch, it records the displayed file, one per kind (last note, last document).
- **Persistence:** the history survives restarts. It is stored in the plugin's private directory as folder names, because the SDK has no API to write a text file.
- **Gesture:** both fingers each travel at least 15% of the screen, in under 0.9 s, roughly straight. Thresholds are in `src/switcher.ts`.
- **Landscape:** the display rotation is read at each touch, and "up" follows the way you hold the device.
- **No false triggers:** a touch only counts as a two-finger swipe when:
  - both fingers land within 300 ms of each other;
  - they are a finger-spacing apart, neither a single blob nor two hands;
  - they move together;
  - the pen has been idle for 400 ms.
  
  Each touch is tracked from its own start, so separate taps (e.g. right after waking up) can never add up into a swipe.
- **Speed:** the current file is read as soon as the fingers touch the screen. By the time the gesture is recognized, the only call left is `openFile`.

## Install and build

1. Download `SwipeSwitch.snplg` from the [latest release](https://github.com/CharlesCheval/supernote-pdf-note-swipe/releases/latest) and copy it to the device's `MyStyle` folder (USB, Supernote Partner or Browse & Access).
2. Open **Settings → Apps → Plugins → Add plugin**.
3. On the first swipe, allow file reading with **Always allow**.

To build from source:

```bash
npm install
npm run build   # -> build/outputs/SwipeSwitch.snplg
npx jest        # gesture detector tests
```

## Limitations

- **Where it works:** only in the Note and Document apps, the only places where plugins run.
- **No interception:** the plugin listens to touches but cannot consume them. If Supernote ever binds the same gesture, both actions will run.

## Releasing

Bump `versionName` **and** `versionCode` in `PluginConfig.json` (the device only upgrades when `versionCode` increases), commit, then push a matching tag:

```bash
git tag v<versionName>
git push origin v<versionName>
```

GitHub Actions runs the tests, builds `SwipeSwitch.snplg` and attaches it to the release.

## License

[MIT](LICENSE) © Charles Cheval. Not affiliated with Ratta / Supernote.
