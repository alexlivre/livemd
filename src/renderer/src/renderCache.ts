import { fnv1a } from '@shared/util';

interface CacheEntry {
  hash: number;
  length: number;
  html: string;
}

export const ENTRY_CAP_BYTES = 768 * 1024;
export const TOTAL_CAP_BYTES = 4.5 * 1024 * 1024;
const STORAGE_KEY = 'md-reader.render';

interface PersistedEntry {
  filePath: string;
  hash: number;
  length: number;
  html: string;
  at: number;
}

export function evictEntries(entries: PersistedEntry[], totalCapBytes: number): PersistedEntry[] {
  let total = entries.reduce((sum, e) => sum + e.html.length, 0);
  if (total <= totalCapBytes) return entries;
  const sorted = [...entries].sort((a, b) => a.at - b.at);
  const dropped = new Set<PersistedEntry>();
  for (const entry of sorted) {
    if (total <= totalCapBytes) break;
    dropped.add(entry);
    total -= entry.html.length;
  }
  return entries.filter((e) => !dropped.has(e));
}

export class RenderCache {
  private entries = new Map<string, CacheEntry>();
  private persisted: PersistedEntry[] | null = null;
  private dirty = false;

  get(key: string, content: string): string | null {
    const hash = fnv1a(content);
    const entry = this.entries.get(key);
    if (entry && entry.hash === hash && entry.length === content.length) return entry.html;
    const persisted = this.loadPersisted().find((e) => e.filePath === key);
    if (persisted && persisted.hash === hash && persisted.length === content.length) {
      this.entries.set(key, { hash, length: content.length, html: persisted.html });
      return persisted.html;
    }
    return null;
  }

  set(key: string, content: string, html: string): void {
    const hash = fnv1a(content);
    this.entries.set(key, { hash, length: content.length, html });
    if (html.length <= ENTRY_CAP_BYTES) {
      const persisted = this.loadPersisted();
      const index = persisted.findIndex((e) => e.filePath === key);
      const entry: PersistedEntry = {
        filePath: key,
        hash,
        length: content.length,
        html,
        at: Date.now()
      };
      if (index >= 0) persisted[index] = entry;
      else persisted.push(entry);
      this.persisted = evictEntries(persisted, TOTAL_CAP_BYTES);
      this.dirty = true;
    }
  }

  delete(key: string): void {
    this.entries.delete(key);
    const persisted = this.loadPersisted();
    const next = persisted.filter((e) => e.filePath !== key);
    if (next.length !== persisted.length) {
      this.persisted = next;
      this.dirty = true;
    }
  }

  flush(): void {
    if (!this.dirty) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.persisted));
    } catch {
      /* quota exceeded: in-memory cache still works */
    }
    this.dirty = false;
  }

  private loadPersisted(): PersistedEntry[] {
    if (this.persisted) return this.persisted;
    let entries: PersistedEntry[] = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          entries = parsed.filter(
            (e): e is PersistedEntry =>
              typeof e === 'object' &&
              e !== null &&
              typeof (e as { filePath?: unknown }).filePath === 'string' &&
              typeof (e as { html?: unknown }).html === 'string'
          );
        }
      }
    } catch {
      /* corrupt storage: start fresh */
    }
    this.persisted = entries;
    return entries;
  }
}
