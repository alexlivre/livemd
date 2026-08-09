# Markdown Reader — Exemplo

Bem-vindo! Este arquivo serve como **exemplo** para testar o leitor.

> Salve este arquivo no seu editor favorito e veja a aba atualizar sozinha.

## Recursos

- Listas
- *Itálico*, **negrito**, ~~riscado~~
- [Links](https://electronjs.org)
- Código inline: `const sum = (a, b) => a + b;`

### Bloco de código

```typescript
type User = { id: number; name: string };

function greet(user: User): string {
  return `Olá, ${user.name}!`;
}

console.log(greet({ id: 1, name: 'Mundo' }));
```

```bash
npm run dev
```

### Tabela

| Recurso        | Status |
| -------------- | :----: |
| Auto-reload    |   ✅   |
| Abas           |   ✅   |
| Syntax HL      |   ✅   |

### Checklist

- [x] Setup do projeto
- [x] Render de markdown
- [ ] Tema claro *(em breve)*

### Citação

> "Simplicidade é a sofisticação suprema." — Leonardo da Vinci

### Linha divisória

---

Edite e salve: você verá a página atualizar automaticamente.
