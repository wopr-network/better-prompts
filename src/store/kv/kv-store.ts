import type { Storage } from "unstorage";
import { randomUUID } from "node:crypto";

import type {
  Revision,
  Invocation,
  Signal,
  Store,
} from "../types.js";

/**
 * Key-Value backed Store. Wraps any `unstorage` Storage instance —
 * the consumer brings whichever driver fits their stack: memory, fs,
 * Redis, Vercel KV, Cloudflare KV, Upstash, IndexedDB, S3, MongoDB,
 * DynamoDB, GitHub, etc. (~30 drivers ship with unstorage; more in
 * the community).
 *
 * ```typescript
 * import { createStorage } from "unstorage";
 * import redisDriver from "unstorage/drivers/redis";
 * import { KVStore } from "@wopr-network/better-prompts/store/kv";
 *
 * const storage = createStorage({
 *   driver: redisDriver({ url: process.env.REDIS_URL!, base: "bp" }),
 * });
 * const store = new KVStore({ storage });
 * ```
 *
 * Key layout (keyPrefix configurable, default `""` since most drivers
 * support their own `base` namespacing):
 *
 *   art:{artifactKey}                                → marker (lists artifact keys)
 *   rev:{revisionId}                                 → Revision JSON
 *   rev-by-art:{artifactKey}:{paddedVersion}         → revisionId
 *   inv:{invocationId}                               → Invocation JSON
 *   inv-by-rev:{revisionId}:{paddedTs}:{invId}       → marker
 *   inv-by-art:{artifactKey}:{paddedTs}:{invId}      → marker
 *   sig:{signalId}                                   → Signal JSON
 *   sig-by-inv:{invocationId}:{paddedTs}:{sigId}     → marker
 *
 * Padding is fixed-width so lexical sort matches numeric sort. Listing
 * uses unstorage's `getKeys(prefix)` which every driver implements.
 *
 * Atomicity caveat: each operation issues 1-3 setItem calls. Drivers do
 * not provide cross-key transactions, so a process crash mid-write can
 * leave the by-* indexes pointing at an entity that doesn't exist (or
 * vice versa). Reads dereference + skip on miss, so the store is
 * self-healing — a missing entity simply doesn't show up in lists.
 * For deployments where this matters, ship a Store impl over a real
 * transactional backend (the SqliteStore default already is one).
 */
export type KVStoreOptions = {
  storage: Storage;
  keyPrefix?: string;
};

const VERSION_WIDTH = 10;
const TIMESTAMP_WIDTH = 17; // ISO ms timestamp ranges to year ~5138

function padVersion(v: number): string {
  return String(v).padStart(VERSION_WIDTH, "0");
}

function padTimestamp(iso: string): string {
  // Convert ISO date to ms-since-epoch for sortable padding. Stable per
  // the original ISO via the back-half so two ms-equal writes still
  // get distinct keys (caller appends the entity id).
  return String(new Date(iso).getTime()).padStart(TIMESTAMP_WIDTH, "0");
}

export class KVStore implements Store {
  private readonly s: Storage;
  private readonly p: string;

  constructor(options: KVStoreOptions) {
    this.s = options.storage;
    this.p = options.keyPrefix ?? "";
  }

  // ── revisions ──────────────────────────────────────────────────────────

  async appendRevision(rev: Omit<Revision, "id">): Promise<Revision> {
    const full: Revision = { id: randomUUID(), ...rev };
    await Promise.all([
      this.s.setItem(this.k(`rev:${full.id}`), full as unknown as string),
      this.s.setItem(this.k(`rev-by-art:${full.artifactKey}:${padVersion(full.version)}`), full.id),
      this.s.setItem(this.k(`art:${full.artifactKey}`), 1),
    ]);
    return full;
  }

  async latestRevision(artifactKey: string): Promise<Revision | null> {
    const prefix = this.k(`rev-by-art:${artifactKey}:`);
    const keys = await this.s.getKeys(prefix);
    keys.sort();
    const latestKey = keys[keys.length - 1];
    if (!latestKey) return null;
    const id = (await this.s.getItem(latestKey)) as string | null;
    return id ? this.revision(id) : null;
  }

