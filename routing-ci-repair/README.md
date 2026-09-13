# Routing CI repair proof

Candidate:90a4341a5b5a6809f0dd6cdd7a4280e913f36720. Baseline:6a176b0c87f0aabbc164ba688bc3002d22df057f.
Exact credited upstream patch:9aecc88d79511d4962f637fcfbe53ea0b8a23eea, PR147293, Peter Steinberger. One expected owner added; strict equality retained.

Isolated Docker node24 Linux ARM64, no host mounts, no credentials, network disconnected. Fresh baseline source archive in /candidate with existing /work/node_modules reused (Vitest5.0.0); not a fresh dependency installation. Baseline targeted command fails1test, skips601. Candidate full file passes602tests, exit0,375.81seconds. Setup attempt initially failed archive permissions before test execution; corrected permissions before these runs.

Commands:
`node /work/node_modules/vitest/vitest.mjs run --config test/vitest/vitest.tooling.config.ts test/scripts/test-projects.test.ts -t 'routes QA Profile Evidence through Git lifecycle'`

Candidate: same command without -t filter. Candidate file SHA2568dc3ace976b30685de780d3efa1b602a7dc132e2c8f1a4e9c438cffa0a2cf9c9 matches pushed source. These checks validate routing only, not whole application CI. Hosted exact-head CI34776519783 pending at publication.
