# PR #28 — CI and integration verification (2026-11-22)

Scope: `integration/records-catalog`. Do not merge to `main`, create a release or publish music.

## Confirmed evidence

- CI runs #116 (45043557024), #118 (45044682251) and #120 (45044737349) failed.
- Run #120 had a single failing job, `validate`, job ID 137276744252; job steps were null.
- The GitHub job-log endpoint for #120 returned HTTP 404 `BlobNotFound`. The root cause is **unknown**.
- `package.json` defines `build` as `tsc -b && vite build`; Electron entry: `electron/main.cjs`.
- The authorized Mac mini was offline (last seen 25 hours earlier), so no local install, build or Electron smoke test was run in this cycle.
- Historical private CSV fixtures are intentionally not committed; synthetic tests use `scripts/test-records-catalog.mjs`.

## Implemented this cycle

Commit `a7689aa5d30be164ec39581aae0d1f95351691e4` updates `.github/workflows/ci.yml` on the PR branch only.

- Matrix stages: `catalog`, `quality`, `coverage`, `vite-electron`.
- Each stage installs locked dependencies under Node 22 and runs the project doctor.
- Catalog stage runs Node synthetic tests; quality runs lint and TypeScript; coverage runs Vitest; Vite/Electron builds frontend and checks Electron entry syntax.
- `fail-fast: false` allows independent results and names the failing category even when GitHub's log download fails.
- New matrix CI run #122 (45055148141) for commit `a7689aa` completed with **failure**. All four jobs (`catalog`, `quality`, `coverage`, `vite-electron`) failed. This pattern is compatible with a shared prerequisite failure but does **not** establish the cause.
- Fetching the `catalog` job #137308602934 logs again returned HTTP 404 `BlobNotFound`; steps remained unavailable. The stage results do not prove any test, typecheck, or build actually started.

## Reproducible validation commands

```bash
npm ci
npm run doctor
node --test scripts/test-records-catalog.mjs
npm run lint
npm run typecheck
npm run test:coverage
npm run build
node --check electron/main.cjs
```

## Next technical work

1. Inspect per-stage workflow conclusions for commit `a7689aa`; fetch logs if GitHub exposes them.
2. Fix the first verified root cause and rerun checks without changing `main`.
3. Validate screen `/records/`, exact SoundCloud URL matching, local audio/cover fallback and editorial storage in a compiled Electron runtime.
4. Add read-only Musica/suno-suite adapter validation with synthetic fixtures; require separate explicit authorization for publication.

No merge, release, distribution upload or music publication was performed.

## Follow-up verification (2026-11-22, current session)

- PR #28 remains open, draft, unmerged; inspected head `9349e61887c5e27e0126ee4a8f1630a3f796c9a5`.
- Its CI run #126, ID `45055200558`, completed with failure. Latest-attempt jobs: catalog `137308767213`, coverage `137308767473`, quality `137308767513`, vite-electron `137308767528`; all four conclusions were failure and all returned `steps: null`.
- Download of catalog job logs returned HTTP 404 `BlobNotFound` again. **No root cause is established**, and there is no proof that npm, tests or build began.
- The CI workflow names all four independent matrix stages, runs `npm ci`, `npm run doctor`, then stage-specific commands. Checked against branch `package.json`: build is `tsc -b && vite build`; desktop smoke test must be separate from this Linux frontend/entrypoint check.
- Desktop Commander lists `Mac-mini-de-IyariGomez.local` **offline**, last seen approximately 32 hours earlier. No native overlay, Xbox input, Electron playback or latency measurement was performed.
- WARPBLACK PR #27 (head `4c229771c856e5d4f41e483a375e547bcb1e120e`) is **closed**; its CI run #347, ID `44981412869`, job `test` ID `137083388292`, concluded failure, with `steps: null`. Logs also returned 404 `BlobNotFound`. This cannot establish that pytest or Ruff failed. Closed does not imply merged.
- Observed dashboard snapshots: SoundCloud 7,080 plays, +85%, for Nov 17–23 as displayed; DistroKid all-service last-seven-day 191, -58%. Windows, publication delays and platform scope are not proven aligned; **do not infer platform migration or sum as a synchronized total**. SoundCloud highlighted Midnight Glow 564, En la penumbra 306, Desde 282 plays. These are observational figures from screenshots, not API-validated ingestion.

### Next verification gates

1. Restore access to an actual job log or step breakdown, or reproduce the common CI prerequisite locally; only then apply a code-level fix.
2. Once authorized Mac becomes online, run locked install, doctor, catalog test, lint, typecheck, coverage, Vite build, Electron entry syntax and separate Electron playback smoke test, recording exit codes.
3. Test overlay non-activating panel and external metadata adapters separately; inspect controller availability and measure p50/p95/p99 before claiming keyboard/gamepad acceptance.
4. Align exported analytics by date, timezone, reporting lag, platform and track ID before enabling cross-service attribution.

This update documents evidence only; no production changes, main merge or music publishing were performed.
