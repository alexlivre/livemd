import type { TabModel } from '@shared/types';

export interface TabData extends TabModel {
  content: string;
  orphaned?: boolean;
  pending?: boolean;
}

export type TabListener = (state: TabState) => void;

export interface TabState {
  tabs: TabData[];
  activeId: string | null;
}

export interface OpenTabInput {
  filePath: string;
  fileName: string;
  content: string;
  modifiedAt: number;
}

export class TabManager {
  private tabs: TabData[] = [];
  private activeId: string | null = null;
  private listeners = new Set<TabListener>();

  subscribe(listener: TabListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  private snapshot(): TabState {
    return { tabs: [...this.tabs], activeId: this.activeId };
  }

  private emit(): void {
    const state = this.snapshot();
    for (const listener of this.listeners) listener(state);
  }

  private nextId(): string {
    return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  }

  add(file: OpenTabInput): TabData {
    return this.addMany([file])[0];
  }

  // Creates a second tab for the same filePath (used when a deleted file is
  // recreated on disk and the user wants to keep the frozen tab open too).
  addCopy(file: OpenTabInput): TabData {
    const tab: TabData = {
      id: this.nextId(),
      filePath: file.filePath,
      fileName: file.fileName,
      content: file.content,
      modifiedAt: file.modifiedAt
    };
    this.tabs.push(tab);
    this.activeId = tab.id;
    this.emit();
    return tab;
  }

  addMany(files: OpenTabInput[], activePath?: string): TabData[] {
    const added: TabData[] = [];
    for (const file of files) {
      const existing = this.tabs.find((t) => t.filePath === file.filePath);
      if (existing) {
        existing.content = file.content;
        existing.modifiedAt = file.modifiedAt;
        added.push(existing);
      } else {
        added.push({
          id: this.nextId(),
          filePath: file.filePath,
          fileName: file.fileName,
          content: file.content,
          modifiedAt: file.modifiedAt
        });
      }
    }
    for (const tab of added) {
      if (!this.tabs.includes(tab)) this.tabs.push(tab);
    }
    if (added.length > 0) {
      const target = activePath ? this.tabs.find((t) => t.filePath === activePath) : undefined;
      this.activeId = target?.id ?? added[added.length - 1].id;
    }
    this.emit();
    return added;
  }

  // Updates every non-orphaned tab for the path; frozen (orphaned) tabs keep
  // their content untouched.
  updateContent(filePath: string, content: string, modifiedAt: number): void {
    let changed = false;
    for (const tab of this.tabs) {
      if (tab.filePath !== filePath || tab.orphaned) continue;
      if (tab.content === content) continue;
      tab.content = content;
      tab.modifiedAt = modifiedAt;
      tab.pending = false;
      changed = true;
    }
    if (changed) this.emit();
  }

  markOrphaned(filePath: string): void {
    let changed = false;
    for (const tab of this.tabs) {
      if (tab.filePath === filePath && !tab.orphaned) {
        tab.orphaned = true;
        tab.pending = false;
        changed = true;
      }
    }
    if (changed) this.emit();
  }

  clearOrphaned(filePath: string): void {
    let changed = false;
    for (const tab of this.tabs) {
      if (tab.filePath === filePath && tab.orphaned) {
        tab.orphaned = false;
        changed = true;
      }
    }
    if (changed) this.emit();
  }

  markPending(filePath: string): void {
    let changed = false;
    for (const tab of this.tabs) {
      if (tab.filePath === filePath && !tab.orphaned && !tab.pending) {
        tab.pending = true;
        changed = true;
      }
    }
    if (changed) this.emit();
  }

  clearPending(filePath: string): void {
    let changed = false;
    for (const tab of this.tabs) {
      if (tab.filePath === filePath && tab.pending) {
        tab.pending = false;
        changed = true;
      }
    }
    if (changed) this.emit();
  }

  hasPath(filePath: string): boolean {
    return this.tabs.some((t) => t.filePath === filePath);
  }

  hasOrphaned(filePath: string): boolean {
    return this.tabs.some((t) => t.filePath === filePath && t.orphaned);
  }

  close(id: string): string | null {
    const index = this.tabs.findIndex((t) => t.id === id);
    if (index === -1) return null;

    const removed = this.tabs.splice(index, 1)[0];
    const wasActive = this.activeId === id;

    if (wasActive) {
      if (this.tabs.length === 0) {
        this.activeId = null;
      } else {
        const fallback = this.tabs[index] ?? this.tabs[index - 1] ?? this.tabs[0];
        this.activeId = fallback.id;
      }
    }
    this.emit();
    return removed?.filePath ?? null;
  }

  activate(id: string): void {
    if (!this.tabs.some((t) => t.id === id)) return;
    if (this.activeId === id) return;
    this.activeId = id;
    this.emit();
  }

  getActive(): TabData | null {
    if (!this.activeId) return null;
    return this.tabs.find((t) => t.id === this.activeId) ?? null;
  }

  getState(): TabState {
    return this.snapshot();
  }

  closeByPath(filePath: string): void {
    const tab = this.tabs.find((t) => t.filePath === filePath);
    if (tab) this.close(tab.id);
  }
}