  async revision(id: string): Promise<Revision | null> {
    return ((await this.s.getItem(this.k(`rev:${id}`))) as Revision | null) ?? null;
  }

  async revisionByVersion(artifactKey: string, version: number): Promise<Revision | null> {
    const id = (await this.s.getItem(
      this.k(`rev-by-art:${artifactKey}:${padVersion(version)}`),
    )) as string | null;
    return id ? this.revision(id) : null;
  }

  async revisionHistory(artifactKey: string, limit = 10): Promise<Revision[]> {
    const prefix = this.k(`rev-by-art:${artifactKey}:`);
    const keys = await this.s.getKeys(prefix);
    keys.sort();
    keys.reverse(); // newest first
    const taken = keys.slice(0, limit);
    const ids = await Promise.all(taken.map((kk) => this.s.getItem(kk) as Promise<string | null>));
    const revs = await Promise.all(ids.map((id) => (id ? this.revision(id) : Promise.resolve(null))));
    return revs.filter((r): r is Revision => r !== null);
  }

  async listArtifactKeys(): Promise<string[]> {
    const prefix = this.k("art:");
    const keys = await this.s.getKeys(prefix);
    return keys.map((kk) => kk.slice(prefix.length)).sort();
  }

  // ── invocations ────────────────────────────────────────────────────────

  async recordInvocation(inv: Omit<Invocation, "id">): Promise<Invocation> {
    const full: Invocation = { id: randomUUID(), ...inv };
    const ts = padTimestamp(full.date);
    await Promise.all([
      this.s.setItem(this.k(`inv:${full.id}`), full as unknown as string),
      this.s.setItem(this.k(`inv-by-rev:${full.revisionId}:${ts}:${full.id}`), 1),
      this.s.setItem(this.k(`inv-by-art:${full.artifactKey}:${ts}:${full.id}`), 1),
    ]);
    return full;
  }

  async invocationsForRevision(revisionId: string, limit = 25): Promise<Invocation[]> {
    return this.scanInvocations(this.k(`inv-by-rev:${revisionId}:`), limit);
  }

  async invocationsForArtifact(artifactKey: string, limit = 25): Promise<Invocation[]> {
    return this.scanInvocations(this.k(`inv-by-art:${artifactKey}:`), limit);
  }

  private async scanInvocations(prefix: string, limit: number): Promise<Invocation[]> {
    const keys = await this.s.getKeys(prefix);
    keys.sort();
    keys.reverse(); // newest first
    const taken = keys.slice(0, limit);
    const ids = taken.map((kk) => kk.slice(kk.lastIndexOf(":") + 1));
    const invs = await Promise.all(
      ids.map((id) => this.s.getItem(this.k(`inv:${id}`)) as Promise<Invocation | null>),
    );
    return invs.filter((i): i is Invocation => i !== null);
  }

  // ── signals ────────────────────────────────────────────────────────────

  async attachSignal(sig: Omit<Signal, "id" | "date">): Promise<Signal> {
    const full: Signal = {
      id: randomUUID(),
      date: new Date().toISOString(),
      ...sig,
    } as Signal;
    const ts = padTimestamp(full.date);
    await Promise.all([
      this.s.setItem(this.k(`sig:${full.id}`), full as unknown as string),
      this.s.setItem(this.k(`sig-by-inv:${full.invocationId}:${ts}:${full.id}`), 1),
    ]);
    return full;
  }

  async signalsForInvocation(invocationId: string): Promise<Signal[]> {
    const prefix = this.k(`sig-by-inv:${invocationId}:`);
    const keys = await this.s.getKeys(prefix);
    keys.sort(); // oldest first (ascending)
    const ids = keys.map((kk) => kk.slice(kk.lastIndexOf(":") + 1));
    const sigs = await Promise.all(
      ids.map((id) => this.s.getItem(this.k(`sig:${id}`)) as Promise<Signal | null>),
    );
    return sigs.filter((s): s is Signal => s !== null);
  }

  // ── helpers ────────────────────────────────────────────────────────────

  private k(key: string): string {
    return this.p ? `${this.p}:${key}` : key;
  }
}
