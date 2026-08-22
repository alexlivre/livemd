# Relatório de Caça a Bugs — LiveMD

**Data:** 2026-08-21 · **Versão analisada:** 1.3.0 (commit `c4da373`)
**Escopo:** análise estática completa de `src/main`, `src/preload`, `src/shared`, `src/renderer` (59 arquivos)
**Validação executada:** `npm run typecheck` ✅ · `npm run build` ✅ · `npx vitest run` ⚠️ 117/119

---

## Resumo executativo

| Severidade | Qtd | Destaques |
|---|---|---|
| 🔴 Alta | 3 | Watcher órfão no macOS; contagem de watchers quebrada com abas duplicadas; export sujo |
| 🟡 Média | 5 | Update-check sem comparador de versão; vazamentos de watchers; testes quebrados; Mermaid/Math mortos |
| 🟢 Baixa | 8 | Corridas menores, recurso incompleto, redundâncias, doc drift |

Nenhuma vulnerabilidade de segurança explorável foi encontrada. A superfície XSS (DOMPurify + hooks), a whitelist de protocolos, o `trustPath` para leitura de arquivos, `contextIsolation`/`sandbox` e `setWindowOpenHandler(deny)` estão todos corretos.

---

## 🔴 Alta

### 1. macOS: reabrir o app cria janela nova, mas os watchers continuam apontando para a janela antiga
- **Onde:** `src/main/index.ts:286-334` (`watchFile` captura `win` na closure), `index.ts:918-920` (`activate` → `createWindow` → `registerIpc`)
- **O que acontece:** no macOS, fechar a janela não encerra o app (`window-all-closed` só sai em não-darwin). Ao clicar no dock, `activate` cria uma **nova** janela. Mas `watched`/`watchCounts` são globais e o `watched.has(filePath)` faz `startWatch` retornar cedo — o watcher existente continua enviando `file:event` para a `webContents` **destruída** da janela velha (silenciosamente descartado pelo guard `isDestroyed()`).
- **Impacto:** live-reload simplesmente para de funcionar na janela reaberta. O mesmo padrão afeta `folderWatchers` e `customCssWatcher`.
- **Correção sugerida:** no `closed` da janela, destruir e recriar watchers (ou fazer os watchers consultarem `mainWindow` atual em vez de capturarem `win`; o handler `search:find` já usa o global `mainWindow` — padronizar nele).

### 2. Fechar uma das abas do mesmo arquivo mata o watcher da outra
- **Onde:** `src/main/index.ts:287-289` (`unwatchFile` decrementa contador global), `src/main/index.ts:474-476` (`tab:close`)
- **O que acontece:** o renderer cria **duas abas com o mesmo `filePath`** quando um arquivo apagado volta ao disco (`addCopy` em `openRecreated`, `main.ts:733-742`) ou quando se reabre um arquivo com aba congelada (`openPath`, `main.ts:808-814`). O contador de watchers é por **caminho**, não por aba: `closeTab(path)` na primeira aba decrementa 1→0 e **fecha o watcher**, embora a segunda aba permaneça aberta.
- **Impacto:** a aba restante fica silenciosamente congelada (sem live reload) — exatamente o estado "órfão" que ela nem deveria ter.
- **Correção sugerida:** contar por `(filePath, tabId)` — ex.: registrar um token por `file:read`/aba e só fechar o watcher quando o último token daquele caminho cair.

### 3. Export (PDF/HTML/copiar) leva conteúdo errado/parcial
- **Onde:** `src/renderer/src/main.ts:1229-1252` (menu Export), `1435-1465` (palette), usando `contentEl.innerHTML`
- **O que acontece:** três problemas compostos:
  1. O HTML exportado inclui **destaques do usuário** (`<mark data-hl-id>`) — artefato de leitura, não do documento;
  2. Inclui SVGs substituídos pelo Mermaid **em vez do código-fonte dos diagramas** (questionável, mas inconsistente com blocos não renderizados);
  3. Se o usuário exportar enquanto um arquivo grande está em **render incremental** (`renderIncremental`, `main.ts:503-518`), exporta o documento **pela metade**.
- **Correção sugerida:** exportar a partir de `renderMarkdown(tab.content)` (fonte pura), não do DOM vivo; opcionalmente remover `<mark[data-hl-id]>` antes de serializar.

---

## 🟡 Média

### 4. Update-check não compara versões: downgrade aparece como "atualização disponível"
- **Onde:** `src/shared/version.ts:6-10` (`versionsDiffer` = apenas diferença), consumido em `src/main/index.ts:599`
- **Impacto:** rodando 1.3.0, um release antigo `v1.2.9` no GitHub marca `hasUpdate: true` → ponto no botão About + "Update 1.2.9 available".
- **Correção:** comparar numericamente (`va > vb`), não por diferença. Os helpers já parseiam para números.

