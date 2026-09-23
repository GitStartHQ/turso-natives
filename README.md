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
