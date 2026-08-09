import { contextBridge, clipboard, ipcRenderer, webUtils } from 'electron';
import type { FileEvent } from '@shared/types';
import type { MdApi, OpenedFile } from '@shared/api';

const api: MdApi = {
  openDialog: () => ipcRenderer.invoke('file:open-dialog') as Promise<OpenedFile[]>,
  readFile: (filePath: string) => ipcRenderer.invoke('file:read', filePath) as Promise<OpenedFile>,
  closeTab: (filePath: string) => ipcRenderer.invoke('tab:close', filePath) as Promise<void>,
  revealInFolder: (filePath: string) =>
    ipcRenderer.invoke('shell:reveal', filePath) as Promise<void>,
  consumePendingPath: () =>
    ipcRenderer.invoke('app:consume-pending') as Promise<string | null>,
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
  copyText: (text: string) => clipboard.writeText(text)
};

contextBridge.exposeInMainWorld('mdApi', api);