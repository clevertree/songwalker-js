/* tslint:disable */
/* eslint-disable */

/**
 * WASM-exposed: compile `.sw` source into a JSON event list (strict/editor mode).
 * Errors if a note plays before track.instrument is set.
 */
export function compile_song(source: string): any;

/**
 * WASM-exposed: return the songwalker-core version string.
 */
export function core_version(): string;

/**
 * WASM-exposed: compile and render `.sw` source to mono f32 samples.
 * Returns the raw audio buffer for AudioWorklet playback.
 */
export function render_song_samples(source: string, sample_rate: number): Float32Array;

/**
 * WASM-exposed: compile and render `.sw` source to mono f32 samples
 * with loaded preset data for sampler-based instruments.
 *
 * `presets_json` is a JSON array of `WasmLoadedPreset` objects, each
 * containing the preset name and pre-decoded PCM zone data.
 */
export function render_song_samples_with_presets(source: string, sample_rate: number, presets_json: string): Float32Array;

/**
 * WASM-exposed: compile and render `.sw` source to a WAV byte array.
 */
export function render_song_wav(source: string, sample_rate: number): Uint8Array;

/**
 * WASM-exposed: compile and render `.sw` source to a WAV byte array
 * with loaded preset data for sampler-based instruments.
 */
export function render_song_wav_with_presets(source: string, sample_rate: number, presets_json: string): Uint8Array;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly compile_song: (a: number, b: number) => [number, number, number];
    readonly core_version: () => [number, number];
    readonly render_song_samples: (a: number, b: number, c: number) => [number, number, number, number];
    readonly render_song_samples_with_presets: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly render_song_wav: (a: number, b: number, c: number) => [number, number, number, number];
    readonly render_song_wav_with_presets: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
