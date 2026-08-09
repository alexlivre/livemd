import type { AppLanguage } from './i18n';

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

export interface MdApi {
  openDialog: () => Promise<OpenedFile[]>;
  readFile: (filePath: string) => Promise<OpenedFile>;
  closeTab: (filePath: string) => Promise<void>;
  revealInFolder: (filePath: string) => Promise<void>;
  consumePendingPath: () => Promise<string | null>;
  getOsLocale: () => Promise<string>;
  setLanguage: (lang: AppLanguage) => Promise<void>;
  getAppVersion: () => Promise<string>;
  openExternal: (url: string) => Promise<void>;
  checkUpdate: () => Promise<UpdateCheck | null>;
  onOpenPath: (handler: (filePath: string) => void) => () => void;
  onFileEvent: (handler: (event: import('./types').FileEvent) => void) => () => void;
  getPathForFile: (file: File) => string;
  copyText: (text: string) => void;
}
