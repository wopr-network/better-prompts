import OpenAI from "openai";
import type { LLMCallback } from "@wopr-network/better-prompts";

/**
 * OpenRouter — multi-provider gateway. Same shape as OpenAI's SDK with
 * a different base URL. Auth via `OPENROUTER_API_KEY`. Model ids use
 * provider-prefixed slugs: `anthropic/claude-sonnet-4.6`,
 * `openai/gpt-4o`, `meta-llama/llama-3.1-405b-instruct`, etc. Set via
 * `BETTER_PROMPTS_MODEL`. Optional referrer / app headers for OpenRouter's
 * leaderboards: `OPENROUTER_REFERER`, `OPENROUTER_APP_TITLE`.
 */
export function make(): LLMCallback {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is required when BETTER_PROMPTS_PROVIDER=openrouter. Get one from openrouter.ai.",
    );
  }
  const client = new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      ...(process.env.OPENROUTER_REFERER ? { "HTTP-Referer": process.env.OPENROUTER_REFERER } : {}),
      ...(process.env.OPENROUTER_APP_TITLE ? { "X-Title": process.env.OPENROUTER_APP_TITLE } : {}),
    },
  });
  const model = process.env.BETTER_PROMPTS_MODEL ?? "anthropic/claude-sonnet-4.6";
  const maxTokens = process.env.BETTER_PROMPTS_MAX_TOKENS
    ? Number(process.env.BETTER_PROMPTS_MAX_TOKENS)
    : undefined;

  return async (rendered) => {
    const res = await client.chat.completions.create({
      model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: rendered }],
    });
    const text = res.choices[0]?.message?.content;
    if (typeof text !== "string") {
      throw new Error(`openrouter: empty or non-string response (finish_reason=${res.choices[0]?.finish_reason})`);
    }
    return text;
  };
}
