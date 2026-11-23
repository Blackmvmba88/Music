export type TrackWithLyrics = { lyrics?: string; hasLyrics?: boolean };

const isVerifiedLyrics = (value: string | undefined): value is string => {
  const text = value?.trim() ?? "";
  return Boolean(text) && !/^(?:LETRA|TRANSCRIPCI[ÓO]N)\s+PENDIENTE\b/i.test(text);
};

export function mergeTrackMetadata<T extends TrackWithLyrics>(canonical: T, local: Partial<T> | undefined): T {
  const canonicalLyrics = canonical.lyrics?.trim();
  const localLyrics = local?.lyrics?.trim();
  const lyrics = isVerifiedLyrics(canonicalLyrics) ? canonicalLyrics : isVerifiedLyrics(localLyrics) ? localLyrics : "";
  return {
    ...canonical,
    ...(local ?? {}),
    lyrics,
    hasLyrics: Boolean(lyrics),
  };
}
