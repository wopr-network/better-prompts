# lineage

Where `better-prompts` comes from. Why it exists. What it's an instance of.

## The substrate-layer position

Every project in TSavo's portfolio is an open programmable runtime where the spec is editable by its inhabitants. The runtime author writes the primitive — physics-as-prose, abilities-as-spec, AI-as-narrator — and the inhabitants grow the spec through use. Cunningham's wikis with editable text. LambdaMOO with editable in-world methods. Malice with editable abilities prose + AI narrator. Toolstac with editable prompts + AI enhancer. Nefariousplan with editable prompts + Claude workers. WOPR with editable plugin manifests + capability resolver.

Same architectural primitive, different substrate at each era's tooling. TSavo has occupied this position since the early-90s P2P scene. MD5-as-content-address (substrate primitive that BitTorrent and git later ran on). Digital Confetti for BitTorrent. ShareReactor's trusted-hash index. Feathercoin genesis. iFilm infrastructure. CBS int32→int64. Citicorp $100M-rescue. The substrate keeps changing; the position is constant.

`better-prompts` is the next substrate-layer primitive in that lineage. It names a slot every nontrivial LLM-driven application eventually needs and nobody wants to build twice.

## Direct ancestors

### toolstac (concrete forerunner)

`github.com/TSavo/toolstac.com` is the bespoke prompt-evolution implementation that proved the pattern. Three files compose its working framework:

- `prompt-store.ts` — Redis-backed versioned prose; newest at index 0; full history; `getOrStore` with code-date merge.
- `prompt-enhancer-agent.ts` — Claude Agent SDK rewrites the prompt file in place via a zip-based file-edit protocol; the meta-prompt that drives surgical editing lives at lines 187–372 of this file.
- `prompt-evolution-service.ts` — orchestrates evolve / history / compare / rollback; rollback is implemented as a new append (history is immutable).

The bespoke implementation works. It runs in toolstac production. It improves the humanizer prompt on every observed failure. `better-prompts` extracts the substrate, abstracts the LLM behind a one-line provider seam, names the four nouns explicitly (artifact / revision / invocation / signal), and ships a SQLite + Drizzle reference store in the IRepository pattern so the library does not commit consumers to Redis.

The reference/toolstac/ directory in this repo is verbatim lifts from toolstac. Implementations port them by reshaping; the meta-prompt at `core/prompt-enhancer-agent.ts:187-372` lifts byte-for-byte to the seeded `_enhancer` artifact.

### Malice (architectural cousin)

`github.com/TSavo/Malice` is a LambdaMOO-style TMMO engine. Its `docs/guides/ABILITIES-FIRST.md` names the deepest version of the same architectural pattern:

- Game physics aren't code. They're prose abilities + property descriptions.
- An AI narrator reads them as a unified physics document.
- The narrator runs in three roles: Bug Fixer (catch invalid intent), Narrator (execute valid intent), and **Creator** (when a novel valid interaction surfaces, add the ability text to the prototype). The Creator role grows the spec through use.

The Creator role is the operational form of "code is truth that LLMs modify as needed." `better-prompts` is the Creator role applied to prompts: when a prompt produces a failure case, the system extends the prompt's specification. The substrate auto-evolves while the operator sleeps.

### Nefariousplan (the in-flight consumer)

`nefariousplan.com` is true-cyber-crime publication. Its CLAUDE.md says: **"The product is the prompts."** The four prompt families (writer/triage `.hbs`, memory files, MCP tool descriptions, pattern page prose) are the institution. Every action in the repo either improves a prompt or degrades one.

Today the evolution loop is human-in-the-loop. Sir red-lines a draft; Sir edits the `.hbs` file; the next writer session reads the new prompt. This is the manual version of `better-prompts`'s automated loop. When the library ships, nefariousplan plugs in directly: failed publishes attach signals to the originating invocations, the library evolves the prompt, the next writer session reads the new revision. The substrate goes from "alive when Sir touches it" to "alive while Sir sleeps."

Nefariousplan is the first real consumer the library is being built for. Toolstac is the second (it migrates from its bespoke implementation to the library when stable). Future projects come with auto-evolving prompts from day one.

### WOPR (portfolio context)

`platform/sidecars/wopr` is the runtime-layer of TSavo's portfolio. Hono daemon + CLI + plugin host. Plugins free; hosted capabilities (TTS, ImageGen) monetized. Plugins declare `requires: ["tts"]` and the platform resolves generically.

`better-prompts` slots cleanly: it's a capability that any WOPR plugin needing LLM calls can declare via `requires: ["prompt-evolution"]`. The hosted-capability layer monetizes it; the library's primitive is given away.

Same pattern as the broader portfolio: build the runtime primitive, give the primitive away, capture value at the capability layer.

## Architectural ancestors (longer arc)

- **Cunningham's wiki (1995).** Editable text content as the substrate. Inhabitants are humans with edit permissions. Same architectural primitive: open programmable runtime where the spec is editable by its inhabitants.
- **LambdaMOO (1990).** Editable in-world methods stored alongside object data. Inhabitants are players with programming permissions. The Creator-role pattern in this library descends directly.
- **Git (2005).** Content-addressed storage as a substrate primitive. TSavo was upstream of this lineage with MD5-on-Napster a decade earlier; git refined the primitive. `better-prompts`'s append-only revision history is the same shape.
- **Bernstein's NaCl / Curve25519.** Cryptographic primitive given away; integrators eat the cost. Same monetization shape as WOPR + `better-prompts`.

The library is not original in shape. It is original in being the prompt-substrate slot's first dedicated occupant.

## What `better-prompts` is operationally

Three claims compressed:

1. **The prompts are the product.** The corpus, the posts, the LLM-extracted profiles, the in-world stories, the auto-generated tool pages — all exhaust. The prompts persist; the prompts compound; the prompts are what TSavo writes.
2. **Prompts decay under production traffic.** Every nontrivial app accumulates failure modes the original prompts didn't anticipate. The author edits, redeploys, accumulates more failures, edits again. Manual loop, lossy.
3. **The loop wants to be infrastructure.** Versioned storage, recorded invocations, attached signals, AI-driven surgical edits, append-only history, full lineage. None of it is novel individually; the integration is what's missing from the field.

`better-prompts` ships the integration as a library. Nefariousplan plugs in. Toolstac migrates. WOPR exposes it as a capability. Future projects come with it from day one. And because `_enhancer` is itself an artifact under the same management, every consumer can train their own enhancement style by signaling on its rewrites and evolving it. The product dogfoods its own prompts.

## Why this matters beyond the portfolio

Every LLM-driven application of any size eventually builds a worse version of this internally. The auto-evolving prompt loop is the kind of dependency that exists in every nontrivial product but is rarely shipped as a library because it sits at the awkward seam between LLM ops, MLOps, and prompt engineering. None of those communities own it.

Cunningham didn't get rich from wikis. The wiki was a primitive he gave away. The primitive's existence is what mattered. The same shape applies here. Whether `better-prompts` becomes a successful open-source library or stays inside the WOPR portfolio is a downstream question. The substrate-layer position is what's being claimed by writing it.
