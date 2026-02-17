/**
 * Preset Browser UI — collapsible tree panel for browsing preset libraries.
 *
 * Features:
 * - Lazy-loading collapsible tree hierarchy (root → libraries → games → presets)
 * - Search filters loaded presets only (not folders)
 * - Category filter chips
 * - Pagination for large folders
 * - Click-to-insert preset into editor
 */

import type { PresetEntry, PresetCategory, SubIndexEntry } from './preset-types.js';
import { PresetLoader } from './preset-loader.js';

// ── Constants ────────────────────────────────────────────

const CATEGORY_COLOURS: Record<PresetCategory, string> = {
    synth: '#89b4fa',
    sampler: '#a6e3a1',
    effect: '#fab387',
    composite: '#cba6f7',
};

const PAGE_SIZE = 100;

// ── Preset Browser Component ─────────────────────────────

export class PresetBrowser {
    private container: HTMLElement;
    private loader: PresetLoader;
    private onSelect: ((entry: PresetEntry) => void) | null = null;
    private onPlay: ((entry: PresetEntry) => void) | null = null;

    private searchInput!: HTMLInputElement;
    private listEl!: HTMLElement;
    private statusEl!: HTMLElement;
    private categoryFilter: PresetCategory | null = null;

    private isOpen = false;
    private rootLoaded = false;

    /** Which tree paths are expanded: e.g. "Auto-Ripped", "Auto-Ripped/Zelda" */
    private expanded: Set<string> = new Set();

    /** Current page for each paginated folder path */
    private folderPages: Map<string, number> = new Map();

    constructor(parentEl: HTMLElement, loader: PresetLoader) {
        this.container = document.createElement('div');
        this.container.className = 'preset-browser';
        this.container.innerHTML = this.buildHTML();
        parentEl.appendChild(this.container);

        this.loader = loader;

        this.searchInput = this.container.querySelector('.pb-search')!;
        this.listEl = this.container.querySelector('.pb-list')!;
        this.statusEl = this.container.querySelector('.pb-status')!;

        this.bindEvents();
        this.applyStyles();
    }

    /** Register a callback for when a preset entry is selected. */
    onPresetSelect(cb: (entry: PresetEntry) => void): void {
        this.onSelect = cb;
    }

    /** Register a callback for when a preset play button is clicked. */
    onPresetPlay(cb: (entry: PresetEntry) => void): void {
        this.onPlay = cb;
    }

    /** Toggle panel open/closed. */
    toggle(): void {
        this.isOpen = !this.isOpen;
        this.container.classList.toggle('open', this.isOpen);
        if (this.isOpen && !this.rootLoaded) {
            this.loadRoot();
        }
    }

    /** Open the panel. */
    open(): void {
        if (!this.isOpen) this.toggle();
    }

    /** Close the panel. */
    close(): void {
        if (this.isOpen) this.toggle();
    }

    // ── Loading ──────────────────────────────────────────

    private async loadRoot(): Promise<void> {
        this.statusEl.textContent = 'Loading index\u2026';
        try {
            await this.loader.loadRootIndex();
            this.rootLoaded = true;
            this.render();
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.statusEl.textContent = `\u26A0 ${msg}`;
            this.statusEl.className = 'pb-status pb-status-error';
            this.showError(msg);
        }
    }

    private async toggleFolder(path: string): Promise<void> {
        if (this.expanded.has(path)) {
            this.expanded.delete(path);
            this.render();
            return;
        }

        // Need to load this level's data
        const parts = path.split('/');

        if (parts.length === 1) {
            // Top-level library — load its index
            const libName = parts[0];
            try {
                this.statusEl.textContent = `Loading ${libName}\u2026`;
                await this.loader.enableLibrary(libName);
                this.expanded.add(path);
                this.render();
            } catch (err) {
                console.warn(`Failed to load library "${libName}":`, err);
                this.statusEl.textContent = `\u26A0 Failed to load ${libName}`;
            }
        } else if (parts.length === 2) {
            // Sub-index (game) within a library
            const [libName, subName] = parts;
            try {
                this.statusEl.textContent = `Loading ${subName}\u2026`;
                await this.loader.loadSubIndex(libName, subName);
                this.expanded.add(path);
                this.render();
            } catch (err) {
                console.warn(`Failed to load sub-index "${subName}":`, err);
                this.statusEl.textContent = `\u26A0 Failed to load ${subName}`;
            }
        }
    }

