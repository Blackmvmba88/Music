# PR #28 — CI and integration verification (2026-11-22)

Scope: `integration/records-catalog`; do not merge to `main` or publish any music.

## Evidence gathered

- Original head `7dda4dd057a322171fa4ffd22495e7813b67fa69`: GitHub Actions CI run 45043557024 (#116) completed with **failure**.
- GitHub Actions job `validate` failed. GitHub's job-log download returned HTTP 404 / `BlobNotFound`; job-step endpoint returned no steps, so the failing command and root cause are **not established**.
- `package.json` defines `npm run build` as `tsc -b && vite build`; the Electron entry is `electron/main.cjs`.
- `package-lock.json` is present (lockfile v3), and the CI installs using `npm ci`.
- The catalog's synthetic tests run without the two private operational CSVs; the historic CSV-based run remains a separate, local data verification.
- CI workflow was changed in commit `276b63ee066591f2383bd5a65c104b425672957f` to isolate install, doctor, synthetic catalog tests, lint, typecheck, coverage, Vite build and Electron entry syntax checks.
- Follow-up Actions run 45044682251 (#118) also completed with **failure**. Its steps were unavailable and its log URL returned `BlobNotFound`. CI is **not fixed** and no local build can be claimed.
- The connected Mac mini was offline when checked, and the temporary workspace could not resolve github.com to clone the repository. No local Vite/Electron build was executed.

## Next checks

1. Restore access to the Mac mini or a network-capable runner and execute `npm ci`, `node --test scripts/test-records-catalog.mjs`, `npm run lint`, `npm run typecheck`, `npm run test:coverage`, `npm run build`, and `node --check electron/main.cjs`.
2. Capture first failing command and complete stdout/stderr. Fix only the established root cause, then rerun CI.
3. Verify the recording screen, exact SoundCloud link matching, audio fallback and artwork in the compiled Electron app.
4. Validate Musica and suno-suite adapters with non-destructive samples; keep publishing disabled until explicit later approval.

No base-branch merge, release, distribution upload or live publishing was performed.
