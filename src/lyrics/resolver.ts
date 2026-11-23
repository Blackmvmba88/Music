/** Provider-neutral lyrics resolution. API calls belong to authorized adapters. */
export type Platform = 'spotify' | 'soundcloud' | 'local' | 'suno';
export interface Recording {
  platform: Platform;
  sourceId?: string;
  isrc?: string;
  title: string;
  artist: string;
  durationSeconds?: number;
}
export interface LyricsCandidate {
  recording: Recording;
  text: string;
  timedLines?: Array<{ start: number; end: number; text: string }>;
}
export interface LyricsProvider {
  name: string;
  lookup(recording: Recording): Promise<LyricsCandidate | null>;
}
export interface LyricsStore {
  get(key: string): Promise<LyricsCandidate | null>;
  put(key: string, candidate: LyricsCandidate, provider: string): Promise<void>;
}
export type ResolveResult =
  | { status: 'found'; provider: string; candidate: LyricsCandidate; errors: string[]; cached: boolean }
  | { status: 'missing'; errors: string[]; cached: false };

const normalize = (s: string) => s.normalize('NFKC').toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
const notPlaceholder = (text: string) => Boolean(text.trim()) && !/^(?:LETRA|TRANSCRIPCI[ÓO]N)\s+PENDIENTE\b/i.test(text.trim());

/** Refuse conflicting strong IDs and ambiguous title-only matches. */
export function sameRecording(wanted: Recording, actual: Recording): boolean {
  const wIsrc = wanted.isrc?.trim().toUpperCase();
  const aIsrc = actual.isrc?.trim().toUpperCase();
  if (wIsrc && aIsrc && wIsrc !== aIsrc) return false;
  const samePlatform = wanted.platform === actual.platform;
  if (samePlatform && wanted.sourceId && actual.sourceId && wanted.sourceId !== actual.sourceId) return false;
  const strongId = Boolean((wIsrc && aIsrc && wIsrc === aIsrc) ||
    (samePlatform && wanted.sourceId && actual.sourceId && wanted.sourceId === actual.sourceId));
  const sameMetadata = normalize(wanted.title) === normalize(actual.title) &&
    normalize(wanted.artist) === normalize(actual.artist);
  const durationKnown = Number.isFinite(wanted.durationSeconds) && Number.isFinite(actual.durationSeconds);
  const durationMatches = durationKnown && Math.abs(wanted.durationSeconds! - actual.durationSeconds!) <= 3;
  return strongId || (sameMetadata && durationMatches);
}

export function recordingKey(r: Recording): string {
  const identity = r.sourceId || r.isrc || `${normalize(r.artist)}:${normalize(r.title)}:${r.durationSeconds ?? 'unknown'}`;
  return `${r.platform}:${identity}`;
}

export function createLyricsResolver(providers: LyricsProvider[], store?: LyricsStore) {
  const pending = new Map<string, Promise<ResolveResult>>();
  async function resolveOne(recording: Recording): Promise<ResolveResult> {
    const key = recordingKey(recording);
    const errors: string[] = [];
    if (store) {
      try {
        const cached = await store.get(key);
        if (cached && notPlaceholder(cached.text) && sameRecording(recording, cached.recording)) {
          return { status: 'found', provider: 'cache', candidate: cached, errors, cached: true };
        }
      } catch (err) { errors.push(`cache-read: ${String(err)}`); }
    }
    for (const provider of providers) {
      try {
        const candidate = await provider.lookup(recording);
        if (!candidate) continue;
        if (!notPlaceholder(candidate.text) || !sameRecording(recording, candidate.recording)) {
          errors.push(`${provider.name}: unverified_or_empty`);
          continue;
        }
        if (store) {
          try { await store.put(key, candidate, provider.name); }
          catch (err) { errors.push(`cache-write: ${String(err)}`); }
        }
        return { status: 'found', provider: provider.name, candidate, errors, cached: false };
      } catch (err) { errors.push(`${provider.name}: ${String(err)}`); }
    }
    return { status: 'missing', errors, cached: false };
  }
  return {
    resolve(recording: Recording): Promise<ResolveResult> {
      const key = recordingKey(recording);
      const existing = pending.get(key);
      if (existing) return existing;
      const task = resolveOne(recording).finally(() => pending.delete(key));
      pending.set(key, task);
      return task;
    },
  };
}
