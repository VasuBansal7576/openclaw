# Preserve webhook compatibility while fixing automatic reset

Candidate `50146b4ed8742ecc79140522410a3a7af26256e0` restores both public webhook files exactly to base `7bf4e2e088bc22daefa5696ab90228b4a5d8064a`. The automatic-reset caller, internal detached continuation, and Code Mode repair remain unchanged. Original contributor credit stays in PR history.

## Before/after compatibility proof

Identical `webhook-compatibility.test.ts` executes actual public `runDetachedWebhookWork`, AsyncWorkScope, and Gateway admission owners, with deterministic barriers and no module mocks. Run at `src/plugin-sdk/webhook-compatibility.test.ts` using:

```sh
node scripts/run-vitest.mjs run --config test/vitest/vitest.unit-fast.config.ts src/plugin-sdk/webhook-compatibility.test.ts --maxWorkers=1
```

- Previous PR head: one expected failed assertion. Callback does not inherit requester signal; late tracked work succeeds after requester closes. The reported final callback signal can be aborted by its own cleanup, but does not carry the requester reason.
- Narrowed candidate: one pass. Callback inherits requester signal and exact cancellation reason, late tracked work rejects with closed-scope, acknowledgement precedes callback, zero roots remain.

This demonstrates retained ambient cancellation, not forced termination of arbitrary uncooperative plugin code. The broader webhook lifetime defect remains in parent #144801, outside this PR.

## Automatic-reset behavior retained

The earlier accepted real idle-rollover harness is rerun unchanged at `src/hooks/reset-runtime-proof.test.ts` on the narrowed candidate, alongside the three committed reset regressions:

```sh
node scripts/run-vitest.mjs run --config test/vitest/vitest.hooks.config.ts src/hooks/autoreset-regression.test.ts src/hooks/reset-runtime-proof.test.ts --maxWorkers=1
```

Four passes. Actual session initialization, idle reason, SQLite storage, hook dispatch, child-process archive write after parent closure; archive contents match the retired session and zero roots remain. Unchanged bundled memory succeeds as a control. This is a test-installed archive hook, not a claim about every installed plugin or live delivery.

## Existing contract regressions

```sh
node scripts/run-vitest.mjs run --config test/vitest/vitest.plugin-sdk.config.ts src/plugin-sdk/webhook-request-guards.test.ts --maxWorkers=1
node scripts/run-vitest.mjs run --config test/vitest/vitest.process.config.ts src/process/gateway-work-admission.test.ts --maxWorkers=1
```

17 webhook tests and 35 admission tests pass. All eight inspected source/test hashes match the container files. This change introduces no public SDK export; the internal detached continuation is referenced only by its owner/test and automatic-reset caller.

## Environment and limitations

Linux ARM64 Docker, Node24.21.0, pnpm12.3.4, Vitest5.0.0. Image node:24-bookworm digest sha256:6dac556d980b7f0e5498d08f08cee0ca67798b4ad6c23964a9214920e67758d0. No host mounts, no user credentials, all capabilities dropped, no-new-privileges. Dependencies installed with frozen lockfile and ignore-scripts; container network disconnected before any source execution. No live model/provider/channel request or service mutation.

Initial setup attempts used the wrong test shard and encountered copy permissions; those ran no assertions and are not behavioral failures. Successful commands above use the repository-owned routing and readable source copies. Native independent source review found no P0-P2 defect in the narrowing; this is not maintainer acceptance. Hosted exact-head CI remains separately reported on the PR.
