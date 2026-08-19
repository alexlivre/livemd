import { describe, it, expect } from 'vitest';
import { MESSAGES } from './i18n';

describe('fase1 i18n keys', () => {
  it('has all fase1 keys in pt/en/es with same set', () => {
    const enKeys = Object.keys(MESSAGES.en);
    for (const lang of ['pt', 'es'] as const) {
      const keys = Object.keys(MESSAGES[lang]);
      expect(keys.sort()).toEqual(enKeys.sort());
      for (const k of ['outlineTooltip', 'exportPdf', 'globalSearchPlaceholder'] as const) {
        expect(MESSAGES[lang][k]).toBeTruthy();
      }
    }
  });
});
