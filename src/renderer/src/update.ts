import type { MdApi } from '@shared/api';

const UPDATE_CHECK_KEY = 'md-reader.update-check';

export async function checkForUpdate(
  api: MdApi,
  opts: { onUpdate: (version: string) => void }
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  let lastCheck = '';
  try {
    lastCheck = localStorage.getItem(UPDATE_CHECK_KEY) ?? '';
    localStorage.setItem(UPDATE_CHECK_KEY, today);
  } catch {
    /* localStorage may be disabled — check anyway */
  }
  if (lastCheck === today) return;
  const result = await api.checkUpdate();
  if (result && result.hasUpdate) {
    opts.onUpdate(result.latestVersion.replace(/^v/, ''));
  }
}
