# Config open-file feedback evidence

Before is captured after clicking `Open` on upstream base `c4052ca628ac0e1026b82c10d7d80a5ebd8aaff9` and shows no toast.

After is captured on the candidate and shows `Configuration file opened on Gateway host.`.

Before SHA256: `4ecd401ad2a52878c0c6b36ac397a9ce594a8e58d30e24871d2bf58488b144ff`.

After SHA256: `a4929da586b107616e692794a3c27ec4422410bcc9255fda40ef6e6e065065e6`.

Changed-scope verification passed: config operations 17 tests and Control UI E2E 3 tests.

The E2E uses a deterministic mocked Gateway and does not claim a live Solari account, provider authentication, or second-machine desktop opener.
