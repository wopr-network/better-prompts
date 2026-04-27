import { query } from "@anthropic-ai/claude-agent-sdk";
import type { LLMCallback } from "./store/types.js";

/**
 * Adapter that wraps the Claude Agent SDK as an `LLMCallback`.
 *
 * Auth: OAuth via the user's existing Claude credentials at `~/.claude`
 * (set up by running `claude` locally and signing in). No API key. Best
 * for personal-machine development. For container deploys, mount the
 * host's `~/.claude` into the worker container.
 *
 * Optional peer dependency on `@anthropic-ai/claude-agent-sdk` — install
 * only if you import this module. SQLite-only / non-evolve consumers
 * never load it.
 *
 * ```typescript
 * import { claudeAgent } from "@wopr-network/better-prompts/claude-agent";
 *
 * const callLLM = claudeAgent();
 * const callLLM = claudeAgent({ model: "claude-opus-4-7" });
 *
 * await bp.evolve("writer", { reason: "...", using: callLLM });
 * ```
 */

export type ClaudeAgentOptions = {
  /** Model id (e.g. "claude-sonnet-4-6", "claude-opus-4-7"). Default tracks Sonnet. */
  model?: string;
  /** Optional system prompt prepended to every call. */
  systemPrompt?: string;
  /** Allowed tool names. Defaults to [] — pure text generation, no tools. */
  allowedTools?: string[];
  /** Per-call max turns. Omitted by default; SDK applies its own. */
  maxTurns?: number;
};

export function claudeAgent(opts: ClaudeAgentOptions = {}): LLMCallback {
  const model = opts.model ?? "claude-sonnet-4-6";

  return async (rendered) => {
    let lastResult: string | null = null;
    for await (const message of query({
      prompt: rendered,
      options: {
        model,
        systemPrompt: opts.systemPrompt,
        allowedTools: opts.allowedTools ?? [],
        maxTurns: opts.maxTurns,
      },
    })) {
      if (message.type === "result") {
        const r = (message as { result?: unknown }).result;
        if (typeof r === "string") lastResult = r;
      }
    }
    if (lastResult === null) {
      throw new Error("claude-agent: no result message received");
    }
    return lastResult;
  };
}
