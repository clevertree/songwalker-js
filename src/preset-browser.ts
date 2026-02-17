/**
 * Preset Browser UI — searchable panel for browsing the preset library.
 *
 * Creates a collapsible sidebar panel with:
 * - Library selector chips (enable/disable source libraries)
 * - Search input with fuzzy matching
 * - Category/tag filter chips
 * - Scrollable preset list grouped by library
 * - Click-to-insert into editor
 */

import type { PresetEntry, PresetCategory } from './preset-types.js';
import { PresetLoader, type LibraryInfo } from './preset-loader.js';

// ── Category Colours ─────────────────────────────────────

const CATEGORY_COLOURS: Record<PresetCategory, string> = {
    synth: '#89b4fa',
    sampler: '#a6e3a1',
    effect: '#fab387',
    composite: '#cba6f7',
};

// ── Preset Browser Component ─────────────────────────────

export class PresetBrowser {
    private container: HTMLElement;
    private loader: PresetLoader;
    private filteredEntries: PresetEntry[] = [];
    private onSelect: ((entry: PresetEntry) => void) | null = null;
    private onPlay: ((entry: PresetEntry) => void) | null = null;

    private searchInput!: HTMLInputElement;
    private listEl!: HTMLElement;
    private statusEl!: HTMLElement;
    private libraryChipsEl!: HTMLElement;
    private categoryFilter: PresetCategory | null = null;

    private isOpen = false;
    private libraries: LibraryInfo[] = [];

    constructor(parentEl: HTMLElement, loader: PresetLoader) {
        this.container = document.createElement('div');
        this.container.className = 'preset-browser';
        this.container.innerHTML = this.buildHTML();
        parentEl.appendChild(this.container);

        this.loader = loader;

        this.searchInput = this.container.querySelector('.pb-search')!;
        this.listEl = this.container.querySelector('.pb-list')!;
        this.statusEl = this.container.querySelector('.pb-status')!;
        this.libraryChipsEl = this.container.querySelector('.pb-libraries')!;

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
        if (this.isOpen && this.libraries.length === 0) {
            this.loadRootIndex();
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

    // ── Internal ─────────────────────────────────────────

    private async loadRootIndex(): Promise<void> {
        this.statusEl.textContent = 'Loading index…';
        this.statusEl.className = 'pb-status';
        try {
            await this.loader.loadRootIndex();
            this.libraries = this.loader.getAvailableLibraries();
            this.renderLibraryChips();
            this.statusEl.textContent = `${this.libraries.length} libraries available`;

            // Auto-enable the first library (or Built-in if present)
            const builtIn = this.libraries.find(l => l.name === 'Built-in');
            if (builtIn) {
                await this.toggleLibrary(builtIn.name, true);
            } else if (this.libraries.length > 0) {
                await this.toggleLibrary(this.libraries[0].name, true);
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.statusEl.textContent = `\u26A0 ${msg}`;
            this.statusEl.className = 'pb-status pb-status-error';
            this.showError(msg);
        }
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
            this.libraries = [];
            this.loadRootIndex();
        });
    }

    private renderLibraryChips(): void {
        const fragment = document.createDocumentFragment();

        for (const lib of this.libraries) {
            const chip = document.createElement('span');
            chip.className = `pb-lib-chip${lib.enabled ? ' active' : ''}`;
            chip.dataset.library = lib.name;
            chip.title = lib.description ?? lib.name;

            const label = lib.name;
            const count = lib.presetCount ? ` (${lib.presetCount})` : '';
            chip.textContent = `${label}${count}`;

            chip.addEventListener('click', () => this.toggleLibrary(lib.name));
            fragment.appendChild(chip);
        }

        this.libraryChipsEl.replaceChildren(fragment);
    }

    private async toggleLibrary(name: string, forceEnable?: boolean): Promise<void> {
        const lib = this.libraries.find(l => l.name === name);
        if (!lib) return;

        const shouldEnable = forceEnable ?? !lib.enabled;

        if (shouldEnable) {
            // Show loading state on the chip
            const chip = this.libraryChipsEl.querySelector(
                `[data-library="${name}"]`
            ) as HTMLElement | null;
            if (chip) chip.textContent = `${name} ⏳`;

            try {
                await this.loader.enableLibrary(name);
                lib.enabled = true;
                lib.loaded = true;
            } catch (err) {
                console.warn(`Failed to load library "${name}":`, err);
                if (chip) chip.textContent = `${name} ✗`;
                return;
            }
        } else {
            this.loader.disableLibrary(name);
            lib.enabled = false;
        }

        this.renderLibraryChips();
        this.applyFilter();
    }

    private applyFilter(): void {
        const query = this.searchInput.value.trim();

        if (query) {
            this.filteredEntries = this.loader.fuzzySearch(query, 100);
        } else {
            this.filteredEntries = this.loader.search({});
        }

        if (this.categoryFilter) {
            this.filteredEntries = this.filteredEntries.filter(
                e => e.category === this.categoryFilter,
            );
        }

        this.renderList();
    }

    private renderList(): void {
        const fragment = document.createDocumentFragment();

        for (const entry of this.filteredEntries.slice(0, 200)) {
            const item = document.createElement('div');
            item.className = 'pb-item';
            item.dataset.path = entry.path;

            const colour = CATEGORY_COLOURS[entry.category] ?? '#cdd6f4';

            item.innerHTML = `
                <button class="pb-item-play" title="Preview preset">▶</button>
                <span class="pb-item-dot" style="background:${colour}"></span>
                <span class="pb-item-name">${escapeHtml(entry.name)}</span>
                <span class="pb-item-meta">${entry.zoneCount ? entry.zoneCount + 'z' : entry.category}</span>
            `;

            // Play button click
            const playBtn = item.querySelector('.pb-item-play')!;
            playBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.onPlay) this.onPlay(entry);
            });