    // ── Render ───────────────────────────────────────────

    private render(): void {
        const query = this.searchInput.value.trim();

        if (query) {
            this.renderSearchResults(query);
        } else {
            this.renderTree();
        }
    }

    /** Render the tree view (no search active) */
    private renderTree(): void {
        const fragment = document.createDocumentFragment();
        const libraries = this.loader.getAvailableLibraries();

        if (libraries.length === 0) {
            this.statusEl.textContent = 'No libraries found';
            this.listEl.replaceChildren();
            return;
        }

        for (const lib of libraries) {
            const libPath = lib.name;
            const isExpanded = this.expanded.has(libPath);

            // Library folder row
            const row = this.makeFolderRow(lib.name, libPath, 0, isExpanded, lib.presetCount);
            fragment.appendChild(row);

            if (!isExpanded) continue;

            // Check if library has sub-indexes or direct presets
            if (this.loader.libraryHasSubIndexes(lib.name)) {
                this.renderSubIndexLevel(fragment, lib.name, libPath);
            } else {
                // Direct presets in library
                const presets = this.loader.search({ library: lib.name });
                this.renderPresetRows(fragment, presets, 1, libPath);
            }
        }

        this.listEl.replaceChildren(fragment);
        this.updateStatus();
    }

    /** Render sub-index entries (games) within an expanded library */
    private renderSubIndexLevel(fragment: DocumentFragment, libName: string, libPath: string): void {
        const subIndexes = this.loader.getSubIndexes(libName);
        const page = this.folderPages.get(libPath) ?? 0;
        const start = page * PAGE_SIZE;
        const pageItems = subIndexes.slice(start, start + PAGE_SIZE);

        for (const sub of pageItems) {
            const subPath = `${libName}/${sub.name}`;
            const isExpanded = this.expanded.has(subPath);
            const count = sub.instrumentCount ?? sub.presetCount;

            const row = this.makeFolderRow(sub.name, subPath, 1, isExpanded, count);
            fragment.appendChild(row);

            if (!isExpanded) continue;

            // Presets within this sub-index
            const presets = this.loader.getSubIndexPresets(libName, sub.name);
            this.renderPresetRows(fragment, presets, 2, subPath);
        }

        // Pagination for sub-indexes
        if (subIndexes.length > PAGE_SIZE) {
            const pager = this.makePager(libPath, page, subIndexes.length);
            fragment.appendChild(pager);
        }
    }

    /** Render preset rows at a given indent level, with optional pagination */
    private renderPresetRows(
        fragment: DocumentFragment,
        presets: PresetEntry[],
        indent: number,
        parentPath: string,
    ): void {
        let filtered = presets;
        if (this.categoryFilter) {
            filtered = filtered.filter(e => e.category === this.categoryFilter);
        }

        const page = this.folderPages.get(parentPath + '/_presets') ?? 0;
        const start = page * PAGE_SIZE;
        const pageItems = filtered.slice(start, start + PAGE_SIZE);

        for (const entry of pageItems) {
            fragment.appendChild(this.makePresetRow(entry, indent));
        }

        if (filtered.length > PAGE_SIZE) {
            const pager = this.makePager(parentPath + '/_presets', page, filtered.length);
            pager.style.paddingLeft = `${indent * 16 + 8}px`;
            fragment.appendChild(pager);
        }
    }

    /** Render flat search results across all loaded presets */
    private renderSearchResults(query: string): void {
        const needle = query.toLowerCase();
        const fragment = document.createDocumentFragment();
        const allPresets = this.getAllLoadedPresets();

        let matched = allPresets.filter(e =>
            e.name.toLowerCase().includes(needle) ||
            e.tags.some(t => t.toLowerCase().includes(needle))
        );

        if (this.categoryFilter) {
            matched = matched.filter(e => e.category === this.categoryFilter);
        }

        const page = this.folderPages.get('_search') ?? 0;
        const start = page * PAGE_SIZE;
        const pageItems = matched.slice(start, start + PAGE_SIZE);

        for (const entry of pageItems) {
            fragment.appendChild(this.makePresetRow(entry, 0));
        }

        if (matched.length > PAGE_SIZE) {
            const pager = this.makePager('_search', page, matched.length);
            fragment.appendChild(pager);
        }

        if (matched.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'pb-empty';
            empty.textContent = 'No matching presets. Expand folders to load more.';
            fragment.appendChild(empty);
        }

        this.listEl.replaceChildren(fragment);

        const total = matched.length;
        const shown = pageItems.length;
        if (total > PAGE_SIZE) {
            this.statusEl.textContent = `${shown} of ${total} results (page ${page + 1}/${Math.ceil(total / PAGE_SIZE)})`;
        } else {
            this.statusEl.textContent = `${total} results`;
        }
    }

