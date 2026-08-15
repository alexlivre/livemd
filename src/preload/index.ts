import { contextBridge, ipcRenderer, webUtils, webFrame } from 'electron';
import type { FileEvent } from '@shared/types';
import type { AppLanguage } from '@shared/i18n';
import type { MdApi, OpenedFile, UpdateCheck, SearchResult, SaveAsResult } from '@shared/api';

const api: MdApi = {
  openDialog: () => ipcRenderer.invoke('file:open-dialog') as Promise<OpenedFile[]>,
  readFile: (filePath: string) => ipcRenderer.invoke('file:read', filePath) as Promise<OpenedFile>,
  allowRead: (filePath: string) => ipcRenderer.invoke('file:allow-read', filePath) as Promise<void>,
  saveAs: (filePath: string, content: string) =>
    ipcRenderer.invoke('file:save-as', { filePath, content }) as Promise<SaveAsResult | null>,
  closeTab: (filePath: string) => ipcRenderer.invoke('tab:close', filePath) as Promise<void>,
  revealInFolder: (filePath: string) =>
    ipcRenderer.invoke('shell:reveal', filePath) as Promise<void>,
  consumePendingPath: () =>
    ipcRenderer.invoke('app:consume-pending') as Promise<string | null>,
  getOsLocale: () => ipcRenderer.invoke('app:get-locale') as Promise<string>,
  setLanguage: (lang: AppLanguage) =>
    ipcRenderer.invoke('app:set-language', lang) as Promise<void>,
  getAppVersion: () => ipcRenderer.invoke('app:get-version') as Promise<string>,
  openExternal: (url: string) =>
    ipcRenderer.invoke('app:open-external', url) as Promise<void>,
  checkUpdate: () => ipcRenderer.invoke('app:check-update') as Promise<UpdateCheck | null>,
  findInPage: (text, options) =>
    ipcRenderer.invoke('search:find', text, options) as Promise<void>,
  stopFind: () => ipcRenderer.invoke('search:stop') as Promise<void>,
  onFoundInPage: (handler) => {
    const listener = (_: unknown, result: SearchResult) => handler(result);
    ipcRenderer.on('search:found', listener);
    return () => ipcRenderer.off('search:found', listener);
  },
  onOpenPath: (handler) => {
    const listener = (_: unknown, filePath: string) => handler(filePath);
    ipcRenderer.on('app:open-path', listener);
    return () => ipcRenderer.off('app:open-path', listener);
  },
  onFileEvent: (handler) => {
    const listener = (_: unknown, payload: FileEvent) => handler(payload);
    ipcRenderer.on('file:event', listener);
    return () => ipcRenderer.off('file:event', listener);
  },
  // Electron 32+ removed File.path; use webUtils to resolve a real OS path
  // for files dropped into the renderer.
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  copyText: (text: string) =>
    ipcRenderer.invoke('clipboard:write-text', text) as Promise<void>,
  setZoomFactor: (factor: number) => webFrame.setZoomFactor(factor),
  getZoomFactor: () => webFrame.getZoomFactor()
};

contextBridge.exposeInMainWorld('mdApi', api);