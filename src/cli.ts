#!/usr/bin/env node
import { readFile, access } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";
import { defineCommand, runMain } from "citty";
import { consola } from "consola";

import { betterPrompts } from "./index.js";
import { SqliteStore } from "./store/sqlite/index.js";
import type { Revision, Invocation, Signal, LLMCallback } from "./store/types.js";
import { onboard } from "./cli-onboard.js";

/**
 * Auto-detect a `bp.config.mjs` (or .js) the consumer's `bp onboard` run
 * generated. Returns the imported module if found, null otherwise. Used
 * by `bp evolve` so the consumer can configure the LLM seam once and
 * have the CLI just work.
 */
const CONFIG_CANDIDATES = [
  "./bp.config.mjs",
  "./bp.config.js",
  "./prompts.config.mjs",
  "./prompts.config.js",
  "./lib/bp.mjs",
  "./lib/bp.js",
];

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function loadConfig(explicitPath?: string): Promise<{ callLLM?: LLMCallback } | null> {
  const env = process.env.BETTER_PROMPTS_CONFIG;
  const candidates = [explicitPath, env, ...CONFIG_CANDIDATES].filter(
    (c): c is string => typeof c === "string" && c.length > 0,
  );
  for (const c of candidates) {
    const abs = resolvePath(c);
    if (await fileExists(abs)) {
      try {
        const url = pathToFileURL(abs).href;
        const m = (await import(url)) as { callLLM?: LLMCallback };
        return m;
      } catch (err) {
        consola.warn(
          `Found config at ${c} but failed to import it: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }
  return null;
}

/**
 * better-prompts CLI. Read-and-ops surface over the substrate. Defaults to
 * SqliteStore at `./prompts.db`; override with `PROMPTLIB_DB` env or `--db`
 * flag on individual commands. Evolve is intentionally not exposed here —
 * it requires an LLM, the library is provider-agnostic, and shipping an
 * opinionated default would push the library to depend on a specific SDK.
 * Run evolve programmatically via your app's existing LLM seam.
 */

type Json = "json";

function makeBp(dbPath: string) {
  const store = new SqliteStore({ path: dbPath });
  return { bp: betterPrompts({ store }), store };
}

function resolveDb(args: { db?: string }): string {
  return args.db ?? process.env.PROMPTLIB_DB ?? "./prompts.db";
}

function emit(json: boolean, data: unknown, human: () => void): void {
  if (json) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    human();
  }
}

async function readBodyArg(arg: string | undefined, fromFile: string | undefined): Promise<string> {
  if (fromFile) return readFile(fromFile, "utf-8");
  if (arg !== undefined) return arg;
  // No arg, no --from-file → read stdin.
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

const commonDbArg = {
  db: {
    type: "string",
    description: "Path to the SQLite store file. Defaults to $PROMPTLIB_DB or ./prompts.db.",
  },
} as const;

const commonJsonArg = {
  json: {
    type: "boolean",
    description: "Emit JSON instead of human-readable output.",
    default: false,
  },
} as const;

const list = defineCommand({
  meta: { name: "list", description: "List artifact keys." },
  args: {
    ...commonDbArg,
    ...commonJsonArg,
    all: {
      type: "boolean",
      description: "Include reserved underscore-prefixed keys (e.g. _enhancer).",
      default: false,
    },
  },
  async run({ args }) {
    const { bp } = makeBp(resolveDb(args));
    const all = await bp.list();
    const keys = args.all ? all : all.filter((k) => !k.startsWith("_"));
    emit(args.json, { keys }, () => {
      if (keys.length === 0) consola.info("(no artifacts)");
      for (const k of keys) console.log(k);
    });
  },
});

const read = defineCommand({
  meta: { name: "read", description: "Print the active body of an artifact." },
  args: {
    ...commonDbArg,
    ...commonJsonArg,
    key: { type: "positional", required: true, description: "Artifact key." },
    version: {
      type: "string",
      description: "Read a specific version (default: active head).",
    },
  },
  async run({ args }) {
    const { bp, store } = makeBp(resolveDb(args));
    const rev: Revision | null = args.version
      ? await store.revisionByVersion(args.key, Number(args.version))
      : await bp.get(args.key);
    if (!rev) {
      consola.error(`No revision v${args.version} for "${args.key}".`);
      process.exit(1);
    }
    emit(args.json, rev, () => {
      consola.info(`${args.key} v${rev.version} (${rev.source}, ${rev.createdAt})`);
      console.log(rev.body);
    });
  },
});

const history = defineCommand({
  meta: { name: "history", description: "List revisions of an artifact, newest first." },
  args: {
    ...commonDbArg,
    ...commonJsonArg,
    key: { type: "positional", required: true, description: "Artifact key." },
    limit: {
      type: "string",
      description: "Max revisions to show.",
      default: "20",
    },
  },
  async run({ args }) {
    const { bp } = makeBp(resolveDb(args));
    const chain = await bp.history(args.key, Number(args.limit));
    emit(args.json, { revisions: chain }, () => {
      if (chain.length === 0) {
        consola.info(`(no history for "${args.key}")`);
        return;
      }
      for (const r of chain) {
        const preview = r.body.replace(/\s+/g, " ").slice(0, 80);
        console.log(`v${r.version}  ${r.source.padEnd(10)} ${r.createdAt}  ${preview}${r.body.length > 80 ? "…" : ""}`);
      }
    });
  },
});

const invocationsCmd = defineCommand({
  meta: { name: "invocations", description: "Recent invocations of an artifact, newest first." },
  args: {
    ...commonDbArg,
    ...commonJsonArg,
    key: { type: "positional", required: true, description: "Artifact key." },
    limit: { type: "string", description: "Max invocations.", default: "25" },
  },
  async run({ args }) {
    const { bp } = makeBp(resolveDb(args));
    const invs: Invocation[] = await bp.invocations(args.key, { limit: Number(args.limit) });
    emit(args.json, { invocations: invs }, () => {
      if (invs.length === 0) {
        consola.info(`(no invocations for "${args.key}")`);
        return;
      }
      for (const i of invs) {
        const preview = i.output.replace(/\s+/g, " ").slice(0, 60);
        console.log(`${i.id}  ${i.date}  rev=${i.revisionId.slice(0, 8)}  ${preview}${i.output.length > 60 ? "…" : ""}`);
      }
    });
  },
});

const signalsCmd = defineCommand({
  meta: { name: "signals", description: "Signals attached to an invocation." },
  args: {
    ...commonDbArg,
    ...commonJsonArg,
    invocationId: { type: "positional", required: true, description: "Invocation id." },
  },
  async run({ args }) {
    const { bp } = makeBp(resolveDb(args));
    const sigs: Signal[] = await bp.signals(args.invocationId);
    emit(args.json, { signals: sigs }, () => {
      if (sigs.length === 0) {
        consola.info("(no signals)");
        return;
      }
      for (const s of sigs) {
        const sev = s.severity != null ? ` sev=${s.severity}` : "";
        const src = s.source ? ` (${s.source})` : "";
        console.log(`${s.verdict}${sev}${src}  ${s.reason ?? ""}`);
      }
    });
  },
});

const set = defineCommand({
  meta: {
    name: "set",
    description: "Append a new revision (manual or seed). Body from positional arg, --from-file, or stdin.",
  },
  args: {
    ...commonDbArg,
    ...commonJsonArg,
    key: { type: "positional", required: true, description: "Artifact key." },
    body: {
      type: "positional",
      required: false,
      description: "Body string. If absent, reads from --from-file or stdin.",
    },
    "from-file": { type: "string", description: "Read body from this file." },
  },
  async run({ args }) {
    const { bp } = makeBp(resolveDb(args));
    const body = await readBodyArg(args.body, args["from-file"]);
    if (!body) {
      consola.error("Body required (positional, --from-file, or stdin).");
      process.exit(1);
    }
    const rev = await bp.set(args.key, body);
    emit(args.json, rev, () => {
      consola.success(`${args.key} v${rev.version} (${rev.source})`);
    });
  },
});

const signalCmd = defineCommand({
  meta: { name: "signal", description: "Attach a signal to an invocation." },
  args: {
    ...commonDbArg,
    ...commonJsonArg,
    invocationId: { type: "positional", required: true, description: "Invocation id." },
    verdict: {
      type: "string",
      required: true,
      description: "pass | fail",
    },
    reason: { type: "string", description: "Short reason text." },
    severity: { type: "string", description: "0–1 magnitude." },
    source: { type: "string", description: "Source tag (default: cli).", default: "cli" },
  },
  async run({ args }) {
    if (args.verdict !== "pass" && args.verdict !== "fail") {
      consola.error(`--verdict must be "pass" or "fail" (got "${args.verdict}").`);
      process.exit(1);
    }
    const { bp } = makeBp(resolveDb(args));
    const sig = await bp.signal(args.invocationId, {
      verdict: args.verdict,
      reason: args.reason,
      severity: args.severity ? Number(args.severity) : undefined,
      source: args.source,
    });
    emit(args.json, sig, () => {
      consola.success(`signal ${sig.id} attached (${sig.verdict})`);
    });
  },
});

const rollback = defineCommand({
  meta: { name: "rollback", description: "Append a rollback revision pointing at an older version." },
  args: {
    ...commonDbArg,
    ...commonJsonArg,
    key: { type: "positional", required: true, description: "Artifact key." },
    version: { type: "positional", required: true, description: "Target version number." },
  },
  async run({ args }) {
    const { bp } = makeBp(resolveDb(args));
    const rev = await bp.rollback(args.key, Number(args.version));
    emit(args.json, rev, () => {
      consola.success(`${args.key} rolled back to v${args.version} as new v${rev.version}`);
    });
  },
});

const diff = defineCommand({
  meta: {
    name: "diff",
    description: "Show two revisions of an artifact side by side. Pipes through `diff` if available; falls back to printing both.",
  },
  args: {
    ...commonDbArg,
    key: { type: "positional", required: true, description: "Artifact key." },
    a: { type: "positional", required: true, description: "First version (older)." },
    b: { type: "positional", required: true, description: "Second version (newer)." },
  },
  async run({ args }) {
    const { store } = makeBp(resolveDb(args));
    const [ra, rb] = await Promise.all([
      store.revisionByVersion(args.key, Number(args.a)),
      store.revisionByVersion(args.key, Number(args.b)),
    ]);
    if (!ra || !rb) {
      consola.error(`Missing revision: ${!ra ? `v${args.a}` : `v${args.b}`}`);
      process.exit(1);
    }
    // Try the system `diff` for proper unified output. Fall back to side-by-side
    // printing if it's not available.
    try {
      const { spawnSync } = await import("node:child_process");
      const { writeFileSync, mkdtempSync } = await import("node:fs");
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");
      const dir = mkdtempSync(join(tmpdir(), "bp-diff-"));
      const fa = join(dir, `v${args.a}`);
      const fb = join(dir, `v${args.b}`);
      writeFileSync(fa, ra.body);
      writeFileSync(fb, rb.body);
      const res = spawnSync("diff", ["-u", fa, fb], { encoding: "utf-8" });
      if (res.error) throw res.error;
      process.stdout.write(res.stdout);
      if (res.status === 0) consola.info("(identical)");
      return;
    } catch {
      console.log(`--- v${args.a} (${ra.createdAt})\n${ra.body}`);
      console.log(`\n+++ v${args.b} (${rb.createdAt})\n${rb.body}`);
    }
  },
});

const evolve = defineCommand({
  meta: {
    name: "evolve",
    description: "Evolve an artifact's body via an LLM seam. Auto-imports bp.config.mjs (from `bp onboard`) when no --provider flag is passed.",
  },
  args: {
    ...commonDbArg,
    ...commonJsonArg,
    key: { type: "positional", required: true, description: "Artifact key." },
    reason: {
      type: "string",
      required: true,
      description: "Editorial reason driving the rewrite. The meta-prompt reads this.",
    },
    config: {
      type: "string",
      description: "Path to a config file exporting `callLLM`. Default: auto-detect bp.config.mjs / bp.config.js / prompts.config.mjs / lib/bp.mjs.",
    },
    provider: {
      type: "string",
      description: "Override the config and use this LLM seam directly: claude-agent | agent-api | ai-sdk.",
    },
    url: {
      type: "string",
      description: "AgentAPI URL when --provider=agent-api. Default http://localhost:3284.",
    },
    model: {
      type: "string",
      description: "Model id. claude-agent: 'claude-sonnet-4-6'. ai-sdk: provider-prefixed string like 'anthropic/claude-sonnet-4-6'.",
    },
  },
  async run({ args }) {
    const { bp } = makeBp(resolveDb(args));

    // Resolve the LLM seam in this order:
    //   1. --provider flag (explicit override; ignores config)
    //   2. config file (BETTER_PROMPTS_CONFIG env / --config flag / auto-detect)
    //   3. $BETTER_PROMPTS_PROVIDER env (fallback default)
    //   4. claude-agent (last-resort default)
    let using: LLMCallback | undefined;

    if (!args.provider) {
      const config = await loadConfig(args.config);
      if (config?.callLLM) {
        using = config.callLLM;
      }
    }

    if (!using) {
      const provider = args.provider ?? process.env.BETTER_PROMPTS_PROVIDER ?? "claude-agent";

      if (provider === "claude-agent") {
        try {
          const m = await import("./claude-agent.js");
          using = m.claudeAgent({ model: args.model });
        } catch (err) {
          consola.error(
            `Could not load claude-agent shim. Install peer dep: pnpm add @anthropic-ai/claude-agent-sdk\n${err instanceof Error ? err.message : String(err)}`,
          );
          process.exit(1);
        }
      } else if (provider === "agent-api") {
        const m = await import("./agent-api.js");
        using = m.agentApi({ url: args.url });
      } else if (provider === "ai-sdk") {
        const model = args.model;
        if (!model) {
          consola.error(
            "--model required when --provider=ai-sdk. Pass a Vercel AI Gateway model id like 'anthropic/claude-sonnet-4-6' or 'openai/gpt-4o', or configure callLLM in bp.config.mjs and drop the --provider flag.",
          );
          process.exit(1);
        }
        try {
          const m = await import("./ai-sdk.js");
          using = m.aiSdk({ model: model as never });
        } catch (err) {
          consola.error(
            `Could not load ai-sdk shim. Install peer dep: pnpm add ai\n${err instanceof Error ? err.message : String(err)}`,
          );
          process.exit(1);
        }
      } else {
        consola.error(`Unknown --provider "${provider}". Valid: claude-agent | agent-api | ai-sdk.`);
        process.exit(1);
      }
    }

    const seamLabel = args.provider ?? (args.config || process.env.BETTER_PROMPTS_CONFIG ? "config" : process.env.BETTER_PROMPTS_PROVIDER ?? "config");
    consola.start(`evolving "${args.key}" via ${seamLabel}…`);
    if (!using) {
      consola.error("internal: LLM callback unresolved");
      process.exit(1);
    }
    const result = await bp.evolve(args.key, { reason: args.reason, using });

    if (!result.ok) {
      consola.error(`evolve failed: ${result.reason}`);
      process.exit(1);
    }

    emit(args.json, result, () => {
      consola.success(
        `${args.key} v${result.revision.version} (${result.revision.source}) — ${result.revision.body.length} chars`,
      );
      console.log(result.revision.body);
    });
  },
});

const main = defineCommand({
  meta: {
    name: "bp",
    version: "0.0.0",
    description: "better-prompts — auto-evolving prompts CLI.",
  },
  subCommands: {
    onboard,
    list,
    read,
    history,
    invocations: invocationsCmd,
    signals: signalsCmd,
    set,
    signal: signalCmd,
    rollback,
    diff,
    evolve,
  },
});

runMain(main);
