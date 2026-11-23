# Universal lyrics resolver — foundation (2026-11-23)

## Implemented
- `src/lyrics/resolver.ts`: authorized provider adapter contract, strong recording identity checks (ISRC/source ID), title+artist+duration fallback, placeholder rejection, cache interface, concurrency de-duplication and per-provider diagnostics.
- `scripts/test-lyrics-resolver.mjs`: five Node built-in regression tests, including ten distinct synthetic recordings alternating Spotify and SoundCloud.
- CI catalog stage invokes `node --experimental-strip-types --test scripts/test-lyrics-resolver.mjs`.

## Reproduction
```sh
node --experimental-strip-types --test scripts/test-lyrics-resolver.mjs
```
Node v22.16.0 local isolated execution: 5 tests passed, 0 failed. Ten **synthetic fixtures** resolved through fallback, not ten live streaming tracks.

## Deliberately not implemented
- No Spotify/SoundCloud scraping or undocumented API.
- No credentials, external publications, direct UI wiring, or writes into existing verified lyrics.
- No native macOS overlay verification: Remote Desktop Commander reports Mac mini offline.
- No live synchronization latency measurements or genuine ten-song provider retrieval.

## Next integration gates
1. Connect approved read-only lyrics providers and a durable store with exact track-version audit evidence.
2. Only then wire the resolver to `SyncLyricsViewer` with a non-blocking pending/failed state and stable song change handling.
3. Validate Spotify and SoundCloud on ten actual authorized recordings plus local variants.
4. Inspect CI logs and confirm all four jobs, then smoke-test compiled Vite/Electron and native overlay.
