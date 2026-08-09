# LiveMD

Leitor de Markdown feito com **Electron + TypeScript**.

## Recursos

- 🗂 **Sistema de abas** — abra vários `.md` e alterne entre eles
- 🔄 **Auto-reload** — ao salvar o arquivo aberto, a aba atualiza automaticamente
- 🎨 **Tema escuro padrão + tema claro opcional** — dark é o fixo; o usuário troca para light com `Ctrl+Shift+T` ou botão no titlebar; preferência salva por usuário
- 🌈 **Syntax highlighting** para blocos de código (JS/TS, Python, Rust, Go, Bash, JSON, etc.) — colorido via variáveis CSS, acompanha o tema
- 🪟 **UI flat sem menus nativos** — barra de menu do Electron removida; ações viram botões diretos + atalhos visíveis no rodapé (estilo OpenKeyVault)
- 🔵 **FAB flutuante** para abrir arquivo (canto inferior direito)
- 📥 **Drag & drop** — arraste arquivos `.md` do Explorer pra dentro da janela; cada arquivo vira uma nova aba (mostra overlay "Solte para abrir" enquanto arrasta)
- 🛡 **Sanitização** do HTML renderizado com DOMPurify
- 📦 **Instalador Windows (NSIS)** com registro de `.md` como aplicativo padrão
- 🔁 **Single-instance** — abrir outro `.md` adiciona na janela existente
- 🖱 Atalhos: `Ctrl+O` (abrir) · `Ctrl+W` (fechar aba) · `Ctrl+Shift+T` (alternar tema) · botão do meio na aba fecha · clique direito revela no explorador

## Setup

```bash
npm install
npm run dev              # hot-reload em desenvolvimento
npm run build            # build de produção em ./out
npm run typecheck
```

## Empacotar instalador Windows

```bash
npm run build:icon       # gera build/icon.png e build/icon.ico a partir do SVG
npm run dist:win         # build + ícone + electron-builder (gera release/LiveMD-Setup-1.0.0.exe)
```

O instalador fica em `release/LiveMD-Setup-1.0.0.exe` (~80 MB). A versão portátil (sem instalador) fica em `release/win-unpacked/LiveMD.exe`.

### Definir como leitor padrão

O instalador NSIS tem uma página extra perguntando se você quer tornar o app padrão para `.md`, `.markdown`, `.mdown`, `.mkd`. A associação também é registrada **automaticamente** pela configuração `fileAssociations` do electron-builder — após instalar, basta clicar com o botão direito em um `.md` → **Abrir com → LiveMD → Sempre usar este app**.

> O instalador é **per-user** (`perMachine: false`), então não precisa de administrador. O registro vai em `HKCU`, não `HKLM`.

## Arquitetura

```
src/
├── main/        # Processo principal: janela, IPC, single-instance, file watcher (chokidar)
├── preload/     # Bridge seguro expõe window.mdApi
├── renderer/    # UI: tabbar + markdown render
│   └── src/
│       ├── main.ts        # entry, cola tabs ↔ render ↔ IPC ↔ "Abrir com"
│       ├── tabs.ts        # gerenciador de abas
│       ├── markdown.ts    # marked + DOMPurify + highlight.js
│       └── style.css
└── shared/      # Tipos compartilhados (IPC, API)
build/
├── icon.svg     # ícone vetorial do app
├── icon.ico     # gerado por scripts/build-icon.mjs
└── installer.nsh   # script NSIS (página "definir como padrão")
scripts/
└── build-icon.mjs   # SVG → PNG → ICO
```

## Como o auto-reload funciona

1. Ao abrir um arquivo, o main inicia um `chokidar.watch(filePath)` dedicado.
2. Quando o arquivo muda, o main envia `file:event` (`kind: 'changed'`) via IPC.
3. O renderer recebe o evento, atualiza o conteúdo da aba correspondente e re-renderiza.
4. Fechar a aba chama `tab:close` no main, que para o watcher e libera recursos.

`chokidar` é usado em vez de `fs.watch` por ser mais confiável entre plataformas (especialmente Windows) e por oferecer `awaitWriteFinish` (evita reload durante gravações parciais).

## Como o "Abrir com" funciona

1. Usuário dá duplo-clique em `exemplo.md` no Explorer.
2. Windows invoca `MarkdownReader.exe "C:\caminho\exemplo.md"`.
3. O main process:
   - Detecta que uma instância já está rodando (`requestSingleInstanceLock`) → foca a janela existente.
   - Extrai o path do `.md` de `process.argv` (segunda instância) ouvia o evento `second-instance`.
   - Envia `app:open-path` via IPC → renderer chama `api.readFile(path)` → `manager.add(...)` cria a aba.
4. Se nenhuma instância estava rodando, o path é guardado em `pendingOpenPath` e entregue ao renderer assim que a janela terminar de carregar (`did-finish-load`).
