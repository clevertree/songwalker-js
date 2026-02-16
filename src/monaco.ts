/**
 * SongWalker language definition for Monaco Editor.
 * Provides syntax highlighting and basic auto-complete.
 */
import type * as monaco from 'monaco-editor';

export const LANGUAGE_ID = 'songwalker';

export const languageConfig: monaco.languages.LanguageConfiguration = {
    comments: {
        lineComment: '//',
    },
    brackets: [
        ['{', '}'],
        ['[', ']'],
        ['(', ')'],
    ],
    autoClosingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '"', close: '"' },
        { open: "'", close: "'" },
    ],
    surroundingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '"', close: '"' },
        { open: "'", close: "'" },
    ],
};

export const monarchTokens: monaco.languages.IMonarchLanguage = {
    defaultToken: '',
    ignoreCase: false,

    keywords: ['track', 'const', 'let', 'for'],

    notes: [
        'C', 'D', 'E', 'F', 'G', 'A', 'B',
    ],

    drums: [
        'Kick', 'Snare', 'HiHat', 'Crash', 'Ride', 'Tom',
        'OpenHiHat', 'ClosedHiHat', 'Clap', 'Rimshot',
    ],

    operators: ['=', '+', '-', '*', '@', '/', '.', '<', '>'],

    symbols: /[=><!~?:&|+\-*\/\^%@.]+/,

    tokenizer: {
        root: [
            // Comments
            [/\/\/.*$/, 'comment'],

            // Note names: C3, Eb4, F#5, etc.
            [/[A-G][b#]?\d+/, 'variable.note'],

            // Drum names
            [/\b(Kick|Snare|HiHat|Crash|Ride|Tom|OpenHiHat|ClosedHiHat|Clap|Rimshot)\b/, 'variable.drum'],

            // Keywords
            [/\b(track|const|let|for)\b/, 'keyword'],

            // Property access: track.something
            [/\b(track)\.([\w.]+)/, ['keyword', 'variable.property']],

            // Function/track calls: identifier followed by (
            [/[a-zA-Z_]\w*(?=\s*[\(*])/, 'entity.name.function'],

            // Identifiers
            [/[a-zA-Z_]\w*/, 'identifier'],

            // Numbers
            [/\d+(\.\d+)?/, 'number'],

            // Strings
            [/"([^"\\]|\\.)*"/, 'string'],
            [/'([^'\\]|\\.)*'/, 'string'],

            // Regex literals
            [/\/(?![\/\*])([^\/\\]|\\.)*\/[gimsuy]*/, 'regexp'],

            // Modifiers
            [/\*/, 'operator.velocity'],
            [/@/, 'operator.duration'],
            [/\//, 'operator.slash'],
            [/\.\.?/, 'operator.dot'],

            // Punctuation
            [/[{}()\[\]]/, '@brackets'],
            [/[;,]/, 'delimiter'],
        ],
    },
};

// Catppuccin Mocha-inspired theme for SongWalker
export const editorTheme: monaco.editor.IStandaloneThemeData = {
    base: 'vs-dark',
    inherit: true,
    rules: [
        { token: 'comment', foreground: '6c7086', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'cba6f7', fontStyle: 'bold' },
        { token: 'variable.note', foreground: '89b4fa', fontStyle: 'bold' },
        { token: 'variable.drum', foreground: 'fab387', fontStyle: 'bold' },
        { token: 'variable.property', foreground: '94e2d5' },
        { token: 'entity.name.function', foreground: '89dceb' },
        { token: 'number', foreground: 'fab387' },
        { token: 'string', foreground: 'a6e3a1' },
        { token: 'regexp', foreground: 'f5c2e7' },
        { token: 'operator.velocity', foreground: 'f9e2af' },
        { token: 'operator.duration', foreground: 'f9e2af' },
        { token: 'operator.slash', foreground: '6c7086' },
        { token: 'operator.dot', foreground: 'f9e2af' },
        { token: 'identifier', foreground: 'cdd6f4' },
        { token: 'delimiter', foreground: '6c7086' },
    ],
    colors: {
        'editor.background': '#181825',
        'editor.foreground': '#cdd6f4',
        'editor.lineHighlightBackground': '#1e1e2e',
        'editor.selectionBackground': '#45475a',
        'editorCursor.foreground': '#f5e0dc',
        'editorLineNumber.foreground': '#585b70',
        'editorLineNumber.activeForeground': '#a6adc8',
        'editor.inactiveSelectionBackground': '#313244',
    },
};

export const completionItems: monaco.languages.CompletionItem[] = [
    {
        label: 'track',
        kind: 1, // Keyword
        insertText: 'track ${1:name}(${2:params}) {\n\t$0\n}',
        insertTextRules: 4, // InsertAsSnippet
        detail: 'Define a new track',
        documentation: 'Defines a track that is scheduled when called.',
    },
    {
        label: 'const',
        kind: 1,
        insertText: 'const ${1:name} = ${0};',
        insertTextRules: 4,
        detail: 'Declare a constant',
    },
    {
        label: 'for',
        kind: 1,
        insertText: 'for (let ${1:i} = 0; ${1:i} < ${2:count}; ${1:i}++) {\n\t$0\n}',
        insertTextRules: 4,
        detail: 'For loop',
    },
    {
        label: 'loadPreset',
        kind: 3, // Function
        insertText: 'loadPreset("${0}")',
        insertTextRules: 4,
        detail: 'Load an instrument preset by name',
        documentation: 'Loads a preset from the catalog. Preset assets are preloaded at compile time.',
    },
    {
        label: 'Oscillator',
        kind: 3, // Function
        insertText: "Oscillator({type: '${1|sine,square,sawtooth,triangle|}'})",
        insertTextRules: 4,
        detail: 'Create an oscillator instrument',
        documentation: "Built-in oscillator preset. Options: type (waveform), attack, decay, sustain, release, detune, mixer.",
    },
    {
        label: 'track.beatsPerMinute',
        kind: 9, // Property
        insertText: 'track.beatsPerMinute = ${1:120};',
        insertTextRules: 4,
        detail: 'Set the tempo in BPM',
    },
    {
        label: 'track.duration',
        kind: 9,
        insertText: 'track.duration = ${1:1/4};',
        insertTextRules: 4,
        detail: 'Set the default step duration (deprecated, use track.noteLength)',
    },
    {
        label: 'track.noteLength',
        kind: 9,
        insertText: 'track.noteLength = ${1:1/4};',
        insertTextRules: 4,
        detail: 'Set the default note length',
    },
    {
        label: 'track.instrument',
        kind: 9,
        insertText: 'track.instrument = ${1:inst};',
        insertTextRules: 4,
        detail: 'Set the track instrument',
    },
    {
        label: 'track.effects',
        kind: 9,
        insertText: 'track.effects = [${0}];',
        insertTextRules: 4,
        detail: 'Set the track effects chain',
    },
    {
        label: 'song.endMode',
        kind: 9,
        insertText: "song.endMode = '${1|gate,release,tail|}';",
        insertTextRules: 4,
        detail: "Set song end mode: 'gate', 'release', or 'tail'",
        documentation: "Controls output length. 'gate' = hard cut at last note-off, 'release' = wait for envelope release, 'tail' = wait for effects tail (default).",
    },
] as any;

/**
 * Register the SongWalker language with Monaco.
 * Call this once after Monaco is loaded.
 */
export function registerSongwalkerLanguage(monacoInstance: typeof monaco): void {
    monacoInstance.languages.register({ id: LANGUAGE_ID });
    monacoInstance.languages.setLanguageConfiguration(LANGUAGE_ID, languageConfig);
    monacoInstance.languages.setMonarchTokensProvider(LANGUAGE_ID, monarchTokens);
    monacoInstance.editor.defineTheme('songwalker-dark', editorTheme);

    monacoInstance.languages.registerCompletionItemProvider(LANGUAGE_ID, {
        provideCompletionItems: (model, position) => {
            const word = model.getWordUntilPosition(position);
            const range = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endColumn: word.endColumn,
            };
            return {
                suggestions: completionItems.map(item => ({ ...item, range })),
            };
        },
    });
}
