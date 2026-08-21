// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { prepareThemeEditor, resetThemeEditor } from './themeEditor';

function elements(): {
  modal: HTMLDivElement;
  card: HTMLDivElement;
  name: HTMLInputElement;
  css: HTMLTextAreaElement;
} {
  document.body.innerHTML = `
    <div id="modal" hidden>
      <div id="card"><input id="name" disabled readonly /><textarea id="css" disabled readonly></textarea></div>
    </div>`;
  return {
    modal: document.getElementById('modal') as HTMLDivElement,
    card: document.getElementById('card') as HTMLDivElement,
    name: document.getElementById('name') as HTMLInputElement,
    css: document.getElementById('css') as HTMLTextAreaElement
  };
}

describe('theme editor state', () => {
  it('re-enables both fields every time the editor is reopened', () => {
    const refs = elements();

    prepareThemeEditor(refs);
    refs.name.value = 'First';
    refs.css.value = 'body { color: red; }';
    resetThemeEditor(refs);

    prepareThemeEditor(refs);

    expect(refs.modal.hidden).toBe(false);
    expect(refs.name.disabled).toBe(false);
    expect(refs.name.readOnly).toBe(false);
    expect(refs.css.disabled).toBe(false);
    expect(refs.css.readOnly).toBe(false);
    expect(refs.name.style.pointerEvents).toBe('auto');
    expect(refs.css.style.pointerEvents).toBe('auto');
    expect(refs.name.style.userSelect).toBe('text');
    expect(refs.css.style.userSelect).toBe('text');
  });
});
