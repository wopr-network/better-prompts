# reference material

Verbatim artifacts lifted from existing implementations. Do not edit. Reshape into the library's own form when implementing — these are the substrate the next builder reads first, not the substrate the next builder ships.

The prompts in particular are the product. Don't paraphrase them when porting; copy and adapt. Lossless transfer, then surgical adaptation. Anything else dilutes what the original author put in.

## toolstac/

Lifted from `github.com/TSavo/toolstac.com` on 2026-04-26. The bespoke prompt-evolution implementation that motivated extracting the library. Contains the working framework, the meta-prompts that drive enhancement, and the admin-UI shape.

### toolstac/core/

The four files that compose the bespoke evolution loop. Each maps onto one of the library's `I*` interfaces.

- **`prompt-store.ts`** — Redis-backed versioned store. Maps to `IStore`. The `getOrStore` method's "code-date overrides DB if newer" pattern is worth preserving as an option in the library's reference store impl. The `prompt:KEY:list` + `prompt:KEY:ID` two-key Redis layout is the storage shape; reproduce or replace.
- **`prompt-evolution-service.ts`** — Orchestrates evolve / history / compare / rollback. Maps to a thin layer over `PromptLibrary`. Note that rollback is implemented as a NEW append (history is immutable) — preserve this discipline.
- **`prompt-enhancer-agent.ts`** — The AI-driven prompt rewriter. Maps to `IEnhancer`. The zip-based file-edit protocol (pre-create directory, zip, send to Claude, extract zip back) is the production-tested implementation; do not invent a different one without strong reason. **The meta-prompt that teaches Claude how to be a "prompt surgeon" lives at lines 187–372 of this file.** That string is the most load-bearing artifact in this whole reference set. It defines the editorial voice of the auto-evolution loop. Copy it; do not paraphrase it.
- **`claude-sdk-cached-proxy.ts`** — Wraps the Claude Code SDK proxy with Redis caching keyed on prompt content. Maps to one possible `IProvider`. The cache-first-then-pass-through pattern is reusable.

### toolstac/types/

- **`prompt.ts`** — The minimal `Prompt`, `PromptToken`, `PromptInvocation` types. Maps to `IStoredPrompt` + `TokenSpec` + a partial form of `ISignal`'s context.
- **`universal-prompt.ts`** — A more elaborate type system supporting categories, template engines (handlebars / string-template / raw), source tracking, and usage telemetry. Closer to where the library should land — port the category enum and the `templateEngine` discriminator forward.

### toolstac/api-route/

- **`route.ts`** — The Next.js API route that the admin UI calls to trigger an evolution. Job-queue-coupled (uses `JobManager.createJob`); the library version should expose the same surface but routed through `lib.run(promptId)` directly. The validation pattern (typed body, structured error responses) is reusable.

### toolstac/admin-ui/

React components for the bespoke admin panel. The library doesn't ship UI in v0, but if/when an admin package gets built, these are the shapes that have already worked in production:

- **`PromptEvolver.tsx`** — The evolution-trigger UI. 442 lines; carries the entire UX flow.
- **`PromptEditor.tsx`** — Direct prompt-text editing.
- **`PromptsTable.tsx`** — The list view.

Don't ship these as-is — the library's UI needs to be substrate-agnostic (no `@/lib/dal` / `@/lib/job-manager` / Toolstac-specific styling). Port the UX moves, redo the wiring.

### toolstac/seed-scripts/

- **`seed-humanizer-prompt.ts`** — How to seed an initial prompt into the store at install time. The library's `init` command should look like this.
- **`reseed-humanizer-prompt.ts`** — How to force-overwrite a stored prompt with a known-good version (operator escape hatch). Useful when an evolution has gone bad and the rollback target is also bad.
- **`check-prompt.js`** — Diagnostic helper. Read for the pattern of how operators verify what's currently stored.

### toolstac/seeded-prompts/

The actual prompt content that toolstac ships. Reference for what real seeded prompts look like:

- **`humanizer-original-prompt.txt`** — The original v1 humanizer prompt. The thing the evolution loop has been improving against.
- **`twitter-strategy.hbs`** / **`twitter-growth-strategy.hbs`** — Handlebars-templated prompts. Examples of what the `templateEngine: 'handlebars'` shape produces.

### toolstac/PROMPT_EVOLUTION.md

The architectural overview from toolstac's docs/. Covers the same ground as `../../SPEC.md` but from the bespoke implementation's perspective. Useful for triangulating "what does the library spec match in toolstac, and what does it diverge from."

## How to use this reference

1. Read `toolstac/PROMPT_EVOLUTION.md` first for the bespoke architecture.
2. Read `../../SPEC.md` for the abstracted library shape.
3. Diff them mentally — where does the library go further (typed `ISignal`, real `IEvaluator`, policy abstraction) vs. where does toolstac already have the right answer (zip-based file-edit, two-key Redis layout, surgical-not-rewrite voice).
4. When implementing each `I*`, open the matching toolstac file and port what's there. Reshape — don't retype from memory.
5. The meta-prompt at `core/prompt-enhancer-agent.ts:187-372` is sacred. It is the prompt that runs every prompt rewrite. Lift it to the library's reserved id `promptlib.enhancer` verbatim. Improvements happen through the library's own evolution loop, not through manual editing during port.

## Source attribution

- Repo: `github.com/TSavo/toolstac.com` (private)
- Commit reference: lifted 2026-04-26
- Author: TSavo (Kevlar)
- License: needs explicit grant for public release of the library; until then this directory is for internal portfolio use only.
