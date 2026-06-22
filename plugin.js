class Plugin extends AppPlugin {
    onLoad() {
        this._storageKey = `thymer-font-chooser:${this.getWorkspaceGuid()}`;
        this._modal = null;
        this._chooserPanel = null;
        this._googleFonts = null;
        this._localFonts = null;
        this._fontLinks = new Map();
        this._styleTag = null;
        this._target = "content"; // content | interface | both

        this._command = this.ui.addCommandPaletteCommand({
            label: "Choose Font",
            icon: "letter-t",
            onSelected: () => this._openChooser(),
        });

        this.ui.registerCustomPanelType("font-chooser", (panel) => this._renderChooserPanel(panel));
        this._injectBaseCSS();
        this._restoreSavedFont();
    }

    onUnload() {
        try { this._command && this._command.remove(); } catch (_) {}
        this._closeChooser();
        if (this._fontLinks) for (const link of this._fontLinks.values()) link.remove();
        if (this._styleTag) this._styleTag.remove();
    }

    _injectBaseCSS() {
        this.ui.injectCSS(`
            .tfchooser-panel{height:100%;max-height:100vh;box-sizing:border-box;padding:14px;background:Canvas;color:CanvasText;color-scheme:light dark;overflow:hidden;display:flex;flex-direction:column}
            .tfchooser-modal{max-width:820px;height:100%;max-height:calc(100vh - 96px);display:flex;flex-direction:column;background:Canvas;color:CanvasText;border:1px solid color-mix(in srgb, CanvasText 22%, transparent);border-radius:14px;overflow:hidden;font-family:inherit;color-scheme:light dark}
            .tfchooser-head{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid color-mix(in srgb, CanvasText 14%, transparent);gap:12px}
            .tfchooser-title{font-weight:650;font-size:18px}.tfchooser-close{border:0;background:transparent;color:CanvasText;font-size:24px;cursor:pointer;opacity:.7}.tfchooser-close:hover{opacity:1}
            .tfchooser-search{box-sizing:border-box;width:calc(100% - 32px);margin:14px 16px 8px;padding:11px 13px;border-radius:10px;border:1px solid color-mix(in srgb, CanvasText 24%, transparent);background:color-mix(in srgb, Canvas 92%, CanvasText 8%);color:CanvasText;font:inherit;outline:none}
            .tfchooser-actions{display:flex;gap:8px;align-items:center;padding:0 16px 12px;flex-wrap:wrap}.tfchooser-btn{border:1px solid color-mix(in srgb, CanvasText 24%, transparent);border-radius:9px;background:color-mix(in srgb, Canvas 92%, CanvasText 8%);color:CanvasText;padding:7px 10px;cursor:pointer;font:inherit}.tfchooser-btn:hover{background:color-mix(in srgb, Canvas 86%, CanvasText 14%)}.tfchooser-btn[aria-pressed="true"]{background:Highlight;color:HighlightText;border-color:Highlight}
            .tfchooser-help{font-size:12px;opacity:.72;padding:0 16px 10px}.tfchooser-status{font-size:12px;opacity:.72;padding-left:4px}.tfchooser-size{font-size:12px;opacity:.78;padding:0 4px}.tfchooser-list{overflow-y:auto;overflow-x:hidden;height:45vh;max-height:min(70vh,520px);min-height:140px;flex:0 0 auto;padding:4px 8px 12px}.tfchooser-section{font-size:11px;text-transform:uppercase;letter-spacing:.08em;opacity:.58;padding:12px 10px 6px}
            .tfchooser-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border-radius:10px;cursor:pointer}.tfchooser-row:hover,.tfchooser-row[aria-selected="true"]{background:color-mix(in srgb, Canvas 86%, CanvasText 14%)}
            .tfchooser-name{font-size:16px}.tfchooser-meta{font-size:12px;opacity:.6;white-space:nowrap}.tfchooser-empty{padding:28px;text-align:center;opacity:.68}.tfchooser-footer{display:flex;gap:8px;justify-content:flex-end;padding:12px 16px;border-top:1px solid color-mix(in srgb, CanvasText 14%, transparent);flex:0 0 auto;background:Canvas}
        `);
    }

    _restoreSavedFont() {
        const saved = this._getSaved();
        if (saved.content && saved.content.source === "google" && saved.content.family) this._loadGoogleFont(saved.content.family);
        if (saved.interface && saved.interface.source === "google" && saved.interface.family) this._loadGoogleFont(saved.interface.family);
        this._writeFontCSS(saved);
    }

    _getSaved() {
        try {
            const saved = JSON.parse(localStorage.getItem(this._storageKey) || "null") || {};
            // Backwards compatibility with older single-font saves.
            if (saved.family) return { content: saved, interface: saved };
            return saved;
        } catch (_) { return {}; }
    }

    _saveFont(family, source, target) {
        const saved = this._getSaved();
        const set = (slot) => {
            const existing = saved[slot] || {};
            saved[slot] = { family, source, size: existing.size || 100 };
        };
        if (target === "both") { set("content"); set("interface"); }
        else set(target);
        localStorage.setItem(this._storageKey, JSON.stringify(saved));
    }

    async _openChooser() {
        const afterPanel = this.ui.getActivePanel();
        const panel = await this.ui.createPanel(afterPanel ? { afterPanel } : undefined);
        if (!panel) return;
        this._chooserPanel = panel;
        panel.navigateToCustomType("font-chooser");
    }

    _renderChooserPanel(panel) {
        panel.setTitle("Choose Font");
        const root = panel.getElement();
        if (!root) return;

        const original = this._cloneSaved(this._getSaved());
        let draft = this._cloneSaved(original);
        let allFonts = [];
        let finished = false;
        const closedHandler = this.events.on("panel.closed", (event) => {
            if (!event.panel || event.panel.getId() !== panel.getId()) return;
            if (!finished) this._writeFontCSS(original);
            this.events.off(closedHandler);
        });

        root.innerHTML = `
            <div class="tfchooser-panel">
                <div class="tfchooser-modal" aria-label="Choose Font">
                    <div class="tfchooser-head"><div class="tfchooser-title">Choose Font</div></div>
                    <input class="tfchooser-search" placeholder="Search installed and Google Fonts…" autocomplete="off" />
                    <div class="tfchooser-actions">
                        <button class="tfchooser-btn" data-target="content" aria-pressed="true">Primary text</button>
                        <button class="tfchooser-btn" data-target="interface" aria-pressed="false">Interface / UX</button>
                        <button class="tfchooser-btn" data-target="both" aria-pressed="false">Both</button>
                        <button class="tfchooser-btn" data-action="size-down" title="Decrease selected font size">−</button>
                        <span class="tfchooser-size">100%</span>
                        <button class="tfchooser-btn" data-action="size-up" title="Increase selected font size">+</button>
                        <button class="tfchooser-btn" data-action="size-reset" title="Reset selected font size">Reset size</button>
                        <button class="tfchooser-btn" data-action="system">Reset selected</button>
                        <button class="tfchooser-btn" data-action="refresh">Refresh local fonts</button>
                        <span class="tfchooser-status">Loading fonts…</span>
                    </div>
                    <div class="tfchooser-help">Selections preview live in other panels. Use Apply to save, or Cancel to restore the previous fonts.</div>
                    <div class="tfchooser-list"></div>
                    <div class="tfchooser-footer">
                        <button class="tfchooser-btn" data-action="cancel">Cancel</button>
                        <button class="tfchooser-btn" data-action="apply">Apply</button>
                    </div>
                </div>
            </div>`;

        const search = root.querySelector(".tfchooser-search");
        const status = root.querySelector(".tfchooser-status");
        const list = root.querySelector(".tfchooser-list");
        const sizeLabel = root.querySelector(".tfchooser-size");
        const updateSizeLabel = () => { sizeLabel.textContent = `${this._getDraftSize(draft, this._target)}%`; };
        const render = () => {
            updateSizeLabel();
            this._renderFontList(list, search.value, allFonts, draft, (font) => {
                this._setDraftFont(draft, font, this._target);
                if (font.source === "google") this._loadGoogleFont(font.family);
                this._writeFontCSS(draft);
                render();
            });
        };

        for (const btn of root.querySelectorAll("[data-target]")) {
            btn.addEventListener("click", () => {
                this._target = btn.dataset.target;
                for (const other of root.querySelectorAll("[data-target]")) other.setAttribute("aria-pressed", other === btn ? "true" : "false");
                render();
            });
        }
        root.querySelector('[data-action="size-down"]').addEventListener("click", () => {
            this._adjustDraftSize(draft, this._target, -5);
            this._writeFontCSS(draft);
            render();
        });
        root.querySelector('[data-action="size-up"]').addEventListener("click", () => {
            this._adjustDraftSize(draft, this._target, 5);
            this._writeFontCSS(draft);
            render();
        });
        root.querySelector('[data-action="size-reset"]').addEventListener("click", () => {
            this._setDraftSize(draft, this._target, 100);
            this._writeFontCSS(draft);
            render();
        });
        root.querySelector('[data-action="system"]').addEventListener("click", () => {
            if (this._target === "both") { delete draft.content; delete draft.interface; }
            else delete draft[this._target];
            this._writeFontCSS(draft);
            render();
        });
        root.querySelector('[data-action="refresh"]').addEventListener("click", async () => {
            this._localFonts = null;
            await loadAndRender();
        });
        root.querySelector('[data-action="cancel"]').addEventListener("click", () => {
            finished = true;
            this._writeFontCSS(original);
            this.ui.closePanel(panel);
        });
        root.querySelector('[data-action="apply"]').addEventListener("click", () => {
            finished = true;
            localStorage.setItem(this._storageKey, JSON.stringify(draft));
            this._writeFontCSS(draft);
            this.ui.addToaster({ title: "Fonts applied", message: "Your font choices have been saved.", dismissible: true, autoDestroyTime: 1800 });
            this.ui.closePanel(panel);
        });
        search.addEventListener("input", () => render());

        const loadAndRender = async () => {
            status.textContent = "Loading fonts…";
            const [local, google] = await Promise.all([this._getLocalFonts(), this._getGoogleFonts()]);
            allFonts = [
                ...google.map(f => ({ family: f, source: "google" })),
                ...local.map(f => ({ family: f, source: "local" })),
            ];
            status.textContent = `${local.length} installed, ${google.length} Google Fonts`;
            render();
        };

        search.focus();
        loadAndRender();
    }

    _closeChooser() {
        if (this._modal) {
            this._modal.remove();
            this._modal = null;
        }
    }

    _cloneSaved(saved) {
        return JSON.parse(JSON.stringify(saved || {}));
    }

    _ensureDraftSlot(draft, slot) {
        if (!draft[slot]) draft[slot] = { size: 100 };
        if (!draft[slot].size) draft[slot].size = 100;
        return draft[slot];
    }

    _setDraftFont(draft, font, target) {
        const apply = (slot) => {
            const existing = this._ensureDraftSlot(draft, slot);
            draft[slot] = { family: font.family, source: font.source, size: existing.size || 100 };
        };
        if (target === "both") { apply("content"); apply("interface"); }
        else apply(target);
    }

    _getDraftSize(draft, target) {
        if (target === "both") {
            const content = draft.content && draft.content.size ? draft.content.size : 100;
            const ui = draft.interface && draft.interface.size ? draft.interface.size : 100;
            return content === ui ? content : `${content}/${ui}`;
        }
        return draft[target] && draft[target].size ? draft[target].size : 100;
    }

    _setDraftSize(draft, target, size) {
        size = Math.max(75, Math.min(140, size));
        const apply = (slot) => { this._ensureDraftSlot(draft, slot).size = size; };
        if (target === "both") { apply("content"); apply("interface"); }
        else apply(target);
    }

    _adjustDraftSize(draft, target, delta) {
        if (target === "both") {
            this._setDraftSize(draft, "content", (draft.content && draft.content.size ? draft.content.size : 100) + delta);
            this._setDraftSize(draft, "interface", (draft.interface && draft.interface.size ? draft.interface.size : 100) + delta);
        } else {
            this._setDraftSize(draft, target, (draft[target] && draft[target].size ? draft[target].size : 100) + delta);
        }
    }

    _renderFontList(container, query, fonts, saved, onSelected) {
        const q = (query || "").trim().toLowerCase();
        saved = saved || this._getSaved();
        const matches = fonts.filter(f => !q || f.family.toLowerCase().includes(q)).slice(0, 350);
        if (!matches.length) {
            container.innerHTML = `<div class="tfchooser-empty">No fonts found.</div>`;
            return;
        }

        container.innerHTML = "";
        let currentSource = null;
        for (const font of matches) {
            if (font.source !== currentSource) {
                currentSource = font.source;
                const section = document.createElement("div");
                section.className = "tfchooser-section";
                section.textContent = currentSource === "local" ? "Installed fonts" : "Google Fonts";
                container.appendChild(section);
            }
            const row = document.createElement("div");
            row.className = "tfchooser-row";
            row.setAttribute("role", "button");
            const selected = this._isSelectedFont(saved, font.family);
            row.setAttribute("aria-selected", selected ? "true" : "false");
            row.innerHTML = `<div class="tfchooser-name"></div><div class="tfchooser-meta">${font.source === "local" ? "Installed" : "Google"}</div>`;
            row.querySelector(".tfchooser-name").textContent = font.family;
            row.querySelector(".tfchooser-name").style.fontFamily = this._fontFamilyCSS(font.family);
            row.addEventListener("click", () => {
                if (onSelected) onSelected(font);
                else this._applyFont(font.family, font.source, this._target, true);
            });
            container.appendChild(row);
        }
    }

    async _getLocalFonts() {
        if (this._localFonts) return this._localFonts;

        // Best option in Chromium-based browsers. It prompts once and can enumerate installed fonts.
        if (window.queryLocalFonts) {
            try {
                const fonts = await window.queryLocalFonts();
                this._localFonts = [...new Set(fonts.map(f => f.family).filter(Boolean))].sort((a, b) => a.localeCompare(b));
                return this._localFonts;
            } catch (_) {}
        }

        // Browser-safe fallback: detect a useful set of common installed fonts.
        const candidates = [
            "Arial","Arial Black","Aptos","Avenir","Baskerville","Calibri","Cambria","Candara","Century Gothic","Comic Sans MS","Consolas","Courier New","Didot","Fira Code","Futura","Garamond","Georgia","Gill Sans","Helvetica","Helvetica Neue","Hoefler Text","Inter","Iosevka","JetBrains Mono","Lato","Liberation Sans","Liberation Serif","Menlo","Monaco","Montserrat","Noto Sans","Open Sans","Optima","Palatino","Roboto","Segoe UI","SF Pro Display","SF Pro Text","Tahoma","Times New Roman","Trebuchet MS","Ubuntu","Verdana"
        ];
        this._localFonts = candidates.filter(f => this._isFontAvailable(f)).sort((a, b) => a.localeCompare(b));
        return this._localFonts;
    }

    async _getGoogleFonts() {
        if (this._googleFonts) return this._googleFonts;
        const curatedFonts = [
            "IBM Plex Sans", "IBM Plex Mono", "IBM Plex Serif",
            "Roboto", "Open Sans", "Lato", "Montserrat", "Poppins", "Source Sans 3", "Raleway", "Oswald", "Noto Sans", "Merriweather", "Ubuntu", "Playfair Display", "Nunito", "PT Sans", "Roboto Condensed", "Roboto Slab", "Lora", "Rubik", "Inter", "Fira Sans", "Work Sans", "Quicksand", "Mulish", "Manrope", "DM Sans", "Plus Jakarta Sans", "Cabin", "Karla", "Josefin Sans", "Libre Baskerville", "Roboto Mono"
        ];
        try {
            const res = await fetch("https://fonts.google.com/metadata/fonts", { cache: "force-cache" });
            let text = await res.text();
            text = text.replace(/^\)\]\}'\s*/, "");
            const json = JSON.parse(text);
            const fetchedFonts = (json.familyMetadataList || []).map(f => f.family).filter(Boolean);
            this._googleFonts = [...new Set([...curatedFonts, ...fetchedFonts])].sort((a, b) => a.localeCompare(b));
        } catch (_) {
            this._googleFonts = curatedFonts;
        }
        return this._googleFonts;
    }

    _isFontAvailable(font) {
        const text = "mmmmmmmmmmlli";
        const size = "72px";
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const bases = ["monospace", "serif", "sans-serif"];
        const baseWidths = bases.map(base => { ctx.font = `${size} ${base}`; return ctx.measureText(text).width; });
        return bases.some((base, i) => {
            ctx.font = `${size} ${this._fontFamilyCSS(font)}, ${base}`;
            return ctx.measureText(text).width !== baseWidths[i];
        });
    }

    _fontFamilyCSS(family) {
        return `"${String(family).replace(/"/g, '\\"')}"`;
    }

    _isSelectedFont(saved, family) {
        if (this._target === "both") {
            return saved.content && saved.interface && saved.content.family === family && saved.interface.family === family;
        }
        return saved[this._target] && saved[this._target].family === family;
    }

    _applyFont(family, source, target, persist) {
        if (source === "google") this._loadGoogleFont(family);
        if (persist) this._saveFont(family, source, target);
        this._writeFontCSS();
        if (persist) {
            const label = target === "content" ? "primary text" : target === "interface" ? "interface" : "all text";
            this.ui.addToaster({ title: "Font changed", message: `${family} applied to ${label}.`, dismissible: true, autoDestroyTime: 2200 });
        }
    }

    _writeFontCSS(saved) {
        saved = saved || this._getSaved();
        if (!this._styleTag) {
            this._styleTag = document.createElement("style");
            this._styleTag.id = "thymer-font-chooser-style";
        }
        // Keep our generated rules at the end of <head> so they win over Thymer/theme styles
        // when selectors have similar specificity.
        document.head.appendChild(this._styleTag);

        const contentFamily = saved.content && saved.content.family ? this._fontFamilyCSS(saved.content.family) : null;
        const interfaceFamily = saved.interface && saved.interface.family ? this._fontFamilyCSS(saved.interface.family) : null;
        const contentSize = saved.content && saved.content.size ? saved.content.size : 100;
        const interfaceSize = saved.interface && saved.interface.size ? saved.interface.size : 100;
        const fallback = `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
        const contentSelectors = `
            [contenteditable="true"],
            [contenteditable="true"] *,
            textarea,
            input.title,
            input[name="title"],
            .ProseMirror,
            .ProseMirror *,
            .cm-editor,
            .cm-editor *,
            .cm-content,
            .cm-content *,
            .editor,
            .editor *,
            .editor-content,
            .editor-content *,
            .document,
            .document :not(button):not(input):not(select):not(.ti):not([class^="ti-"]):not([class*=" ti-"]),
            .document-content,
            .document-content *,
            .document-title,
            .document-title *,
            .record-content,
            .record-content *,
            .record-title,
            .record-title *,
            .page-content,
            .page-content *,
            .page-title,
            .page-title *,
            .outline,
            .outline :not(button):not(input):not(select):not(.ti):not([class^="ti-"]):not([class*=" ti-"]),
            .lines,
            .lines *,
            .line,
            .line :not(button):not(input):not(select):not(.ti):not([class^="ti-"]):not([class*=" ti-"]),
            .lineitem,
            .lineitem *,
            .line-item,
            .line-item *,
            .lineitem-content,
            .lineitem-content *,
            .line-content,
            .line-content *,
            .lineitem-text,
            .lineitem-text *,
            .line-text,
            .line-text *,
            .segment-text,
            [class*="lineitem"],
            [class*="lineitem"] *,
            [class*="line-item"],
            [class*="line-item"] *,
            [class*="document-title"],
            [class*="record-title"],
            [class*="page-title"]
        `;
        const contentSizeSelectors = `
            [contenteditable="true"],
            textarea,
            input.title,
            input[name="title"],
            .ProseMirror,
            .cm-editor,
            .cm-content,
            .editor,
            .editor-content,
            .document,
            .document-content,
            .record-content,
            .page-content,
            .outline,
            .lines,
            .line,
            .lineitem,
            .line-item,
            .listitem-text .line-div,
            .listitem:not(.listitem-heading) > .line-div,
            .lineitem-content,
            .line-content
        `;
        const interfaceSizeSelectors = `
            button,
            input:not(.title):not([name="title"]),
            select,
            .sidebar,
            .statusbar,
            .toolbar,
            .menu,
            .dropdown,
            .modal,
            .dialog,
            .toaster,
            .command-palette,
            .tfchooser-modal
        `;
        // Thymer heading line items use their own default sizes on .line-div.heading-hN.
        // Do not replace those with fixed pixel values. Instead, avoid targeting heading spans
        // in the broad text-size rule, then scale the text inside each heading by the same
        // percentage as body text. That preserves Thymer's native h1/h2/h3/h4 proportions.
        const thymerHeadingSizeSelectors = {
            h1: `.heading-h1, .listitem-heading .heading-h1, .id--h1, [class~="id--h1"], [class~="h1"], .heading-1, .heading--1, .heading-size-1, [data-heading-size="1"], [data-size="1"][data-type="heading"], [data-size="1"][data-line-type="heading"], [data-level="1"][data-type="heading"]`,
            h2: `.heading-h2, .listitem-heading .heading-h2, .id--h2, [class~="id--h2"], [class~="h2"], .heading-2, .heading--2, .heading-size-2, [data-heading-size="2"], [data-size="2"][data-type="heading"], [data-size="2"][data-line-type="heading"], [data-level="2"][data-type="heading"]`,
            h3: `.heading-h3, .listitem-heading .heading-h3, .id--h3, [class~="id--h3"], [class~="h3"], .heading-3, .heading--3, .heading-size-3, [data-heading-size="3"], [data-size="3"][data-type="heading"], [data-size="3"][data-line-type="heading"], [data-level="3"][data-type="heading"]`,
            h4: `.heading-h4, .listitem-heading .heading-h4, .id--h4, [class~="id--h4"], [class~="h4"], .heading-4, .heading--4, .heading-size-4, [data-heading-size="4"], [data-size="4"][data-type="heading"], [data-size="4"][data-line-type="heading"], [data-level="4"][data-type="heading"]`,
        };
        const semanticHeadingSizeSelectors = {
            h1: `.ProseMirror h1, .editor h1, .editor-content h1, .document h1, .document-content h1, .record-content h1, .page-content h1`,
            h2: `.ProseMirror h2, .editor h2, .editor-content h2, .document h2, .document-content h2, .record-content h2, .page-content h2`,
            h3: `.ProseMirror h3, .editor h3, .editor-content h3, .document h3, .document-content h3, .record-content h3, .page-content h3`,
            h4: `.ProseMirror h4, .editor h4, .editor-content h4, .document h4, .document-content h4, .record-content h4, .page-content h4`,
        };
        const withSuffix = (selectors, suffix) => selectors.split(",").map(s => `${s.trim()}${suffix}`).filter(Boolean).join(",\n                    ");
        const defaultContentSizes = contentSize !== 100 ? this._measureDefaultContentSizes() : null;
        const scaledPx = (key) => `${(defaultContentSizes[key] * contentSize / 100).toFixed(3)}px`;
        const css = [];

        if (contentFamily || contentSize !== 100) {
            const vars = [];
            if (contentFamily) vars.push(`--thymer-font-chooser-content: ${contentFamily};`);
            vars.push(`--thymer-font-chooser-content-size: ${contentSize}%;`);
            css.push(`:root { ${vars.join(" ")} }`);
            if (contentFamily) {
                css.push(`
                    /* Primary writing/content surfaces. Thymer has used several DOM shapes for
                       editor/title/outline text, so target common content containers and line classes. */
                    ${contentSelectors} {
                        --font-family: var(--thymer-font-chooser-content);
                        --font-text: var(--thymer-font-chooser-content);
                        font-family: var(--thymer-font-chooser-content), ${fallback} !important;
                    }
                `);
            }
            if (contentSize !== 100) {
                css.push(`
                    ${contentSizeSelectors} {
                        font-size: var(--thymer-font-chooser-content-size) !important;
                    }

                    /* Scale from Thymer's measured native editor sizes, rather than guessing fixed sizes. */
                    listview-editor .listview-items .listitem:not(.listitem-heading) > .line-div,
                    listview-editor .listview-items .listitem:not(.listitem-heading) > .line-div > .lineitem-text,
                    .listview-items .listitem:not(.listitem-heading) > .line-div,
                    .listview-items .listitem:not(.listitem-heading) > .line-div > .lineitem-text { font-size: ${scaledPx("text")} !important; }

                    listview-editor .listview-items .listitem.listitem-heading > .line-div.heading-h1,
                    listview-editor .listview-items .listitem.listitem-heading > .line-div.heading-h1 > .lineitem-text,
                    .listview-items .listitem.listitem-heading > .line-div.heading-h1,
                    .listview-items .listitem.listitem-heading > .line-div.heading-h1 > .lineitem-text,
                    ${thymerHeadingSizeSelectors.h1},
                    ${withSuffix(thymerHeadingSizeSelectors.h1, " > .lineitem-text")},
                    ${semanticHeadingSizeSelectors.h1},
                    ${withSuffix(semanticHeadingSizeSelectors.h1, " > *")} { font-size: ${scaledPx("h1")} !important; }

                    listview-editor .listview-items .listitem.listitem-heading > .line-div.heading-h2,
                    listview-editor .listview-items .listitem.listitem-heading > .line-div.heading-h2 > .lineitem-text,
                    .listview-items .listitem.listitem-heading > .line-div.heading-h2,
                    .listview-items .listitem.listitem-heading > .line-div.heading-h2 > .lineitem-text,
                    ${thymerHeadingSizeSelectors.h2},
                    ${withSuffix(thymerHeadingSizeSelectors.h2, " > .lineitem-text")},
                    ${semanticHeadingSizeSelectors.h2},
                    ${withSuffix(semanticHeadingSizeSelectors.h2, " > *")} { font-size: ${scaledPx("h2")} !important; }

                    listview-editor .listview-items .listitem.listitem-heading > .line-div.heading-h3,
                    listview-editor .listview-items .listitem.listitem-heading > .line-div.heading-h3 > .lineitem-text,
                    .listview-items .listitem.listitem-heading > .line-div.heading-h3,
                    .listview-items .listitem.listitem-heading > .line-div.heading-h3 > .lineitem-text,
                    ${thymerHeadingSizeSelectors.h3},
                    ${withSuffix(thymerHeadingSizeSelectors.h3, " > .lineitem-text")},
                    ${semanticHeadingSizeSelectors.h3},
                    ${withSuffix(semanticHeadingSizeSelectors.h3, " > *")} { font-size: ${scaledPx("h3")} !important; }

                    listview-editor .listview-items .listitem.listitem-heading > .line-div.heading-h4,
                    listview-editor .listview-items .listitem.listitem-heading > .line-div.heading-h4 > .lineitem-text,
                    .listview-items .listitem.listitem-heading > .line-div.heading-h4,
                    .listview-items .listitem.listitem-heading > .line-div.heading-h4 > .lineitem-text,
                    ${thymerHeadingSizeSelectors.h4},
                    ${withSuffix(thymerHeadingSizeSelectors.h4, " > .lineitem-text")},
                    ${semanticHeadingSizeSelectors.h4},
                    ${withSuffix(semanticHeadingSizeSelectors.h4, " > *")} { font-size: ${scaledPx("h4")} !important; }
                `);
            }
        }

        if (interfaceFamily || interfaceSize !== 100) {
            const vars = [];
            if (interfaceFamily) vars.push(`--thymer-font-chooser-interface: ${interfaceFamily};`);
            vars.push(`--thymer-font-chooser-interface-size: ${interfaceSize}%;`);
            css.push(`:root { ${vars.join(" ")} }`);
            if (interfaceFamily) {
                css.push(`
                    /* App chrome / UX only. Do not target .panel or body descendants, otherwise
                       editor content inherits the interface font too. */
                    button,
                    input:not(.title):not([name="title"]),
                    select,
                    .sidebar,
                    .sidebar :not(.ti):not([class^="ti-"]):not([class*=" ti-"]),
                    .statusbar,
                    .statusbar :not(.ti):not([class^="ti-"]):not([class*=" ti-"]),
                    .toolbar,
                    .toolbar :not(.ti):not([class^="ti-"]):not([class*=" ti-"]),
                    .menu,
                    .menu :not(.ti):not([class^="ti-"]):not([class*=" ti-"]),
                    .dropdown,
                    .dropdown :not(.ti):not([class^="ti-"]):not([class*=" ti-"]),
                    .modal,
                    .modal :not(.ti):not([class^="ti-"]):not([class*=" ti-"]),
                    .dialog,
                    .dialog :not(.ti):not([class^="ti-"]):not([class*=" ti-"]),
                    .toaster,
                    .toaster :not(.ti):not([class^="ti-"]):not([class*=" ti-"]),
                    .command-palette,
                    .command-palette :not(.ti):not([class^="ti-"]):not([class*=" ti-"]),
                    .tfchooser-modal,
                    .tfchooser-modal :not(.ti):not([class^="ti-"]):not([class*=" ti-"]) {
                        font-family: var(--thymer-font-chooser-interface), ${fallback} !important;
                    }
                `);
            }
            if (interfaceSize !== 100) {
                css.push(`
                    ${interfaceSizeSelectors} {
                        font-size: var(--thymer-font-chooser-interface-size) !important;
                    }
                `);
            }
        }

        // Content rules are repeated last so a separate interface font does not override note text.
        if (contentFamily && interfaceFamily) {
            css.push(`
                ${contentSelectors} {
                    --font-family: var(--thymer-font-chooser-content);
                    --font-text: var(--thymer-font-chooser-content);
                    font-family: var(--thymer-font-chooser-content), ${fallback} !important;
                }
            `);
        }

        this._styleTag.textContent = css.join("\n");
    }

    _measureDefaultContentSizes() {
        const fallback = { text: 12, h1: 24, h2: 20, h3: 17, h4: 15 };
        if (typeof document === "undefined" || !document.body) return fallback;

        const previousCSS = this._styleTag ? this._styleTag.textContent : "";
        const previousDisabled = this._styleTag ? this._styleTag.disabled : false;
        const px = (el) => {
            const value = el ? parseFloat(getComputedStyle(el).fontSize) : NaN;
            return Number.isFinite(value) && value > 0 ? value : null;
        };

        let fixture = null;
        try {
            // Temporarily remove this plugin's size overrides, then build a tiny off-screen copy
            // of Thymer's editor DOM. This lets the active Thymer theme/app CSS tell us the real
            // native body and heading sizes instead of guessing.
            if (this._styleTag) this._styleTag.textContent = "";

            const live = {
                text: px(document.querySelector("listview-editor .listview-items .listitem:not(.listitem-heading) > .line-div > .lineitem-text, .listview-items .listitem:not(.listitem-heading) > .line-div > .lineitem-text")),
                h1: px(document.querySelector("listview-editor .listview-items .listitem.listitem-heading > .line-div.heading-h1 > .lineitem-text, .listview-items .listitem.listitem-heading > .line-div.heading-h1 > .lineitem-text")),
                h2: px(document.querySelector("listview-editor .listview-items .listitem.listitem-heading > .line-div.heading-h2 > .lineitem-text, .listview-items .listitem.listitem-heading > .line-div.heading-h2 > .lineitem-text")),
                h3: px(document.querySelector("listview-editor .listview-items .listitem.listitem-heading > .line-div.heading-h3 > .lineitem-text, .listview-items .listitem.listitem-heading > .line-div.heading-h3 > .lineitem-text")),
                h4: px(document.querySelector("listview-editor .listview-items .listitem.listitem-heading > .line-div.heading-h4 > .lineitem-text, .listview-items .listitem.listitem-heading > .line-div.heading-h4 > .lineitem-text")),
            };

            fixture = document.createElement("listview-editor");
            fixture.className = "listview-focus thymer-font-chooser-measure";
            fixture.style.cssText = "position:absolute;left:-10000px;top:-10000px;visibility:hidden;pointer-events:none;contain:layout style;";
            fixture.innerHTML = `
                <div class="listview-items">
                    <div class="listitem listitem-text"><div class="line-div"><span class="lineitem-text">Text</span></div></div>
                    <div class="listitem listitem-heading"><div class="line-div heading-h1"><span class="lineitem-text">H1</span></div></div>
                    <div class="listitem listitem-heading"><div class="line-div heading-h2"><span class="lineitem-text">H2</span></div></div>
                    <div class="listitem listitem-heading"><div class="line-div heading-h3"><span class="lineitem-text">H3</span></div></div>
                    <div class="listitem listitem-heading"><div class="line-div heading-h4"><span class="lineitem-text">H4</span></div></div>
                </div>`;
            document.body.appendChild(fixture);

            const measured = {
                text: live.text || px(fixture.querySelector(".listitem-text .lineitem-text")) || fallback.text,
                h1: live.h1 || px(fixture.querySelector(".heading-h1 .lineitem-text")) || px(fixture.querySelector(".heading-h1")) || fallback.h1,
                h2: live.h2 || px(fixture.querySelector(".heading-h2 .lineitem-text")) || px(fixture.querySelector(".heading-h2")) || fallback.h2,
                h3: live.h3 || px(fixture.querySelector(".heading-h3 .lineitem-text")) || px(fixture.querySelector(".heading-h3")) || fallback.h3,
                h4: live.h4 || px(fixture.querySelector(".heading-h4 .lineitem-text")) || px(fixture.querySelector(".heading-h4")) || fallback.h4,
            };

            // If the off-screen fixture was not styled by Thymer's CSS, all measurements can
            // collapse to body size. In that case preserve a sane decreasing scale from the
            // measured body size rather than flattening headings.
            if (measured.h1 <= measured.text) measured.h1 = measured.text * 1.8;
            if (measured.h2 <= measured.text) measured.h2 = measured.text * 1.5;
            if (measured.h3 <= measured.text) measured.h3 = measured.text * 1.25;
            if (measured.h4 <= measured.text) measured.h4 = measured.text * 1.125;
            return measured;
        } catch (_) {
            return fallback;
        } finally {
            if (fixture) fixture.remove();
            if (this._styleTag) {
                this._styleTag.textContent = previousCSS;
                this._styleTag.disabled = previousDisabled;
            }
        }
    }

    _clearFont(target) {
        const saved = this._getSaved();
        if (target === "both") {
            delete saved.content;
            delete saved.interface;
        } else {
            delete saved[target];
        }
        localStorage.setItem(this._storageKey, JSON.stringify(saved));
        this._writeFontCSS();
        this.ui.addToaster({ title: "Font reset", message: "Selected font area reset to Thymer's default.", dismissible: true, autoDestroyTime: 1800 });
    }

    _loadGoogleFont(family) {
        if (this._fontLinks.has(family)) return;
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}&display=swap`;
        document.head.appendChild(link);
        this._fontLinks.set(family, link);
    }
}
