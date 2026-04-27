# contributing

Thanks for taking the time. This is a small library with a deliberately narrow scope; that's the design, not a TODO.

## Local setup

```bash
git clone https://github.com/wopr-network/better-prompts.git
cd better-prompts
pnpm install
pnpm test          # vitest run
pnpm typecheck     # tsc --noEmit
pnpm walkthrough   # examples/walkthrough.ts (uses Claude Agent SDK; needs ~/.claude auth)
```

The admin UI is a separate workspace at `ui/` with its own deps:

```bash
cd ui
pnpm install
pnpm dev   # http://localhost:3030
```

## Repo layout

```
src/                     # library source
  index.ts                 # the betterPrompts() factory + the five-verb API
  store/                   # Store interface + SqliteStore + KVStore
  agent-api.ts             # LLM seam: HTTP wrapper for coder/agentapi
  ai-sdk.ts                # LLM seam: Vercel ai SDK wrapper
  claude-agent.ts          # LLM seam: Claude Agent SDK (~/.claude OAuth)
  cli.ts / cli-onboard.ts  # bp / better-prompts CLI
  seeded-prompts/          # _enhancer body, lifted byte-for-byte from toolstac
tests/                   # vitest suites: substrate smoke, kv-store, agent-api, fromFile
examples/                # walkthrough + critique-and-evolve
docs/                    # QUICKSTART + MIGRATION
ui/                      # Next.js admin UI (private workspace; not published to npm)
reference/toolstac/      # the in-house implementation that proved the pattern
```

## Discipline

These are the load-bearing rules. They keep the substrate small.

**Don't paraphrase the meta-prompt.** `reference/toolstac/core/prompt-enhancer-agent.ts:187-372` is the surgical-editor-of-prompts prompt, production-tested. The byte-for-byte port lives at `src/seeded-prompts/enhancer.md`. Improvements to it happen through the substrate's own evolution loop after publish, not through manual edits during port. Same applies to any prompt content lifted from reference: byte-for-byte, then evolved through the substrate.

**The body is opaque to the substrate.** The library does not parse, validate, or schema-check revision bodies. No token field, no preservation check at evolve time. If the LLM drops a placeholder the consumer cares about, the consumer's renderer produces broken output, the consumer signal-fails, and the substrate evolves again. Don't reintroduce body inspection.

**Append-only, revision-scoped.** Revisions, invocations, and signals are never mutated or deleted. Rollback creates a NEW revision (`source: "rollback"`) with the target's body. Evolution reads telemetry of the active revision **only** — old invocations stay attached to their original revision for provenance, but never feed forward into a new evolution. These two invariants are the whole reason the substrate works; don't trade them for convenience.

**BYO LLM, no exceptions.** The library does not depend on `@anthropic-ai/sdk`, `@anthropic-ai/claude-agent-sdk`, `openai`, or any model provider as a hard dep. The optional peer deps in `package.json` (`@anthropic-ai/claude-agent-sdk`, `ai`, `unstorage`) are loaded by reference shims under `src/*` only when consumers import those subpaths. The only place an LLM enters the substrate is the `using` callback consumers pass to `evolve`.

**Consumer owns rendering.** The library doesn't ship a template engine. Consumers receive a body from `bp.get(...)` and substitute their own variables however they want (handlebars, mustache, raw `replaceAll`, anything). The `vars` they report via `bp.record(...)` are stored as telemetry metadata for evolve, not used by the library to render anything.

**Substrate independence.** No Next.js, no specific ORM beyond Drizzle for SqliteStore, no Redis client wrapper, no Vault, no logging framework. The Next.js admin UI is a separate workspace at `ui/`, not part of the library. If a contributor proposes coupling the library to anything WOPR-portfolio-specific, reject the PR.

**Library, narrow.** This is for codebases without a prompt platform. If you have Langfuse / Agenta / PromptLayer / Helicone, take the seeded `_enhancer` and propose reflective evolution there directly. We are not shipping platform adapters; that path was tried and walked away from. Don't reintroduce it without a long conversation about why.

## Branch + PR workflow

- Open an issue first if your change touches public API or the substrate's invariants. For bug fixes and tight scope, just open a PR.
- One change per PR. Don't bundle drive-bys into a feature PR or vice-versa.
- Conventional-style commits are appreciated but not enforced (`fix:`, `feat:`, `docs:`, `test:`).
- Tests pass + typecheck clean before review (CI enforces both).
- For UI-touching PRs, include a screenshot or short note about what you verified in the browser. Type checking and test suites verify code correctness, not feature correctness.

## When to ask first

- Changes to the public API of `betterPrompts(...)` or any `Store` interface method.
- Adding a new external dependency to `package.json` (peer or otherwise).
- Adding a new `Store` reference implementation that changes the contract shape.
- Changes to `src/seeded-prompts/enhancer.md` (the meta-prompt).

## When to proceed without asking

- Adding tests.
- Fixing bugs that don't change public API.
- Boy-scout cleanups in code that hasn't been called off-limits.
- Doc/README/CHANGELOG fixes.
- UI improvements that don't change the substrate's API surface.

## License

MIT — see [LICENSE](./LICENSE). Contributions are accepted under the same terms.
