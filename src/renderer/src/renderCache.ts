import { fnv1a } from '@shared/util';

export class RenderCache {
  private entries = new Map<string, { hash: number; html: string }>();

  get(key: string, content: string): string | null {
    const entry = this.entries.get(key);
    if (entry && entry.hash === fnv1a(content)) return entry.html;
    return null;
  }

  set(key: string, content: string, html: string): void {
    this.entries.set(key, { hash: fnv1a(content), html });
  }

  delete(key: string): void {
    this.entries.delete(key);
  }
}
