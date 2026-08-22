import { contextBridge, ipcRenderer, webUtils, webFrame } from 'electron';
import type { FileEvent } from '@shared/types';
import type { AppLanguage } from '@shared/i18n';
import type { Highlight, MdApi, OpenedFile, UpdateCheck, SearchResult, SaveAsResult } from '@shared/api';

const api: MdApi = {
  openDialog: () => ipcRenderer.invoke('file:open-dialog') as Promise<OpenedFile[]>,
  readFile: (filePath: string) => ipcRenderer.invoke('file:read', filePath) as Promise<OpenedFile>,
  watchFile: (filePath: string) =>
    ipcRenderer.invoke('file:watch', filePath) as Promise<void>,
  allowRead: (filePath: string) => ipcRenderer.invoke('file:allow-read', filePath) as Promise<void>,
  saveAs: (filePath: string, content: string) =>
    ipcRenderer.invoke('file:save-as', { filePath, content }) as Promise<SaveAsResult | null>,
  closeTab: (filePath: string) => ipcRenderer.invoke('tab:close', filePath) as Promise<void>,
  revealInFolder: (filePath: string) =>
    ipcRenderer.invoke('shell:reveal', filePath) as Promise<void>,
  consumePendingPaths: () =>
    ipcRenderer.invoke('app:consume-pending') as Promise<string[]>,
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
  exportHtml: (html: string, suggestedName: string) =>
    ipcRenderer.invoke('file:export-html', { html, suggestedName }) as Promise<SaveAsResult | null>,
  exportPdf: (html: string, suggestedName: string) =>
    ipcRenderer.invoke('file:export-pdf', { html, suggestedName }) as Promise<SaveAsResult | null>,
  copyHtml: (html: string) =>
    ipcRenderer.invoke('clipboard:write-text', html) as Promise<void>,
  setZoomFactor: (factor: number) => webFrame.setZoomFactor(factor),
  getZoomFactor: () => webFrame.getZoomFactor(),
  loadHighlights: (filePath: string) =>
    ipcRenderer.invoke('highlights:load', filePath) as Promise<Highlight[]>,
  saveHighlights: (filePath: string, list: Highlight[]) =>
    ipcRenderer.invoke('highlights:save', filePath, list) as Promise<void>,
  onHighlightAdd: (handler: (text: string) => void) => {
    const listener = (_: unknown, text: string) => handler(text);
    ipcRenderer.on('highlight:add', listener);
    return () => ipcRenderer.off('highlight:add', listener);
  },
  listFolder: (folderPath: string) =>
    ipcRenderer.invoke('folder:list', folderPath) as Promise<string[]>,
  loadCustomCss: () => ipcRenderer.invoke('customCss:load') as Promise<string>,
  saveCustomCss: (css: string) =>
    ipcRenderer.invoke('customCss:save', css) as Promise<void>,
  onCustomCssChanged: (handler: (css: string) => void) => {
    const listener = (_: unknown, css: string) => handler(css);
    ipcRenderer.on('custom-css:changed', listener);
    return () => ipcRenderer.off('custom-css:changed', listener);
  },
  onFolderChanged: (handler: (folderPath: string) => void) => {
    const listener = (_: unknown, fp: string) => handler(fp);
    ipcRenderer.on('folder:changed', listener);
    ipcRenderer.on('folder:event', listener);
    return () => {
      ipcRenderer.off('folder:changed', listener);
      ipcRenderer.off('folder:event', listener);
    };
  },
  listCustomThemes: () => ipcRenderer.invoke('customThemes:list') as Promise<import('@shared/api').CustomTheme[]>,
  saveCustomTheme: (payload: { id?: string; name: string; css: string }) =>
    ipcRenderer.invoke('customThemes:save', payload) as Promise<import('@shared/api').CustomTheme>,
  deleteCustomTheme: (id: string) => ipcRenderer.invoke('customThemes:delete', id) as Promise<void>,
  renameCustomTheme: (id: string, newName: string) =>
    ipcRenderer.invoke('customThemes:rename', { id, newName }) as Promise<import('@shared/api').CustomTheme>,
  // aliases for spec compatibility
  onCustomCssChange: (handler: (css: string) => void) => {
    const listener = (_: unknown, css: string) => handler(css);
    ipcRenderer.on('custom-css:changed', listener);
    return () => ipcRenderer.off('custom-css:changed', listener);
  },
  onFolderEvent: (handler: (folderPath: string) => void) => {
    const listener = (_: unknown, fp: string) => handler(fp);
    ipcRenderer.on('folder:changed', listener);
    ipcRenderer.on('folder:event', listener);
    return () => {
      ipcRenderer.off('folder:changed', listener);
      ipcRenderer.off('folder:event', listener);
    };
  }
} as MdApi & {
  onCustomCssChange: (handler: (css: string) => void) => () => void;
  onFolderEvent: (handler: (folderPath: string) => void) => () => void;
};

contextBridge.exposeInMainWorld('mdApi', api);