export interface SessionSnapshot {
  tabs: Array<{ filePath: string; scrollTop: number; pinned?: boolean }>;
  activePath: string | null;
}

const SESSION_KEY = 'md-reader.session';

export function saveSession(snapshot: SessionSnapshot): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(snapshot));
  } catch {
    /* ignore */
  }
}

export function loadSession(): SessionSnapshot | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const p = parsed as { tabs?: unknown; activePath?: unknown };
    if (!Array.isArray(p.tabs)) return null;
    return {
      tabs: p.tabs
        .filter(
          (t): t is { filePath: string; scrollTop: number; pinned?: boolean } =>
            typeof t === 'object' &&
            t !== null &&
            typeof (t as { filePath?: unknown }).filePath === 'string'
        )
        .map((t) => ({
          filePath: t.filePath,
          scrollTop: typeof t.scrollTop === 'number' ? t.scrollTop : 0,
          ...(t.pinned ? { pinned: true } : {})
        })),
      activePath: typeof p.activePath === 'string' ? p.activePath : null
    };
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}
