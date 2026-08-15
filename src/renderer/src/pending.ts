export const REMOVAL_GRACE_MS = 500;

// Some editors save atomically by deleting and recreating the file. A raw
// unlink would freeze the tab; this grace window lets the follow-up add
// event turn the deletion into a transparent refresh instead.
export class RemovalGrace {
  private timers = new Map<string, number>();

  start(filePath: string, onExpire: () => void): void {
    this.cancel(filePath);
    this.timers.set(
      filePath,
      window.setTimeout(() => {
        this.timers.delete(filePath);
        onExpire();
      }, REMOVAL_GRACE_MS)
    );
  }

  cancel(filePath: string): boolean {
    const timer = this.timers.get(filePath);
    if (timer === undefined) return false;
    window.clearTimeout(timer);
    this.timers.delete(filePath);
    return true;
  }

  isActive(filePath: string): boolean {
    return this.timers.has(filePath);
  }

  clear(): void {
    for (const timer of this.timers.values()) window.clearTimeout(timer);
    this.timers.clear();
  }
}