    /** Collect all presets from every loaded sub-index and library */
    private getAllLoadedPresets(): PresetEntry[] {
        const results: PresetEntry[] = [];
        const libraries = this.loader.getAvailableLibraries();

        for (const lib of libraries) {
            if (!lib.loaded) continue;

            if (this.loader.libraryHasSubIndexes(lib.name)) {
                const subIndexes = this.loader.getSubIndexes(lib.name);
                for (const sub of subIndexes) {
                    if (this.loader.isSubIndexLoaded(lib.name, sub.name)) {
                        results.push(...this.loader.getSubIndexPresets(lib.name, sub.name));
                    }
                }
            } else {
                // Direct presets
                results.push(...this.loader.search({ library: lib.name }));
            }
        }

        return results;
    }

    // ── Row Builders ─────────────────────────────────────

    private makeFolderRow(
        label: string,
        path: string,
        indent: number,
        expanded: boolean,
        count?: number,
    ): HTMLElement {
        const row = document.createElement('div');
        row.className = 'pb-folder';
        row.style.paddingLeft = `${indent * 16 + 8}px`;

        const chevron = expanded ? '\u25BE' : '\u25B8';
        const countStr = count != null ? ` (${count.toLocaleString()})` : '';

        row.innerHTML = `
            <span class="pb-folder-chevron">${chevron}</span>
            <span class="pb-folder-icon">\uD83D\uDCC1</span>
            <span class="pb-folder-name">${escapeHtml(label)}</span>
            <span class="pb-folder-count">${countStr}</span>
        `;

        row.addEventListener('click', () => this.toggleFolder(path));
        return row;
    }

