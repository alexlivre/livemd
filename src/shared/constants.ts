export const MARKDOWN_EXTENSIONS = ['md', 'markdown', 'mdown', 'mkd', 'mdx'] as const;

export const MARKDOWN_EXT_RE = /\.(md|markdown|mdown|mkd|mdx)$/i;

export type ThemeName = 'dark' | 'soft' | 'light';

export const DEFAULT_THEME: ThemeName = 'soft';

export const THEME_BG_COLORS: Record<ThemeName, string> = {
  dark: '#1a1d23',
  soft: '#f5f5f5',
  light: '#ffffff'
};

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
