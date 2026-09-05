import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const source = process.env.OPENCLAW_SOURCE;
if (!source) throw new Error("OPENCLAW_SOURCE is required");
const root = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-doctor-receipt-"));
const state = path.join(root, "state");
process.env.OPENCLAW_STATE_DIR = state;
process.env.OPENCLAW_HOME = root;
process.env.HOME = root;
const storeModule = await import(pathToFileURL(path.join(source, "src/agents/auth-profiles/store.ts")).href);
const doctorModule = await import(pathToFileURL(path.join(source, "src/commands/doctor/shared/stale-oauth-profile-shadows.ts")).href);
const persistedModule = await import(pathToFileURL(path.join(source, "src/agents/auth-profiles/persisted.ts")).href);
const profileId = "github-copilot:default";
const now = Date.now();
const credential = (enterpriseUrl: string | undefined, expires: number, extra: Record<string, unknown> = {}) => ({
  type: "oauth" as const,
  provider: "github-copilot",
  enterpriseUrl,
  access: "fake-access",
  refresh: "fake-refresh",
  expires,
  ...extra,
});
const childAgentDir = path.join(state, "agents", "telegram", "agent");
storeModule.saveAuthProfileStore({ version: 1, profiles: { [profileId]: credential("acme.ghe.com", now - 60_000) } }, childAgentDir);
storeModule.saveAuthProfileStore({ version: 1, profiles: { [profileId]: credential(process.env.OPENCLAW_MAIN_DOMAIN ?? "other.ghe.com", now + 3_600_000, { accountId: "fake-main-account" }) } });
const hits = await doctorModule.scanStaleOAuthProfileShadows({ cfg: {}, now });
const repair = await doctorModule.repairStaleOAuthProfileShadows({ cfg: {}, now });
const remaining = persistedModule.loadPersistedAuthProfileStore(childAgentDir)?.profiles[profileId] !== undefined;
console.log(JSON.stringify({ source, gitRevision: process.env.OPENCLAW_GIT_REVISION, mainDomain: process.env.OPENCLAW_MAIN_DOMAIN ?? "other.ghe.com", scanHits: hits.length, repair, childProfileRemaining: remaining }));
await fs.rm(root, { recursive: true, force: true });
