/**
 * SongWalker Audio Player
 *
 * Uses the Rust DSP engine (via WASM) to pre-render audio,
 * then plays it through a standard AudioBufferSourceNode.
 * Routes through an AnalyserNode for real-time visualisation.
 */

import { render_song_samples, render_song_samples_with_presets, render_song_wav, render_song_wav_with_presets } from './wasm/songwalker_core.js';

// ── Player State ───────────────────────────────────────────

export interface PlayerState {
    playing: boolean;
    currentBeat: number;
    totalBeats: number;
    bpm: number;
}

export type OnStateChange = (state: PlayerState) => void;

/**
 * Pre-renders audio via Rust WASM DSP engine, then plays it.
 * Exposes an AnalyserNode and rendered samples for visualisation.
 */
export class SongPlayer {
    private ctx: AudioContext | null = null;
    private sourceNode: AudioBufferSourceNode | null = null;
    private analyser: AnalyserNode | null = null;
    private gainNode: GainNode | null = null;
    private totalBeats = 0;
    private bpm = 120;
    private startTime = 0;
    private stateTimer: number | null = null;
    private playing = false;
    private onStateChange: OnStateChange | null = null;

    /** The most recently rendered audio samples (mono f32). */
    public renderedSamples: Float32Array | null = null;

    private readonly SAMPLE_RATE = 44100;

    constructor() { }

    /** Register a callback for state changes. */
    onState(cb: OnStateChange): void {
        this.onStateChange = cb;
    }

    /** Get the AnalyserNode (created on first play). */
    getAnalyser(): AnalyserNode | null {
        return this.analyser;
    }

    /** Sample rate used for rendering. */
    get sampleRate(): number {
        return this.SAMPLE_RATE;
    }

    /** Compile, render, and play the song from source code.
     *  If presetsJson is provided, sampler presets will be used for rendering.
     *  Throws a descriptive Error if WASM rendering fails.
     */
    async playSource(source: string, presetsJson?: string): Promise<void> {
        this.stop();

        if (!this.ctx) {
            this.ctx = new AudioContext({ sampleRate: this.SAMPLE_RATE });
            // Persistent analyser + gain — recreated only once
            this.analyser = this.ctx.createAnalyser();
            this.analyser.fftSize = 2048;
            this.analyser.smoothingTimeConstant = 0.8;
            this.gainNode = this.ctx.createGain();
            this.gainNode.connect(this.analyser);
            this.analyser.connect(this.ctx.destination);
        }
        if (this.ctx.state === 'suspended') {
            await this.ctx.resume();
        }

        // Render audio via Rust DSP engine — with or without presets
        let samples: Float32Array;
        try {
            samples = presetsJson
                ? render_song_samples_with_presets(source, this.SAMPLE_RATE, presetsJson)
                : render_song_samples(source, this.SAMPLE_RATE);
        } catch (err) {
            // Re-throw with context so callers get a meaningful message
            if (err instanceof WebAssembly.CompileError || err instanceof WebAssembly.RuntimeError) {
                throw new Error(`WASM engine error: ${err.message}. The WASM module may not be loaded correctly.`);
            }
            throw err;
        }
        this.renderedSamples = samples;
        if (samples.length === 0) {
            this.emitState();
            return;
        }

        this.extractMetadata(source);

        // Create AudioBuffer and route through analyser
        const buffer = this.ctx.createBuffer(1, samples.length, this.SAMPLE_RATE);
        buffer.copyToChannel(new Float32Array(samples), 0);

        this.sourceNode = this.ctx.createBufferSource();
        this.sourceNode.buffer = buffer;
        this.sourceNode.connect(this.gainNode!);

        this.playing = true;
        this.startTime = this.ctx.currentTime;
        this.sourceNode.start(0);

        this.sourceNode.onended = () => {
            this.stop();
        };

        this.stateTimer = window.setInterval(() => this.emitState(), 50);
        this.emitState();
    }

    /** Stop playback. */
    stop(): void {
        if (this.sourceNode) {
            try {
                this.sourceNode.stop();
            } catch {
                // already stopped
            }
            this.sourceNode.disconnect();
            this.sourceNode = null;
        }
        this.playing = false;
        if (this.stateTimer !== null) {
            clearInterval(this.stateTimer);
            this.stateTimer = null;
        }
        this.emitState();
    }

    /** Export the current song as a WAV file download. */
    exportWav(source: string, filename = 'song.wav', presetsJson?: string): void {
        let wavBytes: Uint8Array;
        try {
            wavBytes = presetsJson
                ? render_song_wav_with_presets(source, this.SAMPLE_RATE, presetsJson)
                : render_song_wav(source, this.SAMPLE_RATE);
        } catch (err) {
            if (err instanceof WebAssembly.CompileError || err instanceof WebAssembly.RuntimeError) {
                throw new Error(`WASM engine error: ${err.message}. The WASM module may not be loaded correctly.`);
            }
            throw err;
        }
        const blob = new Blob([new Uint8Array(wavBytes)], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    /** Get current playback position in beats. */
    getCurrentBeat(): number {
        if (!this.playing || !this.ctx) return 0;
        const elapsed = this.ctx.currentTime - this.startTime;
        return (elapsed * this.bpm) / 60;
    }

    /** Fraction of playback elapsed (0..1). */
    getProgress(): number {
        if (!this.playing || this.totalBeats <= 0) return 0;
        return Math.min(this.getCurrentBeat() / this.totalBeats, 1);
    }

    get isPlaying(): boolean {
        return this.playing;
    }

    get currentBPM(): number {
        return this.bpm;
    }

    get currentTotalBeats(): number {
        return this.totalBeats;
    }

    private extractMetadata(source: string): void {
        const bpmMatch = source.match(/beatsPerMinute\s*=\s*(\d+)/);
        this.bpm = bpmMatch ? parseInt(bpmMatch[1], 10) : 120;
        try {
            const durationSec = this.sourceNode?.buffer?.duration ?? 0;
            this.totalBeats = (durationSec * this.bpm) / 60;
        } catch {
            this.totalBeats = 0;
        }
    }

    private emitState(): void {
        if (this.onStateChange) {
            this.onStateChange({
                playing: this.playing,
                currentBeat: this.getCurrentBeat(),
                totalBeats: this.totalBeats,
                bpm: this.bpm,
            });
        }
    }
}
