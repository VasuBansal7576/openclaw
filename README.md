# Copilot PR #139131 — Solari evidence

PR: https://github.com/openclaw/openclaw/pull/139131

## Results

Actual Solari web-terminal screenshots are in 02-before.jpg and 03-after.jpg. These are screenshots, not exported VM disk snapshots.

- Before: 2 failed, 2 passed. Real Doctor repair removed the different-tenant child and real provider token selection chose the wrong shared tenant.
- After: 4 passed. Different-tenant credentials preserved; same-tenant spelling/public controls continue sharing.
- Final focused suite: 105 passed across five files; formatting passed.
- All ten final changed source files matched the cloud SHA-256 hashes.

The proof uses real isolated SQLite stores, Doctor scan/repair, and provider token formatting/selection. Tokens are deliberately invalid synthetic fixtures. Test execution was offline in a separate network namespace on Solari, Node 24.21.0. No live account authentication, upgrade driver, or real provider refresh was exercised. Maintainer acceptance of the sharing policy remains required.

inputs.json pins the source/head and patch hash; source-hashes.json identifies the exact cloud-tested source. Raw logs are included and the compressed archive hash is in inputs.json. The first screenshot records a full dependency-install disk limit; no tests ran during that setup failure. A smaller dependency environment then ran the real targeted code successfully. No dependency changes were added to the PR.

The new head was pushed and GitHub reports mergeable. Fresh CI initially failed production types, test types, and package-boundary compilation because unchanged upstream server-startup-finish.ts passes an array where GatewayPostReadySidecarHandle is required. This is not a passing full-CI claim.

The disposable Solari sandbox was deleted after export. No paid subscription was enabled. No live OpenClaw installation or real credential stores were modified.
