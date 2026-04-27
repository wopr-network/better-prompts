import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

export const revisions = sqliteTable(
  "revisions",
  {
    id: text("id").primaryKey(),
    artifactKey: text("artifact_key").notNull(),
    version: integer("version").notNull(),
    createdAt: text("created_at").notNull(),
    body: text("body").notNull(),
    source: text("source").notNull(),
  },
  (t) => ({
    byArtifact: index("revisions_by_artifact").on(t.artifactKey, t.version),
  }),
);

export const invocations = sqliteTable(
  "invocations",
  {
    id: text("id").primaryKey(),
    artifactKey: text("artifact_key").notNull(),
    revisionId: text("revision_id").notNull(),
    varsJson: text("vars").notNull(),
    metadataJson: text("metadata").notNull(),
    output: text("output").notNull(),
    date: text("date").notNull(),
  },
  (t) => ({
    byRevision: index("invocations_by_revision").on(t.revisionId),
    byArtifact: index("invocations_by_artifact").on(t.artifactKey, t.date),
  }),
);

export const signals = sqliteTable(
  "signals",
  {
    id: text("id").primaryKey(),
    invocationId: text("invocation_id").notNull(),
    verdict: text("verdict").notNull(),
    reason: text("reason"),
    severity: real("severity"),
    source: text("source"),
    date: text("date").notNull(),
  },
  (t) => ({
    byInvocation: index("signals_by_invocation").on(t.invocationId),
  }),
);
