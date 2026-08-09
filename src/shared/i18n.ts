export type AppLanguage = 'pt' | 'en' | 'es';
export type LangSetting = 'auto' | AppLanguage;
export type MsgParams = Record<string, string | number>;

const enMessages = {
  appSubtitle: 'Tabs & live reload',
  recentTooltip: 'Recent files',
  themeTooltip: 'Toggle theme (Ctrl+Shift+T)',
  openTooltip: 'Open file (Ctrl+O)',
  newTabTooltip: 'New tab (Ctrl+O)',
  langMenuTitle: 'Language',
  emptyTitle: 'No file open',
  emptyHint: 'Open a .md file or drag it here.',
  openFile: 'Open file',
  recentTitle: 'Recently opened',
  recentEmpty: 'No recent files',
  clearHistory: 'Clear history',
  dropTitle: 'Drop to open',
  dropSubtitle: '.md files will open in new tabs',
  ready: 'Ready',
  opening: 'Opening...',
  openingFile: 'Opening: {file}',
  openOk: 'File opened: {file}',
  cancelled: 'Cancelled',
  openedCount: '{n} file(s) opened',
  errorPrefix: 'Error: {msg}',
  reading: 'Reading: {file}',
  updated: 'Updated: {file}',
  removed: 'File removed: {file}',
  openedWithoutWatch: 'Opened without watching: {file}',
  noFileInDrop: 'No file in the drop',
  noMarkdownInDrop: 'No Markdown file in the drop',
  openedViaDrop: '{n} file(s) opened via drop',
  dropError: 'Drop error: {msg}',
  openError: 'Error opening: {msg}',
  readDroppedError: 'Error reading dropped file: {msg}',
  modifiedAt: 'modified: {time}',
  copy: 'Copy',
  copied: 'Copied!',
  copyAria: 'Copy code',
  closeTabAria: 'Close {name}',
  langAuto: 'Automatic ({lang})',
  shortcutOpen: 'open',
  shortcutCloseTab: 'close tab',
  shortcutTheme: 'theme',
  openDialogTitle: 'Open Markdown',
  filterMarkdown: 'Markdown',
  filterAll: 'All files',
  errorOpening: 'Error opening',
  notAFile: 'Not a file',
  markdownOnly: 'Markdown files only'
} as const satisfies Record<string, string>;

export type MsgKey = keyof typeof enMessages;

const ptMessages: Record<MsgKey, string> = {
  appSubtitle: 'Leitor com abas e auto-reload',
  recentTooltip: 'Arquivos recentes',
  themeTooltip: 'Alternar tema (Ctrl+Shift+T)',
  openTooltip: 'Abrir arquivo (Ctrl+O)',
  newTabTooltip: 'Nova aba (Ctrl+O)',
  langMenuTitle: 'Idioma',
  emptyTitle: 'Nenhum arquivo aberto',
  emptyHint: 'Abra um arquivo .md ou arraste pra cá.',
  openFile: 'Abrir arquivo',
  recentTitle: 'Abertos recentemente',
  recentEmpty: 'Nenhum arquivo recente',
  clearHistory: 'Limpar histórico',
  dropTitle: 'Solte para abrir',
  dropSubtitle: 'Arquivos .md serão abertos em novas abas',
  ready: 'Pronto',
  opening: 'Abrindo...',
  openingFile: 'Abrindo: {file}',
  openOk: 'Arquivo aberto: {file}',
  cancelled: 'Cancelado',
  openedCount: '{n} arquivo(s) aberto(s)',
  errorPrefix: 'Erro: {msg}',
  reading: 'Lendo: {file}',
  updated: 'Atualizado: {file}',
  removed: 'Arquivo removido: {file}',
  openedWithoutWatch: 'Aberto sem monitoramento: {file}',
  noFileInDrop: 'Nenhum arquivo no drop',
  noMarkdownInDrop: 'Nenhum arquivo Markdown no drop',
  openedViaDrop: '{n} arquivo(s) aberto(s) via drop',
  dropError: 'Erro no drop: {msg}',
  openError: 'Erro ao abrir: {msg}',
  readDroppedError: 'Erro ao ler o arquivo solto: {msg}',
  modifiedAt: 'modificado: {time}',
  copy: 'Copiar',
  copied: 'Copiado!',
  copyAria: 'Copiar código',
  closeTabAria: 'Fechar {name}',
  langAuto: 'Automático ({lang})',
  shortcutOpen: 'abrir',
  shortcutCloseTab: 'fechar aba',
  shortcutTheme: 'tema',
  openDialogTitle: 'Abrir Markdown',
  filterMarkdown: 'Markdown',
  filterAll: 'Todos os arquivos',
  errorOpening: 'Erro ao abrir',
  notAFile: 'Não é um arquivo',
  markdownOnly: 'Apenas arquivos Markdown'
};

