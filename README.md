# songwalker-js

SongWalker music programming library for the browser. Provides audio playback and preset loading via WebAssembly.

## Installation

```bash
npm install songwalker-js
```

## Usage

### Basic Playback

```typescript
import { SongPlayer, initWasm } from 'songwalker-js';

// Initialize WASM (required before playback)
await initWasm();

// Create player and play a song
const player = new SongPlayer();
await player.playSource(`
  track.beatsPerMinute = 120;
  track.instrument = Oscillator({ type: 'square' });
  C4 D4 E4 F4 G4
`);
```

### Preset Loading

```typescript
import { PresetLoader, initWasm } from 'songwalker-js';

await initWasm();

// Create loader pointing to a preset library
const loader = new PresetLoader('https://example.com/presets');

// Load the root index and enable a library
await loader.loadRootIndex();
await loader.enableLibrary('FluidR3_GM');

// Search for presets
const pianos = loader.search({ tags: ['piano'] });

// Load a specific preset
const preset = await loader.loadPreset('FluidR3_GM/Acoustic Grand Piano');
```

### Monaco Editor Integration

```typescript
import * as monaco from 'monaco-editor';
import { registerSongwalkerLanguage } from 'songwalker-js/monaco';

// Register the SongWalker language with Monaco
registerSongwalkerLanguage(monaco);

// Create an editor with the SongWalker language
monaco.editor.create(container, {
  language: 'songwalker',
  theme: 'songwalker-dark',
});
```

## Exports

### Main (`songwalker-js`)

- `SongPlayer` — Audio player class
- `PresetLoader` — Preset fetching and caching
- `initWasm` / `initSync` — WASM initialization
- `compile_song` — Compile .sw source to events
- `render_song_samples` / `render_song_wav` — Render to audio
- All preset types (`PresetDescriptor`, `PresetIndex`, etc.)

### Monaco (`songwalker-js/monaco`)

- `registerSongwalkerLanguage()` — Register language with Monaco
- `LANGUAGE_ID` — Language identifier (`'songwalker'`)
- `languageConfig` — Monaco language configuration
- `monarchTokens` — Syntax highlighting tokens
- `editorTheme` — Catppuccin Mocha theme
- `completionItems` — Auto-complete items

## License

MIT

---

> *"Perfection is achieved, not when there is nothing more to add,*
> *but when there is nothing left to take away."*
>
> — Antoine de Saint-Exupéry
