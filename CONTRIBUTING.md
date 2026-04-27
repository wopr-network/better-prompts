# contributing

Guide for the next builder. Pick this up where the spec leaves off.

## Scope

v0 is the substrate. Not a kitchen sink.

- Three typed nouns: `Revision`, `Invocation`, `Signal`. (No `Token` type — bodies are opaque strings to the library.)
- Public API: `get`, `set`, `record`, `signal`, `evolve`, plus `history`, `rollback`, `invocations`, `signals` as reads.
- The library does NOT own LLM calls. The only place an LLM enters is the `using` callback consumers pass to `evolve`. Variable substitution is also the consumer's job; `vars` and `metadata` reported via `record` are stored as telemetry, not as a request to template anything. The library never inspects body content.
- One reference store: `SqliteStore` — SQLite + Drizzle in the IRepository pattern (one repo per table behind a Store facade). `:memory:` for tests, file path for prod, same implementation. No raw SQL.
- One seeded artifact: `_enhancer`, body lifted byte-for-byte from `reference/toolstac/core/prompt-enhancer-agent.ts:187-372`. Seeded on first `evolve` call via the same `get` path any consumer artifact uses.
- The library uses itself: every `evolve(key, { reason, using })` records an invocation against `_enhancer` automatically (it's a normal call through the consumer's `using` callback). Self-improvement of `_enhancer` is structural, not a feature flag.

That is the whole v0. No CLI, no admin UI, no Postgres adapter, no Redis adapter, no held-out evaluator, no policy abstraction, no signal collector / emitter dichotomy, no traffic-split, no MCP server. Those layer on top later **if a real consumer asks for them.** Don't speculate.

## Build order

Each step is shippable. Each step is one PR.

1. **Types + Drizzle schema + SqliteStore.** `src/store/schema.ts` defines the Drizzle schema (revisions, invocations, signals tables). `src/store/repositories.ts` defines `RevisionRepository`, `InvocationRepository`, `SignalRepository` — each takes a Drizzle DB handle and exposes typed queries for its table. `src/store/sqlite.ts` exports `SqliteStore` — composes the three repos and implements the public `Store` contract. Constructor takes a path (`:memory:` for tests, file for prod). Auto-applies schema on first connect. No raw SQL anywhere — every query goes through Drizzle.
2. **The factory and operations.** `src/index.ts` exports `betterPrompts({ store, telemetryWindow? })` — no provider, no renderer. Implement `get` (with `codeDate` merge), `set` (unconditional manual append), `record` (writes Invocation with `vars` + `metadata` + `output`), `signal` (attaches Signal), `evolve(key, { reason, using })` (renders the `_enhancer` meta-prompt + the consumer's `using` callback runs it + appendRevision). Plus `history`, `rollback`, `invocations`, `signals`. Smoke tests use a stub `LLMCallback` against `:memory:` SqliteStore.
3. **Seed the meta-prompt.** `src/seeded-prompts/enhancer.md` holds the byte-for-byte lift. The factory seeds `_enhancer` on first `evolve` call by going through `get("_enhancer", DEFAULT_FROM_MARKDOWN, CODE_DATE)` — same code path any consumer artifact uses.
4. **Reference LLM-callback example.** `examples/claude-agent-provider.ts` demonstrating the one-line plug for the Claude Agent SDK. Not shipped as `src/`. Lives in `examples/` so consumers can copy it. The example wraps the SDK in an `LLMCallback`-shaped function and passes it to both `bp.evolve({..., using})` and the consumer's own LLM calls.

That's v0.

## Discipline

**Don't paraphrase the meta-prompt.** `reference/toolstac/core/prompt-enhancer-agent.ts:187-372` is the surgical-editor-of-prompts prompt, production-tested. Copy it byte-for-byte into `src/seeded-prompts/enhancer.md`. Improvements happen through the library's own evolution loop after launch, not through manual edits during port. The same applies to any prompt content lifted from reference: byte-for-byte, then evolved through the substrate.

**The body is opaque to the substrate.** The library does not parse, validate, or schema-check revision bodies. No token field, no preservation check at evolve time. If the LLM drops a placeholder the consumer cares about, the consumer's renderer produces broken output, the consumer signal-fails, and the substrate evolves again. Don't reintroduce body inspection.

**Append-only, revision-scoped.** Revisions, invocations, and signals are never mutated or deleted. Rollback creates a NEW revision with the old body. Evolution reads telemetry of the active revision **only** — old invocations stay attached to their original revision for provenance, but never feed forward into a new evolution. These two invariants are the whole reason the substrate works; don't trade them for convenience.

**One PR per step.** No monolithic "shipped all the steps" PR. Each PR is independently reviewable and revertable.

**BYO LLM, no exceptions.** The library does not depend on `@anthropic-ai/sdk`, `claude-agent-sdk`, `openai`, or any model provider. The only place an LLM enters the substrate is the `using` callback consumers pass to `evolve`. Reference examples in `examples/` may import provider SDKs; `src/` may not.

**Consumer owns rendering.** The library doesn't ship a template engine. Consumers receive a body from `bp.get(...)` and substitute their own variables however they want (handlebars, mustache, raw `replaceAll`, anything). The `vars` they report via `bp.record(...)` are stored as telemetry metadata for evolve, not used by the library to render anything.

**Substrate independence.** No Next.js, no specific ORM, no Redis client wrapper, no Vault, no logging framework. `Store` reference implementations choose their own backend internals. If a contributor proposes coupling the library to anything WOPR-portfolio-specific (`@wopr-network/wopr` core, `@tsavo/nefariousplan-core`), reject the PR.

## Test discipline

- `InMemoryStore` MUST pass a shared `Store`-contract test suite. Future store implementations reuse the same suite.
- The factory's three operations test against a `MockProvider` returning deterministic responses.
- The token-preservation enforcement test uses a `MockProvider` that intentionally drops a token; assert rejection.
- Real-LLM end-to-end tests are tagged `@integration` and run manually before release.

## Versioning

- Revision versions increment by `+1` per artifact (simpler than toolstac's `+0.1`; numeric monotonic per artifactKey).
- Library package versions are semver. Interface-breaking changes are major bumps.
- A major bump MAY require a one-time migration of stored revisions; ship a migration tool with any major.

## When to ask Sir

- Before changing any public API signature after v0 ships.
- Before adopting any external dependency beyond TypeScript / a test framework.
- Before writing user-facing copy (READMEs, error messages). Voice matters.
- Before publishing the package publicly.

## When to proceed without asking

- Adding tests.
- Fixing bugs that don't change public API.
- Adding new `Store` reference implementations.
- Boy-scout cleanups in code Sir hasn't named as off-limits.
- Updating `reference/` if upstream toolstac evolves and the library should track it.
