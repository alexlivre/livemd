export interface GlobalSearchGroup { filePath:string; fileName:string; matches:{line:number;preview:string;index:number}[] }

export function searchInContent(content:string, query:string): {line:number;preview:string;index:number}[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  const lines = content.split('\n');
  const out = [];
  for (let i=0;i<lines.length;i++) {
    const line = lines[i]!;
    const idx = line.toLowerCase().indexOf(q);
    if (idx>=0) {
      const preview = line.length>120 ? line.slice(Math.max(0,idx-40), idx+q.length+60) : line;
      out.push({ line:i+1, preview, index: idx });
      if (out.length>=50) break;
    }
  }
  return out;
}

export function searchAll(query:string, tabs: {filePath:string,fileName:string,content:string}[], recentContents: Map<string,string>): GlobalSearchGroup[] {
  const groups: GlobalSearchGroup[] = [];
  const seen = new Set<string>();
  let total = 0;
  for (const t of tabs) {
    seen.add(t.filePath);
    const m = searchInContent(t.content, query);
    if (m.length) {
      const remaining = 50 - total;
      if (remaining <= 0) break;
      const sliced = m.slice(0, remaining);
      groups.push({ filePath:t.filePath, fileName:t.fileName, matches:sliced });
      total += sliced.length;
      if (total >= 50) break;
    }
  }
  if (total < 50) {
    for (const [fp, content] of recentContents) {
      if (seen.has(fp)) continue;
      const m = searchInContent(content, query);
      if (m.length) {
        const remaining = 50 - total;
        if (remaining <= 0) break;
        const sliced = m.slice(0, remaining);
        groups.push({ filePath:fp, fileName: fp.split(/[\\/]/).pop()||fp, matches:sliced });
        total += sliced.length;
        if (total >= 50) break;
      }
    }
  }
  return groups;
}
