# Thymer Font Chooser

A global [Thymer](https://thymer.com/) app plugin for quickly previewing and applying custom fonts across your workspace.

Open the Thymer command palette, choose **Choose Font**, and use a dedicated font chooser panel to preview fonts live before saving them.

## Features

- Adds **Choose Font** to the Thymer command palette.
- Opens in a dedicated Thymer panel, so you can keep a note open beside it and preview changes live.
- Searchable font list.
- Includes most popular Google Fonts & installed/system fonts
- Google Fonts metadata is loaded from Google when available.
- Installed fonts use the browser Local Font Access API when available.
- Falls back to detecting common installed fonts if full font enumeration is unavailable.
- Separate font targets:
  - **Primary text** — note/editor/page text.
  - **Interface / UX** — sidebars, menus, buttons, command palette, app chrome.
  - **Both** — apply to both areas.
- Live preview while selecting fonts.
- Font size adjustment controls:
  - `−` decrease size.
  - `+` increase size.
  - `Reset size` restores 100%.
- Font size settings are saved separately for primary text and interface fonts.
- Reset selected target back to Thymer defaults.
- Persists settings per workspace using `localStorage`.
- Designed to work with light and dark themes without overriding theme colours.

## Preview

<img width="911" height="1022" alt="image" src="https://github.com/user-attachments/assets/4eb759e1-583f-48ac-9dce-ae08b7749be8" />

## Installation

Create a **Global Plugin** in Thymer and paste:

- `plugin.js` into **Custom Code**
- `plugin.json` into **Configuration**

Then open the command palette and run **Choose Font**.

3. Enable plugin hot reload in Thymer's plugin developer tools.

## Browser notes

Full installed-font enumeration depends on `window.queryLocalFonts()`, which is currently mostly available in Chromium-based browsers and may prompt for permission.

If unavailable or denied, the plugin falls back to detecting a practical list of common local fonts.

Google Fonts require network access to Google font endpoints. If metadata loading fails, a curated fallback font list is still available.
