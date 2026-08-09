# Correção do Drag & Drop — Causas dos Erros e Soluções

**Data:** 2026-08-09
**Escopo:** Arquivos `.md` arrastados do Explorer não abriam no Markdown Reader (Electron 32.3.3)
**Status:** Corrigido e empacotado (`release/Markdown Reader-Setup-1.0.0.exe`)

---

## 1. Sintoma

Arrastar um arquivo `.md` do Windows Explorer para dentro da janela do aplicativo não fazia nada:
nenhum overlay, nenhuma aba, nenhuma mensagem de status. O bug persistia mesmo depois de duas
tentativas de correção no renderer (commit `d340423`).

## 2. Causas Raiz

### 2.1 Causa principal — `dropEffect = 'none'` rejeitava o drop em produção

**Problema:** Em páginas carregadas via protocolo `file://` (build empacotado), o `DataTransfer`
fica em *protected mode* durante os eventos `dragenter`/`dragover`:

- `item.kind` continua enumerável (é possível saber que é um arquivo);
- `getAsFile()` retorna `null`;
- `dataTransfer.files` vem vazio.

Esse é um bug histórico e ainda aberto do Chromium/Electron ([electron#9840](https://github.com/electron/electron/issues/9840),
mudança `2cb1858`). Em `http://localhost` (modo dev) tudo fica acessível — por isso o bug só
aparecia no aplicativo instalado.

O código antigo usava `getAsFile()` no `dragover` para decidir o `dropEffect`:

```ts
// Código antigo (quebrado em file://):
const f = item.getAsFile();          // -> null em file://
if (f && MARKDOWN_EXT.test(f.name))  // -> nunca verdadeiro
  ...
evt.dataTransfer.dropEffect = isMarkdownDrag(...) ? 'copy' : 'none';  // -> sempre 'none'
```

Com `dropEffect = 'none'`, o Chromium **rejeita o drop**: o evento `drop` nunca dispara e nada
acontece (nem navegação). As duas tentativas anteriores falharam porque ambas dependiam de
`getAsFile()` no `dragover` e foram testadas apenas em dev.

### 2.2 Causa secundária — bloqueio silencioso no `will-navigate`

Se por qualquer motivo o `drop` não for cancelado no renderer, o Electron tenta **navegar** até o
arquivo solto. O código anterior interceptava essa navegação e a **bloqueava silenciosamente** —
transformando uma falha em "nada acontece", sem nenhum feedback ao usuário.

### 2.3 Causa terciária — falhas sem mensagem no fluxo do `drop`

O handler de `drop` antigo retornava silenciosamente quando `dataTransfer.files` estava vazio e
não tinha fallback quando `webUtils.getPathForFile()` devolvia caminho vazio (ex.: bug conhecido
no macOS, [electron#44600](https://github.com/electron/electron/issues/44600)). Ou seja: qualquer
falha menor no fluxo virava silêncio total.

## 3. Soluções Aplicadas

### 3.1 Renderer — detectar arquivos por `item.kind` (correção da causa principal)

`src/renderer/src/main.ts` — a função `isMarkdownDrag()` (que usava `getAsFile()`) foi substituída
por `hasDraggedFiles()`, que inspeciona **apenas o `kind`** dos itens (disponível mesmo em
*protected mode*):

```ts
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
```

Consequência direta: `dropEffect` passa a ser `'copy'` para qualquer drag de arquivo → o evento
`drop` **sempre dispara** em produção. A validação de extensão `.md` foi movida para o `drop`
(onde `dataTransfer.files` está disponível), com mensagem clara quando não há Markdown.

### 3.2 Renderer — `drop` robusto e sem falha silenciosa

- `collectDroppedFiles()`: lê de `dataTransfer.files` com fallback para `dataTransfer.items` +
  `getAsFile()`.
- `openDroppedFile()`: usa `webUtils.getPathForFile()`; se o caminho vier vazio, lê o conteúdo
  via `File.text()` e abre a aba mesmo assim (sem watcher, com aviso "Aberto sem monitoramento").
- `try/catch` em todo o fluxo, com mensagem de status (barra inferior) em **toda** falha —
  nenhuma falha é mais silenciosa.

### 3.3 Main — `will-navigate` passa a abrir o arquivo em vez de bloquear

`src/main/index.ts` — quando o Chromium tenta navegar para um `file://`, a navegação é bloqueada e
o caminho é convertido em abertura normal do arquivo (mesmo fluxo do "Abrir com"):

```ts
mainWindow.webContents.on('will-navigate', (event, url) => {
  if (!url.startsWith('file://')) return;
  event.preventDefault();
  const filePath = filePathFromFileUrl(url);
  if (filePath && isMarkdown(filePath)) {
    deliverOpenPath(filePath);
  }
});
```

`filePathFromFileUrl()` converte `file:///C:/a%20b/x.md` → `C:/a b/x.md`, tratando espaços,
acentos e caracteres especiais (validado com Node para 5 formatos de URL).

## 4. Arquivos Alterados

| Arquivo | Mudança |
|---|---|
| `src/renderer/src/main.ts` | Detecção por `kind`, `drop` robusto, fallback de caminho, status em toda falha |
| `src/main/index.ts` | `will-navigate` converte navegação em abertura de arquivo; helper `filePathFromFileUrl()` |

Nenhuma dependência nova. Nenhuma alteração em `preload` ou `shared`.

## 5. Por que isso cobre todos os modos de falha

| Cenário | Comportamento antigo | Comportamento novo |
|---|---|---|
| `file://` protegido no `dragover` | `dropEffect='none'` → drop rejeitado → nada | `dropEffect='copy'` via `kind` → drop dispara → abre |
| Navegação residual (drop não cancelado) | Bloqueada silenciosamente | Convertida em abertura do arquivo |
| `getPathForFile()` retorna `''` | Arquivo ignorado | Abre via `File.text()` com aviso |
| `dataTransfer.files` vazio no `drop` | Retorno silencioso | Fallback `items` + mensagem de status |
| Arquivo não-Markdown | Nada | Mensagem "Nenhum arquivo Markdown no drop" |

## 6. Como Verificar

- `npm run typecheck` e `npm run build` passam sem erros.
- App inicia normalmente (smoke test com janela criada).
- **Teste manual obrigatório no build empacotado** (é onde o bug ocorria):
  1. Arrastar `exemplo.md` do Explorer → abre aba com o conteúdo;
  2. Arrastar vários `.md` juntos → uma aba por arquivo;
  3. Arrastar `.md` já aberto → ativa a aba existente (não duplica);
  4. Arrastar `.txt`/imagem → mensagem de aviso no rodapé, sem navegação;
  5. Salvar o arquivo aberto → aba atualiza (auto-reload intacto).

> Nota conhecida: soltar o arquivo sobre a titlebar (36px no topo) não abre — é a região de
> arrastar a janela (`-webkit-app-region: drag`), comportamento do Windows.
