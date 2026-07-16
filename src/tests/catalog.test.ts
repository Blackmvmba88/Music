import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadCatalog, loadRatings, loadTrackDetails, persistRatings } from '../api/catalog';

afterEach(() => vi.unstubAllGlobals());

describe('catalog API', () => {
  it('validates and normalizes a healthy response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ tracks: [{ id: 'one' }], confidence: 1, evidence: ['verified'] }) }));
    await expect(loadCatalog<{ id: string }>()).resolves.toMatchObject({ tracks: [{ id: 'one' }], confidence: 1, warnings: [] });
  });

  it('rejects malformed data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ songs: [] }) }));
    await expect(loadCatalog()).rejects.toThrow('invalid shape');
  });

  it('loads deferred track details on demand', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ lyrics: 'hello', description: 'details' }) }));
    await expect(loadTrackDetails<{ lyrics: string }>('suno-one')).resolves.toMatchObject({ lyrics: 'hello' });
    expect(fetch).toHaveBeenCalledWith('/api/tracks/suno-one/details', expect.objectContaining({ cache: 'no-cache' }));
  });

  it('loads and persists durable ratings', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ratings: { one: 5 } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ratings: { one: 5 } }) });
    vi.stubGlobal('fetch', request);
    await expect(loadRatings()).resolves.toEqual({ one: 5 });
    await persistRatings({ one: 5 });
    expect(request).toHaveBeenLastCalledWith('/api/profile/ratings', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ ratings: { one: 5 } }) }));
  });
});
