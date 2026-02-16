/**
 * Preset Loader — fetches and caches preset descriptors and audio data.
 *
 * Responsibilities:
 * - Load and parse the root index file (index.json)
 * - Load individual library indexes on demand
 * - Search across enabled libraries by name, tags, gmProgram, category
 * - Resolve preset paths and fetch JSON descriptors
 * - Decode audio samples to AudioBuffers via WebAudio
 * - LRU caching for presets and decoded audio
 */

import type {
    PresetDescriptor,
    PresetIndex,
    PresetEntry,
    SubIndexEntry,
    SamplerConfig,
    SampleZone,
    AudioReference,
    IndexEntry,
} from './preset-types.js';

// Re-export types for convenience
export type {
    PresetDescriptor,
    PresetIndex,
    PresetEntry,
    SubIndexEntry,
    SamplerConfig,
    SampleZone,
    AudioReference,
    IndexEntry,
};

// ── LRU Cache ────────────────────────────────────────────

class LRUCache<K, V> {
    private maxSize: number;
    private cache: Map<K, V>;

    constructor(maxSize: number) {
        this.maxSize = maxSize;
        this.cache = new Map();
    }

    has(key: K): boolean {
        return this.cache.has(key);
    }

    get(key: K): V | undefined {
        const value = this.cache.get(key);
        if (value !== undefined) {
            // Move to end (most recently used)
            this.cache.delete(key);
            this.cache.set(key, value);
        }
        return value;
    }

    set(key: K, value: V): void {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.maxSize) {
            // Evict oldest (first item)
            const oldest = this.cache.keys().next().value!;
            this.cache.delete(oldest);
        }
        this.cache.set(key, value);
    }

    clear(): void {
        this.cache.clear();
    }

    get size(): number {
        return this.cache.size;
    }
}

// ── Helper ───────────────────────────────────────────────

function dirOf(url: string): string {
    const idx = url.lastIndexOf('/');
    return idx > 0 ? url.substring(0, idx) : url;
}

// ── Search Options ───────────────────────────────────────

export interface SearchOptions {
    /** Filter by library name */
    library?: string;
    /** Filter by category */
    category?: 'synth' | 'sampler' | 'effect' | 'composite';
    /** Filter by GM program number */
    gmProgram?: number;
    /** Filter by tags (entry must have at least one matching tag) */
    tags?: string[];
    /** Filter by name substring (case-insensitive) */
    name?: string;
}

/** Info about a loadable library (from root index sub-index entries) */
export interface LibraryInfo {
    name: string;
    path: string;
    description?: string;
    presetCount?: number;
    loaded: boolean;
    enabled: boolean;
}

// ── Preset Loader ────────────────────────────────────────

export interface LoadedLibrary {
    index: PresetIndex;
    baseUrl: string;
}

export class PresetLoader {
    private readonly baseUrl: string;

    /** Root index (lazy-loaded) */
    private rootIndex: PresetIndex | null = null;

    /** Loaded library indexes, keyed by library name */
    private loadedLibraries: Map<string, LoadedLibrary> = new Map();

    /** Which libraries are enabled for search */
    private enabledLibraries: Set<string> = new Set();

    /** LRU cache for preset descriptors */
    private presetCache: LRUCache<string, PresetDescriptor>;

    /** LRU cache for decoded AudioBuffers */
    private audioCache: LRUCache<string, AudioBuffer>;

    /** AudioContext for decoding audio */
    private _audioContext: AudioContext | null = null;

    constructor(baseUrl: string, options?: { presetCacheSize?: number; audioCacheSize?: number }) {
        this.baseUrl = baseUrl.replace(/\/$/, ''); // trim trailing slash
        this.presetCache = new LRUCache(options?.presetCacheSize ?? 128);
        this.audioCache = new LRUCache(options?.audioCacheSize ?? 256);
    }

    /** Set the AudioContext used for decoding audio samples. */
    setAudioContext(ctx: AudioContext): void {
        this._audioContext = ctx;
    }

    /** Get the current AudioContext, if set. */
    getAudioContext(): AudioContext | null {
        return this._audioContext;
    }

    // ── Index Loading ────────────────────────────────────

