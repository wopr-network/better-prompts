import type { LLMCallback } from "./store/types.js";

/**
 * Adapter that turns a running AgentAPI server into an `LLMCallback`.
 *
 * AgentAPI (https://github.com/coder/agentapi) is a separately-installed
 * binary that wraps coding-agent CLIs (Claude Code, Codex, OpenCode, Aider,
 * Goose, Gemini, GitHub Copilot, Sourcegraph Amp, AmazonQ, Auggie, Cursor)
 * behind a uniform HTTP API. Auth is whatever the underlying CLI already
 * has on the host — Claude Code uses OAuth via ~/.claude, Codex uses its
 * own auth, etc.
 *
 * This shim is intentionally minimal:
 *
 *   - No peer dependency. The shim uses global `fetch` and `setTimeout`,
 *     nothing else. `npm install`-ing better-prompts pulls in zero new
 *     packages on account of this file.
 *   - The `agentapi` binary itself is the consumer's responsibility to
 *     install. See https://github.com/coder/agentapi for the curl-based
 *     install. Once installed, run e.g. `agentapi server -- claude`
 *     before using the shim.
 *   - The shim assumes a server is already running. It does not spawn or
 *     manage AgentAPI's lifecycle. Run AgentAPI under your existing
 *     supervisor (systemd, launchd, docker-compose, pm2, your dev shell).
 *
 * Usage:
 *
 * ```typescript
 * import { agentApi } from "@wopr-network/better-prompts/agent-api";
 *
 * const callLLM = agentApi();                          // localhost:3284
 * const callLLM = agentApi({ url: "http://lab:3284" }); // remote
 *
 * await bp.evolve("writer", { reason: "lede repeats", using: callLLM });
 * ```
 *
 * Shape: send the rendered prompt as a user message, poll `/status` until
 * it returns to "stable", read the new agent message from `/messages`,
 * return its content. AgentAPI works by piping the message into a
 * terminal emulator wrapping the agent CLI, so the round-trip latency is
 * dominated by the underlying agent's compute time, not the HTTP layer.
 */

export type AgentApiOptions = {
  /** Base URL of the AgentAPI server. Default `http://localhost:3284`. */
  url?: string;
  /** Polling interval for `/status`. Default 250ms. Lower for snappier
   *  response, higher to reduce server load. */
  pollIntervalMs?: number;
  /** Hard timeout for any one call. Default 10 minutes — agent-loop calls
   *  can be long. Bump for large refactors or shrink for tighter feedback. */
  timeoutMs?: number;
  /** Custom fetch (e.g. for a per-host token). Defaults to global `fetch`. */
  fetch?: typeof fetch;
};

interface AgentApiMessage {
  readonly id?: number;
  readonly role?: string;
  readonly content: string;
  readonly type?: string;
}

interface AgentApiMessages {
  readonly messages: readonly AgentApiMessage[];
}

interface AgentApiStatus {
  readonly status: "stable" | "running" | string;
}

export function agentApi(opts: AgentApiOptions = {}): LLMCallback {
  const url = (opts.url ?? "http://localhost:3284").replace(/\/$/, "");
  const pollIntervalMs = opts.pollIntervalMs ?? 250;
  const timeoutMs = opts.timeoutMs ?? 10 * 60_000;
  const f = opts.fetch ?? globalThis.fetch;

  if (typeof f !== "function") {
    throw new Error(
      "agent-api: global fetch is not available. Pass `fetch` in options or run on Node 18+.",
    );
  }

  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await f(`${url}${path}`, init);
    } catch (err) {
      throw new Error(
        `agent-api: cannot reach AgentAPI server at ${url}. Install the binary from https://github.com/coder/agentapi and start it via e.g. \`agentapi server -- claude\` before invoking. Underlying error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`agent-api: ${init?.method ?? "GET"} ${path} → ${res.status}${body ? ` ${body.slice(0, 200)}` : ""}`);
    }
    return (await res.json()) as T;
  }

  return async (rendered) => {
    // Snapshot the message count before sending so we can identify the
    // new agent reply by index rather than by content equality.
    const before = await call<AgentApiMessages>("/messages");
    const baseline = before.messages.length;

    await call("/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: rendered, type: "user" }),
    });

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const s = await call<AgentApiStatus>("/status");
      if (s.status === "stable") {
        const after = await call<AgentApiMessages>("/messages");
        // Take the new tail and pick the last message that looks like an
        // agent reply. AgentAPI tags messages with `role` ("user"|"agent")
        // OR `type` depending on the underlying agent's TUI; check both
        // and fall back to "anything not from the user" as a guard.
        const tail = after.messages.slice(baseline);
        const agentMsg = [...tail].reverse().find(
          (m) => (m.role && m.role !== "user") || (m.type && m.type !== "user"),
        );
        if (agentMsg) return agentMsg.content;
        // Defensive fallback: tail contains nothing tagged. Take the last
        // message in the tail regardless of role; better to return
        // something than to throw.
        const last = tail[tail.length - 1];
        if (last) return last.content;
      }
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
    throw new Error(
      `agent-api: agent did not return to stable status within ${timeoutMs}ms. Either bump timeoutMs or check the AgentAPI server logs — the underlying agent may be stuck.`,
    );
  };
}