    private makePresetRow(entry: PresetEntry, indent: number): HTMLElement {
        const row = document.createElement('div');
        row.className = 'pb-item';
        row.style.paddingLeft = `${indent * 16 + 8}px`;

        const colour = CATEGORY_COLOURS[entry.category] ?? '#cdd6f4';

        row.innerHTML = `
            <button class="pb-item-play" title="Preview preset">\u25B6</button>
            <span class="pb-item-dot" style="background:${colour}"></span>
            <span class="pb-item-name">${escapeHtml(entry.name)}</span>
            <span class="pb-item-meta">${entry.zoneCount ? entry.zoneCount + 'z' : entry.category}</span>
        `;

        const playBtn = row.querySelector('.pb-item-play')!;
        playBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.onPlay) this.onPlay(entry);
        });

        row.addEventListener('click', () => {
            if (this.onSelect) this.onSelect(entry);
        });

        return row;
    }

    private makePager(pagerKey: string, currentPage: number, totalItems: number): HTMLElement {
        const totalPages = Math.ceil(totalItems / PAGE_SIZE);
        const pager = document.createElement('div');
        pager.className = 'pb-pager';

        if (currentPage > 0) {
            const prev = document.createElement('button');
            prev.className = 'pb-pager-btn';
            prev.textContent = '\u2190 Prev';
            prev.addEventListener('click', (e) => {
                e.stopPropagation();
                this.folderPages.set(pagerKey, currentPage - 1);
                this.render();
                this.listEl.scrollTop = 0;
            });
            pager.appendChild(prev);
        }

        const info = document.createElement('span');
        info.className = 'pb-pager-info';
        info.textContent = `${currentPage + 1} / ${totalPages}`;
        pager.appendChild(info);

        if (currentPage + 1 < totalPages) {
            const next = document.createElement('button');
            next.className = 'pb-pager-btn';
            next.textContent = 'Next \u2192';
            next.addEventListener('click', (e) => {
                e.stopPropagation();
                this.folderPages.set(pagerKey, currentPage + 1);
                this.render();
                this.listEl.scrollTop = 0;
            });
            pager.appendChild(next);
        }

        return pager;
    }

    // ── Status & Errors ──────────────────────────────────

    private updateStatus(): void {
        const libraries = this.loader.getAvailableLibraries();
        const loaded = libraries.filter(l => l.loaded);
        const totalPresets = libraries.reduce((s, l) => s + (l.presetCount ?? 0), 0);
        this.statusEl.textContent = `${loaded.length}/${libraries.length} libraries \u00B7 ${totalPresets.toLocaleString()} presets`;
        this.statusEl.className = 'pb-status';
    }

    private showError(msg: string): void {
        this.listEl.innerHTML = `
            <div class="pb-error">
                <div class="pb-error-icon">\u26A0</div>
                <div class="pb-error-msg">${escapeHtml(msg)}</div>
                <button class="pb-error-retry">Retry</button>
            </div>
        `;
        this.listEl.querySelector('.pb-error-retry')?.addEventListener('click', () => {
            this.rootLoaded = false;
            this.loadRoot();
        });
    }

    // ── Events ───────────────────────────────────────────

    private bindEvents(): void {
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;
        this.searchInput.addEventListener('input', () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                this.folderPages.delete('_search');
                this.render();
            }, 150);
        });

        // Close button
        const closeBtn = this.container.querySelector('.pb-close');
        closeBtn?.addEventListener('click', () => this.close());

        // Category filter chips
        const chips = this.container.querySelectorAll<HTMLElement>('.pb-chip');
        chips.forEach(chip => {
            chip.addEventListener('click', () => {
                const cat = chip.dataset.category as PresetCategory | 'all';
                if (cat === 'all' || this.categoryFilter === cat) {
                    this.categoryFilter = null;
                    chips.forEach(c => c.classList.remove('active'));
                    chip.classList.add('active');
                } else {
                    this.categoryFilter = cat as PresetCategory;
                    chips.forEach(c => c.classList.remove('active'));
                    chip.classList.add('active');
                }
                this.render();
            });
        });
    }

    // ── HTML & Styles ────────────────────────────────────

    private buildHTML(): string {
        return `
            <div class="pb-header">
                <span class="pb-title">Presets</span>
                <button class="pb-close" title="Close">&times;</button>
            </div>
            <input class="pb-search" type="text" placeholder="Search presets\u2026" />
            <div class="pb-filters">
                <span class="pb-chip active" data-category="all">All</span>
                <span class="pb-chip" data-category="sampler">Sampler</span>
                <span class="pb-chip" data-category="synth">Synth</span>
                <span class="pb-chip" data-category="composite">Composite</span>
                <span class="pb-chip" data-category="effect">Effect</span>
            </div>
            <div class="pb-list"></div>
            <div class="pb-status">Click \u201CPresets\u201D to load</div>
        `;
    }

    private applyStyles(): void {
        if (document.getElementById('pb-styles')) return;
        const style = document.createElement('style');
        style.id = 'pb-styles';
        style.textContent = STYLES;
        document.head.appendChild(style);
    }
}

// ── Helpers ──────────────────────────────────────────────

function escapeHtml(text: string): string {
    const el = document.createElement('span');
    el.textContent = text;
    return el.innerHTML;
}

// ── Styles ───────────────────────────────────────────────