    /** Load the root index from baseUrl/index.json */
    async loadRootIndex(): Promise<PresetIndex> {
        if (this.rootIndex) return this.rootIndex;

        const url = `${this.baseUrl}/index.json`;
        const resp = await fetch(url);
        if (!resp.ok) {
            throw new Error(`Failed to fetch root index: ${resp.status} ${url}`);
        }
        this.rootIndex = await resp.json() as PresetIndex;
        return this.rootIndex;
    }

    /** Get list of available libraries from root index (async) */
    async getAvailableLibrariesAsync(): Promise<SubIndexEntry[]> {
        const root = await this.loadRootIndex();
        return root.entries.filter((e): e is SubIndexEntry => e.type === 'index');
    }

    /**
     * Get info about all available libraries (synchronous).
     * Requires loadRootIndex() to have been called first.
     *
     * If the root index contains sub-index entries, those are returned as libraries.
     * If the root index contains only preset entries (flat index), a single
     * virtual library is created from the root index itself.
     */
    getAvailableLibraries(): LibraryInfo[] {
        if (!this.rootIndex) return [];

        const subIndexes = this.rootIndex.entries.filter(
            (e): e is SubIndexEntry => e.type === 'index'
        );

        // Flat index — presets are directly in the root, no sub-libraries
        if (subIndexes.length === 0) {
            const presetCount = this.rootIndex.entries.filter(e => e.type === 'preset').length;
            if (presetCount > 0) {
                const name = this.rootIndex.name;
                return [{
                    name,
                    path: 'index.json',
                    description: this.rootIndex.description,
                    presetCount,
                    loaded: this.loadedLibraries.has(name),
                    enabled: this.enabledLibraries.has(name),
                }];
            }
            return [];
        }

        return subIndexes.map(entry => ({
            name: entry.name,
            path: entry.path,
            description: entry.description,
            presetCount: entry.presetCount,
            loaded: this.loadedLibraries.has(entry.name),
            enabled: this.enabledLibraries.has(entry.name),
        }));
    }

    /** Load a specific library index by name.
     *  Matches by exact name first, then by normalized name (underscores ↔ spaces),
     *  then by directory prefix in the path.
     */
    async loadLibrary(name: string): Promise<LoadedLibrary> {
        if (this.loadedLibraries.has(name)) {
            return this.loadedLibraries.get(name)!;
        }

        const root = await this.loadRootIndex();

        // Check if this is a flat index (root index IS the library)
        const hasSubIndexes = root.entries.some(e => e.type === 'index');
        if (!hasSubIndexes && root.name === name) {
            // Flat index: treat root index as the library itself
            const loaded: LoadedLibrary = { index: root, baseUrl: this.baseUrl };
            this.loadedLibraries.set(name, loaded);
            return loaded;
        }

        // Try exact match first
        let libEntry = root.entries.find(
            (e): e is SubIndexEntry => e.type === 'index' && e.name === name
        );

        // Fall back: normalize underscores ↔ spaces for matching
        if (!libEntry) {
            const normalized = name.replace(/_/g, ' ');
            libEntry = root.entries.find(
                (e): e is SubIndexEntry => e.type === 'index' &&
                    e.name.replace(/_/g, ' ').toLowerCase() === normalized.toLowerCase()
            );
        }

        // Fall back: match by directory prefix in path (e.g. "FluidR3_GM/index.json")
        if (!libEntry) {
            libEntry = root.entries.find(
                (e): e is SubIndexEntry => e.type === 'index' &&
                    e.path.startsWith(name + '/')
            );
        }

        if (!libEntry) {
            throw new Error(`Library not found: "${name}"`);
        }

        const libUrl = `${this.baseUrl}/${libEntry.path}`;
        const resp = await fetch(libUrl);
        if (!resp.ok) {
            throw new Error(`Failed to fetch library index: ${resp.status} ${libUrl}`);
        }
        const index = await resp.json() as PresetIndex;
        const baseUrl = dirOf(libUrl);

        const loaded: LoadedLibrary = { index, baseUrl };
        // Store under both the requested name and the canonical name from the index
        this.loadedLibraries.set(name, loaded);
        if (libEntry.name !== name) {
            this.loadedLibraries.set(libEntry.name, loaded);
        }
        return loaded;
    }

    /** Enable a library for searching. Loads if not already loaded. */
    async enableLibrary(name: string): Promise<void> {
        await this.loadLibrary(name);
        this.enabledLibraries.add(name);
    }

