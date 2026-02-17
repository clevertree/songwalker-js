/**
 * songwalker-js — SongWalker player and preset loader for the browser.
 *
 * Main entry point — exports player, preset loader, and WASM bindings.
 */

// ── Preset Types ─────────────────────────────────────────
export type {
    PresetCategory,
    PresetDescriptor,
    PresetMetadata,
    TuningInfo,
    PresetNode,
    WaveformType,
    OscillatorConfig,
    CompositeMode,
    SamplerConfig,
    SampleZone,
    KeyRange,
    VelocityRange,
    ZonePitch,
    LoopPoints,
    AudioReference,
    AudioCodec,
    ADSRConfig,
    PresetIndex,
    IndexEntry,
    PresetEntry,
    SubIndexEntry,
    LibraryIndex,
    CatalogEntry,
} from './preset-types.js';

// ── Preset Loader ────────────────────────────────────────
export {
    PresetLoader,
    type LoadedLibrary,
    type SearchOptions,
    type LibraryInfo,
} from './preset-loader.js';

// ── Preset Browser UI ────────────────────────────────────
export { PresetBrowser } from './preset-browser.js';

// ── Player ───────────────────────────────────────────────
export {
    SongPlayer,
    type PlayerState,
    type OnStateChange,
} from './player.js';

// ── WASM Bindings ────────────────────────────────────────
export {
    compile_song,
    core_version,
    render_song_samples,
    render_song_samples_with_presets,
    render_song_wav,
    render_song_wav_with_presets,
    initSync,
    default as initWasm,
} from './wasm/songwalker_core.js';

export type {
    InitInput,
    InitOutput,
    SyncInitInput,
} from './wasm/songwalker_core.js';
