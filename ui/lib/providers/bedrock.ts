import { AnthropicBedrock } from "@anthropic-ai/bedrock-sdk";
import type { LLMCallback } from "@wopr-network/better-prompts";

/**
 * Anthropic models on AWS Bedrock. AWS credentials are read from the
 * standard AWS SDK chain (env, `~/.aws/credentials`, IAM role, etc.).
 * Region from `AWS_REGION`. Model id is Bedrock-specific, e.g.
 * `us.anthropic.claude-sonnet-4-20250514-v1:0` — supply via
 * `BETTER_PROMPTS_MODEL`.
 */
export function make(): LLMCallback {
  const model = process.env.BETTER_PROMPTS_MODEL;
  if (!model) {
    throw new Error(
      "BETTER_PROMPTS_MODEL is required when BETTER_PROMPTS_PROVIDER=bedrock (e.g. us.anthropic.claude-sonnet-4-20250514-v1:0).",
    );
  }
  const client = new AnthropicBedrock({
    awsRegion: process.env.AWS_REGION,
  });
  const maxTokens = Number(process.env.BETTER_PROMPTS_MAX_TOKENS ?? 8192);

  return async (rendered) => {
    const res = await client.messages.create({
      model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: rendered }],
    });
    const first = res.content[0];
    if (!first || first.type !== "text") {
      throw new Error(`bedrock: unexpected content type: ${first?.type ?? "(empty)"}`);
    }
    return first.text;
  };
}
