import { query } from "@anthropic-ai/claude-agent-sdk";
import type { LLMCallback } from "@wopr-network/better-prompts";

/**
 * Claude Agent SDK provider. Uses the user's local Claude credentials
 * (`~/.claude` on dev machines; mount the same path into containers for
 * deploys). No API key required. Model overridable via
 * `BETTER_PROMPTS_MODEL`; default tracks the current Sonnet.
 */
export function make(): LLMCallback {
  const model = process.env.BETTER_PROMPTS_MODEL ?? "claude-sonnet-4-6";
  return async (rendered) => {
    let lastResult: string | null = null;
    for await (const message of query({
      prompt: rendered,
      options: { model, allowedTools: [] },
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
