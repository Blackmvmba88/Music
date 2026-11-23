// A snapshot uses the local clock. Spotify's timestamp represents a state change.
function snapshot(provider, id, title, positionMs, durationMs, playing, observedAtMs) {
  if (!id || typeof title !== 'string' || typeof playing !== 'boolean') return null;
  const duration = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : null;
  const position = Number.isFinite(positionMs) && positionMs >= 0 ? positionMs : null;
  return {
    provider,
    trackId: String(id),
    title,
    positionMs: duration === null || position === null ? position : Math.min(position, duration),
    durationMs: duration,
    playing,
    observedAtMs,
  };
}

export function positionAt(state, nowMs, maxAgeMs = 10000) {
  if (!state || state.positionMs === null) return null;
  const age = Math.max(0, nowMs - state.observedAtMs);
  if (age > maxAgeMs) return null;
  const position = state.positionMs + (state.playing ? age : 0);
  return state.durationMs === null ? position : Math.min(position, state.durationMs);
}

// Keep the injected token provider in a trusted process. Use user OAuth with
// user-read-currently-playing and refresh tokens in the existing credential owner.
export function createSpotifyPlaybackReader({ getAccessToken, fetchImpl = fetch, now = Date.now }) {
  let retryAtMs = 0;
  let pending;

  async function read() {
    if (now() < retryAtMs) return { status: 'rate-limited', retryAtMs };
    const token = await getAccessToken();
    if (!token) return { status: 'unauthorized' };
    const response = await fetchImpl('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    });
    const observedAtMs = now();
    if (response.status === 204) return { status: 'idle' };
    if (response.status === 401) return { status: 'unauthorized' };
    if (response.status === 403) return { status: 'forbidden' };
    if (response.status === 429) {
      const seconds = Number(response.headers.get('Retry-After'));
      retryAtMs = observedAtMs + 1000 * (Number.isFinite(seconds) && seconds > 0 ? seconds : 30);
      return { status: 'rate-limited', retryAtMs };
    }
    if (!response.ok) return { status: 'unavailable' };
    const data = await response.json();
    const item = data?.item;
    const state = item?.type === 'track'
      ? snapshot('spotify', item.id, item.name, data.progress_ms, item.duration_ms, data.is_playing, observedAtMs)
      : null;
    if (!state) return { status: 'idle' };
    return {
      status: 'ready',
      state: {
        ...state,
        isrc: typeof item.external_ids?.isrc === 'string' ? item.external_ids.isrc : undefined,
        artist: Array.isArray(item.artists)
          ? item.artists.map((artist) => artist?.name).filter((name) => typeof name === 'string').join(', ')
          : undefined,
      },
    };
  }

  return () => {
    pending ??= read().catch(() => ({ status: 'unavailable' })).finally(() => { pending = undefined; });
    return pending;
  };
}

// Call once the embedded widget is ready. Recheck identity across asynchronous
// getters so a playlist transition cannot pair one track with another's clock.
export function createSoundCloudPlaybackReader(widget, now = Date.now) {
  let pending;
  function get(method) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('SoundCloud widget did not respond')), 2000);
      try {
        widget[method]((value) => { clearTimeout(timeout); resolve(value); });
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  async function read() {
    const sound = await get('getCurrentSound');
    const id = sound?.urn ?? sound?.id;
    if (!id) return { status: 'idle' };
    const [position, paused] = await Promise.all([
      get('getPosition').then((value) => ({ value, observedAtMs: now() })),
      get('isPaused'),
    ]);
    const confirmed = await get('getCurrentSound');
    if ((confirmed?.urn ?? confirmed?.id) !== id || typeof paused !== 'boolean') {
      return { status: 'unavailable' };
    }
    const state = snapshot('soundcloud', id, sound.title, position.value, sound.duration, !paused, position.observedAtMs);
    return state ? { status: 'ready', state } : { status: 'unavailable' };
  }

  return () => {
    pending ??= read().catch(() => ({ status: 'unavailable' })).finally(() => { pending = undefined; });
    return pending;
  };
}
