export interface ToastAction {
  label: string;
  primary?: boolean;
  onClick: () => void;
}

export interface ToastOptions {
  message: string;
  actions?: ToastAction[];
  persist?: boolean;
}

const AUTO_DISMISS_MS = 2000;

// A single non-blocking pill above the status bar. Each show() replaces the
// previous one; transient messages dismiss themselves, persistent ones wait
// for an action or Escape.
export class Toast {
  private messageEl: HTMLElement;
  private actionsEl: HTMLElement;
  private hideTimer: number | null = null;

  constructor(private host: HTMLElement) {
    this.messageEl = host.querySelector('.toast-message') as HTMLElement;
    this.actionsEl = host.querySelector('.toast-actions') as HTMLElement;
    document.addEventListener('keydown', (evt) => {
      if (evt.key === 'Escape' && !host.hidden) this.hide();
    });
  }

  show(opts: ToastOptions): void {
    this.messageEl.textContent = opts.message;
    this.actionsEl.replaceChildren();
    for (const action of opts.actions ?? []) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = action.primary ? 'toast-btn toast-btn-primary' : 'toast-btn';
      btn.textContent = action.label;
      btn.addEventListener('click', () => {
        this.hide();
        action.onClick();
      });
      this.actionsEl.appendChild(btn);
    }
    this.host.hidden = false;
    if (this.hideTimer !== null) window.clearTimeout(this.hideTimer);
    this.hideTimer = opts.persist ? null : window.setTimeout(() => this.hide(), AUTO_DISMISS_MS);
  }

  hide(): void {
    this.host.hidden = true;
    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }
}