### 5. `file:read` inicia watcher permanente para qualquer leitura — busca global acumula watchers
- **Onde:** `src/main/index.ts:433` (`startWatch` dentro do handler `file:read`), `src/renderer/src/main.ts:195-242` (busca global lê até 10 recentes **por tecla digitada**, com debounce de 180 ms)
- **Impacto:** cada arquivo recente pesquisado ganha um watcher chokidar que **nunca é fechado** (não há aba → ninguém chama `tab:close`). Limitado a ~10 instâncias, mas somando-se aos watchers de pasta (#6), o app prende handles de FS desnecessários.
- **Correção:** separar "ler" de "assistir": adicionar parâmetro `watch: boolean` no `file:read`, ou mover o `startWatch` para um canal explícito chamado só quando uma aba é criada.

### 6. Watchers de pasta nunca são liberados
- **Onde:** `src/main/index.ts:207-227` (`watchFolder`), `649-659` (`folder:list`)
- **Impacto:** cada pasta diferente visitada pela sidebar cria um watcher que vive até o app encerrar (`folderWatchers` só é limpo em `unwatchAll`). Navegar entre pastas de projetos distintos acumula watchers de diretório inteiro.
- **Correção:** fechar o watcher da pasta anterior quando a sidebar trocar de contexto (canal `folder:unwatch`).

### 7. Suíte de testes quebrada (infra): `node:fs` em ambiente jsdom
- **Onde:** `src/renderer/src/markdown.test.ts:2` importa `readFileSync` de `node:fs`; o arquivo declara `@vitest-environment jsdom`
- **Impacto:** o Vite externaliza `node:fs` para ambiente browser → `readFileSync is not a function` → **2 testes falham sempre** (`npm test` sai com exit 1, quebraria CI).
- **Correção:** mover esses 2 testes para um arquivo com ambiente node, ou ler o README via `fs` do próprio Vitest (`import { readFileSync } from 'node:fs'` em teste sem jsdom), ou embutir a fixture.

### 8. Mermaid/KaTeX são código morto — e continuariam mortos mesmo com as deps instaladas
- **Onde:** `src/renderer/src/mermaidMath.ts:7-15` (`new Function('s', 'return import(s)')`), CSP em `src/renderer/index.html:8` (`script-src 'self'`, sem `unsafe-eval`), `package.json` (sem `mermaid`/`katex` nas dependências)
- **Dois bloqueios independentes:**
  1. `mermaid` e `katex` **não estão instalados** → o import dinâmico sempre falha;
  2. `new Function` é avaliação dinâmica → a CSP do app bloqueia → mesmo com as deps, `tryDynamicImport` lançaria e retornaria `null`.
- **Impacto:** usuários colam blocos ```mermaid e fórmulas `$...$` e nada acontece, sem mensagem (o `mermaidError` existe nos dicionários mas nunca é usado).
- **Correção:** instalar as deps e usar `import()` estático do bundler (com lazy chunk), removendo o `new Function`.

---

## 🟢 Baixa

### 9. Segundo arquivo aberto durante o startup sobrescreve o primeiro
`deliverOpenPath` (`index.ts:371-379`) guarda um único `pendingOpenPath`; dois eventos rápidos (multi-seleção no "Abrir com" do Windows) perdem o primeiro arquivo.

### 10. Sessão salva o scroll de todas as abas mas restaura só o da ativa
`snapshotSession` grava `scrollTop` por aba (`main.ts:832-841`), mas `restoreSession` só lê o da `activePath` (`main.ts:869-872`). Ou restaura tudo, ou pare de salvar o resto.

### 11. Tema `light` existe, funciona, mas está fora do ciclo do botão
`theme.ts:11` aceita e aplica `'light'` persistido, e `style.css:141` tem o bloco `:root[data-theme='light']` — mas `THEME_CYCLE` só tem `['dark','soft']`. Usuário que ficou no `light` (versão anterior?) não consegue voltar a ele pela UI. O AGENTS.md diz que `light` deveria migrar para `soft` — a migração nunca foi implementada.

### 12. CSS customizado é aplicado duas vezes por fontes diferentes
`insertCSS` no main (`index.ts:158-174`) **e** `<style id="custom-css">` no renderer (`customCss.ts:35-48`), ambos com o mesmo `enhanceSpecificity`. Redundante: dois pontos para divergir no futuro.

### 13. Evento de pasta dispara duas mensagens idênticas e o listener escuta as duas
Main envia `folder:changed` **e** `folder:event` para o mesmo evento (`index.ts:216-220`); o preload registra o handler nos dois canais (`preload/index.ts:74-82`) → `refreshSidebar` roda 2× por evento de disco.

### 14. Branch morto no atalho Ctrl+P
`shortcuts.ts:58-66`: o `if` para inputs é vazio (só comentário) — quando o foco está num input, Ctrl+P não faz nada silenciosamente. Simplificar para um `else` único.

### 15. Cache de render guarda o HTML pré-Mermaid/pré-highlight
`renderCache.set` é chamado antes das passadas assíncronas (`main.ts:541,546`); voltar para a aba reinjeta o HTML bruto e re-renderiza Mermaid/highlight do zero a cada visita (piscada + trabalho repetido).

### 16. `escapeAttr` não escapa aspas simples
`util.ts:14-16` escapa `"` mas não `'`. Hoje todos os atributos usam aspas duplas, então não é explorável — mas é um acidente esperando para acontecer em template futuro. Escapar também `'` (ou usar `&apos;`).

---

## Documentação desatualizada (AGENTS.md)

- Diz **Electron 32**; `package.json` usa **Electron ^43.4.0**.
- Diz "**não existe** tema light"; existe bloco CSS e o tipo aceita (bug #11 relacionado).
- Não menciona a suíte **Vitest** (20 arquivos de teste) nem os módulos novos (sidebar, palette, themes editor, export, global search).

## Verificação

```
npm run typecheck   ✅ passa
npm run build       ✅ passa (out/ gerado)
npx vitest run      ⚠️ 117/119 — falhas são o bug #7 (infra de teste)
```

## Ordem sugerida de correção

1. **#7** (testes) — destrava CI;
2. **#2 e #1** (watchers) — são o coração do produto (live reload);
3. **#4** (update-check) — trivial e visível;
4. **#3** (export) — decisão de produto sobre o que exportar;
5. **#5/#6/#8** — higiene de recursos/features mortas;
6. Baixas conforme oportunidade.
