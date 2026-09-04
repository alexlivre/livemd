import type { AppLanguage } from './i18n';

export interface Highlight {
  id: string;
  text: string;
  color: 'accent' | 'warning' | 'success';
  createdAt: number;
}

export interface OpenedFile {
  filePath: string;
  fileName: string;
  content: string;
  modifiedAt: number;
}

export interface UpdateCheck {
  latestVersion: string;
  hasUpdate: boolean;
}

export interface SearchResult {
  matches: number;
  activeMatchOrdinal: number;
}

export interface SaveAsResult {
  savedPath: string;
}

export interface CustomTheme {
  id: string;
  name: string;
  css: string;
  createdAt: number;
  updatedAt: number;
}

export interface MdApi {
  openDialog: () => Promise<OpenedFile[]>;
  readFile: (filePath: string) => Promise<OpenedFile>;
  watchFile: (filePath: string) => Promise<void>;
  allowRead: (filePath: string) => Promise<void>;
  saveAs: (filePath: string, content: string) => Promise<SaveAsResult | null>;
  closeTab: (filePath: string) => Promise<void>;
  revealInFolder: (filePath: string) => Promise<void>;
  consumePendingPaths: () => Promise<string[]>;
  getOsLocale: () => Promise<string>;
  setLanguage: (lang: AppLanguage) => Promise<void>;
  setTheme: (theme: string) => Promise<void>;
  getAppVersion: () => Promise<string>;
  openExternal: (url: string) => Promise<void>;
  checkUpdate: () => Promise<UpdateCheck | null>;
  findInPage: (text: string, options?: { findNext?: boolean; forward?: boolean }) => Promise<void>;
  stopFind: () => Promise<void>;
  onFoundInPage: (handler: (result: SearchResult) => void) => () => void;
  onOpenPath: (handler: (filePath: string) => void) => () => void;
  onFileEvent: (handler: (event: import('./types').FileEvent) => void) => () => void;
  getPathForFile: (file: File) => string;
  copyText: (text: string) => Promise<void>;
  exportHtml: (html: string, suggestedName: string) => Promise<SaveAsResult | null>;
  exportPdf: (html: string, suggestedName: string) => Promise<SaveAsResult | null>;
  copyHtml: (html: string) => Promise<void>;
  setZoomFactor: (factor: number) => void;
  getZoomFactor: () => number;
  loadHighlights: (filePath: string) => Promise<Highlight[]>;
  saveHighlights: (filePath: string, list: Highlight[]) => Promise<void>;
  onHighlightAdd: (handler: (text: string) => void) => () => void;
  listFolder: (folderPath: string) => Promise<string[]>;
  loadCustomCss: () => Promise<string>;
  saveCustomCss: (css: string) => Promise<void>;
  onCustomCssChanged: (handler: (css: string) => void) => () => void;
  onFolderChanged: (handler: (folderPath: string) => void) => () => void;
  // aliases for spec/plan compatibility
  onCustomCssChange?: (handler: (css: string) => void) => () => void;
  onFolderEvent?: (handler: (folderPath: string) => void) => () => void;
  listCustomThemes: () => Promise<CustomTheme[]>;
  saveCustomTheme: (payload: { id?: string; name: string; css: string }) => Promise<CustomTheme>;
  deleteCustomTheme: (id: string) => Promise<void>;
  renameCustomTheme: (id: string, newName: string) => Promise<CustomTheme>;
}
