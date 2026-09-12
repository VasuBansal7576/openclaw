# Actual idle-rollover proof

Candidate source7cb9d592709a49fc1976dfc22eeb9f30b0447e7d. Baseline reverses only src/hooks/session-auto-reset.ts to upstream e7133caac4431d810b1dbcc7bcd2c4c503a91224, retaining the helper. Identical harness for both runs. Run file at src/hooks/reset-runtime-proof.test.ts with Vitest hooks config.

Real initSessionState, idle expiry, SQLite session/transcript storage and internal hook dispatch. A test-installed archive hook explicitly uses trackAsyncWork around a real child-process file write. Parent scope drains before releasing that hook. The unchanged bundled session-memory handler (llmSlug:false) is a control and succeeds both before/after, NOT a claim of default-memory failure.

Before: fails with closed async scope, no archive. After: archive contents match retired ID, memory contains original text, one hook owner remains until release, all roots finish zero. Browser-cleanup may concurrently own another root; test asserts the hook-specific owner exactly, not total global count. Both observed runs finish dispatch before cleanup. This evidence harness is not a production regression test and requires stronger early-failure finally cleanup before promotion.

Node24.21.0 LinuxARM64 in clean Docker. No host mounts; capdropall/no-new-privileges; frozen pnpm12.3.4 install ignore-scripts, then network disconnected. No real model, user credentials, or provider/channel requests. Independent read-only review found no blocking false-positive; added exact artifact-content assertion before final runs.

## Accepted CI-fix integration rerun

The same harness passed again on exact PR head `03ca2382874f813d19926dd5cfb10701c7caa96f`, after merging accepted upstream UI and shard fixes through `d569fcdba8bd04b9ae6787af432a6fef409cade7`. See `after-03ca.log`. This is a new candidate run, not a new baseline run. Docker used init, network none, no mounts, and the same frozen dependency installation. No assertions or production files were changed for this rerun.
