import { readdir, stat, readFile, writeFile, access, mkdir } from "node:fs/promises";
import { join, basename, extname, relative, resolve, dirname } from "node:path";
import { defineCommand } from "citty";
import { consola } from "consola";

import { betterPrompts } from "./index.js";
import { SqliteStore } from "./store/sqlite/index.js";

/**
 * `bp onboard` — guided + scriptable setup for a new project.
 *
 * Interactive by default; pass `--yes` to take defaults for everything
 * (CI / scripted use). Steps run in order; each can be skipped with a
 * dedicated flag.
 *
 *   1. Pick the SQLite path (default ./prompts.db).
 *   2. Scan common prompt directories, preview the bulk-seed plan, and
 *      apply it via bp.fromFile.
 *   3. Pick the LLM seam (claude-agent | agent-api | ai-sdk-stub | none)
 *      and write a lib/bp.ts boilerplate wired to it.
 *   4. Add the SQLite path to .gitignore.
 *   5. Print the admin-UI instructions.
 *
 * Each step is idempotent. Running onboard twice is safe; it picks up
 * whatever exists and offers to extend.
 */

const DEFAULT_PROMPT_DIRS = [
  "./prompts",
  "./src/prompts",
  "./.prompts",
  "./app/prompts",
];

const PROMPT_FILE_EXTS = new Set([".hbs", ".md", ".prompt", ".txt", ".tmpl", ".j2"]);

type LlmSeam = "claude-agent" | "agent-api" | "ai-sdk" | "none";

const SEAM_DESCRIPTIONS: Record<LlmSeam, string> = {
  "claude-agent": "Claude Agent SDK — OAuth via your local ~/.claude credentials",
  "agent-api": "AgentAPI — wraps any agent CLI (Claude Code, Codex, OpenCode, etc.) over HTTP",
  "ai-sdk": "Vercel AI SDK — multi-provider chat completion (Anthropic / OpenAI / Bedrock / etc.)",
  none: "skip — wire your own callback later",
};

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function scanPromptDir(dir: string): Promise<string[]> {
  if (!(await exists(dir))) return [];
  const out: string[] = [];
  async function walk(d: string): Promise<void> {
    const entries = await readdir(d, { withFileTypes: true });
    for (const e of entries) {
      const p = join(d, e.name);
      if (e.isDirectory()) {
        await walk(p);
      } else if (e.isFile() && PROMPT_FILE_EXTS.has(extname(e.name))) {
        out.push(p);
      }
    }
  }
  await walk(dir);
  return out;
}

function deriveKey(path: string): string {
  return basename(path, extname(path));
}

async function bulkSeed(bp: ReturnType<typeof betterPrompts>, files: string[]): Promise<void> {
  for (const f of files) {
    const rev = await bp.fromFile(f);
    consola.success(`seeded "${rev.artifactKey}" v${rev.version} from ${relative(process.cwd(), f)}`);
  }
}

