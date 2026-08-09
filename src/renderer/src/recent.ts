const STORAGE_KEY = 'md-reader.recent';
const MAX_ITEMS = 10;

export function getRecentFiles(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p): p is string => typeof p === 'string' && p.length > 0);
  } catch {
    return [];
  }
}

function writeRecent(files: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
  } catch {
    /* localStorage may be disabled */
  }
}

export function recordRecentFile(filePath: string): void {
  const files = getRecentFiles().filter((p) => p !== filePath);
  files.unshift(filePath);
  writeRecent(files.slice(0, MAX_ITEMS));
}

export function removeRecentFile(filePath: string): void {
  writeRecent(getRecentFiles().filter((p) => p !== filePath));
}

export function clearRecentFiles(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
