## What this changes

One or two sentences. The "why" matters more than the "what."

## Scope

- [ ] One change per PR (no drive-by refactors bundled in)
- [ ] No paraphrasing of `src/seeded-prompts/enhancer.md` (improvements happen through the substrate's own evolution loop after publish)
- [ ] Append-only invariants intact (no mutation of revisions, invocations, or signals; rollback creates a new revision)
- [ ] No new hard dependency on a model provider SDK (BYO LLM)

## Tests

- [ ] `pnpm test` passes
- [ ] `pnpm typecheck` clean
- [ ] If UI-touching: ran `pnpm dev` in `ui/` and verified the change in a browser. Note what you verified:

## Public API impact

- [ ] No change to `betterPrompts(...)` shape, `Store` interface, or the seeded `_enhancer` body
- [ ] OR: opened an issue first and linked it: #
