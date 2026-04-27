import { describe, it, expect } from "vitest";
import { createStorage } from "unstorage";
import memoryDriver from "unstorage/drivers/memory";

import { betterPrompts } from "../src/index.js";
import { KVStore } from "../src/store/kv/index.js";
import type { LLMCallback } from "../src/store/types.js";

/**
 * Same end-to-end shape as the SqliteStore smoke tests, but driven through
 * unstorage's memory driver. Proves that anything implementing the
 * unstorage Storage interface works against the library's full API.
 *
 * If this passes, every other unstorage driver (redis, fs, vercel-kv,
 * cloudflare-kv, mongodb, s3, dynamodb, indexeddb, etc.) gets the same
 * guarantees — they all satisfy the same Storage contract.
 */

function evolverThatReturns(body: string): LLMCallback {
  return async () => body;
}

describe("KVStore via unstorage memory driver", () => {
  it("supports the full evolve loop", async () => {
    const storage = createStorage({ driver: memoryDriver() });
    const store = new KVStore({ storage, keyPrefix: "test" });
    const bp = betterPrompts({ store });

    // Seed
    const r1 = await bp.set("humanizer", "Default body with ${var}");
    expect(r1.version).toBe(1);
    expect(r1.source).toBe("seed");
    expect(r1.body).toBe("Default body with ${var}");

    // Record
    const inv = await bp.record({
      artifactKey: "humanizer",
      revisionId: r1.id,
      vars: { var: "x" },
      output: "the LLM said something",
    });
    expect(inv.id).toBeTruthy();
    expect(inv.revisionId).toBe(r1.id);

    // Signal
    const sig = await bp.signal(inv.id, {
      verdict: "fail",
      reason: "lede repeated",
    });
    expect(sig.verdict).toBe("fail");

    // Evolve (uses the seeded _enhancer artifact internally)
    const result = await bp.evolve("humanizer", {
      reason: "fix the repetition",
      using: evolverThatReturns("Rewritten body with ${var}"),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.revision.version).toBe(2);
      expect(result.revision.source).toBe("evolution");
      expect(result.revision.body).toBe("Rewritten body with ${var}");
      // _enhancer was seeded as a side effect.
      expect(result.invocation.artifactKey).toBe("_enhancer");
    }

    // History
    const chain = await bp.history("humanizer");
    expect(chain.length).toBe(2);
    expect(chain[0]?.version).toBe(2);
    expect(chain[1]?.version).toBe(1);

    // The library seeds _enhancer the first time evolve runs.
    const keys = await bp.list();
    expect(keys).toContain("humanizer");
    expect(keys).toContain("_enhancer");
  });

  it("invocation queries are revision-scoped and artifact-scoped, newest-first", async () => {
    const storage = createStorage({ driver: memoryDriver() });
    const store = new KVStore({ storage });
    const bp = betterPrompts({ store });

    const r1 = await bp.set("art", "body");
    // Record three invocations, slightly spaced to keep timestamps ordered.
    const a = await bp.record({ artifactKey: "art", revisionId: r1.id, output: "1" });
    await new Promise((r) => setTimeout(r, 5));
    const b = await bp.record({ artifactKey: "art", revisionId: r1.id, output: "2" });
    await new Promise((r) => setTimeout(r, 5));
    const c = await bp.record({ artifactKey: "art", revisionId: r1.id, output: "3" });

    const recent = await bp.invocations("art");
    expect(recent.map((i) => i.id)).toEqual([c.id, b.id, a.id]);
  });

  it("rollback appends a new revision with the target body", async () => {
    const storage = createStorage({ driver: memoryDriver() });
    const store = new KVStore({ storage });
    const bp = betterPrompts({ store });

    const v1 = await bp.set("art", "v1");
    const future = new Date(Date.now() + 60_000).toISOString();
    const v2 = await bp.get("art", "v2", future);
    expect(v2.version).toBe(2);

    const rolled = await bp.rollback("art", 1);
    expect(rolled.version).toBe(3);
    expect(rolled.source).toBe("rollback");
    expect(rolled.body).toBe(v1.body);
  });

  it("listArtifactKeys returns sorted unique keys", async () => {
    const storage = createStorage({ driver: memoryDriver() });
    const store = new KVStore({ storage });
    const bp = betterPrompts({ store });

    await bp.set("zebra", "z");
    await bp.set("alpha", "a");
    await bp.set("middle", "m");
    // Multiple revisions of the same key shouldn't duplicate.
    await bp.set("alpha", "a2");

    const keys = await bp.list();
    expect(keys).toEqual(["alpha", "middle", "zebra"]);
  });
});
