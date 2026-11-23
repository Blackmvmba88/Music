export type LyricSegment = { start: number; end: number; text: string };

const parseTimestamp = (input: string): number | null => {
  const parts = input.trim().split(':');
  if (parts.length !== 2 && parts.length !== 3) return null;
  const seconds = parts.pop()!;
  const minutes = parts.pop()!;
  if (!/^\d{2}\.\d{3}$/.test(seconds) || !/^\d{2}$/.test(minutes)) return null;
  const sec = Number(seconds);
  const min = Number(minutes);
  const hours = parts.length ? Number(parts[0]) : 0;
  if (!Number.isFinite(hours) || min > 59 || sec >= 60) return null;
  return hours * 3600 + min * 60 + sec;
};

/** Parse WebVTT karaoke cues without turning cue IDs, comments or timestamps into lyrics. */
export function parseVTT(source: string): LyricSegment[] {
  const lines = source.replace(/^\uFEFF/, '').split(/\r?\n/);
  const output: LyricSegment[] = [];
  let block: string[] = [];
  const flush = () => {
    if (!block.length) return;
    const index = block.findIndex(line => line.includes('-->'));
    if (index < 0) { block = []; return; }
    const match = block[index].match(/^\s*(\S+)\s+-->\s+(\S+)/);
    const start = match ? parseTimestamp(match[1]) : null;
    const end = match ? parseTimestamp(match[2]) : null;
    const text = block.slice(index + 1).join('\n').trim();
    if (start !== null && end !== null && end > start && text) {
      output.push({start, end, text});
    }
    block = [];
  };
  for (const line of lines) {
    if (!line.trim()) { flush(); continue; }
    if (!block.length && (/^WEBVTT(?:\s|$)/.test(line) || /^(NOTE|STYLE|REGION)(?:\s|$)/.test(line))) {
      block.push(line);
      continue;
    }
    if (/^(NOTE|STYLE|REGION)(?:\s|$)/.test(block[0] ?? '')) { block.push(line); continue; }
    block.push(line);
  }
  flush();
  return output.sort((a,b) => a.start - b.start);
}

export function activeCueIndex(segments: LyricSegment[], currentTime: number, graceSeconds = 2): number {
  if (!Number.isFinite(currentTime)) return -1;
  for (let i = segments.length - 1; i >= 0; i--) {
    if (currentTime >= segments[i].start) {
      return currentTime <= segments[i].end + graceSeconds ? i : -1;
    }
  }
  return -1;
}
