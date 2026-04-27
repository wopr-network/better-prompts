import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { betterPrompts } from "../src/index.js";
import { SqliteStore } from "../src/store/index.js";

describe("bp.fromFile", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "bp-file-test-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("seeds from disk on first call, returns the active revision afterward", async () => {
    const path = join(dir, "writer.hbs");
    writeFileSync(path, "Write a {{kind}}.");

    const bp = betterPrompts({ store: new SqliteStore({ path: ":memory:" }) });

    const r1 = await bp.fromFile(path);
    expect(r1.version).toBe(1);
    expect(r1.source).toBe("seed");
    expect(r1.body).toBe("Write a {{kind}}.");
    // Default key derived from basename-without-extension.
    expect(r1.artifactKey).toBe("writer");

    // Same call again returns the head — no new revision unless the file
    // mtime advanced.
    const r2 = await bp.fromFile(path);
    expect(r2.id).toBe(r1.id);
    expect(r2.version).toBe(1);
  });

  it("appends a manual revision when the file mtime advances", async () => {
    const path = join(dir, "writer.hbs");
    writeFileSync(path, "v1 body");
    const past = new Date(Date.now() - 60_000);
    utimesSync(path, past, past);

    const bp = betterPrompts({ store: new SqliteStore({ path: ":memory:" }) });

    const r1 = await bp.fromFile(path);
    expect(r1.version).toBe(1);
    expect(r1.body).toBe("v1 body");

    // Bump mtime + content.
    writeFileSync(path, "v2 body");
    const future = new Date(Date.now() + 60_000);
    utimesSync(path, future, future);

    const r2 = await bp.fromFile(path);
    expect(r2.version).toBe(2);
    expect(r2.source).toBe("manual");
    expect(r2.body).toBe("v2 body");
  });

  it("respects an explicit key", async () => {
    const path = join(dir, "tweet.hbs");
    writeFileSync(path, "tweet body");

    const bp = betterPrompts({ store: new SqliteStore({ path: ":memory:" }) });
    const r = await bp.fromFile(path, { key: "social.tweet" });
    expect(r.artifactKey).toBe("social.tweet");
    expect((await bp.list()).includes("social.tweet")).toBe(true);
  });

  it("accepts URL input (resolves via fileURLToPath)", async () => {
    const path = join(dir, "intro.md");
    writeFileSync(path, "intro body");
    const url = new URL(`file://${path}`);

    const bp = betterPrompts({ store: new SqliteStore({ path: ":memory:" }) });
    const r = await bp.fromFile(url);
    expect(r.body).toBe("intro body");
    expect(r.artifactKey).toBe("intro");
  });
});
