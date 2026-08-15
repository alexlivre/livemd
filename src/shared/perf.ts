let enabled = false;
let origin = 0;

export function enablePerf(flag: boolean, timeOrigin: number = performance.now()): void {
  enabled = flag;
  origin = timeOrigin;
}

export function perfMark(label: string): void {
  if (!enabled) return;
  console.log(`[perf] ${label}=${(performance.now() - origin).toFixed(1)}ms`);
}
