import assert from 'node:assert/strict';
import test from 'node:test';
import { createSoundCloudPlaybackReader, createSpotifyPlaybackReader, positionAt } from '../electron/playback-sources.mjs';

function spotify(fetchImpl, now = () => 1000) {
  return createSpotifyPlaybackReader({ getAccessToken: () => 'fixture', fetchImpl, now });
}

test('Spotify detects a new track, pause and account position', async () => {
  let trackId = 'honey-v1';
  let playing = true;
  const read = spotify(async (url, { headers }) => {
    assert.equal(url, 'https://api.spotify.com/v1/me/player/currently-playing');
    assert.equal(headers.Authorization, 'Bearer fixture');
    return Response.json({
      timestamp: 1,
      progress_ms: 250,
      is_playing: playing,
      item: { id: trackId, name: 'Honey', type: 'track', duration_ms: 3000 },
    });
  });
  const first = await read();
  assert.equal(first.state.trackId, 'honey-v1');
  assert.equal(positionAt(first.state, 1500), 750);
  assert.equal(positionAt(first.state, 5000), 3000);
  assert.equal(positionAt(first.state, 12000), null);
  trackId = 'honey-v2';
  playing = false;
  const second = await read();
  assert.equal(second.state.trackId, 'honey-v2');
  assert.equal(second.state.playing, false);
  assert.equal(positionAt(second.state, 1500), 250);
});

test('Spotify shares a pending request and honors Retry-After', async () => {
  let now = 1000;
  let requests = 0;
  const read = spotify(async () => {
    requests += 1;
    return requests === 1
      ? new Response(null, { status: 429, headers: { 'Retry-After': '4' } })
      : new Response(null, { status: 204 });
  }, () => now);
  const pending = read();
  assert.equal(read(), pending);
  assert.deepEqual(await pending, { status: 'rate-limited', retryAtMs: 5000 });
  assert.equal((await read()).status, 'rate-limited');
  assert.equal(requests, 1);
  now = 5000;
  assert.equal((await read()).status, 'idle');
  assert.equal(requests, 2);
});

test('Spotify distinguishes inactive playback, auth and network errors', async () => {
  for (const [http, status] of [[204, 'idle'], [401, 'unauthorized'], [403, 'forbidden'], [500, 'unavailable']]) {
    assert.equal((await spotify(async () => new Response(null, { status: http }))()).status, status);
  }
  assert.equal((await spotify(async () => { throw new Error('offline'); })()).status, 'unavailable');
  assert.equal((await spotify(async () => Response.json({ item: { type: 'episode' } }))()).status, 'idle');
});

test('SoundCloud rejects a track transition during asynchronous sampling', async () => {
  let trackId = 1;
  let transitioning = true;
  const read = createSoundCloudPlaybackReader({
    getCurrentSound: (callback) => callback({ id: trackId, title: 'Honey', duration: 3000 }),
    getPosition: (callback) => {
      if (transitioning) trackId += 1;
      callback(1500);
    },
    isPaused: (callback) => callback(true),
  }, () => 1000);

  assert.equal((await read()).status, 'unavailable');
  transitioning = false;
  const { state } = await read();
  assert.equal(state.trackId, '2');
  assert.equal(state.playing, false);
  assert.equal(positionAt(state, 2000), 1500);
});
