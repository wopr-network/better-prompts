import { AnthropicVertex } from "@anthropic-ai/vertex-sdk";
import type { LLMCallback } from "@wopr-network/better-prompts";

/**
 * Anthropic models on Google Cloud Vertex AI. GCP credentials are read
 * via Application Default Credentials (env, `gcloud auth application-default
 * login`, GCE/GKE metadata server, etc.). Region from `CLOUD_ML_REGION` and
 * project from `ANTHROPIC_VERTEX_PROJECT_ID`. Model id is Vertex-specific,
 * e.g. `claude-sonnet-4@20250514` — supply via `BETTER_PROMPTS_MODEL`.
 */
export function make(): LLMCallback {
  const model = process.env.BETTER_PROMPTS_MODEL;
  if (!model) {
    throw new Error(
      "BETTER_PROMPTS_MODEL is required when BETTER_PROMPTS_PROVIDER=vertex (e.g. claude-sonnet-4@20250514).",
    );
  }
  const client = new AnthropicVertex({
    region: process.env.CLOUD_ML_REGION,
    projectId: process.env.ANTHROPIC_VERTEX_PROJECT_ID,
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
      throw new Error(`vertex: unexpected content type: ${first?.type ?? "(empty)"}`);
    }
    return first.text;
  };
}