            // Select preset (insert into editor)
            item.addEventListener('click', () => {
                if (this.onSelect) this.onSelect(entry);
            });

            fragment.appendChild(item);
        }

        this.listEl.replaceChildren(fragment);

        const total = this.filteredEntries.length;
        const shown = Math.min(total, 200);
        this.statusEl.textContent = total === shown
            ? `${total} presets`
            : `${shown} / ${total} presets`;
    }

    private bindEvents(): void {
        this.searchInput.addEventListener('input', () => this.applyFilter());

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
                this.applyFilter();
            });
        });
    }

    private buildHTML(): string {
        return `
            <div class="pb-header">
                <span class="pb-title">Presets</span>
                <button class="pb-close" title="Close">&times;</button>
            </div>
            <div class="pb-libraries"></div>
            <input class="pb-search" type="text" placeholder="Search presets…" />
            <div class="pb-filters">
                <span class="pb-chip active" data-category="all">All</span>
                <span class="pb-chip" data-category="sampler">Sampler</span>
                <span class="pb-chip" data-category="synth">Synth</span>
                <span class="pb-chip" data-category="composite">Composite</span>
                <span class="pb-chip" data-category="effect">Effect</span>
            </div>
            <div class="pb-list"></div>
            <div class="pb-status">Click "Presets" to load</div>
        `;
    }

    private applyStyles(): void {
        if (document.getElementById('pb-styles')) return;
        const style = document.createElement('style');
        style.id = 'pb-styles';
        style.textContent = `
.preset-browser {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 280px;
    background: var(--surface, #181825);
    border-left: 1px solid var(--border, #313244);
    display: flex;
    flex-direction: column;
    transform: translateX(100%);
    transition: transform 0.2s ease;
    z-index: 50;
    font-size: 0.85rem;
}
.preset-browser.open {
    transform: translateX(0);
}
.pb-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--border, #313244);
}
.pb-title {
    font-weight: 600;
    color: var(--accent, #89b4fa);
}
.pb-close {
    background: none;
    border: none;
    color: var(--subtext, #a6adc8);
    cursor: pointer;
    font-size: 1.2rem;
    padding: 0 4px;
    line-height: 1;
}
.pb-libraries {
    display: flex;
    gap: 4px;
    padding: 0.5rem 0.75rem 0.25rem;
    flex-wrap: wrap;
}
.pb-lib-chip {
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 0.7rem;
    cursor: pointer;
    background: var(--overlay, #11111b);
    border: 1px solid var(--border, #313244);
    color: var(--subtext, #a6adc8);
    user-select: none;
    transition: background 0.15s, color 0.15s;
}
.pb-lib-chip.active {
    background: #45475a;
    color: var(--text, #cdd6f4);
    border-color: var(--accent, #89b4fa);
    font-weight: 600;
}
.pb-lib-chip:hover {
    border-color: var(--accent, #89b4fa);
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
.pb-search:focus {
    border-color: var(--accent, #89b4fa);
}
.pb-filters {
    display: flex;
    gap: 4px;
    padding: 0 0.75rem 0.5rem;
    flex-wrap: wrap;
}
.pb-chip {
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 0.7rem;
    cursor: pointer;
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
    flex: 1;
    overflow-y: auto;
    padding: 0 0.5rem;
}
.pb-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 6px;
    border-radius: 4px;
    cursor: pointer;
}
.pb-item:hover {
    background: var(--border, #313244);
}
.pb-item-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
}
.pb-item-name {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--text, #cdd6f4);
    font-size: 0.8rem;
}
.pb-item-meta {
    font-size: 0.65rem;
    color: var(--subtext, #a6adc8);
    flex-shrink: 0;
}
.pb-item-play {
    background: none;
    border: none;
    color: var(--accent, #89b4fa);
    cursor: pointer;
    font-size: 0.7rem;
    padding: 2px 4px;
    border-radius: 3px;
    opacity: 0.6;
    transition: opacity 0.15s, background 0.15s;
}
.pb-item-play:hover {
    opacity: 1;
    background: var(--border, #313244);
}
.pb-item.playing .pb-item-play {
    color: #a6e3a1;
    opacity: 1;
}
.pb-status {
    padding: 0.4rem 0.75rem;
    font-size: 0.7rem;
    color: var(--subtext, #a6adc8);
    border-top: 1px solid var(--border, #313244);
}
.pb-status-error {
    color: #f38ba8;
}
.pb-error {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 2rem 1rem;
    text-align: center;
}
.pb-error-icon {
    font-size: 2rem;
}
.pb-error-msg {
    font-size: 0.8rem;
    color: #f38ba8;
    word-break: break-word;
}
.pb-error-retry {
    padding: 4px 12px;
    border-radius: 4px;
    border: 1px solid var(--accent, #89b4fa);
    background: transparent;
    color: var(--accent, #89b4fa);
    cursor: pointer;
    font-size: 0.75rem;
}
.pb-error-retry:hover {
    background: var(--accent, #89b4fa);
    color: var(--bg, #1e1e2e);
}
        `;
        document.head.appendChild(style);
    }
}

function escapeHtml(text: string): string {
    const el = document.createElement('span');
    el.textContent = text;
    return el.innerHTML;
}
