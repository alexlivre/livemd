export interface OpenedFile {
  filePath: string;
  fileName: string;
  content: string;
  modifiedAt: number;
}

export interface MdApi {
  openDialog: () => Promise<OpenedFile[]>;
  readFile: (filePath: string) => Promise<OpenedFile>;
  closeTab: (filePath: string) => Promise<void>;
  revealInFolder: (filePath: string) => Promise<void>;
  consumePendingPath: () => Promise<string | null>;
  onOpenPath: (handler: (filePath: string) => void) => () => void;
  onFileEvent: (handler: (event: import('./types').FileEvent) => void) => () => void;
  getPathForFile: (file: File) => string;
}
