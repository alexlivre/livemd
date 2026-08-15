import { describe, it, expect } from 'vitest';
import { suggestBackupPath } from './backupName';

describe('suggestBackupPath', () => {
  it('returns the plain path when nothing exists', () => {
    expect(suggestBackupPath('C:\\docs\\note.md', () => false)).toBe('C:\\docs\\note_backup.md');
  });

  it('uses _backup_2 when the first candidate exists', () => {
    const exists = (p: string): boolean => p === 'C:\\docs\\note_backup.md';
    expect(suggestBackupPath('C:\\docs\\note.md', exists)).toBe('C:\\docs\\note_backup_2.md');
  });

  it('increments past every occupied candidate', () => {
    const occupied = new Set([
      'C:\\docs\\note_backup.md',
      'C:\\docs\\note_backup_2.md',
      'C:\\docs\\note_backup_3.md'
    ]);
    expect(suggestBackupPath('C:\\docs\\note.md', (p) => occupied.has(p))).toBe(
      'C:\\docs\\note_backup_4.md'
    );
  });

  it('handles files without an extension', () => {
    expect(suggestBackupPath('/tmp/README', () => false)).toBe('/tmp/README_backup');
  });

  it('preserves multi-part extensions on the base name', () => {
    expect(suggestBackupPath('/tmp/draft.v2.md', () => false)).toBe('/tmp/draft.v2_backup.md');
  });
});
