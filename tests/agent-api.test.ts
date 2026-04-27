import { describe, it, expect } from "vitest";

import { betterPrompts } from "../src/index.js";
import { SqliteStore } from "../src/store/index.js";
import { agentApi } from "../src/agent-api.js";

/**
 * The shim's only external dependency is global `fetch`. Test by stubbing
 * a fetch that mimics AgentAPI's HTTP surface — proves the LLMCallback
 * shape, the polling loop, and the message-tail parsing without needing
 * the actual `agentapi` binary running.
 */

type StubServer = {
  fetch: typeof fetch;
  setAgentReply: (content: string) => void;
};

function makeStub(): StubServer {
  let messages: { role: string; content: string; type?: string }[] = [];
  let nextAgentReply = "stub agent reply";
  let pendingResolve = false;

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    const path = new URL(url).pathname;

    if (path === "/messages" && (!init || init.method === undefined || init.method === "GET")) {
      return new Response(JSON.stringify({ messages }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (path === "/message" && init?.method === "POST") {
      const body = JSON.parse(init.body as string) as { content: string; type: string };
      messages.push({ role: "user", content: body.content, type: "user" });
      // Schedule an agent reply on the next tick — simulates the agent
      // becoming "running" then "stable" with a new message.
      pendingResolve = true;
      setTimeout(() => {
        messages.push({ role: "agent", content: nextAgentReply });
        pendingResolve = false;
      }, 30);
      return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
    }

    if (path === "/status") {
      return new Response(
        JSON.stringify({ status: pendingResolve ? "running" : "stable" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response("not found", { status: 404 });
  };

  return {
    fetch: fetchImpl,
    setAgentReply: (content) => {
      nextAgentReply = content;
    },
  };
}

describe("agent-api shim", () => {
  it("posts the rendered prompt and returns the agent's reply", async () => {
    const stub = makeStub();
    stub.setAgentReply("Rewritten body from a stubbed agent.");

    const callLLM = agentApi({ fetch: stub.fetch, pollIntervalMs: 10 });
    const out = await callLLM("Test prompt body.");
    expect(out).toBe("Rewritten body from a stubbed agent.");
  });

  it("drives bp.evolve end-to-end against the stub", async () => {
    const stub = makeStub();
    stub.setAgentReply("Evolved prompt body.");

    const bp = betterPrompts({ store: new SqliteStore({ path: ":memory:" }) });
    const callLLM = agentApi({ fetch: stub.fetch, pollIntervalMs: 10 });

    await bp.set("writer", "Original body.");
    const result = await bp.evolve("writer", { reason: "tighten the lede", using: callLLM });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.revision.version).toBe(2);
      expect(result.revision.source).toBe("evolution");
      expect(result.revision.body).toBe("Evolved prompt body.");
    }
  });

  it("throws a teaching error when the server is unreachable", async () => {
    const failingFetch: typeof fetch = async () => {
      throw new Error("ECONNREFUSED");
    };
    const callLLM = agentApi({ fetch: failingFetch, url: "http://localhost:9999" });
    await expect(callLLM("anything")).rejects.toThrow(
      /cannot reach AgentAPI server at http:\/\/localhost:9999/,
    );
  });

  it("throws when the agent never returns to stable within timeout", async () => {
    const stuckFetch: typeof fetch = async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      const path = new URL(url).pathname;
      if (path === "/messages") return new Response(JSON.stringify({ messages: [] }));
      if (path === "/message") return new Response("{}");
      if (path === "/status") return new Response(JSON.stringify({ status: "running" }));
      return new Response("nope", { status: 404 });
    };
    const callLLM = agentApi({ fetch: stuckFetch, pollIntervalMs: 5, timeoutMs: 30 });
    await expect(callLLM("anything")).rejects.toThrow(/did not return to stable/);
  });
});