function bpBoilerplate(opts: { dbPath: string; seam: LlmSeam }): string {
  // Generate plain ESM JavaScript so the CLI can dynamic-import this file
  // without a TypeScript runtime. TS callers can still import this from
  // their .ts code; the .mjs resolution works in any modern bundler / TS
  // moduleResolution=bundler setup.
  const importBlock = (() => {
    switch (opts.seam) {
      case "claude-agent":
        return [
          'import { betterPrompts } from "@wopr-network/better-prompts";',
          'import { SqliteStore } from "@wopr-network/better-prompts/store/sqlite";',
          'import { claudeAgent } from "@wopr-network/better-prompts/claude-agent";',
        ].join("\n");
      case "agent-api":
        return [
          'import { betterPrompts } from "@wopr-network/better-prompts";',
          'import { SqliteStore } from "@wopr-network/better-prompts/store/sqlite";',
          'import { agentApi } from "@wopr-network/better-prompts/agent-api";',
        ].join("\n");
      case "ai-sdk":
        return [
          'import { betterPrompts } from "@wopr-network/better-prompts";',
          'import { SqliteStore } from "@wopr-network/better-prompts/store/sqlite";',
          'import { aiSdk } from "@wopr-network/better-prompts/ai-sdk";',
          'import { anthropic } from "@ai-sdk/anthropic"; // pick your provider package',
          '// import { openai } from "@ai-sdk/openai";',
          '// import { google } from "@ai-sdk/google";',
        ].join("\n");
      case "none":
        return [
          'import { betterPrompts } from "@wopr-network/better-prompts";',
          'import { SqliteStore } from "@wopr-network/better-prompts/store/sqlite";',
        ].join("\n");
    }
  })();

  const callLLMBlock = (() => {
    switch (opts.seam) {
      case "claude-agent":
        return [
          "// LLM seam: Claude Agent SDK — uses your local ~/.claude credentials.",
          'export const callLLM = claudeAgent({ model: "claude-sonnet-4-6" });',
        ].join("\n");
      case "agent-api":
        return [
          "// LLM seam: AgentAPI. Run `agentapi server -- <agent>` separately;",
          "// see https://github.com/coder/agentapi for the binary install.",
          "export const callLLM = agentApi();",
        ].join("\n");
      case "ai-sdk":
        return [
          "// LLM seam: Vercel AI SDK. Install your chosen provider package",
          "// alongside `ai`: pnpm add ai @ai-sdk/anthropic (or @ai-sdk/openai, etc.).",
          "// Set ANTHROPIC_API_KEY (or your provider's key) in env.",
          'export const callLLM = aiSdk({ model: anthropic("claude-sonnet-4-6") });',
        ].join("\n");
      case "none":
        return [
          "// No LLM seam wired. Add one before bp.evolve will work:",
          "//",
          "// export const callLLM = async (rendered) => {",
          "//   /* call your model however you like */",
          "//   return responseString;",
          "// };",
        ].join("\n");
    }
  })();

  return [
    "// Generated by `bp onboard`. Edit freely.",
    "// `bp evolve` auto-imports this file. Move it via --config-out next time you onboard,",
    "// or pass --config <path> / set BETTER_PROMPTS_CONFIG to point bp evolve elsewhere.",
    importBlock,
    "",
    "export const bp = betterPrompts({",
    `  store: new SqliteStore({ path: "${opts.dbPath}" }),`,
    "});",
    "",
    callLLMBlock,
    "",
  ].join("\n");
}

async function ensureGitignored(dbPath: string): Promise<boolean> {
  const giPath = ".gitignore";
  let current = "";
  if (await exists(giPath)) {
    current = await readFile(giPath, "utf-8");
  }
  const line = dbPath.startsWith("./") ? dbPath.slice(2) : dbPath;
  if (current.split("\n").map((l) => l.trim()).includes(line)) return false;
  const append = current.length > 0 && !current.endsWith("\n") ? "\n" : "";
  await writeFile(giPath, `${current}${append}${line}\n${line}-shm\n${line}-wal\n`);
  return true;
}

