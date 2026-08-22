export function parseVersion(value: string): number[] {
  const parts = value.replace(/^v/, '').split('.');
  return [0, 1, 2].map((i) => Number.parseInt(parts[i] ?? '0', 10) || 0);
}

export function versionsDiffer(a: string, b: string): boolean {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  return va[0] !== vb[0] || va[1] !== vb[1] || va[2] !== vb[2];
}

export function versionsNewer(a: string, b: string): boolean {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  if (va[0] !== vb[0]) return va[0] > vb[0];
  if (va[1] !== vb[1]) return va[1] > vb[1];
  return va[2] > vb[2];
}
