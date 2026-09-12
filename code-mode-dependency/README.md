# Existing Code Mode dependency verification

PR #143234 by Yigtwxx, head ff365359b30dfaebb3ee0d92593ec296c327b98d, already fixes the exact Code Mode failure seen in #146350 CI. This is not a new implementation. Its three commits were cherry-picked with -x and author credit preserved after isolated verification. Current composed head: eaeb2d35c7fd21463737d6caff318672f8ebbb0d.

On #146350 source03ca2382874, the upstream regression file with unmodified worker code produces3 failures/3 passes: typed deadline and abort failures incorrectly become internal_error. Applying the upstream worker change without changing assertions yields100 passes across five Code Mode files. The existing hook regressions plus actual idle-rollover proof also pass4 tests afterward. Candidate files were byte-compared with the tested overlay before push.

Node24.21.0 LinuxARM64, Docker init, network none, no host mounts or credentials. This is local Docker evidence, not Solari. Hosted CI on the new head is still required; no live model or channel run is claimed.

The dependency is explicit in the PR body and can disappear from the diff after upstream lands it. Original source/credit: https://github.com/openclaw/openclaw/pull/143234. Its accepted technical review does not authorize us to merge that PR.
