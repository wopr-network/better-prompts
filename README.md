# better-prompts

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](tsconfig.json)
[![Status: pre-release](https://img.shields.io/badge/status-pre--release%20v0-orange.svg)](#status)

> Yo dawg, I heard you like enhancement prompts — so we put an enhancement prompt in your enhancement prompt, so you can enhance your enhancement prompt while enhancing your prompts.

Drop in where you already load prompts. Get better prompts over time.

```typescript
import { betterPrompts } from "@wopr-network/better-prompts";
import { SqliteStore } from "@wopr-network/better-prompts/store";

const bp = betterPrompts({
  store: new SqliteStore({ path: "prompts.db" }),
});

// 1. Read the active body. Pass your literal as the source-of-record and a
//    discriminator that advances when the literal changes. First call seeds.
const tweet = await bp.get("tweet", DEFAULT_TWEET_BODY, "2026-04-27");

// 2. Substitute your own variables. The library never templates anything for
//    you — your renderer is yours.
const rendered = render(tweet.body, { topic: "a small bookstore that sells coffee" });

// 3. Call your LLM. The library never sees this call.
const output = await myLLM(rendered);

// 4. Record what happened. `vars` is metadata reporting what you substituted.
const inv = await bp.record({
  artifactKey: "tweet",
  revisionId: tweet.id,
  vars: { topic: "a small bookstore that sells coffee" },
  output,
});

// 5. Read the output, decide it's bad, attach a critique signal.
await bp.signal(inv.id, {
  verdict: "fail",
  reason: "lede repeats; em-dashes; generic hashtag stack",
  source: "operator-review",
});

// 6. When you want better prompts, evolve. The library renders the meta-prompt
//    and hands it to your `using` callback; whatever you return is the new body
//    (after token-preservation check).
await bp.evolve("tweet", {
  reason: "outputs are generic AI-tweet voice; tighten for specific detail",
  using: myLLM,
});

// Next time anyone calls bp.get("tweet", DEFAULT_TWEET_BODY, "2026-04-27"),
// they get the evolved body — same line of code, evolved prompt underneath.
```

## Who this is for

Codebases where prompts live in `.hbs` files, string constants, a database column, Redis, or wherever your repo decided to put them. The library gives you a small substrate that turns those literals into evolvable artifacts: revisions, telemetry, a seeded meta-prompt that rewrites under critique. The default `SqliteStore` plus the `unstorage`-backed `KVStore` (Redis, Cloudflare KV, fs, ~30 backends) cover the no-platform path end to end.

If you're already on a prompt-management platform (Langfuse, Agenta, PromptLayer, Helicone), don't install this. The four nouns the library defines are nouns those platforms already expose natively. Take the seeded `_enhancer` from [`src/seeded-prompts/enhancer.md`](./src/seeded-prompts/enhancer.md), register it in your platform's prompt registry, render it with your active prompt body plus recent telemetry plus a critique reason, and apply the rewrite via your platform's normal version API. Reflective evolution is a feature that belongs on your platform, not on a translation layer above it.

## The four nouns

- **Artifact** — a named editable thing. In this library, every artifact is a prompt.
- **Revision** — a point-in-time version of an artifact. Append-only chain. Newest at the head.
- **Invocation** — a recorded call, pinned to the exact revision that produced its output.
- **Signal** — a verdict attached to an invocation. Fail-with-reason is the input to evolution.

Telemetry is revision-scoped. Evolution of revision N reads only invocations made under revision N — old telemetry is preserved for provenance but never bleeds into the next revision's training set. When evolution writes revision N+1, telemetry collection starts fresh.

## What the library owns

- Storage of revisions, invocations, signals (append-only)
- The seeded `_enhancer` meta-prompt (byte-for-byte from toolstac)
- `evolve` orchestration: rendering the meta-prompt with the active body + telemetry + reason, calling your `using` callback, appending the new revision

## What the library does NOT own

- **Your LLM.** The library doesn't ship one and doesn't import one. The only place an LLM enters the substrate is through the `using` callback you pass to `evolve`.
- **Your rendering.** Variable substitution is a thing your code does. The `vars` you report via `record(...)` are metadata for telemetry, not a request for the library to template anything.
- **When you call your LLM.** The library doesn't wrap or schedule consumer LLM calls. It just stores what you tell it to store.

## How `_enhancer` becomes yours

The artifact at the reserved key `_enhancer` is the prompt that drives `evolve`. Seeded byte-for-byte from the toolstac lift at install time. Lives in the same store as your prompts. Every call to `evolve("...", { using })` invokes `_enhancer`'s active revision via your callback. So:

```typescript
// Some evolution produces a rewrite you don't like.
const evolved = await bp.evolve("writer.outline", { reason: "lede repeats", using: myLLM });

// Find the _enhancer invocation that produced it (the most recent one):
const [rewriteInvocation] = await bp.invocations("_enhancer", { limit: 1 });

// Tell the substrate the rewrite was wrong for your domain:
await bp.signal(rewriteInvocation.id, {
  verdict: "fail",
  reason: "rewrites flatten our voice — we want sharper tone, not safer prose",
});

// After enough such signals, evolve _enhancer itself.
await bp.evolve("_enhancer", { reason: "rewrites flatten our voice", using: myLLM });
```

The new `_enhancer` revision becomes active. Future `evolve(...)` calls use it. Telemetry collection on `_enhancer` starts fresh against the new revision. If the new `_enhancer` is worse, `bp.rollback("_enhancer", goodVersion)` appends the good body forward. Or bump `codeDate` at your `get` site to force the toolstac seed back.

The library ships with one opinionated meta-prompt. Your usage shapes it. The recursion is just how the substrate works — `_enhancer` is an artifact, calls of it are invocations, signals attach to invocations, evolve operates on telemetry. By induction.

## Status

Pre-release v0. Deliberately narrow: a substrate for codebases without a prompt platform. Storage adapters ship for SQLite (default) and the ~30 KV backends `unstorage` exposes; nothing else is on the roadmap. The substrate API (`get` / `set` / `record` / `signal` / `evolve` plus reads) is stable; expect interface stability commitments at v1. The library has not yet been published to npm. Install from a git checkout for now; see [CONTRIBUTING.md](./CONTRIBUTING.md) for the build path.

## Read

- [docs/QUICKSTART.md](./docs/QUICKSTART.md) — zero to evolving prompts in five minutes
- [docs/MIGRATION.md](./docs/MIGRATION.md) — moving prompts from string constants, `.hbs` files, Redis, a database column, LangChain templates, or wherever they live now
- [SPEC.md](./SPEC.md) — the substrate in detail
- [CONTRIBUTING.md](./CONTRIBUTING.md) — implementation discipline
- [LINEAGE.md](./LINEAGE.md) — where this comes from
- [examples/walkthrough.ts](./examples/walkthrough.ts) — the whole API top to bottom
- [reference/toolstac/](./reference/) — the in-house implementation that proved the pattern

## Related

- [nefariousplan.com](https://nefariousplan.com): true cyber crime, post-CVE. The editorial pipeline that drove the patterns this library encodes.
- [horizon-city.com](https://horizon-city.com): *Horizon City*, a cyberpunk fiction anthology, and *I Hate It Here*, a blog about cyber terrorism.
- [WOPR Network](https://github.com/wopr-network): the org this library lives in.
