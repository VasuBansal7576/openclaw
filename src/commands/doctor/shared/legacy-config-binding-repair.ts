// Repairs canonical binding references after agent config migration.
import { asNullableRecord, isRecord } from "@openclaw/normalization-core/record-coerce";
import { AgentSelectionRequiredError, listAgentIds } from "../../../agents/agent-scope-config.js";
import { listRouteBindings } from "../../../config/bindings.js";
import type { AgentRouteBinding } from "../../../config/types.agents.js";
import type { OpenClawConfig } from "../../../config/types.openclaw.js";
import { normalizeRouteBindingChannelId } from "../../../routing/binding-scope.js";
import { resolveAgentRoute } from "../../../routing/resolve-route.js";
import {
  DEFAULT_ACCOUNT_ID,
  DEFAULT_AGENT_ID,
  normalizeAccountId,
  normalizeAgentId,
} from "../../../routing/session-key.js";
import type { DoctorConfigMutationResult } from "./config-mutation-state.js";
import { listDoctorConfiguredChannelIds } from "./configured-channel-ids.js";

export function pruneBindingsForMissingAgents(
  cfg: OpenClawConfig,
  changes: string[],
): OpenClawConfig {
  const agents = cfg.agents?.list;
  const bindings = cfg.bindings;
  if (!Array.isArray(agents) || agents.length === 0 || !Array.isArray(bindings)) {
    return cfg;
  }

  const validAgents = agents.filter((agent): agent is { id: string } => {
    return agent !== null && typeof agent === "object" && typeof agent.id === "string";
  });
  if (validAgents.length !== agents.length) {
    return cfg;
  }

  const agentIds = new Set(validAgents.map((agent) => normalizeAgentId(agent.id)));
  const nextBindings = bindings.filter((binding) => {
    const agentId = binding && typeof binding === "object" ? binding.agentId : undefined;
    return (
      typeof agentId !== "string" ||
      agentId === DEFAULT_AGENT_ID ||
      agentIds.has(normalizeAgentId(agentId))
    );
  });
  const removed = bindings.length - nextBindings.length;
  if (removed === 0) {
    return cfg;
  }

  changes.push(
    `Removed ${removed} binding${removed === 1 ? "" : "s"} that referenced missing agents.list ids.`,
  );
  return {
    ...cfg,
    ...(nextBindings.length > 0 ? { bindings: nextBindings } : { bindings: undefined }),
  };
}

/** Materialize only channel-account owners already established by narrower route bindings. */
export function repairUnownedChannelAccountBindings(
  cfg: OpenClawConfig,
): DoctorConfigMutationResult {
  const agentIds = new Set(listAgentIds(cfg));
  const additions: AgentRouteBinding[] = [];
  // Leave malformed binding input to config validation; it cannot establish an owner.
  if (
    agentIds.size < 2 ||
    !Array.isArray(cfg.bindings) ||
    !cfg.bindings.every(
      (binding) =>
        isRecord(binding) &&
        isRecord(binding.match) &&
        typeof binding.agentId === "string" &&
        typeof binding.match.channel === "string" &&
        (binding.match.accountId === undefined || typeof binding.match.accountId === "string"),
    )
  ) {
    return { config: cfg, changes: [] };
  }
  const bindings = listRouteBindings(cfg);
  const channelKeys = listDoctorConfiguredChannelIds(cfg, {
    configEntryPolicy: "enabled",
    sort: "codepoint",
  });
  for (const channelKey of channelKeys) {
    const channel = asNullableRecord(cfg.channels?.[channelKey]);
    const channelId = normalizeRouteBindingChannelId(channelKey);
    if (!channel || !channelId) {
      continue;
    }
    const channelBindings = bindings.filter(
      (binding) => normalizeRouteBindingChannelId(binding.match.channel) === channelId,
    );
    const accounts = new Map(
      Object.entries(asNullableRecord(channel.accounts) ?? {}).map(([id, account]) => [
        normalizeAccountId(id),
        account,
      ]),
    );
    if (
      !accounts.has(DEFAULT_ACCOUNT_ID) &&
      (accounts.size === 0 ||
        channelBindings.some(
          (binding) =>
            binding.match.accountId?.trim() !== "*" &&
            normalizeAccountId(binding.match.accountId) === DEFAULT_ACCOUNT_ID,
        ))
    ) {
      accounts.set(DEFAULT_ACCOUNT_ID, {});
    }
    for (const accountId of [...accounts.keys()].toSorted()) {
      if (asNullableRecord(accounts.get(accountId))?.enabled === false) {
        continue;
      }
      try {
        resolveAgentRoute({ cfg, channel: channelId, accountId });
        continue;
      } catch (error) {
        if (!(error instanceof AgentSelectionRequiredError)) {
          throw error;
        }
      }
      const owners = new Set(
        channelBindings
          .filter(
            (binding) =>
              binding.match.accountId?.trim() === "*" ||
              normalizeAccountId(binding.match.accountId) === accountId,
          )
          .map((binding) => normalizeAgentId(binding.agentId)),
      );
      const [agentId] = owners;
      if (owners.size === 1 && agentId && agentIds.has(agentId)) {
        // An exact account fallback preserves narrower precedence and never assigns sibling accounts.
        additions.push({ agentId, match: { channel: channelId, accountId } });
      }
    }
  }
  return {
    config: additions.length ? { ...cfg, bindings: [...cfg.bindings, ...additions] } : cfg,
    changes: additions.map(
      ({ agentId, match }) =>
        `Bound ${match.channel}:${match.accountId} to its sole configured route owner "${agentId}".`,
    ),
  };
}
