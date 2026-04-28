# @wopr-network/better-prompts

## 0.1.1

### Patch Changes

- f256228: Add `default` keys alongside `import` in every conditional export. Resolves `ERR_PACKAGE_PATH_NOT_EXPORTED` when CommonJS consumers (e.g. provekit's tsx 4.21 + `"type": "commonjs"` setup) try to load any subpath. Backwards-compatible — ESM consumers continue to resolve via the `import` condition; CJS resolvers now find the `default` fallback at the same target file.

  The package remains ESM-only at the file level (`"type": "module"`); this only fixes the resolution layer so loaders that walk the exports map find a target instead of bailing.

## 0.1.0

### Minor Changes

- bdf286f: First published release. The substrate is stable in shape; the public API has been hardened through several rounds.

  **Substrate.** Five-verb core: `get`, `set`, `record`, `signal`, `evolve`. Plus reads: `history`, `list`, `rollback`, `invocations`, `signals`. Three-shape `get` contract: read-only (`get(key)`), source-of-record (`get(key, body, discriminator)`), and an explicit throw on the deprecated two-argument form. Append-only revision history, revision-scoped telemetry, idempotent `_enhancer` self-seeding. The byte-for-byte toolstac surgical-editor meta-prompt seeded as `_enhancer` on first evolve.

  **Storage.** `SqliteStore` (better-sqlite3 + Drizzle) — zero-config default. `KVStore` over any [unstorage](https://unstorage.unjs.io) driver — covers ~30 backends (Redis, Vercel KV, Cloudflare KV, Upstash, S3, MongoDB, IndexedDB, fs, memory, etc.).

  **LLM seams.** `claude-agent` shim — Claude Agent SDK, OAuth via `~/.claude`. `agent-api` shim — wraps a running [coder/agentapi](https://github.com/coder/agentapi) server, covering 11+ agent CLIs (Claude Code, Codex, OpenCode, Aider, Goose, Gemini, Copilot, Amp, AmazonQ, Auggie, Cursor). `ai-sdk` shim — wraps Vercel's `ai` package, covering ~30 commodity providers (Anthropic, OpenAI, Bedrock, Vertex, OpenRouter, Mistral, Groq, Cohere, xAI, Gemini, etc.).

  **Helpers.** `bp.fromFile(path, { key? })` — read a prompt body from disk with mtime as the discriminator. Collapses Pattern B of the migration guide into one call. Default key is the file's basename without extension.

  **CLI.** `bp onboard` — guided + scriptable setup. Interactive by default; `--yes` for non-interactive defaults. `bp evolve <key> --reason "..." [--provider claude-agent|agent-api|ai-sdk]` — drive an evolution from the terminal. Read commands: `list`, `read`, `history`, `invocations`, `signals`. Write commands: `set` (stdin / file / arg), `signal`, `rollback`, `diff` (via system `diff -u` when available).

  **Admin UI.** Next.js workspace at `/ui` (`@wopr-network/better-prompts-ui`, not published to npm). Lists artifacts, edits the active body in a CodeMirror editor with markdown highlighting, invokes a rendered prompt, attaches signals, drives `evolve` from the browser, and shows revision history with expandable rows + inline unified diff (vs previous or vs active) + a "load into editor" path for editing a past revision forward as a new manual revision. Cmd+Enter saves; Cmd+Shift+Enter invokes.

  **Documentation.** README, SPEC, CONTRIBUTING, LINEAGE, QUICKSTART, MIGRATION. Verbatim toolstac reference under `reference/toolstac/`.
