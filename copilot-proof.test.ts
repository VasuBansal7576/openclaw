/**
 * Copy to the repository root in the secretless /lab sandbox.
 * Actual Doctor scan/repair, SQLite stores, and provider credential selection.
 * No provider adapter mocks; tokens below are deliberately invalid fixtures.
 * Does NOT prove GitHub accepts credentials, or exercise a released upgrade driver.
 */
import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { resolveFirstGithubToken } from "./extensions/github-copilot/auth.js";
import { loadPersistedAuthProfileStore } from "./src/agents/auth-profiles/persisted.js";
import { clearRuntimeAuthProfileStoreSnapshots } from "./src/agents/auth-profiles/runtime-snapshots.js";
import { saveAuthProfileStore } from "./src/agents/auth-profiles/store-runtime.js";
import type { AuthProfileStore, OAuthCredential } from "./src/agents/auth-profiles/types.js";
import {
  repairStaleOAuthProfileShadows,
  scanStaleOAuthProfileShadows,
} from "./src/commands/doctor/shared/stale-oauth-profile-shadows.js";
import { createOpenClawTestState } from "./src/test-utils/openclaw-test-state.js";

const profileId = "github-copilot:default";
const childToken = "INVALID_SYNTHETIC_CHILD_TOKEN_NOT_A_SECRET";
const mainToken = "INVALID_SYNTHETIC_MAIN_TOKEN_NOT_A_SECRET";

function credential(enterpriseUrl: string | undefined, token: string, expires: number): OAuthCredential {
  return {
    type: "oauth",
    provider: "github-copilot",
    access: token,
    refresh: token,
    expires,
    ...(enterpriseUrl === undefined ? {} : { enterpriseUrl }),
  };
}

function store(value: OAuthCredential): AuthProfileStore {
  return { version: 1, profiles: { [profileId]: value } };
}

const cases = [
  { label: "different enterprise tenants", child: "acme.ghe.com", main: "other.ghe.com", remove: false, domain: "acme.ghe.com" },
  { label: "same enterprise tenant URL spelling", child: "acme.ghe.com", main: "https://ACME.ghe.com/", remove: true, domain: "acme.ghe.com" },
  { label: "public child versus enterprise main", child: undefined, main: "other.ghe.com", remove: false, domain: "github.com" },
  { label: "equivalent public tenant spellings", child: undefined, main: "https://github.com/", remove: true, domain: "github.com" },
] as const;

describe("Doctor repair followed by real Copilot profile resolution (synthetic credentials)", () => {
  it.each(cases)("$label", async (scenario) => {
    const state = await createOpenClawTestState({
      prefix: "copilot-doctor-proof-",
      layout: "state-only",
      agentEnv: "main",
      env: { COPILOT_GITHUB_TOKEN: undefined, COPILOT_GITHUB_DOMAIN: undefined },
    });
    try {
      state.applyEnv();
      clearRuntimeAuthProfileStoreSnapshots();
      const childDir = state.agentDir("child");
      await fs.mkdir(childDir, { recursive: true });
      const now = Date.now();
      const child = credential(scenario.child, childToken, now - 60_000);
      const main = credential(scenario.main, mainToken, now + 3_600_000);
      const options = { filterExternalAuthProfiles: false, syncExternalCli: false };
      saveAuthProfileStore(store(child), childDir, options);
      saveAuthProfileStore(store(main), undefined, options);
      expect(loadPersistedAuthProfileStore(childDir)?.profiles[profileId]).toEqual(child);
      expect(loadPersistedAuthProfileStore()?.profiles[profileId]).toEqual(main);

      const hits = await scanStaleOAuthProfileShadows({ cfg: {}, env: state.env, now });
      const repair = await repairStaleOAuthProfileShadows({ cfg: {}, env: state.env, now });
      const persistedChild = loadPersistedAuthProfileStore(childDir)?.profiles[profileId];
      clearRuntimeAuthProfileStoreSnapshots();
      // Calls the provider's real store reader, API-key formatter, and parser.
      const selected = await resolveFirstGithubToken({
        agentDir: childDir,
        config: {},
        env: {},
        profileId,
      });
      const receipt = {
        scenario: scenario.label,
        scanHits: hits.length,
        removedProfiles: repair.changes.length,
        childPreserved: persistedChild !== undefined,
        selectedTokenOwner: selected.githubToken === childToken ? "child" : selected.githubToken === mainToken ? "shared-main" : "unexpected",
        selectedDomain: selected.githubDomain,
        proofBoundary: "actual Doctor + persisted SQLite + real Copilot credential resolution; no provider network authentication",
      };
      console.info("COPILOT_PROOF", JSON.stringify(receipt));
      expect(hits).toHaveLength(scenario.remove ? 1 : 0);
      expect(repair.warnings).toEqual([]);
      expect(repair.changes).toHaveLength(scenario.remove ? 1 : 0);
      expect(persistedChild).toEqual(scenario.remove ? undefined : child);
      expect(loadPersistedAuthProfileStore()?.profiles[profileId]).toEqual(main);
      expect(selected).toMatchObject({
        githubToken: scenario.remove ? mainToken : childToken,
        githubDomain: scenario.domain,
        hasProfile: true,
        profileId,
      });
    } finally {
      clearRuntimeAuthProfileStoreSnapshots();
      await state.cleanup();
    }
  });
});
