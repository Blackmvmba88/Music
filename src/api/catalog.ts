export type CatalogResponse<T> = { tracks: T[]; confidence: number; evidence: string[]; warnings: string[]; fallbackReason: string | null };

export async function loadCatalog<T>(signal?: AbortSignal): Promise<CatalogResponse<T>> {
  const response = await fetch('/player/library.json', { signal, cache: 'no-cache', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Catalog request failed: ${response.status}`);
  const body: unknown = await response.json();
  if (!body || typeof body !== 'object' || !Array.isArray((body as { tracks?: unknown }).tracks)) throw new Error('Catalog response has an invalid shape');
  const catalog = body as Partial<CatalogResponse<T>> & { tracks: T[] };
  return { tracks: catalog.tracks, confidence: Number(catalog.confidence ?? 0.5), evidence: Array.isArray(catalog.evidence) ? catalog.evidence : [], warnings: Array.isArray(catalog.warnings) ? catalog.warnings : [], fallbackReason: catalog.fallbackReason ?? null };
}

export async function loadTrackDetails<T>(id: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/tracks/${encodeURIComponent(id)}/details`, {
    signal,
    cache: 'no-cache',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Track details request failed: ${response.status}`);
  const body: unknown = await response.json();
  if (!body || typeof body !== 'object') throw new Error('Track details response has an invalid shape');
  return body as T;
}

export async function loadRatings(signal?: AbortSignal): Promise<Record<string, number>> {
  const response = await fetch('/api/profile/ratings', { signal, cache: 'no-cache', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Ratings request failed: ${response.status}`);
  const body = await response.json() as { ratings?: unknown };
  return body?.ratings && typeof body.ratings === 'object' ? body.ratings as Record<string, number> : {};
}

export async function persistRatings(ratings: Record<string, number>): Promise<void> {
  const response = await fetch('/api/profile/ratings', {
    method: 'PUT',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ratings }),
  });
  if (!response.ok) throw new Error(`Ratings save failed: ${response.status}`);
}
