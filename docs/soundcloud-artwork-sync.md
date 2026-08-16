# SoundCloud artwork sync

This workflow treats the local BlackMamba cover as the canonical artwork source and requires external evidence before a write is considered complete.

## Safety ladder

1. Audit replacement candidates without writing:

   `npm run library:soundcloud-artwork:replace:dry`

2. Apply a one-track canary and verify the result:

   `npm run library:soundcloud-artwork:replace:canary`

   To target a specific linked track, append `-- --track=<soundcloud-id-or-urn>`.

3. Only after reviewing `soundcloud-artwork-sync.json`, apply the full replacement set:

   `npm run library:soundcloud-artwork:replace`

## Policies

- Default `library:soundcloud-artwork` / `:apply` keeps the existing `missing-only` behavior.
- `--replace-existing` makes tracks with remote artwork eligible for replacement.
- Existing remote artwork is never assumed to equal the local canonical cover.
- Every write performs a GET before PUT and another GET after PUT.
- The report records the local SHA-256 plus before/after artwork URLs and remote fingerprints when available.
- A failed write or missing post-write artwork leaves the run incomplete.
- `--track=<id-or-urn>` scopes audit/application to one linked track for controlled canaries.

## Required environment

The machine performing real writes needs:

- `BLACKMAMBA_LIBRARY_ROOT` pointing at the canonical library.
- `SOUNDCLOUD_ACCESS_TOKEN` or `SOUNDCLOUD_OAUTH_TOKEN` with permission to update the account's tracks.
