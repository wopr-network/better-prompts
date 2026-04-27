# better-prompts — spec

The unit is an **artifact**. An artifact has revisions. Telemetry on an artifact is the invocations of those revisions and the signals attached to those invocations. The library is the substrate that makes those four things first-class.

The library owns: storage of revisions / invocations / signals, the seeded `_enhancer` meta-prompt, and the `evolve` orchestration. The library does **not** own LLM calls (those are the consumer's, via callback at evolve time only), template substitution (also the consumer's; vars and metadata reported to `record` are stored as telemetry), or any kind of body-content schema (no tokens, no validation — the body is an opaque string to the substrate).

## 1. The slot it fills

Every LLM-driven app eventually accumulates prompts that decay. Production traffic surfaces failure modes the original prompt didn't anticipate. The author edits, redeploys, accumulates more failures, edits again. The loop is manual and lossy. Failures aren't recorded systematically; edits aren't versioned; nobody can answer "what version of the prompt produced this output."

`better-prompts` turns that loop into infrastructure. Artifacts as versioned prose. Telemetry as recorded invocations and attached signals. AI-driven surgical edits as new revisions. Append-only history. The interface is what users of prompts already do, plus a thin wrapper that records and improves.

## 2. The four nouns

### Artifact

A named editable thing. In v0 every artifact is a prompt — opaque prose. The artifact is identified by a `key`; the actual content lives in its revisions. The library does not parse, validate, or schema-check the body.

### Revision

A point-in-time version of an artifact. Newest at the head of an append-only chain. Old revisions are never mutated.

```typescript
type Revision = {
  id: string;
  artifactKey: string;
  version: number;
  createdAt: string;
  body: string;
  source: "seed" | "manual" | "evolution" | "rollback";
};
```

### Invocation

What happened at runtime. Pinned to the exact revision that produced the output. Carries vars (template substitutions) and metadata (anything else the consumer wants the next evolution to see).

```typescript
type Invocation = {
  id: string;
  artifactKey: string;
  revisionId: string;                    // active revision at the time of the call
  output: string;                        // the LLM's response
  metadata: Record<string, unknown>;     // anything the consumer wants to attach
  date: string;
};
```

`id` and `date` are substrate-generated at write time. Consumers do not pass either; `record(...)` returns the persisted Invocation with both fields populated.

`metadata` is opaque to the substrate. The consumer puts whatever the next evolve should see — substitution vars they applied, the template body that was actually used (when an operator tweaked it in an admin UI before submitting), model id, latency, source tag, anything. The library never inspects, validates, or schema-checks this bag. The meta-prompt at evolve time reads it as untyped JSON.

### Signal

A verdict attached to an invocation after the fact. Multiple signals can attach to one invocation. Signals are the input to evolution.

```typescript
type Signal = {
  id: string;
  invocationId: string;
  verdict: "pass" | "fail";
  reason?: string;
  severity?: number;
  source?: string;
  date: string;
};
```

`id` and `date` substrate-generated at write time, same as Invocation.

## 3. The operations

```typescript
const bp = betterPrompts({ store });
```

No provider field. The library doesn't own an LLM.

### `get(key, body?, codeDate?)`

Returns the active revision for `artifactKey = key`. `body` is optional — pass it when this call site might be the first read (so it can act as the seed) or when it's bumping a `codeDate`. Omit it for reads on artifacts you know are already seeded elsewhere.

- Stored → return head, with the codeDate-merge applied if both `body` and `codeDate` are passed.
- Stored, no `body` (or no `codeDate`) → return head. Store is canonical.
- Stored, `codeDate` later than head → append a new revision with the supplied `body` (`source: "manual"`).
- Stored, `codeDate` earlier-or-equal → return head; store has evolved past code.
- Nothing stored, `body` passed → seed v1 with `body` (`source: "seed"`).
- Nothing stored, no `body` → throws with a teaching message: pass a default or call `bp.set(key, body)` first.

This is the toolstac `getOrStore` pattern. Source code stays the genesis seed and the operator's manual fallback while leaving the store canonical for everyday reads.

#### Two call shapes (and the one that throws)

`get` has two valid call shapes. The two-argument form `bp.get(key, body)` exists in the type signature only so that the throw can carry a teaching message; it is not a usable shape.

**Shape 1: `get(key)` — read-only.**

```typescript
const writer = await bp.get("writer");
```

