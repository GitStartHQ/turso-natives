# turso-natives
Prebuilt Turso (libSQL) native N-API packages for platforms upstream doesn't publish to npm (currently macOS x64). Consumed by gitenv as URL optionalDependencies.

## Sync 0.6.1 typed-array backport

The `build-sync-061-typedarray.yml` workflow builds all five GitEnv Machine
platforms from the pinned Turso 0.6.1 source commit. Its patch changes only
the JavaScript sync request byte boundary: N-API now returns a `Uint8Array`
instead of an array of one JavaScript number per byte. The matching
`sync-common` change passes that byte array to `fetch` without a second copy.
It does not change the database engine, sync protocol, or on-disk format.
Every package retains the upstream `0.6.1` version so the existing loader
accepts it.

The workflow uploads test artifacts only. Do not publish or use them in a
Machine release until the following checks pass: one large transaction push
against a disposable hosted Turso database, a same-file patched-to-stock
0.6.1 rollback, and full Catalog replica convergence. One observed Machine
has a 223 MB pending transaction and over 1 GB of CDC backlog. The native
memory fix alone does not prove that hosted Turso accepts the request or that
the remaining backlog drains. Never delete or rewrite its CDC ledger.

On 2026-09-23, the hosted acceptance test passed against the disposable
`ziahamza/gitenv` database `gitenv-cdc-qa-20260923`: the patched binding sent a
257,399,528-byte request and Turso returned HTTP 200. Stock 0.6.1 reopened
the same replica and read all 44,359 rows. An independent Turso Cloud query
also returned 44,359 rows and 181,690,369 payload bytes. Run
`scripts/smoke-hosted-large-sync.mjs` with stock and patched npm prefixes and
`TURSO_HOSTED_QA_URL` / `TURSO_HOSTED_QA_TOKEN` to repeat it. This proves hosted
request acceptance and format rollback, not production Catalog convergence or
the absence of replica 502s. Keep the production release gated until those are
verified.
