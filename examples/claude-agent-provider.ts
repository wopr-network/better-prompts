import { query } from "@anthropic-ai/claude-agent-sdk";

import type { LLMCallback } from "../src/store/types.js";

export type ClaudeAgentProviderOptions = {
  /** Model id, e.g. "claude-opus-4-7" or "claude-sonnet-4-6". */
  model?: string;
  /** Per-call max turns. Omitted by default — the SDK applies its own. */
  maxTurns?: number;
  /** Allowed tool names. Defaults to [] (pure text generation, no tools). */
  allowedTools?: string[];
  /** Optional system prompt prepended to every call. */
  systemPrompt?: string;
  /**
   * When true, every message coming back from the SDK is logged to stderr with
   * timing relative to the start of the call. Useful for bring-up debugging.
   * Defaults to the value of `process.env.BETTER_PROMPTS_DEBUG === "1"`.
   */
  debug?: boolean;
  /** Per-message JSON dump cap. Defaults to 2000 chars. */
  maxLogChars?: number;
};

export function claudeAgentProvider(opts: ClaudeAgentProviderOptions = {}): LLMCallback {
  const debug = opts.debug ?? process.env.BETTER_PROMPTS_DEBUG === "1";
  const maxLog = opts.maxLogChars ?? 2000;

  return async (rendered) => {
    const t0 = Date.now();
    if (debug) {
      console.error(
        `\n[claude-agent] >>> request (${rendered.length} chars, model=${opts.model ?? "(default)"})`,
      );
      console.error(`[claude-agent] prompt preview: ${preview(rendered, 400)}`);
    }

    let lastResult: string | null = null;
    let messageCount = 0;

    for await (const message of query({
      prompt: rendered,
      options: {
        model: opts.model,
        systemPrompt: opts.systemPrompt,
        allowedTools: opts.allowedTools ?? [],
        maxTurns: opts.maxTurns,
      },
    })) {
      messageCount++;
      const dt = Date.now() - t0;

      if (debug) {
        const dump = truncate(safeStringify(message), maxLog);
        console.error(`[claude-agent +${dt}ms #${messageCount} type=${typeof message.type === "string" ? message.type : "?"}]`);
        console.error(dump);
      }

      if (message.type === "result") {
        const r = (message as { result?: unknown }).result;
        if (typeof r === "string") lastResult = r;
      }
    }

    if (debug) {
      const total = Date.now() - t0;
      console.error(
        `[claude-agent] <<< done (${messageCount} messages, ${total}ms total, ${lastResult?.length ?? 0} chars in result)`,
      );
    }

    if (lastResult === null) {
      throw new Error("Claude Agent SDK: no result message received");
    }
    return lastResult;
  };
}

function preview(s: string, n: number): string {
  const oneLine = s.replace(/\s+/g, " ").trim();
  return oneLine.length <= n ? oneLine : `${oneLine.slice(0, n)}…`;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n)}…(+${s.length - n} chars truncated)`;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2);
  } catch {
    return String(value);
  }
}
