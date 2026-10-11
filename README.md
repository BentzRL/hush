<p align="center"><img src="icons/icon128.png" width="96" alt=""></p>

# Hush

Set the volume of each browser tab separately. Works in Chrome, Brave and other Chromium browsers (version 116+).

- Slider from 0% to 200%, with 100% in the middle (snaps to 100% near the centre)
- Mouse wheel over the slider moves it 5% per notch
- Presets: Mute, 25%, 50%, 75%, 100%
- Badge on the toolbar icon shows the current tab's level
- Adjust other tabs you've already set without switching to them

## Install

1. Download or clone this repo.
2. Open `chrome://extensions` (or `brave://extensions`).
3. Turn on **Developer mode**.
4. Click **Load unpacked** and choose this folder.

## Use

Open the tab you want to change, click the Hush icon and move the slider. **Stop controlling this tab** returns it to normal.

## How it works

The extension captures the tab's audio with the `tabCapture` API and plays it back through a Web Audio gain node in an offscreen document. Because of that:

- You start controlling a tab from that tab (Chrome only lets an extension capture a tab you invoked it on).
- Chrome shows its "tab is being shared" indicator on controlled tabs.
- Browser pages (`chrome://`, `brave://`) and the Chrome Web Store can't be captured.
- Levels reset when the browser restarts.

No data leaves your browser; the extension has no network access.
