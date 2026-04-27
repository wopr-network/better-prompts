import type { LLMCallback } from "@wopr-network/better-prompts";

export type ProviderId =
  | "claude-agent"
  | "anthropic"
  | "openai"
  | "openrouter"
  | "bedrock"
  | "vertex";

const PROVIDER_IDS: readonly ProviderId[] = [
  "claude-agent",
  "anthropic",
  "openai",
  "openrouter",
  "bedrock",
  "vertex",
];

function selectProvider(): ProviderId {
  const raw = process.env.BETTER_PROMPTS_PROVIDER ?? "claude-agent";
  if (!PROVIDER_IDS.includes(raw as ProviderId)) {
    throw new Error(
      `BETTER_PROMPTS_PROVIDER="${raw}" is not recognized. Valid: ${PROVIDER_IDS.join(", ")}.`,
    );
  }
  return raw as ProviderId;
}

let cached: Promise<LLMCallback> | null = null;

async function loadProvider(id: ProviderId): Promise<LLMCallback> {
  switch (id) {
    case "claude-agent": {
      const m = await import("./providers/claude-agent");
      return m.make();
    }
    case "anthropic": {
      const m = await import("./providers/anthropic");
      return m.make();
    }
    case "openai": {
      const m = await import("./providers/openai");
      return m.make();
    }
    case "openrouter": {
      const m = await import("./providers/openrouter");
      return m.make();
    }
    case "bedrock": {
      const m = await import("./providers/bedrock");
      return m.make();
    }
    case "vertex": {
      const m = await import("./providers/vertex");
      return m.make();
    }
  }
}

export const ACTIVE_PROVIDER: ProviderId = selectProvider();

/**
 * The single `LLMCallback` the UI hands to invoke and evolve. Provider is
 * selected by `BETTER_PROMPTS_PROVIDER`; provider-specific env vars (api
 * keys, region, project id) are read by the provider module itself.
 *
 * Lazy-loaded so a misconfigured provider's SDK isn't constructed until the
 * first request — keeps boot fast and keeps unrelated SDK errors from
 * crashing the dev server when only one provider is wanted.
 */
export const callLLM: LLMCallback = async (rendered) => {
  if (!cached) cached = loadProvider(ACTIVE_PROVIDER);
  const cb = await cached;
  return cb(rendered);
};
