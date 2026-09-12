# Installed package and published-updater proof

Candidate source: `3cb830e78e1d9b566f22ccb48517e01d42efa465` (PR #139131).
Node 24.21.0, npm 11.19.0, Linux ARM64. This follow-up is local Docker evidence, not an additional Solari run.

## Distribution and isolation

The complete candidate was built with `node --import ./scripts/tsx.mjs scripts/build-all.mts` and packed through `node scripts/package-openclaw-for-docker.mjs --skip-build --allow-unreleased-changelog --output-dir /proof-pack --output-name copilot-candidate.tgz`. The package passed the repository's tarball inventory and import-graph checks. Copilot is included by the core package; no plugin bundling override was used.

Candidate tarball SHA256: `5fc136cfaf7af5b0e396f81c6927af4fe7df896ba1940100487f7c7e17ed80ba`.
The packaged `dist/extensions/github-copilot/api.js` SHA256 matches both the fresh installation and the upgraded installation: `13f03a65304d7e19f39363a81e6ccfc6175cf5d0465f7b52ddfd13b8c8a7e492`.
All five changed production source files were hash-compared with the candidate checkout before publication; see `hashes.json`.

Containers have no host mounts, no credentials, dropped capabilities, no-new-privileges and Docker init. Dependency preparation used npm `--ignore-scripts`; networking was disconnected before running OpenClaw. The actual updater ran offline with its normal staged install and validation lifecycle. Only synthetic, deliberately invalid tokens and example tenant hostnames were used. No live GitHub request, paid service, user gateway, or user's state was involved. The updater's isolated gateway canary is not a live user deployment.

## Fresh installed Doctor: six discriminating cases

`proof.mjs` invokes the installed candidate's CLI (`doctor --fix --non-interactive --no-workspace-suggestions`), then inspects the primary SQLite profile store and calls the installed provider's actual token selector. Each case has a separate synthetic state/config/home and separate seed/Doctor/verify processes. No source imports or module mocks. Each command exited zero.

| Case | Expected and observed |
| --- | --- |
| Different enterprise tenants | Child preserved; child selected on acme.ghe.com |
| Same enterprise tenant, hostname case variation | Child shadow removed; shared main selected on acme.ghe.com |
| Public child / enterprise main | Child preserved; child selected on github.com |
| Equivalent public scopes, absent / github.com | Child shadow removed; shared main selected on github.com |
| Raw persisted enterprise URL | Same-scope shadow removed; subsequent unsupported-domain validation durably fences shared main |
| Raw persisted public URL | Same-scope shadow removed; subsequent unsupported-domain validation durably fences shared main |

The first attempted fixture incorrectly expected a raw persisted `https://ACME.ghe.com/` scope to remain usable through full Doctor. Its failed log is retained. Source review confirmed login canonicalizes URLs before persistence, while the unchanged refresh validator rejects raw URL-shaped persisted scopes. The success fixtures therefore use supported hostname forms; both original URL cases remain explicit negative controls asserting the diagnostic, failed refresh fence and expired credential. No validation or production assertion was loosened to obtain a pass. Earlier scanner/repair-only URL normalization evidence does not prove whole-Doctor legacy URL compatibility.

## Actual published updater → candidate

1. Installed the official npm `openclaw@2026.9.4` tarball, verified against npm's SHA512 integrity. The installed CLI reports release build `3a9d69d`.
2. Used that **released SDK** to create the different-enterprise fixture before updating; seed assertions passed.
3. Invoked the released executable:

   `openclaw update --tag file:/tmp/copilot-candidate.tgz --yes --no-restart --json`

   with a synthetic state/config/home, `OPENCLAW_ALLOW_ROOT=1`, `npm_config_cache=/root/.npm`, `npm_config_offline=true`, and container networking disconnected.
4. Updater returned `status: ok`, `mode: npm`, exit zero. Its receipt records staged package installation, candidate migration rehearsal, Doctor lint, config validation, plugin resolution, migration continuation, gateway canary and final Doctor. Before and after have the same development version string but **different build IDs**; package/API hashes establish replacement rather than a no-op.
5. The upgraded installed provider still selects the original child token on `acme.ghe.com`; the child SQLite profile remains intact. No reseeding happened after the update.

`published-updater.log` and `upgrade-verify.log` are raw receipts. Service management was intentionally skipped for the synthetic nondefault state/config paths and `--no-restart`; this does not claim system-service upgrade/restart coverage. The full four-case matrix is the fresh installation test; the released-updater transition uses the cross-enterprise preservation case.

## Limits

This proves loading of the packaged policy artifact, real Doctor repair and installed provider selection, plus one supported published-updater transition. It does not prove valid Enterprise authentication, live refresh, all platform/install-manager variants, or maintainer acceptance of the sharing policy. Independent review checked the harness APIs and negative-control semantics. Prior failed environment attempts are not counted as passing tests.
