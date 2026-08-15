export const SEGMENT_BYTES = 256 * 1024;

const FENCE_RE = /^\s*(```+|~~~+)/;

// Splits markdown into chunks that never cut through a fenced code block.
// Break points sit between lines; the opening line of a fence, everything
// inside it, and its closing line always stay in the same segment.
export function splitMarkdown(source: string, maxBytes: number = SEGMENT_BYTES): string[] {
  const segments: string[] = [];
  let current = '';
  let currentBytes = 0;
  let fenceMarker: string | null = null;

  const flush = (): void => {
    if (current.trim()) segments.push(current);
    current = '';
    currentBytes = 0;
  };

  const lines = source.split('\n');
  const lastIndex = lines.length - 1;
  for (let i = 0; i <= lastIndex; i++) {
    const line = lines[i] as string;
    const fence = FENCE_RE.exec(line);
    const opensFence = fence !== null && fenceMarker === null;
    const insideFence = fenceMarker !== null;

    const lineBytes = line.length + 1;
    if (!insideFence && !opensFence && currentBytes > 0 && currentBytes + lineBytes > maxBytes) {
      flush();
    }

    if (fence) {
      const marker = fence[1] as string;
      if (!fenceMarker) {
        fenceMarker = marker;
      } else if (line.trim().startsWith(fenceMarker)) {
        fenceMarker = null;
      }
    }

    current += line;
    if (i < lastIndex) current += '\n';
    currentBytes += lineBytes;
  }

  flush();
  return segments;
}
