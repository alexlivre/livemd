import type { TabModel } from '@shared/types';

export interface TabData extends TabModel {
  content: string;
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

  addMany(files: OpenTabInput[]): TabData[] {
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
    if (added.length > 0) this.activeId = added[added.length - 1].id;
    this.emit();
    return added;
  }

  updateContent(filePath: string, content: string, modifiedAt: number): void {
    const tab = this.tabs.find((t) => t.filePath === filePath);
    if (!tab) return;
    if (tab.content === content) return;
    tab.content = content;
    tab.modifiedAt = modifiedAt;
    this.emit();
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