const STYLES = `
.preset-browser {
    position: absolute;
    right: 0; top: 0; bottom: 0;
    width: 300px;
    background: var(--surface, #181825);
    border-left: 1px solid var(--border, #313244);
    display: flex;
    flex-direction: column;
    transform: translateX(100%);
    transition: transform 0.2s ease;
    z-index: 50;
    font-size: 0.85rem;
}
.preset-browser.open { transform: translateX(0); }

.pb-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--border, #313244);
}
.pb-title { font-weight: 600; color: var(--accent, #89b4fa); }
.pb-close {
    background: none; border: none;
    color: var(--subtext, #a6adc8);
    cursor: pointer; font-size: 1.2rem;
    padding: 0 4px; line-height: 1;
}

.pb-search {
    margin: 0.5rem 0.75rem;
    padding: 0.35rem 0.5rem;
    border-radius: 4px;
    border: 1px solid var(--border, #313244);
    background: var(--overlay, #11111b);
    color: var(--text, #cdd6f4);
    font-size: 0.8rem;
    outline: none;
}
.pb-search:focus { border-color: var(--accent, #89b4fa); }

.pb-filters {
    display: flex; gap: 4px;
    padding: 0 0.75rem 0.5rem;
    flex-wrap: wrap;
}
.pb-chip {
    padding: 2px 8px; border-radius: 12px;
    font-size: 0.7rem; cursor: pointer;
    background: var(--overlay, #11111b);
    border: 1px solid var(--border, #313244);
    color: var(--subtext, #a6adc8);
    user-select: none;
}
.pb-chip.active {
    background: var(--accent, #89b4fa);
    color: var(--bg, #1e1e2e);
    border-color: var(--accent, #89b4fa);
    font-weight: 600;
}

.pb-list {
    flex: 1; overflow-y: auto;
    padding: 0 0.25rem;
}

/* ── Folder rows ── */
.pb-folder {
    display: flex; align-items: center;
    gap: 4px; padding: 4px 6px;
    border-radius: 4px; cursor: pointer;
    user-select: none;
}
.pb-folder:hover { background: var(--border, #313244); }
.pb-folder-chevron {
    width: 12px; text-align: center;
    font-size: 0.7rem;
    color: var(--subtext, #a6adc8);
    flex-shrink: 0;
}
.pb-folder-icon {
    font-size: 0.8rem; flex-shrink: 0;
}
.pb-folder-name {
    flex: 1; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis;
    color: var(--text, #cdd6f4);
    font-size: 0.8rem;
}
.pb-folder-count {
    font-size: 0.6rem;
    color: var(--subtext, #a6adc8);
    flex-shrink: 0;
}

/* ── Preset rows ── */
.pb-item {
    display: flex; align-items: center;
    gap: 6px; padding: 3px 6px;
    border-radius: 4px; cursor: pointer;
}
.pb-item:hover { background: var(--border, #313244); }
.pb-item-dot {
    width: 8px; height: 8px;
    border-radius: 50%; flex-shrink: 0;
}
.pb-item-name {
    flex: 1; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis;
    color: var(--text, #cdd6f4);
    font-size: 0.78rem;
}
.pb-item-meta {
    font-size: 0.6rem;
    color: var(--subtext, #a6adc8);
    flex-shrink: 0;
}
.pb-item-play {
    background: none; border: none;
    color: var(--accent, #89b4fa);
    cursor: pointer; font-size: 0.65rem;
    padding: 2px 3px; border-radius: 3px;
    opacity: 0.5;
    transition: opacity 0.15s, background 0.15s;
}
.pb-item-play:hover {
    opacity: 1;
    background: var(--border, #313244);
}

/* ── Pager ── */
.pb-pager {
    display: flex; align-items: center;
    justify-content: center; gap: 10px;
    padding: 6px 0;
    border-top: 1px solid var(--border, #313244);
    margin-top: 2px;
}
.pb-pager-btn {
    padding: 2px 8px; border-radius: 4px;
    border: 1px solid var(--accent, #89b4fa);
    background: transparent;
    color: var(--accent, #89b4fa);
    cursor: pointer; font-size: 0.65rem;
}
.pb-pager-btn:hover {
    background: var(--accent, #89b4fa);
    color: var(--bg, #1e1e2e);
}
.pb-pager-info {
    font-size: 0.65rem;
    color: var(--subtext, #a6adc8);
}

/* ── Empty / Status ── */
.pb-empty {
    padding: 1.5rem 1rem;
    text-align: center;
    color: var(--subtext, #a6adc8);
    font-size: 0.75rem;
}
.pb-status {
    padding: 0.4rem 0.75rem;
    font-size: 0.7rem;
    color: var(--subtext, #a6adc8);
    border-top: 1px solid var(--border, #313244);
}
.pb-status-error { color: #f38ba8; }

.pb-error {
    display: flex; flex-direction: column;
    align-items: center; gap: 8px;
    padding: 2rem 1rem; text-align: center;
}
.pb-error-icon { font-size: 2rem; }
.pb-error-msg {
    font-size: 0.8rem; color: #f38ba8;
    word-break: break-word;
}
.pb-error-retry {
    padding: 4px 12px; border-radius: 4px;
    border: 1px solid var(--accent, #89b4fa);
    background: transparent;
    color: var(--accent, #89b4fa);
    cursor: pointer; font-size: 0.75rem;
}
.pb-error-retry:hover {
    background: var(--accent, #89b4fa);
    color: var(--bg, #1e1e2e);
}
`;
