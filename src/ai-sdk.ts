import { generateText, type LanguageModel } from "ai";
import type { LLMCallback } from "./store/types.js";

/**
 * Adapter that turns any [Vercel AI SDK](https://ai-sdk.dev) `LanguageModel`
 * into an `LLMCallback`. Covers ~30 commodity LLM providers — Anthropic,
 * OpenAI, Google (Gemini / Vertex), Bedrock, OpenRouter, Mistral, Groq,
 * Cohere, xAI, and dozens more — through a single uniform interface. The
 * consumer brings whichever provider package fits their auth shape:
 *
 * ```typescript
 * import { generateText } from "ai";
 * import { anthropic } from "@ai-sdk/anthropic";
 * import { openai } from "@ai-sdk/openai";
 * import { aiSdk } from "@wopr-network/better-prompts/ai-sdk";
 *
 * const callLLM = aiSdk({ model: anthropic("claude-sonnet-4-6") });
 * const callLLM = aiSdk({ model: openai("gpt-4o") });
 * const callLLM = aiSdk({ model: openai("gpt-4o-codex") });
 *
 * await bp.evolve("writer", { reason: "...", using: callLLM });
 * ```
 *
 * Optional peer dependency on `ai`. The provider packages
 * (`@ai-sdk/anthropic`, `@ai-sdk/openai`, etc.) are the consumer's choice
 * and are not the library's concern — install only what your app uses.
 *
 * For OAuth-via-`~/.claude` (Claude Max subscription), use
 * `@wopr-network/better-prompts/claude-agent` instead — Vercel's AI SDK
 * uses API-key auth for Anthropic, not the OAuth flow.
 *
 * For agent-loop CLIs (Claude Code, Codex, OpenCode, Aider, Goose, etc.),
 * use `@wopr-network/better-prompts/agent-api` — the AI SDK is for
 * single-shot chat completion, not the agent-loop shape.
 */

export type AiSdkOptions = {
  /** Any AI SDK LanguageModel — anthropic("..."), openai("..."), etc. */
  model: LanguageModel;
  /** Optional system prompt prepended to every call. */
  system?: string;
  /** Cap on response tokens. The SDK will throw if the model would exceed it. */
  maxOutputTokens?: number;
  /** Sampling temperature. Provider-specific clamping applies. */
  temperature?: number;
};

export function aiSdk(opts: AiSdkOptions): LLMCallback {
  return async (rendered) => {
    const { text } = await generateText({
      model: opts.model,
      system: opts.system,
      prompt: rendered,
      maxOutputTokens: opts.maxOutputTokens,
      temperature: opts.temperature,
    });
    return text;
  };
}
