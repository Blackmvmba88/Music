import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLyricsResolver, sameRecording } from '../src/lyrics/resolver.ts';

const recording = (i) => ({ platform: i % 2 ? 'spotify' : 'soundcloud', sourceId: `id-${i}`, title: `Track ${i}`, artist: 'BlackMamba', durationSeconds: 180 + i });
const candidate = (r, text = `Authorized lyrics for ${r.title}`) => ({ recording: { ...r }, text });

test('ten distinct Spotify/SoundCloud recordings resolve through fallback, no manual exceptions', async () => {
  const calls = [];
  const saved = new Map();
  const store = { get: async key => saved.get(key)?.candidate ?? null, put: async (key, c, provider) => { saved.set(key, { candidate: c, provider }); } };
  const resolver = createLyricsResolver([
    { name: 'unavailable', lookup: async r => { calls.push(r.sourceId); throw new Error('provider unavailable'); } },
    { name: 'authorized-fixture', lookup: async r => candidate(r) },
  ], store);
  const results = await Promise.all(Array.from({length: 10}, (_, i) => resolver.resolve(recording(i))));
  assert.equal(results.filter(r => r.status === 'found').length, 10);
  assert.equal(calls.length, 10);
  assert.equal(saved.size, 10);
  assert.equal((await resolver.resolve(recording(0))).provider, 'cache');
});

test('rejects homonyms with different IDs or mismatched duration', () => {
  const r = recording(0);
  assert.equal(sameRecording(r, { ...r, sourceId: 'other' }), false);
  assert.equal(sameRecording({ ...r, sourceId: undefined }, { ...r, sourceId: undefined, durationSeconds: 230 }), false);
  assert.equal(sameRecording(r, { ...r, isrc: 'US123' }), true);
  assert.equal(sameRecording({ ...r, isrc: 'US123' }, { ...r, isrc: 'MX123' }), false);
});

test('rejects placeholder lyrics, tries subsequent authorized provider', async () => {
  const r = recording(2);
  const resolver = createLyricsResolver([
    { name: 'pending', lookup: async () => candidate(r, 'TRANSCRIPCIÓN PENDIENTE') },
    { name: 'verified', lookup: async () => candidate(r) },
  ]);
  const result = await resolver.resolve(r);
  assert.equal(result.status, 'found');
  assert.equal(result.provider, 'verified');
  assert.deepEqual(result.errors, ['pending: unverified_or_empty']);
});

test('returns missing state rather than interrupting player when no provider resolves', async () => {
  const resolver = createLyricsResolver([{ name: 'empty', lookup: async () => null }]);
  assert.deepEqual(await resolver.resolve(recording(3)), { status: 'missing', errors: [], cached: false });
});

test('concurrent calls deduplicate network work', async () => {
  let calls = 0;
  const r = recording(4);
  const resolver = createLyricsResolver([{ name: 'fixture', lookup: async () => { calls++; await Promise.resolve(); return candidate(r); } }]);
  const [a, b] = await Promise.all([resolver.resolve(r), resolver.resolve(r)]);
  assert.equal(a.status, 'found');
  assert.equal(b.status, 'found');
  assert.equal(calls, 1);
});