Returns the active revision. **Throws** if no artifact exists at `key`. Use anywhere you assume the artifact is already seeded — a hot path, a service module that runs after a startup seed phase, a test that pre-seeded explicitly. The throw is the safety net: a typo in the key surfaces immediately rather than silently returning a wrong revision.

**Shape 2: `get(key, body)` — INVALID. Throws.**

```typescript
const writer = await bp.get("writer", "Write a {{kind}}."); // throws
```

This shape used to be "seed once, ignore future edits to the literal." It is gone because the silent-ignore was the migration footgun this library refuses to ship. The throw points the caller at Shape 3 (overwhelmingly the right answer) and at Shape 1 (for the read-only case).

**Shape 3: `get(key, body, discriminator)` — source-of-record / migration. The shape you almost always want.**

```typescript
const SUMMARIZE = "Summarize {{text}}.";
const SUMMARIZE_DATE = "2026-04-27"; // bump when you edit the literal above
const summarize = await bp.get("summarize", SUMMARIZE, SUMMARIZE_DATE);
```

This is the migration tool. The body in code stays the canonical source-of-record, the discriminator advances when the body changes, the substrate detects the advance and writes a new revision. Conventionally a date — ISO timestamps, file mtimes, database `updated_at` columns — but anything monotonic-when-the-body-changes works (a hash, a build number, a git commit short-sha turned into a sortable string).

The substrate compares `codeDate` to the stored revision's `createdAt`:

- `codeDate > stored.createdAt` → append a `"manual"` revision with `defaultBody` and return it (your code-side edit "wins")
- `codeDate ≤ stored.createdAt` → return the stored head (the store has evolved past code; code is now stale, by design)

The `codeDate` is the discriminator that lets the substrate distinguish "body in code right now is a new edit" from "body in code right now is the same body that produced the existing stored revision." Without it (Shape 2), every call looks identical to the substrate; the second-edit-doesn't-take-effect failure mode in Shape 2 is the direct consequence. Bumping the discriminator with every body edit is what makes Shape 3 work — forget to bump it and you're back in the Shape 2 trap.

Two writes with identical body and identical `codeDate` resolve to the same revision (no-op). A body change without bumping the date is silently dropped (return-head). A date bump appends, even if the body is identical to before — so don't bump the date without changing the body or you'll create no-op revisions.

**`bp.fromFile(path, { key? })` collapses Shape 3 to one call by pulling the body and `codeDate` from the file's content and mtime.** Use it for `.hbs` / `.md` / any text-on-disk prompt source. Default key is the basename without extension.

### `set(key, body)`

Unconditional append of a new revision. No `codeDate` reasoning; just "make this the new latest." If the artifact doesn't exist, seeds v1 (`source: "seed"`); otherwise appends `source: "manual"`. Use for admin-UI form submissions, scripted overrides, or any case where you have a body in hand and don't want to fake a `codeDate`.

### `record({ artifactKey, revisionId, output, metadata? })`

Persists an Invocation. The consumer calls this *after* they have rendered, called their LLM, and gotten the output back — the library never sees the LLM call. `metadata` is stored verbatim and shown to the meta-prompt at evolve time as untyped JSON context for that call. The consumer decides what's worth attaching: vars they substituted, the template body if they tweaked it, the model id, latency, source tag, anything. The substrate doesn't inspect it.

### `signal(invocationId, { verdict, reason?, severity?, source? })`

Attaches a Signal to an Invocation.

### `evolve(key, { reason, using })`

Triggers one improvement cycle for the artifact at `key`. The `using` field is the consumer's LLM callback — `(rendered: string) => Promise<string>`. The library:

