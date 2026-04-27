import { readFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { basename, dirname, extname, resolve } from "node:path";

import type {
  Invocation,
  LLMCallback,
  Revision,
  Signal,
  Store,
  Verdict,
} from "./store/types.js";

const ENHANCER_KEY = "_enhancer";
const ENHANCER_SEED_DATE = "2026-04-26T00:00:00.000Z";

let cachedEnhancerSeed: string | null = null;
function loadEnhancerSeed(): string {
  if (cachedEnhancerSeed !== null) return cachedEnhancerSeed;
  const here = dirname(fileURLToPath(import.meta.url));
  const path = resolve(here, "seeded-prompts", "enhancer.md");
  cachedEnhancerSeed = readFileSync(path, "utf-8");
  return cachedEnhancerSeed;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Internal substitution used only when the library renders its own meta-prompt
 * during `evolve`. Not exposed — consumers render their own artifact bodies
 * however they like; the `vars` they report back via `record(...)` are metadata
 * for telemetry, not a request for the library to template anything.
 */
function substitute(body: string, vars: Record<string, string>): string {
  let out = body;
  for (const [k, v] of Object.entries(vars)) {
    const handlebars = new RegExp(`\\{\\{\\s*${escapeRegex(k)}\\s*\\}\\}`, "g");
    const dollar = new RegExp(`\\$\\{\\s*${escapeRegex(k)}\\s*\\}`, "g");
    out = out.replace(handlebars, v).replace(dollar, v);
  }
  return out;
}

export type BetterPromptsOptions = {
  store: Store;
  /** Telemetry window evolve sees. Default 25. */
  telemetryWindow?: number;
};

export type SignalInput = {
  verdict: Verdict;
  reason?: string;
  severity?: number;
  source?: string;
};

export type RecordInput = {
  artifactKey: string;
  revisionId: string;
  output: string;
  /** Template variables substituted into the prompt body. Optional, defaults to {}. */
  vars?: Record<string, string>;
  /** Free-form context (source URL, model id, retrieval context, latency, etc.). Optional. */
  metadata?: Record<string, unknown>;
};

export type EvolveOptions = {
  reason: string;
  /** Consumer-supplied LLM callback. The library renders the meta-prompt and
   *  hands it to this function; you run it through your LLM and return the
   *  result. This is the only place an LLM enters the substrate. */
  using: LLMCallback;
};

export type EvolveResult =
  | { ok: true; revision: Revision; invocation: Invocation | null }
  | { ok: false; reason: "no_active_revision" };

export type BetterPrompts = ReturnType<typeof betterPrompts>;

export function betterPrompts(opts: BetterPromptsOptions) {
  const { store } = opts;
  const telemetryWindow = opts.telemetryWindow ?? 25;

  let enhancerSeeded = false;
  async function ensureEnhancerSeeded(): Promise<void> {
    if (enhancerSeeded) return;
    const seed = loadEnhancerSeed();
    await get(ENHANCER_KEY, seed, ENHANCER_SEED_DATE);
    enhancerSeeded = true;
  }

  async function get(
    key: string,
    defaultBody?: string,
    codeDate?: string,
  ): Promise<Revision> {
    // Shape 2 — bp.get(key, body) with no discriminator — is invalid.
    // It seeds once and then silently ignores every later edit to the body,
    // because the substrate has no way to detect that the literal changed.
    // The migration use case is overwhelmingly the reason a consumer reaches
    // this surface, so the throw points there directly.
    if (defaultBody !== undefined && codeDate === undefined) {
      throw new Error(
        `bp.get("${key}", body) is missing the third argument — the discriminator that lets the substrate detect when your literal has changed. Without it, the substrate would seed once and then silently ignore every future edit to the body, which is the migration footgun this library refuses to ship.\n\n` +
          `You're almost certainly migrating an existing prompt into the substrate. Use:\n\n` +
          `    bp.get("${key}", body, discriminator)\n\n` +
          `where discriminator is anything that advances when the body changes — an ISO date you bump on edit, a file's mtime, a content hash, a build number. Whatever signal you already have in your existing setup that says "this prompt has been revised." On each call:\n\n` +
          `  • discriminator newer than what's stored → the substrate appends a "manual" revision and returns it\n` +
          `  • discriminator equal-or-older → the substrate returns the stored head (your code's literal is now stale because evolve has moved past it; this is by design)\n\n` +
          `If your prompt body lives in a file on disk, bp.fromFile collapses this to one call (file content is the body, mtime is the discriminator):\n\n` +
          `    const ${(key.match(/[a-zA-Z_$][a-zA-Z0-9_$]*$/)?.[0]) ?? "active"} = await bp.fromFile("./prompts/${key}.hbs");\n\n` +
          `If you actually want read-only — assume already seeded, throw on miss — call bp.get("${key}") with no body at all.\n\n` +
          `See docs/MIGRATION.md for the full migration patterns.`,
      );
    }

    const existing = await store.latestRevision(key);

    // Shape 1 — bp.get(key) — read-only.
    if (defaultBody === undefined) {
      if (!existing) {
        throw new Error(
          `Artifact "${key}" not found. Either:\n` +
            `  • bp.get("${key}", body, discriminator) — source-of-record (the migration shape)\n` +
            `  • bp.set("${key}", body)                — unconditional append`,
        );
      }
      return existing;
    }

    // Shape 3 — bp.get(key, body, codeDate) — source-of-record.
    if (!existing) {
      return store.appendRevision({
        artifactKey: key,
        version: 1,
        createdAt: new Date().toISOString(),
        body: defaultBody,
        source: "seed",
      });
    }

    const existingDate = new Date(existing.createdAt).getTime();
    const providedDate = new Date(codeDate as string).getTime();
    if (Number.isNaN(providedDate)) {
      throw new Error(`Invalid codeDate: ${codeDate}`);
    }
    if (existingDate >= providedDate) return existing;

    return store.appendRevision({
      artifactKey: key,
      version: existing.version + 1,
      createdAt: new Date(providedDate).toISOString(),
      body: defaultBody,
      source: "manual",
    });
  }

  async function set(key: string, body: string): Promise<Revision> {
    const head = await store.latestRevision(key);
    return store.appendRevision({
      artifactKey: key,
      version: (head?.version ?? 0) + 1,
      createdAt: new Date().toISOString(),
      body,
      source: head ? "manual" : "seed",
    });
  }

  async function record(input: RecordInput): Promise<Invocation> {
    return store.recordInvocation({
      artifactKey: input.artifactKey,
      revisionId: input.revisionId,
      vars: input.vars ?? {},
      metadata: input.metadata ?? {},
      output: input.output,
      date: new Date().toISOString(),
    });
  }

  async function signal(
    invocationId: string,
    input: SignalInput,
  ): Promise<Signal> {
    return store.attachSignal({ invocationId, ...input });
  }

  async function evolve(key: string, opts: EvolveOptions): Promise<EvolveResult> {
    await ensureEnhancerSeeded();

    const active = await store.latestRevision(key);
    if (!active) return { ok: false, reason: "no_active_revision" };

    // Telemetry is supplementary context for the meta-prompt — not required.
    // The operator's `reason` is the load-bearing critique; if they have it,
    // they can evolve. Recorded invocations + their signals enrich the
    // meta-prompt envelope when they exist.
    const recent = await store.invocationsForRevision(active.id, telemetryWindow);
    const telemetry = await Promise.all(
      recent.map(async (inv) => ({
        invocation: inv,
        signals: await store.signalsForInvocation(inv.id),
      })),
    );
    const failing = telemetry.filter((t) => t.signals.some((s) => s.verdict === "fail"));
    const exemplar = failing[0]?.invocation ?? recent[0];

    const metaVars: Record<string, string> = {
      outputDir: "(inline; see CURRENT PROMPT BODY below)",
      enhancedFile: "(inline; respond with the new body)",
      analysisFile: "(inline; analysis is optional, body is required)",
      contextValuesJson: JSON.stringify(exemplar?.vars ?? {}, null, 2),
      actualOutput: exemplar?.output ?? "(no recent output captured)",
      tokensDescription: "Preserve any `${name}` or `{{name}}` placeholders that appear in the current prompt body verbatim — those are template variables the consumer substitutes at call time.",
    };

    const enhancerActive = await store.latestRevision(ENHANCER_KEY);
    if (!enhancerActive) {
      throw new Error("_enhancer artifact missing after seeding — store inconsistency");
    }
    const renderedMeta = substitute(enhancerActive.body, metaVars);

    const wrapped = buildEvolveEnvelope({
      renderedMetaPrompt: renderedMeta,
      activeBody: active.body,
      telemetry,
      reason: opts.reason,
    });

    // The only LLM call the library makes — and it's via the consumer's callback.
    const output = await opts.using(wrapped);

    // Recording the _enhancer invocation is bonus telemetry. A store may
    // reject substrate-level invocation writes (e.g. a custom adapter that
    // delegates observability to a host platform's own SDK). Don't let that
    // block the load-bearing revision write.
    let enhancerInvocation: Invocation | null = null;
    try {
      enhancerInvocation = await store.recordInvocation({
        artifactKey: ENHANCER_KEY,
        revisionId: enhancerActive.id,
        vars: metaVars,
        metadata: { _evolveTarget: key, _evolveReason: opts.reason },
        output,
        date: new Date().toISOString(),
      });
    } catch {
      // Store doesn't accept invocation writes — proceed with the revision.
    }

    const candidate = extractBody(output);
    const next = await store.appendRevision({
      artifactKey: key,
      version: active.version + 1,
      createdAt: new Date().toISOString(),
      body: candidate,
      source: "evolution",
    });

    return { ok: true, revision: next, invocation: enhancerInvocation };
  }

  async function history(key: string, limit?: number): Promise<Revision[]> {
    return store.revisionHistory(key, limit);
  }

  async function list(): Promise<string[]> {
    return store.listArtifactKeys();
  }

  async function rollback(key: string, targetVersion: number): Promise<Revision> {
    const target = await store.revisionByVersion(key, targetVersion);
    if (!target) throw new Error(`No revision v${targetVersion} for "${key}"`);
    const head = await store.latestRevision(key);
    return store.appendRevision({
      artifactKey: key,
      version: (head?.version ?? 0) + 1,
      createdAt: new Date().toISOString(),
      body: target.body,
      source: "rollback",
    });
  }

  async function invocations(key: string, options: { limit?: number } = {}): Promise<Invocation[]> {
    return store.invocationsForArtifact(key, options.limit);
  }

  async function signalsFor(invocationId: string): Promise<Signal[]> {
    return store.signalsForInvocation(invocationId);
  }

  async function fromFile(
    pathOrUrl: string | URL,
    options: { key?: string } = {},
  ): Promise<Revision> {
    const path = typeof pathOrUrl === "string" ? pathOrUrl : fileURLToPath(pathOrUrl);
    const [body, info] = await Promise.all([readFile(path, "utf-8"), stat(path)]);
    const key = options.key ?? basename(path, extname(path));
    return get(key, body, info.mtime.toISOString());
  }

  return {
    get,
    set,
    record,
    signal,
    evolve,
    history,
    list,
    rollback,
    invocations,
    signals: signalsFor,
    fromFile,
  };
}

function buildEvolveEnvelope(input: {
  renderedMetaPrompt: string;
  activeBody: string;
  telemetry: Array<{ invocation: Invocation; signals: Signal[] }>;
  reason: string;
}): string {
  const telemetryBlock = input.telemetry
    .map((entry) => {
      const sigs = entry.signals
        .map((s) => `    [${s.verdict}${s.severity != null ? ` ${s.severity}` : ""}] ${s.reason ?? ""}${s.source ? ` (${s.source})` : ""}`)
        .join("\n");
      const metadataStr = Object.keys(entry.invocation.metadata).length > 0
        ? `\n  metadata: ${JSON.stringify(entry.invocation.metadata)}`
        : "";
      return [
        `INVOCATION ${entry.invocation.id} (rev ${entry.invocation.revisionId}, ${entry.invocation.date})`,
        `  vars: ${JSON.stringify(entry.invocation.vars)}${metadataStr}`,
        `  output: ${truncate(entry.invocation.output, 600)}`,
        sigs ? `  signals:\n${sigs}` : "  signals: (none)",
      ].join("\n");
    })
    .join("\n\n");

  return [
    "PROTOCOL NOTE",
    "",
    "The meta-prompt below was originally written for a workspace-edit protocol where you would read and write files on disk. We are using a simpler protocol here. Return ONLY the new prompt body inline as your response. The first character of your response is the first character of the new prompt body. No preamble, no markdown fences, no commentary.",
    "",
    "---",
    "",
    input.renderedMetaPrompt,
    "",
    "---",
    "",
    "CURRENT PROMPT BODY (this is what you are revising):",
    "",
    "```",
    input.activeBody,
    "```",
    "",
    "RECENT TELEMETRY (invocations of this revision and their signals):",
    "",
    telemetryBlock || "(no recent invocations)",
    "",
    "ESCALATION REASON:",
    "",
    input.reason,
    "",
    "YOUR RESPONSE FORMAT: only the new prompt body. Nothing else.",
  ].join("\n");
}

function extractBody(output: string): string {
  const fence = output.match(/^```(?:\w+)?\n([\s\S]*?)\n```\s*$/);
  if (fence?.[1]) return fence[1];
  return output.trim();
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n)}…(${s.length - n} more chars)`;
}

export type {
  Revision,
  Invocation,
  Signal,
  LLMCallback,
  Store,
  Verdict,
} from "./store/types.js";
