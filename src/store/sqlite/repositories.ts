import { eq, desc, asc, and } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { randomUUID } from "node:crypto";

import * as schema from "./schema.js";
import type {
  Revision,
  RevisionSource,
  Invocation,
  Signal,
  Verdict,
} from "../types.js";

type DB = BetterSQLite3Database<typeof schema>;

export class RevisionRepository {
  constructor(private readonly db: DB) {}

  async append(input: Omit<Revision, "id">): Promise<Revision> {
    const row = {
      id: randomUUID(),
      artifactKey: input.artifactKey,
      version: input.version,
      createdAt: input.createdAt,
      body: input.body,
      source: input.source,
    };
    await this.db.insert(schema.revisions).values(row);
    return rowToRevision(row);
  }

  async byId(id: string): Promise<Revision | null> {
    const r = await this.db
      .select()
      .from(schema.revisions)
      .where(eq(schema.revisions.id, id))
      .limit(1);
    const head = r[0];
    return head ? rowToRevision(head) : null;
  }

  async latest(artifactKey: string): Promise<Revision | null> {
    const r = await this.db
      .select()
      .from(schema.revisions)
      .where(eq(schema.revisions.artifactKey, artifactKey))
      .orderBy(desc(schema.revisions.version))
      .limit(1);
    const head = r[0];
    return head ? rowToRevision(head) : null;
  }

  async byVersion(artifactKey: string, version: number): Promise<Revision | null> {
    const r = await this.db
      .select()
      .from(schema.revisions)
      .where(
        and(
          eq(schema.revisions.artifactKey, artifactKey),
          eq(schema.revisions.version, version),
        ),
      )
      .limit(1);
    const head = r[0];
    return head ? rowToRevision(head) : null;
  }

  async history(artifactKey: string, limit = 10): Promise<Revision[]> {
    const rows = await this.db
      .select()
      .from(schema.revisions)
      .where(eq(schema.revisions.artifactKey, artifactKey))
      .orderBy(desc(schema.revisions.version))
      .limit(limit);
    return rows.map(rowToRevision);
  }

  async listKeys(): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ artifactKey: schema.revisions.artifactKey })
      .from(schema.revisions)
      .orderBy(asc(schema.revisions.artifactKey));
    return rows.map((r) => r.artifactKey);
  }
}

function rowToRevision(row: typeof schema.revisions.$inferSelect): Revision {
  return {
    id: row.id,
    artifactKey: row.artifactKey,
    version: row.version,
    createdAt: row.createdAt,
    body: row.body,
    source: row.source as RevisionSource,
  };
}

export class InvocationRepository {
  constructor(private readonly db: DB) {}

  async record(input: Omit<Invocation, "id">): Promise<Invocation> {
    const row = {
      id: randomUUID(),
      artifactKey: input.artifactKey,
      revisionId: input.revisionId,
      varsJson: JSON.stringify(input.vars ?? {}),
      metadataJson: JSON.stringify(input.metadata ?? {}),
      output: input.output,
      date: input.date,
    };
    await this.db.insert(schema.invocations).values(row);
    return rowToInvocation(row);
  }

  async forRevision(revisionId: string, limit = 25): Promise<Invocation[]> {
    const rows = await this.db
      .select()
      .from(schema.invocations)
      .where(eq(schema.invocations.revisionId, revisionId))
      .orderBy(asc(schema.invocations.date))
      .limit(limit);
    return rows.map(rowToInvocation);
  }

  async forArtifact(artifactKey: string, limit = 25): Promise<Invocation[]> {
    const rows = await this.db
      .select()
      .from(schema.invocations)
      .where(eq(schema.invocations.artifactKey, artifactKey))
      .orderBy(desc(schema.invocations.date))
      .limit(limit);
    return rows.map(rowToInvocation);
  }
}

function rowToInvocation(row: typeof schema.invocations.$inferSelect): Invocation {
  return {
    id: row.id,
    artifactKey: row.artifactKey,
    revisionId: row.revisionId,
    vars: JSON.parse(row.varsJson) as Record<string, string>,
    metadata: JSON.parse(row.metadataJson) as Record<string, unknown>,
    output: row.output,
    date: row.date,
  };
}

export class SignalRepository {
  constructor(private readonly db: DB) {}

  async attach(input: Omit<Signal, "id" | "date">): Promise<Signal> {
    const row = {
      id: randomUUID(),
      invocationId: input.invocationId,
      verdict: input.verdict,
      reason: input.reason ?? null,
      severity: input.severity ?? null,
      source: input.source ?? null,
      date: new Date().toISOString(),
    };
    await this.db.insert(schema.signals).values(row);
    return rowToSignal(row);
  }

  async forInvocation(invocationId: string): Promise<Signal[]> {
    const rows = await this.db
      .select()
      .from(schema.signals)
      .where(eq(schema.signals.invocationId, invocationId))
      .orderBy(asc(schema.signals.date));
    return rows.map(rowToSignal);
  }
}

function rowToSignal(row: typeof schema.signals.$inferSelect): Signal {
  return {
    id: row.id,
    invocationId: row.invocationId,
    verdict: row.verdict as Verdict,
    reason: row.reason ?? undefined,
    severity: row.severity ?? undefined,
    source: row.source ?? undefined,
    date: row.date,
  };
}
