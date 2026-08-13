export interface OpenFilePayload {
  filePath: string;
}

export interface FileContent {
  filePath: string;
  fileName: string;
  content: string;
  modifiedAt: number;
}

export interface FileChangePayload {
  filePath: string;
}

export interface TabModel {
  id: string;
  filePath: string;
  fileName: string;
  modifiedAt: number;
}

export type IpcChannel =
  | 'file:open-dialog'
  | 'file:read'
  | 'file:allow-read'
  | 'file:changed'
  | 'file:removed'
  | 'tab:close'
  | 'app:get-locale'
  | 'app:set-language'
  | 'app:get-version'
  | 'app:open-external'
  | 'app:check-update'
  | 'search:find'
  | 'search:stop';

export type FileEvent =
  | { kind: 'changed'; filePath: string; content: string; modifiedAt: number }
  | { kind: 'removed'; filePath: string }
  | { kind: 'error'; filePath: string; message: string };