export const onboard = defineCommand({
  meta: {
    name: "onboard",
    description: "Guided setup. Picks a store, scans for existing prompts, wires an LLM seam, generates boilerplate.",
  },
  args: {
    yes: {
      type: "boolean",
      description: "Accept defaults non-interactively. Defaults: ./prompts.db, scan & seed, claude-agent seam, lib/bp.ts.",
      alias: "y",
      default: false,
    },
    db: {
      type: "string",
      description: "SQLite path. Default: ./prompts.db.",
    },
    "prompts-dir": {
      type: "string",
      description: "Override the directory scanned for existing prompt files. Default: auto-detect among ./prompts, ./src/prompts, ./.prompts, ./app/prompts.",
    },
    seam: {
      type: "string",
      description: "LLM seam: claude-agent | agent-api | ai-sdk | none. Default: claude-agent.",
    },
    "config-out": {
      type: "string",
      description: "Where to write the generated boilerplate. Default: ./bp.config.mjs (auto-detected by bp evolve).",
    },
    "skip-seed": { type: "boolean", default: false, description: "Don't bulk-seed existing prompt files." },
    "skip-config": { type: "boolean", default: false, description: "Don't write the boilerplate config file." },
    "skip-gitignore": { type: "boolean", default: false, description: "Don't update .gitignore." },
  },
  async run({ args }) {
    const yes = args.yes;
    consola.info("better-prompts onboard");
    consola.log(yes ? "(non-interactive: using defaults)\n" : "(interactive — pass --yes to skip prompts)\n");

    // ─── 1. Pick the store path ───────────────────────────────────
    const dbPath: string = args.db
      ?? (yes
        ? "./prompts.db"
        : (await consola.prompt("SQLite path for the substrate?", {
            type: "text",
            default: "./prompts.db",
          })) as string);

    consola.success(`store → ${dbPath}`);

    // Construct bp now so the seed step can use it.
    const bp = betterPrompts({ store: new SqliteStore({ path: dbPath }) });

    // ─── 2. Bulk-seed existing prompt files ───────────────────────
    if (!args["skip-seed"]) {
      const dir = args["prompts-dir"];
      let candidates: string[] = [];
      if (dir) {
        candidates = await scanPromptDir(dir);
      } else {
        for (const d of DEFAULT_PROMPT_DIRS) {
          candidates.push(...(await scanPromptDir(d)));
        }
      }

      if (candidates.length === 0) {
        consola.info("no prompt files detected; skipping seed.");
      } else {
        consola.info(`detected ${candidates.length} prompt file(s):`);
        for (const f of candidates) {
          const rel = relative(process.cwd(), f);
          consola.log(`  • ${rel}  →  key "${deriveKey(f)}"`);
        }
        const proceed: boolean = yes
          ? true
          : ((await consola.prompt("seed these into the store?", {
              type: "confirm",
              initial: true,
            })) as boolean);
        if (proceed) {
          await bulkSeed(bp, candidates);
        } else {
          consola.info("skipped seeding.");
        }
      }
    }

    // ─── 3. Pick the LLM seam ─────────────────────────────────────
    let seam: LlmSeam = "claude-agent";
    if (args.seam) {
      if (!["claude-agent", "agent-api", "ai-sdk", "none"].includes(args.seam)) {
        consola.error(`Unknown seam "${args.seam}". Valid: claude-agent | agent-api | ai-sdk | none.`);
        process.exit(1);
      }
      seam = args.seam as LlmSeam;
    } else if (!yes) {
      const choice = await consola.prompt("LLM seam for evolve?", {
        type: "select",
        options: (Object.keys(SEAM_DESCRIPTIONS) as LlmSeam[]).map((s) => ({
          label: `${s} — ${SEAM_DESCRIPTIONS[s]}`,
          value: s,
        })),
        initial: "claude-agent",
      });
      seam = choice as LlmSeam;
    }
    consola.success(`seam → ${seam}`);

    // ─── 4. Write the boilerplate config ──────────────────────────
    if (!args["skip-config"]) {
      const out = args["config-out"] ?? "./bp.config.mjs";
      const proceed: boolean = yes
        ? true
        : ((await consola.prompt(`write boilerplate to ${out}?`, {
            type: "confirm",
            initial: true,
          })) as boolean);
      if (proceed) {
        const absOut = resolve(out);
        await mkdir(dirname(absOut), { recursive: true });
        if (await exists(absOut) && !yes) {
          const overwrite: boolean = (await consola.prompt(`${out} exists — overwrite?`, {
            type: "confirm",
            initial: false,
          })) as boolean;
          if (!overwrite) {
            consola.info("kept existing config.");
          } else {
            await writeFile(absOut, bpBoilerplate({ dbPath, seam }));
            consola.success(`wrote ${out}`);
          }
        } else {
          await writeFile(absOut, bpBoilerplate({ dbPath, seam }));
          consola.success(`wrote ${out}`);
        }
      }
    }

    // ─── 5. .gitignore ────────────────────────────────────────────
    if (!args["skip-gitignore"]) {
      const updated = await ensureGitignored(dbPath);
      if (updated) consola.success(`added ${dbPath} (+ -shm/-wal) to .gitignore`);
    }

    // ─── 6. Admin UI pointer ──────────────────────────────────────
    consola.box(
      [
        "next steps:",
        "",
        "  • write code against `bp` in your generated config",
        "  • run `bp list` to see what's seeded",
        "  • run `bp evolve <key> --reason \"...\"` to evolve via the chosen seam",
        "  • the admin UI lives in the better-prompts repo's `ui/` dir;",
        "    a published `@wopr-network/better-prompts-ui` package is",
        "    on the roadmap. for now, clone the repo and run it locally.",
        "",
        "  docs: https://github.com/wopr-network/better-prompts",
      ].join("\n"),
    );
  },
});
