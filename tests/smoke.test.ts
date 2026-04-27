import { describe, it, expect } from "vitest";

import { betterPrompts } from "../src/index.js";
import { SqliteStore } from "../src/store/index.js";
import type { LLMCallback } from "../src/store/types.js";

/** Trivial renderer the consumer would normally write themselves. */
function render(body: string, vars: Record<string, string>): string {
  let out = body;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`\${${k}}`, v).replaceAll(`{{${k}}}`, v);
  }
  return out;
}

const DEFAULT_HUMANIZER = `Rewrite the content at \${directoryPath} to read like a human. Save to {{reportFile}}.`;

/** A stub the consumer would normally wire to their real LLM. Used only by `evolve`. */
function evolverThatReturns(body: string): LLMCallback {
  return async () => body;
}

describe("better-prompts substrate", () => {
  it("get → render → consumer-call → record → signal → evolve end-to-end", async () => {
    const store = new SqliteStore({ path: ":memory:" });
    const bp = betterPrompts({ store });

    // 1. Seed the artifact.
    const r1 = await bp.set("humanizer", DEFAULT_HUMANIZER);
    expect(r1.version).toBe(1);
    expect(r1.source).toBe("seed");
    expect(r1.body).toBe(DEFAULT_HUMANIZER);

    // 2. Consumer renders + calls their LLM (faked here) + records.
    const vars = { directoryPath: "/x", reportFile: "out.md" };
    const rendered = render(r1.body, vars);
    expect(rendered).toContain("/x");
    const consumerLLMOutput = `mock LLM output for ${rendered.slice(0, 30)}`;
    const inv = await bp.record({
      artifactKey: "humanizer",
      revisionId: r1.id,
      vars,
      output: consumerLLMOutput,
    });
    expect(inv.revisionId).toBe(r1.id);
    expect(inv.output).toBe(consumerLLMOutput);

    // 3. Signal.
    const sig = await bp.signal(inv.id, {
      verdict: "fail",
      reason: "lede repeated",
      source: "test",
    });
    expect(sig.verdict).toBe("fail");
    expect(sig.invocationId).toBe(inv.id);

    // 4. Evolve. The `using` callback is the only place an LLM enters the substrate.
    const evolveResult = await bp.evolve("humanizer", {
      reason: "validator flagged duplicates",
      using: evolverThatReturns(
        `Rewritten v2: handle \${directoryPath} more carefully. {{reportFile}} unchanged.`,
      ),
    });
    expect(evolveResult.ok).toBe(true);
    if (evolveResult.ok) {
      expect(evolveResult.revision.version).toBe(2);
      expect(evolveResult.revision.source).toBe("evolution");
      expect(evolveResult.revision.body).toContain("Rewritten v2");
      expect(evolveResult.invocation.artifactKey).toBe("_enhancer");
    }

    // 5. _enhancer was seeded as a side effect.
    const enhancer = await store.latestRevision("_enhancer");
    expect(enhancer).not.toBeNull();
    expect(enhancer?.source).toBe("seed");
    expect(enhancer?.body).toContain("ULTIMATE PROMPT ENHANCEMENT ENGINE");

    // 6. History.
    const chain = await bp.history("humanizer");
    expect(chain.length).toBe(2);
    expect(chain[0]?.version).toBe(2);
    expect(chain[1]?.version).toBe(1);

    store.close();
  });

  it("evolve stores whatever the LLM returns (no preservation check)", async () => {
    const store = new SqliteStore({ path: ":memory:" });
    const bp = betterPrompts({ store });

    const r1 = await bp.set("test", "default with ${x}");
    const inv = await bp.record({
      artifactKey: "test",
      revisionId: r1.id,
      vars: { x: "value" },
      output: "irrelevant",
    });
    await bp.signal(inv.id, { verdict: "fail", reason: "bad" });

    // The candidate body deliberately drops ${x}. Library doesn't care; that's
    // a contract between the consumer and their renderer. The new revision lands.
    const result = await bp.evolve("test", {
      reason: "fix it",
      using: evolverThatReturns("body that has lost its tokens entirely"),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.revision.version).toBe(2);
      expect(result.revision.body).toBe("body that has lost its tokens entirely");
    }

    store.close();
  });

  it("evolve runs without any telemetry — reason alone is enough", async () => {
    const store = new SqliteStore({ path: ":memory:" });
    const bp = betterPrompts({ store });

    const r1 = await bp.set("blind", "original body");
    expect(r1.version).toBe(1);

    // No record, no signal — straight to evolve.
    const result = await bp.evolve("blind", {
      reason: "this prompt feels wrong; rewrite it to be sharper",
      using: evolverThatReturns("rewritten body"),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.revision.version).toBe(2);
      expect(result.revision.source).toBe("evolution");
      expect(result.revision.body).toBe("rewritten body");
    }

    store.close();
  });

  it("set unconditionally appends a manual revision", async () => {
    const store = new SqliteStore({ path: ":memory:" });
    const bp = betterPrompts({ store });

    const v1 = await bp.set("art", "v1 body \${x}");
    expect(v1.version).toBe(1);

    const v2 = await bp.set("art", "v2 body \${x}");
    expect(v2.version).toBe(2);
    expect(v2.source).toBe("manual");
    expect(v2.body).toBe("v2 body ${x}");

    // set on a non-existent key seeds it.
    const fresh = await bp.set("brand-new", "fresh body");
    expect(fresh.version).toBe(1);
    expect(fresh.source).toBe("seed");

    store.close();
  });

  it("rollback appends a new revision with the target body", async () => {
    const store = new SqliteStore({ path: ":memory:" });
    const bp = betterPrompts({ store });

    const v1 = await bp.set("art", "v1 body \${x}");

    const future = new Date(Date.now() + 60_000).toISOString();
    const v2 = await bp.get("art", "v2 body \${x}", future);
    expect(v2.version).toBe(2);

    const rolled = await bp.rollback("art", 1);
    expect(rolled.version).toBe(3);
    expect(rolled.source).toBe("rollback");
    expect(rolled.body).toBe(v1.body);

    const head = await store.latestRevision("art");
    expect(head?.body).toBe(v1.body);
    expect(head?.version).toBe(3);

    store.close();
  });

  it("get(key) returns the head when seeded; throws when missing", async () => {
    const store = new SqliteStore({ path: ":memory:" });
    const bp = betterPrompts({ store });

    // Throws when nothing's seeded.
    await expect(bp.get("never-seeded")).rejects.toThrow(/not found/);

    // Two-argument bp.get(key, body) is invalid — throws with the
    // migration-shape pointer.
    await expect(bp.get("via-twoarg", "v1 body")).rejects.toThrow(
      /missing the third argument|discriminator/,
    );

    // Seed it explicitly via bp.set, then key-only read returns the head.
    await bp.set("seeded", "v1 body");
    const r = await bp.get("seeded");
    expect(r.version).toBe(1);
    expect(r.body).toBe("v1 body");

    // bp.set always appends. Second call creates v2; there is no idempotent
    // seed verb in the substrate (consumers compose existence-check + set
    // when they want first-writer-wins semantics).
    const v2 = await bp.set("seeded", "v2 body");
    expect(v2.version).toBe(2);
    expect(v2.source).toBe("manual");

    store.close();
  });

  it("codeDate merge: source-newer-than-store appends a manual revision", async () => {
    const store = new SqliteStore({ path: ":memory:" });
    const bp = betterPrompts({ store });

    const past = new Date(Date.now() - 86_400_000).toISOString();
    const v1 = await bp.get("art", "v1 ${x}", past);
    expect(v1.version).toBe(1);
    expect(v1.source).toBe("seed");

    const future = new Date(Date.now() + 86_400_000).toISOString();
    const v2 = await bp.get("art", "v2 ${x}", future);
    expect(v2.version).toBe(2);
    expect(v2.source).toBe("manual");
    expect(v2.body).toBe("v2 ${x}");

    const v3 = await bp.get("art", "v3 ${x}", past);
    expect(v3.version).toBe(2);
    expect(v3.body).toBe("v2 ${x}");

    store.close();
  });
});