    /** Disable a library from being searched. */
    disableLibrary(name: string): void {
        this.enabledLibraries.delete(name);
    }

    /** Get currently enabled library names. */
    getEnabledLibraries(): string[] {
        return Array.from(this.enabledLibraries);
    }

    // ── Search ───────────────────────────────────────────

    /** Get all presets from enabled libraries. */
    private _getEnabledPresets(): { libraryName: string; entry: PresetEntry }[] {
        const results: { libraryName: string; entry: PresetEntry }[] = [];
        for (const libraryName of this.enabledLibraries) {
            const lib = this.loadedLibraries.get(libraryName);
            if (!lib) continue;
            for (const entry of lib.index.entries) {
                if (entry.type === 'preset') {
                    results.push({ libraryName, entry });
                }
            }
        }
        return results;
    }

    /** Search enabled libraries with optional filters. Returns matching entries. */
    search(options: SearchOptions = {}): PresetEntry[] {
        let results = this._getEnabledPresets();

        if (options.library) {
            results = results.filter(r =>
                r.libraryName.toLowerCase() === options.library!.toLowerCase()
            );
        }
        if (options.category) {
            results = results.filter(r => r.entry.category === options.category);
        }
        if (options.gmProgram !== undefined) {
            results = results.filter(r => r.entry.gmProgram === options.gmProgram);
        }
        if (options.tags && options.tags.length > 0) {
            const searchTags = new Set(options.tags.map(t => t.toLowerCase()));
            results = results.filter(r =>
                r.entry.tags.some(t => searchTags.has(t.toLowerCase()))
            );
        }
        if (options.name) {
            const needle = options.name.toLowerCase();
            results = results.filter(r =>
                r.entry.name.toLowerCase().includes(needle)
            );
        }

        return results.map(r => r.entry);
    }

