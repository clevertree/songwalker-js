/**
 * TypeScript types mirroring the Rust preset system.
 *
 * These types define the JSON schema for preset descriptors,
 * catalog entries, and the library index.
 */

// ── Preset Descriptor ────────────────────────────────────

export type PresetCategory = 'synth' | 'sampler' | 'effect' | 'composite';

export interface PresetDescriptor {
    format: string;            // "songwalker-preset"
    version: number;           // 1
    name: string;
    category: PresetCategory;
    tags: string[];
    metadata?: PresetMetadata;
    tuning?: TuningInfo;
    maxVoices?: number;        // Per-preset voice limit (default: 64)
    node: PresetNode;
}

export interface PresetMetadata {
    description?: string;
    author?: string;
    license?: string;
    gmProgram?: number;
    gmCategory?: string;
    source?: string;
    originalFile?: string;
}

export interface TuningInfo {
    a4Frequency: number;
    description?: string;
}

// ── Preset Nodes ─────────────────────────────────────────

export type PresetNode =
    | { type: 'oscillator'; config: OscillatorConfig }
    | { type: 'sampler'; config: SamplerConfig }
    | { type: 'effect'; effectType: string; params: Record<string, number> }
    | { type: 'composite'; mode: CompositeMode; children: PresetNode[]; mixLevels?: number[] };

export type WaveformType = 'sine' | 'square' | 'sawtooth' | 'triangle';

export interface OscillatorConfig {
    waveform: WaveformType;
    envelope?: ADSRConfig;
    detune?: number;
}

export type CompositeMode = 'layer' | 'split' | 'chain';

// ── Sampler Config ───────────────────────────────────────

export interface SamplerConfig {
    zones: SampleZone[];
    oneShot?: boolean;
    defaultEnvelope?: ADSRConfig;
}

export interface SampleZone {
    keyRange?: KeyRange;
    velocityRange?: VelocityRange;
    pitch: ZonePitch;
    audio: AudioReference;
    sampleRate: number;
    loopPoints?: LoopPoints;
}

export interface KeyRange {
    low: number;   // MIDI 0-127
    high: number;
}

export interface VelocityRange {
    low: number;
    high: number;
}

export interface ZonePitch {
    rootNote: number;     // MIDI 0-127
    fineTuneCents: number;
}

export interface LoopPoints {
    start: number;    // sample index
    end: number;
}

export type AudioReference =
    | { type: 'external'; path: string; sha256?: string }
    | { type: 'contentAddressed'; sha256: string; codec: AudioCodec }
    | { type: 'inlineFile'; data: string; codec: AudioCodec }       // base64
    | { type: 'inlinePcm'; data: string; sampleRate: number };      // base64

export type AudioCodec = 'wav' | 'mp3' | 'ogg' | 'flac';

// ── Envelope ─────────────────────────────────────────────

export interface ADSRConfig {
    attack: number;
    decay: number;
    sustain: number;
    release: number;
}

// ── Generic Index ────────────────────────────────────────

/**
 * A generic index file that can contain preset references and/or
 * links to other indexes (sub-indexes). Any index file can serve
 * as a standalone entry point.
 */
export interface PresetIndex {
    format: 'songwalker-index';
    version: number;           // Currently 1
    name: string;              // Human-readable name
    description?: string;
    entries: IndexEntry[];
}

/**
 * Each entry is either a preset reference or a link to another index.
 * Discriminated union on `type`.
 */
export type IndexEntry = PresetEntry | SubIndexEntry;

/** A reference to a preset.json file */
export interface PresetEntry {
    type: 'preset';
    name: string;
    path: string;              // Relative path to preset.json
    category: PresetCategory;
    tags: string[];
    gmProgram?: number;
    zoneCount?: number;
    keyRange?: KeyRange;
}

/** A link to another index file (e.g., a source library) */
export interface SubIndexEntry {
    type: 'index';
    name: string;
    path: string;              // Relative path to sub-index.json
    description?: string;
    presetCount?: number;
}

// ── Legacy compat alias (to be removed) ──────────────────
/** @deprecated Use PresetIndex */
export type LibraryIndex = PresetIndex;
/** @deprecated Use PresetEntry */
export type CatalogEntry = PresetEntry;
