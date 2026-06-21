# Thymer Font Chooser

A global [Thymer](https://thymer.com/) app plugin for quickly previewing and applying custom fonts across your workspace.

Open the Thymer command palette, choose **Choose Font**, and use a dedicated font chooser panel to preview fonts live before saving them.

## Features

- Adds **Choose Font** to the Thymer command palette.
- Opens in a **dedicated Thymer panel**, so you can keep a note open beside it and preview changes live.
- Searchable font list.
- **Google Fonts** shown first.
- Installed/system fonts shown below Google Fonts.
- Google Fonts metadata is loaded from Google when available.
- Curated fallback list includes popular Google Fonts such as:
  - IBM Plex Sans
  - IBM Plex Mono
  - IBM Plex Serif
  - Roboto
  - Open Sans
  - Lato
  - Montserrat
  - Poppins
  - Inter
  - Source Sans 3
  - and more.
- Installed fonts use the browser Local Font Access API when available.
- Falls back to detecting common installed fonts if full font enumeration is unavailable.
- Separate font targets:
  - **Primary text** — note/editor/page text.
  - **Interface / UX** — sidebars, menus, buttons, command palette, app chrome.
  - **Both** — apply to both areas.
- Live preview while selecting fonts.
- Changes are only saved when you click **Apply**.
- **Cancel** restores the previous font settings.
- Closing the chooser panel without applying also restores the previous settings.
- Font size adjustment controls:
  - `−` decrease size.
  - `+` increase size.
  - `Reset size` restores 100%.
- Font size settings are saved separately for primary text and interface fonts.
- Reset selected target back to Thymer defaults.
- Persists settings per workspace using `localStorage`.
- Font list is contained in a scrollable window so Apply/Cancel stay accessible.
- Designed to work with light, dark, and custom Thymer themes without overriding theme colours.

## Installation

Create a **Global Plugin** in Thymer and paste:

- `plugin.js` into **Custom Code**
- `plugin.json` into **Configuration**

Then open the command palette and run **Choose Font**.

## Development with the Thymer Plugin SDK

If using the SDK hot-reload workflow:

1. Copy `plugin.js` and `plugin.json` into your Thymer Plugin SDK starter folder.
2. Run:

```bash
npm run dev
```

3. Enable plugin hot reload in Thymer's plugin developer tools.

## Browser notes

Full installed-font enumeration depends on `window.queryLocalFonts()`, which is currently mostly available in Chromium-based browsers and may prompt for permission.

If unavailable or denied, the plugin falls back to detecting a practical list of common local fonts.

Google Fonts require network access to Google font endpoints. If metadata loading fails, a curated fallback font list is still available.

## Files

- `plugin.js` — plugin implementation.
- `plugin.json` — Thymer plugin configuration.
