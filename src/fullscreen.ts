/**
 * Fullscreen toggle — hides header/about, expands editor to fill viewport.
 *
 * Adds/removes the `fullscreen` class on `<html>` and injects the necessary CSS.
 * Also registers an Escape keybinding in the Monaco editor to exit fullscreen.
 *
 * Usage:
 *   import { setupFullscreen } from 'songwalker-js';
 *   setupFullscreen(editor);       // auto-creates button in toolbar
 *   setupFullscreen(editor, btn);  // uses an existing button element
 */

/** Monaco editor interface — minimal surface we need. */
interface MonacoEditor {
    addAction(descriptor: {
        id: string;
        label: string;
        keybindings?: number[];
        precondition?: string;
        run: () => void;
    }): void;
    layout(): void;
}

/** Monaco KeyCode / KeyMod constants (avoid importing full monaco). */
const ESCAPE_KEY = 9; // monaco.KeyCode.Escape

let stylesInjected = false;

/**
 * Set up fullscreen toggle for the editor.
 *
 * @param editor  Monaco editor instance
 * @param button  Optional existing button element. If omitted, looks for `#fullscreen-btn`.
 * @returns The button element (created or found)
 */
export function setupFullscreen(editor: MonacoEditor, button?: HTMLElement | null): HTMLElement | null {
    // Find or accept the button
    const btn = button ?? document.getElementById('fullscreen-btn');
    if (!btn) return null;

    injectStyles();

    // Toggle on click
    btn.addEventListener('click', () => {
        document.documentElement.classList.toggle('fullscreen');
        setTimeout(() => editor.layout(), 100);
    });

    // Escape to exit
    editor.addAction({
        id: 'songwalker.exitFullscreen',
        label: 'Exit Fullscreen',
        keybindings: [ESCAPE_KEY],
        precondition: undefined,
        run: () => {
            document.documentElement.classList.remove('fullscreen');
            setTimeout(() => editor.layout(), 100);
        },
    });

    return btn;
}

function injectStyles(): void {
    if (stylesInjected) return;
    stylesInjected = true;

    const style = document.createElement('style');
    style.id = 'sw-fullscreen-styles';
    style.textContent = `
/* Fullscreen mode — hides header/about, expands editor */
html.fullscreen header,
html.fullscreen .about {
    display: none;
}
html.fullscreen .toolbar {
    padding: 0.5rem 1rem;
}
`;
    document.head.appendChild(style);
}
