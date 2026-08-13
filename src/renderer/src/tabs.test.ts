import { describe, it, expect } from 'vitest';
import { TabManager } from './tabs';

function file(filePath: string, content = '# hi'): { filePath: string; fileName: string; content: string; modifiedAt: number } {
  return { filePath, fileName: filePath.split('/').pop() ?? filePath, content, modifiedAt: 1 };
}

describe('TabManager', () => {
  it('adds a tab and makes it active', () => {
    const m = new TabManager();
    const t = m.add(file('/a.md'));
    expect(m.getState().tabs).toHaveLength(1);
    expect(m.getState().activeId).toBe(t.id);
  });

  it('reuses an existing tab for the same path', () => {
    const m = new TabManager();
    m.add(file('/a.md'));
    m.add(file('/a.md', '# changed'));
    expect(m.getState().tabs).toHaveLength(1);
    expect(m.getState().tabs[0].content).toBe('# changed');
  });

  it('closes the active tab and activates a fallback', () => {
    const m = new TabManager();
    const a = m.add(file('/a.md'));
    const b = m.add(file('/b.md'));
    m.close(a.id);
    expect(m.getState().activeId).toBe(b.id);
  });

  it('updateContent is a no-op on identical content', () => {
    const m = new TabManager();
    m.add(file('/a.md'));
    m.updateContent('/a.md', '# hi', 99);
    expect(m.getState().tabs[0].modifiedAt).toBe(1);
    expect(m.getState().tabs[0].content).toBe('# hi');
  });

  it('updateContent updates changed content', () => {
    const m = new TabManager();
    m.add(file('/a.md'));
    m.updateContent('/a.md', '# bye', 99);
    expect(m.getState().tabs[0].content).toBe('# bye');
    expect(m.getState().tabs[0].modifiedAt).toBe(99);
  });

  it('closeByPath removes a tab', () => {
    const m = new TabManager();
    m.add(file('/a.md'));
    m.closeByPath('/a.md');
    expect(m.getState().tabs).toHaveLength(0);
    expect(m.getState().activeId).toBeNull();
  });

  it('addMany adds all tabs and emits a single update', () => {
    const m = new TabManager();
    let emissions = 0;
    m.subscribe(() => {
      emissions += 1;
    });
    const added = m.addMany([file('/a.md'), file('/b.md'), file('/c.md')]);
    expect(added).toHaveLength(3);
    expect(m.getState().tabs).toHaveLength(3);
    expect(m.getState().activeId).toBe(added[2].id);
    expect(emissions).toBe(2);
  });

  it('addMany reuses existing tabs for repeated paths', () => {
    const m = new TabManager();
    m.add(file('/a.md'));
    const added = m.addMany([file('/a.md', '# changed'), file('/b.md')]);
    expect(m.getState().tabs).toHaveLength(2);
    expect(m.getState().tabs[0].content).toBe('# changed');
    expect(added[0].id).toBe(m.getState().tabs[0].id);
  });
});
