import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "./schema.js";
import {
  RevisionRepository,
  InvocationRepository,
  SignalRepository,
} from "./repositories.js";
import type { Revision, Invocation, Signal, Store } from "../types.js";

export type SqliteStoreOptions = {
  /** Path to the SQLite file. Use ":memory:" for an in-process database. */
  path: string;
};

const SCHEMA_DDL = `
  CREATE TABLE IF NOT EXISTS revisions (
    id TEXT PRIMARY KEY,
    artifact_key TEXT NOT NULL,
    version INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    body TEXT NOT NULL,
    source TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS revisions_by_artifact ON revisions(artifact_key, version);

  CREATE TABLE IF NOT EXISTS invocations (
    id TEXT PRIMARY KEY,
    artifact_key TEXT NOT NULL,
    revision_id TEXT NOT NULL,
    vars TEXT NOT NULL,
    metadata TEXT NOT NULL,
    output TEXT NOT NULL,
    date TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS invocations_by_revision ON invocations(revision_id);
  CREATE INDEX IF NOT EXISTS invocations_by_artifact ON invocations(artifact_key, date);

  CREATE TABLE IF NOT EXISTS signals (
    id TEXT PRIMARY KEY,
    invocation_id TEXT NOT NULL,
    verdict TEXT NOT NULL,
    reason TEXT,
    severity REAL,
    source TEXT,
    date TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS signals_by_invocation ON signals(invocation_id);
`;

export class SqliteStore implements Store {
  private readonly revisions: RevisionRepository;
  private readonly invocations: InvocationRepository;
  private readonly signals: SignalRepository;
  private readonly db: Database.Database;

  constructor(options: SqliteStoreOptions) {
    this.db = new Database(options.path);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(SCHEMA_DDL);
    const drizzled = drizzle(this.db, { schema });
    this.revisions = new RevisionRepository(drizzled);
    this.invocations = new InvocationRepository(drizzled);
    this.signals = new SignalRepository(drizzled);
  }

  close(): void {
    this.db.close();
  }

  appendRevision(rev: Omit<Revision, "id">): Promise<Revision> {
    return this.revisions.append(rev);
  }
  latestRevision(artifactKey: string): Promise<Revision | null> {
    return this.revisions.latest(artifactKey);
  }
  revision(id: string): Promise<Revision | null> {
    return this.revisions.byId(id);
  }
  revisionByVersion(artifactKey: string, version: number): Promise<Revision | null> {
    return this.revisions.byVersion(artifactKey, version);
  }
  revisionHistory(artifactKey: string, limit?: number): Promise<Revision[]> {
    return this.revisions.history(artifactKey, limit);
  }
  listArtifactKeys(): Promise<string[]> {
    return this.revisions.listKeys();
  }
  recordInvocation(inv: Omit<Invocation, "id">): Promise<Invocation> {
    return this.invocations.record(inv);
  }
  invocationsForRevision(revisionId: string, limit?: number): Promise<Invocation[]> {
    return this.invocations.forRevision(revisionId, limit);
  }
  invocationsForArtifact(artifactKey: string, limit?: number): Promise<Invocation[]> {
    return this.invocations.forArtifact(artifactKey, limit);
  }
  attachSignal(sig: Omit<Signal, "id" | "date">): Promise<Signal> {
    return this.signals.attach(sig);
  }
  signalsForInvocation(invocationId: string): Promise<Signal[]> {
    return this.signals.forInvocation(invocationId);
  }
}
