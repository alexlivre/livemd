export interface ThemeEditorElements {
  modal: HTMLDivElement;
  card: HTMLElement;
  name: HTMLInputElement;
  css: HTMLTextAreaElement;
}

export function prepareThemeEditor(elements: ThemeEditorElements): void {
  const { modal, card, name, css } = elements;
  modal.hidden = false;
  modal.inert = false;
  modal.setAttribute('aria-hidden', 'false');
  modal.style.pointerEvents = 'auto';
  modal.style.zIndex = '400';
  card.style.pointerEvents = 'auto';
  name.disabled = false;
  name.readOnly = false;
  name.style.pointerEvents = 'auto';
  name.style.userSelect = 'text';
  name.style.webkitUserSelect = 'text';
  css.disabled = false;
  css.readOnly = false;
  css.style.pointerEvents = 'auto';
  css.style.userSelect = 'text';
  css.style.webkitUserSelect = 'text';
}

export function resetThemeEditor(elements: ThemeEditorElements): void {
  const { modal } = elements;
  modal.hidden = true;
  modal.inert = true;
  modal.setAttribute('aria-hidden', 'true');
  modal.style.pointerEvents = '';
  modal.style.zIndex = '';
}
