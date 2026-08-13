import type { MdApi } from '@shared/api';
import { MARKDOWN_EXT_RE } from '@shared/constants';
import { TabManager } from './tabs';
import { t } from './i18n';
import { errorMessage } from './util';

export interface DropDeps {
  api: MdApi;
  manager: TabManager;
  openPath: (filePath: string) => Promise<void>;
  setStatus: (text: string, kind: 'ok' | 'warn' | 'err' | '') => void;
}

function hasDraggedFiles(dt: DataTransfer | null): boolean {
  if (!dt) return false;
  if (dt.items && dt.items.length > 0) {
    for (let i = 0; i < dt.items.length; i++) {
      if (dt.items[i].kind === 'file') return true;
    }
    return false;
  }
  return dt.files.length > 0;
}

function collectDroppedFiles(dt: DataTransfer | null): File[] {
  const files: File[] = [];
  if (!dt) return files;
  if (dt.files.length > 0) {
    for (let i = 0; i < dt.files.length; i++) files.push(dt.files[i]);
    return files;
  }
  if (dt.items) {
    for (let i = 0; i < dt.items.length; i++) {
      const item = dt.items[i];
      if (item.kind !== 'file') continue;
      const f = item.getAsFile();
      if (f) files.push(f);
    }
  }
  return files;
}

export function bindDragAndDrop(deps: DropDeps): void {
  const { api, manager, openPath, setStatus } = deps;
  const dropOverlay = document.getElementById('drop-overlay') as HTMLDivElement;

  async function openDroppedFile(f: File): Promise<boolean> {
    try {
      const path = api.getPathForFile(f);
      if (path) {
        await openPath(path);
        return true;
      }
    } catch (err) {
      setStatus(t('dropError', { msg: errorMessage(err) }), 'err');
      return false;
    }

    try {
      const content = await f.text();
      manager.add({
        filePath: `drop://${f.name}`,
        fileName: f.name,
        content,
        modifiedAt: Date.now()
      });
      setStatus(t('openedWithoutWatch', { file: f.name }), 'warn');
      return true;
    } catch (err) {
      setStatus(t('readDroppedError', { msg: errorMessage(err) }), 'err');
      return false;
    }
  }

  let depth = 0;
  const root = document.documentElement;

  root.addEventListener(
    'dragenter',
    (evt) => {
      const dt = evt.dataTransfer;
      if (!dt) return;
      evt.preventDefault();
      depth++;
      if (hasDraggedFiles(dt)) {
        dropOverlay.classList.add('is-visible');
      }
    },
    { capture: true }
  );

  root.addEventListener(
    'dragover',
    (evt) => {
      evt.preventDefault();
      if (evt.dataTransfer) {
        evt.dataTransfer.dropEffect = hasDraggedFiles(evt.dataTransfer) ? 'copy' : 'none';
      }
    },
    { capture: true }
  );

  root.addEventListener(
    'dragleave',
    () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) dropOverlay.classList.remove('is-visible');
    },
    { capture: true }
  );

  root.addEventListener(
    'drop',
    async (evt) => {
      evt.preventDefault();
      depth = 0;
      dropOverlay.classList.remove('is-visible');

      try {
        const files = collectDroppedFiles(evt.dataTransfer);
        if (files.length === 0) {
          setStatus(t('noFileInDrop'), 'warn');
          return;
        }

        const markdownFiles = files.filter((f) => MARKDOWN_EXT_RE.test(f.name));
        if (markdownFiles.length === 0) {
          setStatus(t('noMarkdownInDrop'), 'warn');
          return;
        }

        let opened = 0;
        for (const f of markdownFiles) {
          if (await openDroppedFile(f)) opened++;
        }
        if (opened === markdownFiles.length) {
          setStatus(t('openedViaDrop', { n: opened }), 'ok');
        }
      } catch (err) {
        setStatus(t('dropError', { msg: errorMessage(err) }), 'err');
      }
    },
    { capture: true }
  );

  root.addEventListener(
    'dragend',
    () => {
      depth = 0;
      dropOverlay.classList.remove('is-visible');
    },
    { capture: true }
  );
}
