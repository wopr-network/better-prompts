import OpenAI from "openai";
import type { LLMCallback } from "@wopr-network/better-prompts";

/**
 * OpenAI Chat Completions provider. Auth via `OPENAI_API_KEY`. Model id is
 * any string OpenAI accepts — `gpt-4o`, `gpt-4o-mini`, `gpt-4o-codex`,
 * `o1-preview`, etc. Set via `BETTER_PROMPTS_MODEL`. `OPENAI_BASE_URL` works
 * for self-hosted gateways or compatible proxies.
 */
export function make(): LLMCallback {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is required when BETTER_PROMPTS_PROVIDER=openai. Get one from platform.openai.com.",
    );
  }
  const client = new OpenAI({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL,
  });
  const model = process.env.BETTER_PROMPTS_MODEL ?? "gpt-4o";
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
      throw new Error(`openai: empty or non-string response (finish_reason=${res.choices[0]?.finish_reason})`);
    }
    return text;
  };
}
