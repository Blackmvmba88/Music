export type TrackWithLyrics = { lyrics?: string; hasLyrics?: boolean };

export function mergeTrackMetadata<T extends TrackWithLyrics>(canonical: T, local: Partial<T> | undefined): T {
  const canonicalLyrics = canonical.lyrics?.trim() ?? "";
  const localLyrics = local?.lyrics?.trim() ?? "";
  const lyrics = canonicalLyrics || localLyrics;
  return {
    ...canonical,
    ...(local ?? {}),
    lyrics,
    hasLyrics: Boolean(lyrics),
  };
}
