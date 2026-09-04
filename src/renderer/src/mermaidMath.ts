/**
 * Progressive Mermaid/Math rendering.
 * Both functions are fire-and-forget: dynamic import with fallback.
 * If mermaid/katex are not installed, they leave the DOM intact and never throw.
 */

let mermaidPromise: Promise<any | null> | null = null;
let katexPromise: Promise<any | null> | null = null;

async function tryDynamicImport(spec: string): Promise<any | null> {
  try {
    const loader = new Function('s', 'return import(s)') as (s: string) => Promise<any>;
    const mod = await loader(spec);
    return mod;
  } catch {
    return null;
  }
}

export async function renderMermaid(container: HTMLElement): Promise<void> {
  let mermaid: any = null;
  try {
    mermaidPromise ??= tryDynamicImport('mermaid');
    const mod = await mermaidPromise;
    if (!mod) return;
    mermaid = (mod as any).default ?? mod;
  } catch {
    return;
  }
  if (!mermaid) return;

  const blocks = container.querySelectorAll('pre code.language-mermaid');
  if (blocks.length === 0) return;

  try {
    const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'default';
    if (typeof mermaid.initialize === 'function') {
      mermaid.initialize({ startOnLoad: false, theme });
    } else if (mermaid.mermaidAPI?.initialize) {
      mermaid.mermaidAPI.initialize({ startOnLoad: false, theme });
    }
  } catch {
    // ignore init errors
  }

  let idx = 0;
  for (const code of Array.from(blocks)) {
    if (!(code as HTMLElement).isConnected) continue;
    const pre = (code as HTMLElement).closest('pre');
    if (!pre) continue;
    const text = (code.textContent ?? '').trim();
    if (!text) continue;
    const id = `m-${Date.now()}-${idx++}-${Math.random().toString(36).slice(2, 6)}`;
    try {
      let svg: string | null = null;
      if (typeof mermaid.render === 'function') {
        const res = await mermaid.render(id, text);
        svg = typeof res === 'string' ? res : (res?.svg ?? null);
      } else if (mermaid.mermaidAPI?.render) {
        svg = await new Promise<string>((resolve, reject) => {
          try {
            mermaid.mermaidAPI.render(id, text, (out: string) => resolve(out));
          } catch (e) {
            reject(e);
          }
        });
      }
      if (!svg) continue;
      const wrapper = document.createElement('div');
      wrapper.className = 'mermaid';
      wrapper.innerHTML = svg;
      const codeBlock = pre.closest('.code-block') ?? pre;
      codeBlock.replaceWith(wrapper);
    } catch {
      // leave code block intact on render error
      continue;
    }
  }
}

export async function renderMath(container: HTMLElement): Promise<void> {
  let katex: any = null;
  try {
    katexPromise ??= tryDynamicImport('katex');
    const mod = await katexPromise;
    if (!mod) return;
    katex = (mod as any).default ?? mod;
  } catch {
    return;
  }
  if (!katex || typeof katex.renderToString !== 'function') return;

  if (!container.textContent?.includes('$')) return;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node: Node) {
      const parent = (node as Text).parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      const tag = parent.tagName;
      if (tag === 'CODE' || tag === 'PRE' || tag === 'SCRIPT' || tag === 'STYLE') return NodeFilter.FILTER_REJECT;
      if (parent.closest('code, pre')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  } as any);

  const nodes: Text[] = [];
  let n: Text | null;
  while ((n = walker.nextNode() as Text | null)) {
    if (n.nodeValue && n.nodeValue.includes('$')) nodes.push(n);
  }

  for (const textNode of nodes) {
    if (!textNode.isConnected) continue;
    const original = textNode.nodeValue ?? '';
    // Quick check: must contain $...$ pattern
    if (!original.includes('$')) continue;
    const regex = /\$\$([\s\S]+?)\$\$|\$([^\$\n]+?)\$/g;
    let hasMath = false;
    // probe first
    {
      const probe = new RegExp(regex.source, regex.flags);
      if (probe.test(original)) hasMath = true;
    }
    if (!hasMath) continue;

    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    let m: RegExpExecArray | null;
    regex.lastIndex = 0;
    while ((m = regex.exec(original)) !== null) {
      const idx = m.index;
      if (idx > lastIndex) {
        frag.appendChild(document.createTextNode(original.slice(lastIndex, idx)));
      }
      const display = m[1] !== undefined;
      const tex = display ? m[1] : m[2];
      try {
        const rendered = katex.renderToString(tex, {
          displayMode: display,
          throwOnError: false,
          strict: false
        });
        const span = document.createElement('span');
        span.innerHTML = rendered;
        while (span.firstChild) frag.appendChild(span.firstChild);
      } catch {
        frag.appendChild(document.createTextNode(m[0]));
      }
      lastIndex = idx + m[0].length;
    }
    if (lastIndex < original.length) {
      frag.appendChild(document.createTextNode(original.slice(lastIndex)));
    }
    try {
      textNode.parentNode?.replaceChild(frag, textNode);
    } catch {
      continue;
    }
  }
}