const esMessages: Record<MsgKey, string> = {
  appSubtitle: 'Pestañas y recarga automática',
  recentTooltip: 'Archivos recientes',
  themeTooltip: 'Cambiar tema (Ctrl+Shift+T)',
  openTooltip: 'Abrir archivo (Ctrl+O)',
  newTabTooltip: 'Nueva pestaña (Ctrl+O)',
  langMenuTitle: 'Idioma',
  emptyTitle: 'Ningún archivo abierto',
  emptyHint: 'Abre un archivo .md o arrástralo aquí.',
  openFile: 'Abrir archivo',
  recentTitle: 'Abiertos recientemente',
  recentEmpty: 'Ningún archivo reciente',
  clearHistory: 'Borrar historial',
  dropTitle: 'Suelta para abrir',
  dropSubtitle: 'Los archivos .md se abrirán en pestañas nuevas',
  ready: 'Listo',
  opening: 'Abriendo...',
  openingFile: 'Abriendo: {file}',
  openOk: 'Archivo abierto: {file}',
  cancelled: 'Cancelado',
  openedCount: '{n} archivo(s) abierto(s)',
  errorPrefix: 'Error: {msg}',
  reading: 'Leyendo: {file}',
  updated: 'Actualizado: {file}',
  removed: 'Archivo eliminado: {file}',
  openedWithoutWatch: 'Abierto sin seguimiento: {file}',
  noFileInDrop: 'Ningún archivo en la suelta',
  noMarkdownInDrop: 'Ningún archivo Markdown en la suelta',
  openedViaDrop: '{n} archivo(s) abierto(s) mediante suelta',
  dropError: 'Error en la suelta: {msg}',
  openError: 'Error al abrir: {msg}',
  readDroppedError: 'Error al leer el archivo soltado: {msg}',
  modifiedAt: 'modificado: {time}',
  copy: 'Copiar',
  copied: '¡Copiado!',
  copyAria: 'Copiar código',
  closeTabAria: 'Cerrar {name}',
  langAuto: 'Automático ({lang})',
  shortcutOpen: 'abrir',
  shortcutCloseTab: 'cerrar pestaña',
  shortcutTheme: 'tema',
  openDialogTitle: 'Abrir Markdown',
  filterMarkdown: 'Markdown',
  filterAll: 'Todos los archivos',
  errorOpening: 'Error al abrir',
  notAFile: 'No es un archivo',
  markdownOnly: 'Solo archivos Markdown'
};

export const MESSAGES: Record<AppLanguage, Record<MsgKey, string>> = {
  en: enMessages,
  pt: ptMessages,
  es: esMessages
};

export const LANG_OPTIONS: ReadonlyArray<{ value: AppLanguage; label: string }> = [
  { value: 'pt', label: 'Português' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' }
];

// OS-language display name per current UI language, e.g. UI=pt, OS=en -> 'Inglês'
export const OS_LANG_LABELS: Record<AppLanguage, Record<AppLanguage, string>> = {
  pt: { pt: 'Português', en: 'Inglês', es: 'Espanhol' },
  en: { pt: 'Portuguese', en: 'English', es: 'Spanish' },
  es: { pt: 'Portugués', en: 'Inglés', es: 'Español' }
};

export function mapOsLocale(locale: string): AppLanguage {
  const lower = locale.toLowerCase();
  if (lower.startsWith('pt')) return 'pt';
  if (lower.startsWith('es')) return 'es';
  return 'en';
}

export function t(lang: AppLanguage, key: MsgKey, params?: MsgParams): string {
  let msg = MESSAGES[lang][key];
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      msg = msg.replace(`{${k}}`, String(v));
    }
  }
  return msg;
}
