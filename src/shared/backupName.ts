// Suggests a collision-free save path for a frozen file: first
// `name_backup.ext`, then `name_backup_2.ext`, `name_backup_3.ext`...
// `exists` is injected so the function is testable without the filesystem.
export function suggestBackupPath(
  filePath: string,
  exists: (candidate: string) => boolean
): string {
  const dirIndex = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  const dir = dirIndex >= 0 ? filePath.slice(0, dirIndex + 1) : '';
  const fileName = filePath.slice(dirIndex + 1);
  const dotIndex = fileName.lastIndexOf('.');
  const base = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  const ext = dotIndex > 0 ? fileName.slice(dotIndex) : '';

  const first = `${dir}${base}_backup${ext}`;
  if (!exists(first)) return first;
  for (let i = 2; i < 10_000; i++) {
    const candidate = `${dir}${base}_backup_${i}${ext}`;
    if (!exists(candidate)) return candidate;
  }
  return first;
}