    /** Fuzzy search by name across all enabled libraries — sorted by relevance. */
    fuzzySearch(query: string, limit = 20): PresetEntry[] {
        const needle = query.toLowerCase();
        const allPresets = this._getEnabledPresets();

        const scored = allPresets
            .map(({ entry }) => {
                const name = entry.name.toLowerCase();
                let score = 0;

                if (name === needle) score = 100;
                else if (name.startsWith(needle)) score = 80;
                else if (name.includes(needle)) score = 60;
                else if (entry.tags.some(t => t.toLowerCase().includes(needle))) score = 40;
                else {
                    const words = needle.split(/\s+/);
                    const matchCount = words.filter(w =>
                        name.includes(w) || entry.tags.some(t => t.toLowerCase().includes(w))
                    ).length;
                    score = (matchCount / words.length) * 30;
                }

                return { entry, score };
            })
            .filter(s => s.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map(s => s.entry);

        return scored;
    }

    // ── Load Preset ──────────────────────────────────────

    /**
     * Load a preset by name. Searches all enabled libraries.
     * If the name contains a '/' prefix (e.g., "FluidR3_GM/Acoustic Grand Piano"),
     * the library is loaded automatically if needed.
     */
    async loadPreset(name: string): Promise<PresetDescriptor> {
        const result = await this.loadPresetWithContext(name);
        return result.preset;
    }

    /**
     * Load a preset by name and return the preset, its resolved URL, the matching
     * entry, and the library name — so callers can resolve relative audio paths
     * without duplicating search logic.
     */
    async loadPresetWithContext(name: string): Promise<{
        preset: PresetDescriptor;
        presetUrl: string;
        entry: PresetEntry;
        libraryName: string | undefined;
    }> {
        // Check for library prefix: "LibraryName/PresetName"
        const slashIdx = name.indexOf('/');
        if (slashIdx > 0) {
            const libName = name.substring(0, slashIdx);
            const presetName = name.substring(slashIdx + 1);

            // Ensure library is loaded and enabled
            if (!this.enabledLibraries.has(libName)) {
                await this.enableLibrary(libName);
            }

            const results = this.search({ name: presetName, library: libName });
            if (results.length > 0) {
                const entry = results[0];
                const libraryName = libName;
                const presetUrl = this.resolvePresetUrl(entry.path, libraryName);
                const preset = await this._fetchPreset(presetUrl, entry.path);
                return { preset, presetUrl, entry, libraryName };
            }
        }

        // Fall back to searching all enabled libraries
        const results = this.search({ name });
        if (results.length === 0) {
            throw new Error(`Preset not found: "${name}"`);
        }
        const entry = results[0];
        const libraryName = this.findLibraryForEntry(entry);
        const presetUrl = this.resolvePresetUrl(entry.path, libraryName);
        const preset = await this._fetchPreset(presetUrl, entry.path);
        return { preset, presetUrl, entry, libraryName };
    }

    /** Load a preset by its catalog path, resolved relative to a library. */
    async loadPresetByPath(path: string, libraryName?: string): Promise<PresetDescriptor> {
        const fullUrl = this.resolvePresetUrl(path, libraryName);
        return this._fetchPreset(fullUrl, path);
    }

    /** Load a preset by GM program number (0-127). Searches enabled libraries. */
    async loadPresetByProgram(program: number): Promise<PresetDescriptor> {
        const results = this.search({ gmProgram: program });
        if (results.length === 0) {
            throw new Error(`No preset found for GM program ${program}`);
        }
        return this._loadPresetEntry(results[0]);
    }

    /** Internal: load a preset entry, resolving its URL from its source library. */
    private async _loadPresetEntry(entry: PresetEntry, libraryHint?: string): Promise<PresetDescriptor> {
        // Find which library this entry belongs to
        const libraryName = libraryHint ?? this.findLibraryForEntry(entry);
        const fullUrl = this.resolvePresetUrl(entry.path, libraryName);
        return this._fetchPreset(fullUrl, entry.path);
    }

    /** Find which loaded library contains a given entry. */
    findLibraryForEntry(entry: PresetEntry): string | undefined {
        for (const [libraryName, { index }] of this.loadedLibraries) {
            if (index.entries.some(e =>
                e.type === 'preset' && e.name === entry.name && e.path === entry.path
            )) {
                return libraryName;
            }
        }
        return undefined;
    }

    /** Resolve a preset path to a full URL using the library's base URL. */
    resolvePresetUrl(path: string, libraryName?: string): string {
        if (libraryName) {
            const lib = this.loadedLibraries.get(libraryName);
            if (lib) {
                return `${lib.baseUrl}/${path}`;
            }
        }
        return `${this.baseUrl}/${path}`;
    }

    /** Fetch and cache a preset descriptor. */
    private async _fetchPreset(url: string, cacheKey: string): Promise<PresetDescriptor> {
        if (this.presetCache.has(cacheKey)) {
            return this.presetCache.get(cacheKey)!;
        }

        const resp = await fetch(url);
        if (!resp.ok) {
            throw new Error(`Failed to fetch preset: ${resp.status} ${url}`);
        }
        const preset = await resp.json() as PresetDescriptor;
        this.presetCache.set(cacheKey, preset);
        return preset;
    }

    // ── Audio Decoding ───────────────────────────────────

    /**
     * Decode an audio reference to an AudioBuffer.
     * Requires an AudioContext to be set via setAudioContext().
     */
    async decodeAudio(ref_: AudioReference, presetUrl?: string): Promise<AudioBuffer> {
        const ctx = this._audioContext;
        if (!ctx) {
            throw new Error('AudioContext not set. Call setAudioContext() first.');
        }

        let cacheKey: string;
        let arrayBuffer: ArrayBuffer;

        switch (ref_.type) {
            case 'external': {
                // Preset files may use either 'path' or 'url' for the sample location
                const filePath = ref_.path ?? ref_.url;
                if (!filePath) {
                    throw new Error('External audio reference has neither path nor url');
                }
                const sampleUrl = presetUrl
                    ? `${dirOf(presetUrl)}/${filePath}`
                    : `${this.baseUrl}/${filePath}`;
                cacheKey = ref_.sha256 ?? sampleUrl;

                if (this.audioCache.has(cacheKey)) {
                    return this.audioCache.get(cacheKey)!;
                }

                const resp = await fetch(sampleUrl);
                if (!resp.ok) throw new Error(`Failed to fetch sample: ${resp.status} ${sampleUrl}`);
                arrayBuffer = await resp.arrayBuffer();
                break;
            }

            case 'contentAddressed': {
                cacheKey = ref_.sha256;
                if (this.audioCache.has(cacheKey)) {
                    return this.audioCache.get(cacheKey)!;
                }
                const shaUrl = `${this.baseUrl}/samples/${ref_.sha256}.${ref_.codec}`;
                const resp = await fetch(shaUrl);
                if (!resp.ok) throw new Error(`Failed to fetch sample: ${resp.status} ${shaUrl}`);
                arrayBuffer = await resp.arrayBuffer();
                break;
            }

            case 'inlineFile': {
                cacheKey = `inline:${ref_.data.slice(0, 32)}`;
                if (this.audioCache.has(cacheKey)) {
                    return this.audioCache.get(cacheKey)!;
                }
                const binary = atob(ref_.data);
                arrayBuffer = new ArrayBuffer(binary.length);
                const view = new Uint8Array(arrayBuffer);
                for (let i = 0; i < binary.length; i++) {
                    view[i] = binary.charCodeAt(i);
                }
                break;
            }

            case 'inlinePcm': {
                cacheKey = `pcm:${ref_.data.slice(0, 32)}`;
                if (this.audioCache.has(cacheKey)) {
                    return this.audioCache.get(cacheKey)!;
                }
                // Decode base64 → Float32Array PCM
                const pcmBinary = atob(ref_.data);
                const pcmBytes = new Uint8Array(pcmBinary.length);
                for (let i = 0; i < pcmBinary.length; i++) {
                    pcmBytes[i] = pcmBinary.charCodeAt(i);
                }
                const pcmFloat = new Float32Array(pcmBytes.buffer);
                const pcmBuffer = ctx.createBuffer(1, pcmFloat.length, ref_.sampleRate);
                pcmBuffer.copyToChannel(pcmFloat, 0);
                this.audioCache.set(cacheKey, pcmBuffer);
                return pcmBuffer;
            }
        }

        const decoded = await ctx.decodeAudioData(arrayBuffer);
        this.audioCache.set(cacheKey, decoded);
        return decoded;
    }

    /**
     * Decode all sample zones in a sampler preset, returning AudioBuffers.
     */
    async decodeSamplerZones(
        config: SamplerConfig,
        presetUrl?: string,
    ): Promise<Map<SampleZone, AudioBuffer>> {
        const result = new Map<SampleZone, AudioBuffer>();

        const promises = config.zones.map(async (zone) => {
            const buffer = await this.decodeAudio(zone.audio, presetUrl);
            result.set(zone, buffer);
        });

        await Promise.all(promises);
        return result;
    }

    // ── Cache Management ─────────────────────────────────

    clearCaches(): void {
        this.presetCache.clear();
        this.audioCache.clear();
    }

    get presetCacheSize(): number {
        return this.presetCache.size;
    }

    get audioCacheSize(): number {
        return this.audioCache.size;
    }

    // ── Preloading ───────────────────────────────────────

    /**
     * Preload all referenced presets (and their sample data) before playback.
     * Call with the preset names extracted at compile time via extract_preset_refs().
     *
     * Usage:
     *   const refs = wasm.extract_preset_refs(songSource);
     *   await loader.preloadAll(refs);
     *   // Now playback can start without blocking on network fetches.
     */
    async preloadAll(presetNames: string[]): Promise<void> {
        // Ensure root index is loaded first
        await this.loadRootIndex();

        // Determine which libraries need loading based on presetNames
        // Names of form "LibraryName/PresetName" tell us which libraries to fetch
        const librariesToLoad = new Set<string>();
        for (const name of presetNames) {
            const slashIdx = name.indexOf('/');
            if (slashIdx > 0) {
                librariesToLoad.add(name.substring(0, slashIdx));
            }
        }

        // Load required libraries in parallel
        await Promise.all(
            Array.from(librariesToLoad).map(lib => this.enableLibrary(lib))
        );

        // Now load each preset
        const promises = presetNames.map(async (name) => {
            try {
                const preset = await this.loadPreset(name);
                // Pre-decode sampler zones if the preset has a sampler config
                if (preset.node?.type === 'sampler' && preset.node.config) {
                    const entry = this.search({ name })[0];
                    if (entry) {
                        const libraryName = this.findLibraryForEntry(entry);
                        const presetUrl = this.resolvePresetUrl(entry.path, libraryName);
                        await this.decodeSamplerZones(
                            preset.node.config as SamplerConfig,
                            presetUrl,
                        );
                    }
                }
            } catch (err) {
                console.warn(`[PresetLoader] Failed to preload "${name}":`, err);
            }
        });

        await Promise.all(promises);
    }
}
