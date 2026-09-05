# Refreshed config.openFile evidence

Base: `4db554f4cb3aaab69c1be4931244ce36376e4906`.

Candidate head: `54dabe68a296cb2705f8f103159307dde099e083`.

The before image was captured after clicking `Open` on the unfixed refreshed base and shows no toast.

The after image was captured on the merged candidate and shows `Configuration file opened on Gateway host.`.

Before SHA256: `4ecd401ad2a52878c0c6b36ac397a9ce594a8e58d30e24871d2bf58488b144ff`.

After SHA256: `eac832e67eb9bc389d3c33dbd221fb446266afe2f9ac27c9e11544ac19f42520`.

Changed-scope Control UI E2E passed 3 tests on the refreshed candidate.

The E2E uses a deterministic mocked Gateway and does not claim a live Solari account, provider authentication, or second-machine desktop opener.
