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
