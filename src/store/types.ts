export type RevisionSource = "seed" | "manual" | "evolution" | "rollback";

export type Revision = {
  id: string;
  artifactKey: string;
  version: number;
  createdAt: string;
  body: string;
  source: RevisionSource;
};

export type Invocation = {
  id: string;
  artifactKey: string;
  revisionId: string;
  output: string;
  /**
   * Template variables the consumer substituted into the prompt body before
   * calling their LLM. The natural shape when prompts are handlebars/string
   * templates. The meta-prompt's `contextValuesJson` token gets this. Empty
   * when the prompt has no placeholders.
   */
  vars: Record<string, string>;
  /**
   * Free-form context attached at record time. The library never inspects it;
   * the meta-prompt sees it during evolve as supplemental info about the call.
   * Use for source URL, model id, retrieval context, latency, user role,
   * retry count — anything beyond template vars that might help the next
   * evolution.
   */
  metadata: Record<string, unknown>;
  date: string;
};

export type Verdict = "pass" | "fail";

export type Signal = {
  id: string;
  invocationId: string;
  verdict: Verdict;
  reason?: string;
  severity?: number;
  source?: string;
  date: string;
};

/**
 * A callback the consumer hands to `lib.evolve(...)`. The library renders the
 * meta-prompt internally and asks you to run it through your LLM and return
 * the response. The library does not own your LLM; this callback is the only
 * place an LLM enters the substrate, and only at evolve time.
 */
export type LLMCallback = (rendered: string) => Promise<string>;

export type Store = {
  appendRevision(rev: Omit<Revision, "id">): Promise<Revision>;
  latestRevision(artifactKey: string): Promise<Revision | null>;
  revision(id: string): Promise<Revision | null>;
  revisionByVersion(artifactKey: string, version: number): Promise<Revision | null>;
  revisionHistory(artifactKey: string, limit?: number): Promise<Revision[]>;
  listArtifactKeys(): Promise<string[]>;
  recordInvocation(inv: Omit<Invocation, "id">): Promise<Invocation>;
  invocationsForRevision(revisionId: string, limit?: number): Promise<Invocation[]>;
  invocationsForArtifact(artifactKey: string, limit?: number): Promise<Invocation[]>;
  attachSignal(sig: Omit<Signal, "id" | "date">): Promise<Signal>;
  signalsForInvocation(invocationId: string): Promise<Signal[]>;
};