1. Reads the active revision of `key` and its revision-scoped telemetry (which may be empty — that's fine).
2. Renders the seeded `_enhancer` artifact's active body with that telemetry plus the supplied `reason`.
3. Calls `using(rendered)` — this is the *only* place an LLM enters the substrate.
4. Appends the response as a new revision of `key` (`source: "evolution"`).

The `reason` is the load-bearing input. Telemetry (invocations + signals) is supplementary context: when present, the meta-prompt envelope shows the LLM what the consumer reported about a recent failing call. When absent, evolve still runs — the operator's reason is enough to drive a rewrite.

The library does not validate the response body. If the LLM dropped a placeholder the consumer's renderer cares about, the consumer's next render produces broken output, the consumer signal-fails, and the substrate evolves again. The body is opaque to the library by design.

Operates on **the active revision's telemetry only** — invocations of older revisions are preserved for provenance but don't feed into evolution of the current one. After step 4 the new revision is active and starts collecting telemetry from a clean slate.

Because step 2 renders `_enhancer` and step 3 calls the consumer's LLM, every call to `evolve` generates an invocation on `_enhancer` (the library records it on behalf of the consumer). The library collects telemetry on its own meta-prompt for free. If a rewrite was bad, signal-fail that invocation and call `evolve("_enhancer", { reason, using })` — same code path, by induction. The library uses itself; this is structural, not a feature flag.

### Other reads

- `history(key, limit?)` — revisions newest-first
- `rollback(key, targetVersion)` — appends a NEW revision (`source: "rollback"`) with the target's body
- `invocations(key, { limit? })` — recent invocations of an artifact
- `signals(invocationId)` — signals attached to an invocation

## 4. The append-only, revision-scoped invariants

**Append-only.** Revisions are never mutated or deleted. Invocations are never mutated. Signals are never mutated. Rollback appends; manual operator edits append; evolution appends. Every entry is queryable forever.

**Revision-scoped telemetry.** Every invocation carries `revisionId`, pinning it to the exact revision that produced it. Evolution reads only the active revision's telemetry — old revisions keep their telemetry for provenance but don't bleed into the next evolution. When a new revision is appended, telemetry collection starts fresh against it.

Together these mean: any consumer at any point in time can answer "what revision was active when this output was produced," signals never lose their target invocation, and the substrate can't accidentally evolve a new revision based on telemetry from a body that no longer exists. The provenance graph is intact.

## 5. What v0 ships

- `Store` interface + `SqliteStore` reference impl (SQLite + Drizzle in the IRepository pattern: one repo per table behind a Store facade). `:memory:` for tests, file path for prod, same code path. No raw SQL.
- `betterPrompts({ store })` factory returning `{ get, set, record, signal, evolve, history, rollback, invocations, signals }`
- The meta-prompt seeded as artifact `_enhancer`, body lifted byte-for-byte from toolstac
- TypeScript types for `Revision`, `Invocation`, `Signal`, `LLMCallback`, `Store`

That's it. No CLI, no admin UI, no Postgres adapter, no Redis adapter, no held-out evaluator, no A/B traffic split, no MCP server. No `Provider` config (the library never owns an LLM). No template renderer (the library never substitutes for the consumer).

## 6. What v0 explicitly does not promise

- **Held-out evaluation.** Toolstac doesn't evaluate either. Operator review is the trusted judge. Add an evaluator only when production traffic justifies the cost.
- **Auto-rollback on regression.** Same reason.
- **Traffic-split A/B mechanism, drift detection, MCP exposure, admin UI, CLI.** None of these in v0.

(Self-improvement of `_enhancer` is **not** in this list. It's not a feature; it's just how the substrate works. `_enhancer` is an artifact, every `evolve` records an invocation on it, signals attach, `evolve("_enhancer", { reason, using })` runs the same code path. By induction.)

## 7. Wiring example

```typescript
import { betterPrompts } from "@wopr-network/better-prompts";
import { SqliteStore } from "@wopr-network/better-prompts/store";
import { query } from "@anthropic-ai/claude-agent-sdk";

const bp = betterPrompts({
  store: new SqliteStore({ path: "prompts.db" }),
});

// Your LLM. Library never sees the reference.
const callMyLLM = async (rendered: string) => {
  let result = "";
  for await (const m of query({ prompt: rendered, options: { allowedTools: [] } })) {
    if (m.type === "result" && typeof (m as { result?: unknown }).result === "string") {
      result = (m as { result: string }).result;
    }
  }
  return result;
};

// Your renderer. Library never sees this either.
const render = (body: string, vars: Record<string, string>) => {
  let out = body;
  for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`\${${k}}`, v).replaceAll(`{{${k}}}`, v);
  return out;
};

// Read → render → call → record:
const tweet = await bp.get("tweet", DEFAULT, "2026-04-27");
const vars = { topic: "a small bookstore that sells coffee" };
const output = await callMyLLM(render(tweet.body, vars));
const inv = await bp.record({
  artifactKey: "tweet",
  revisionId: tweet.id,
  vars,
  metadata: { source: "publish-flow", model: "claude-sonnet-4-6" },
  output,
});

// Critique → evolve:
await bp.signal(inv.id, { verdict: "fail", reason: "lede repeats", source: "publish-validator" });
await bp.evolve("tweet", { reason: "validator keeps flagging repeats", using: callMyLLM });
```

That's the substrate, end to end. Artifact, revisions, invocations, signals — substrate-owned. Rendering and LLM calls — yours.
