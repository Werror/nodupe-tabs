# No Dupe Tabs

A small, open-source Chrome extension (Manifest V3) that stops duplicate tabs. When you open a page that is already open, it switches you to the existing tab instead.

No tracking, no network requests, no remote code. All settings stay in Chrome's own storage.

## Features

- **Duplicate prevention.** Opening an already-open URL closes the new tab and focuses the existing one. If you navigated an existing tab to that URL, the tab goes back to where it was instead of being closed.
- **URL matching.** Optionally ignore query strings and/or `#fragments`, globally or per URL prefix.
- **Single-tab sites.** Treat any page on a domain (for example `mail.google.com`) as a duplicate of any other page on that domain.
- **Allow list or block list.** Skip URLs containing given text, or dedupe only those URLs.
- **Scope.** Look for duplicates across all windows, in the same window, or in the same tab group.
- **Popup.** Search all open tabs (space-separated terms, all must match), see and close duplicates, and reopen a recently prevented duplicate on purpose.
- **Badge.** Shows how many duplicate tabs are currently open, or `off` while paused.
- **Omnibox.** Type `dt` and a space in the address bar to search tabs and jump to one.
- **Context menus.** Open a link in a new tab even if it's a duplicate, allow duplicates on the current site, close all duplicates, pause.
- **Keyboard shortcuts.** Open the popup (`Ctrl+Shift+F`), close all duplicates (`Alt+Shift+D`), pause, allow the current site. Change them at `chrome://extensions/shortcuts`.

## Install from source

1. Clone this repository.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and select the `extension/` folder.

## Development

Requires Node.js 20+.

```sh
npm install
npm run lint
npm test            # unit tests for URL matching and duplicate detection
npm run test:e2e    # loads the extension in Chromium via Playwright
npm run pack        # builds dist/nodupe-tabs-<version>.zip for the Chrome Web Store
```

`npm run test:e2e` needs a Chromium build that still accepts `--load-extension` (Chromium or Chrome for Testing, not branded Chrome). Install one with `npx playwright-core install chromium`, or point `CHROME_PATH` at an existing binary. Set `HEADLESS=0` to watch it run.

### Layout

```
extension/
  manifest.json
  background.js      service worker: catches duplicates, badge, menus, commands, omnibox
  lib/               pure logic, unit-tested in Node (url.js, rules.js, duplicates.js, settings.js)
  popup/             tab search, duplicate list, recently prevented
  options/           settings page
test/unit/           node:test unit tests
test/e2e/            Playwright tests against a real browser
```

## Background

This project is an independent, from-scratch implementation inspired by the behavior of the "Clutter Free" extension, which is no longer maintained. It is not affiliated with Clutter Free or its authors, and it contains none of their code.

## License

[MIT](LICENSE)
