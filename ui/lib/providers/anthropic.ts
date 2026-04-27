import Anthropic from "@anthropic-ai/sdk";
import type { LLMCallback } from "@wopr-network/better-prompts";

/**
 * Anthropic Messages API. Direct API key auth via `ANTHROPIC_API_KEY`.
 * The default for users without a Claude subscription / mounted credentials.
 */
export function make(): LLMCallback {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is required when BETTER_PROMPTS_PROVIDER=anthropic. Get one from console.anthropic.com.",
    );
  }
  const client = new Anthropic({ apiKey });
  const model = process.env.BETTER_PROMPTS_MODEL ?? "claude-sonnet-4-6";
  const maxTokens = Number(process.env.BETTER_PROMPTS_MAX_TOKENS ?? 8192);

  return async (rendered) => {
    const res = await client.messages.create({
      model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: rendered }],
    });
    const first = res.content[0];
    if (!first || first.type !== "text") {
      throw new Error(`anthropic: unexpected content type: ${first?.type ?? "(empty)"}`);
    }
    return first.text;
  };
}
