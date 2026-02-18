# Piano Keyboard Support — songwalker-js Plan

## Overview

Re-export new WASM functions from `songwalker-core` that enable cursor-aware
instrument detection, single-note rendering, track name extraction, and
track-filtered rendering. These are consumed by `songwalker-site` (web editor)
for the interactive piano keyboard and track isolation features.

## New WASM Exports to Re-export

After rebuilding WASM from songwalker-core, these new functions will appear in
`src/wasm/songwalker_core.js` and need to be re-exported from `src/index.ts`:

| Function | Signature | Purpose |
|----------|-----------|---------|
| `get_instrument_at_cursor` | `(source: string, cursor_byte_offset: number) => CursorContext` | Returns instrument config + track name at cursor position |
| `render_single_note` | `(config_json: string, midi_note: number, velocity: number, duration_secs: number, sample_rate: number, presets_json: string) => Float32Array` | Renders one note to mono f32 samples |
| `get_track_names` | `(source: string) => string[]` | Extracts unique track names from compiled song |
| `render_song_samples_filtered` | `(source: string, sample_rate: number, presets_json: string, solo_json: string, muted_json: string) => Float32Array` | Renders with track solo/mute filtering |

## New TypeScript Types

Add to `src/preset-types.ts` or a new `src/cursor-types.ts`:

```typescript
export interface CursorContext {
    instrument: InstrumentConfig;
    track_name: string | null;
    bpm: number;
    tuning_pitch: number;
}

export interface InstrumentConfig {
    waveform: string;           // "sine" | "square" | "sawtooth" | "triangle"
    attack?: number;
    decay?: number;
    sustain?: number;
    release?: number;
    detune?: number;
    mixer?: number;
    preset_ref?: string;        // e.g. "FluidR3_GM/Acoustic Grand Piano"
}
```

## Changes to `src/index.ts`

Add re-exports:
```typescript
export {
    // ... existing exports ...
    get_instrument_at_cursor,
    render_single_note,
    get_track_names,
    render_song_samples_filtered,
} from './wasm/songwalker_core.js';

export type { CursorContext, InstrumentConfig } from './cursor-types.js';
```

## Changes to `src/player.ts`

Add a helper method to `SongPlayer` for piano note playback:

```typescript
class SongPlayer {
    // ... existing methods ...

    /** Play a single note using the instrument at the cursor position. */
    async playNote(
        source: string,
        cursorOffset: number,
        midiNote: number,
        presetsJson: string,
    ): Promise<void> {
        const ctx = get_instrument_at_cursor(source, cursorOffset);
        const samples = render_single_note(
            JSON.stringify(ctx.instrument),
            midiNote, 0.8, 0.5, 44100, presetsJson,
        );
        // Play through existing AudioContext
        this.playBuffer(samples);
    }

    /** Render and play with track filtering. */
    async playFiltered(
        source: string,
        presetsJson: string,
        soloTracks: string[],
        mutedTracks: string[],
    ): Promise<void> {
        const samples = render_song_samples_filtered(
            source, 44100, presetsJson,
            JSON.stringify(soloTracks),
            JSON.stringify(mutedTracks),
        );
        this.playBuffer(samples);
    }
}
```

## Streaming Playback (Future)

The core plan introduces a **streaming execution model** (see
`songwalker-core/docs/cursor_aware_plan.md`, Architectural Decision #2). When
the `SongRunner` is exposed via WASM, additional exports will appear:

| Function | Purpose |
|----------|---------|
| `start_playback_from_cursor` | Start streaming playback from a byte offset |
| `song_runner_step` | Advance the SongRunner by one execution step |
| `song_runner_render_block` | Render 128 samples from the EventBuffer |

These enable real-time streaming playback in AudioWorklet. For the initial
piano implementation, `render_single_note()` and `cursor_context()` work
without streaming — they use the existing compiler for finite queries.

## Depends On

- **songwalker-core** WASM rebuild with new exports (see
  `songwalker-core/docs/cursor_aware_plan.md`)

## Build Steps

```bash
# 1. Rebuild WASM from songwalker-core
cd /home/ari/dev/songwalker-core
cargo test
wasm-pack build --target web --out-dir /home/ari/dev/songwalker-js/src/wasm

# 2. Add new re-exports to index.ts and types

# 3. Rebuild package
cd /home/ari/dev/songwalker-js
npm run build

# 4. Publish new version (if needed by songwalker-site)
npm version patch
npm publish
```

## Outstanding Questions

1. **WASM .d.ts generation:** `wasm-pack` generates TypeScript declarations in
   `src/wasm/songwalker_core.d.ts`. Do the new functions get correct TS types
   automatically, or do we need manual `.d.ts` additions?

2. **Return type marshalling:** `get_instrument_at_cursor` returns a `JsValue` from
   Rust. On the JS side this arrives as a plain object. Should we add a wrapper
   function that parses/validates the return value into a typed `CursorContext`?

3. **Bundle size:** The new WASM functions add code to the binary. Is there a
   measurable size increase? (Probably negligible since they reuse existing compiler
   and engine code.)

## File Impact

| File | Changes |
|------|---------|
| `src/wasm/*` | Rebuilt from songwalker-core (auto-generated) |
| `src/index.ts` | Re-export new WASM functions and types |
| `src/cursor-types.ts` | **NEW** — CursorContext, InstrumentConfig types |
| `src/player.ts` | Add `playNote()` and `playFiltered()` helper methods |
