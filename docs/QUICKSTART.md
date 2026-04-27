# quickstart

Zero to evolving prompts in five minutes.

## 1. Install

```bash
npm install @wopr-network/better-prompts
# or pnpm add / yarn add
```

That's it. SQLite ships zero-config; you don't need Redis, Postgres, or any other infrastructure to get started.

## 2. Create the file

```typescript
// prompts.ts
import { betterPrompts } from "@wopr-network/better-prompts";
import { SqliteStore } from "@wopr-network/better-prompts/store/sqlite";

export const bp = betterPrompts({
  store: new SqliteStore({ path: "./prompts.db" }),
});
```

The first call to `bp.evolve(...)` seeds an internal `_enhancer` artifact (the byte-for-byte toolstac meta-prompt). Everything else is your prompts.

## 3. Wire your LLM

The library never sees your LLM. You hand it a callback at evolve time. Anything `(rendered: string) => Promise<string>` works. Examples:

**Claude Agent SDK** (uses your local `~/.claude` credentials):

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

export const myLLM = async (rendered: string): Promise<string> => {
  let result = "";
  for await (const m of query({ prompt: rendered, options: { allowedTools: [] } })) {
    if (m.type === "result" && typeof (m as { result?: unknown }).result === "string") {
      result = (m as { result: string }).result;
    }
  }
  return result;
};
```

**Anthropic Messages API** (`ANTHROPIC_API_KEY`):

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
export const myLLM = async (rendered: string): Promise<string> => {
  const res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    messages: [{ role: "user", content: rendered }],
  });
  const first = res.content[0];
  if (!first || first.type !== "text") throw new Error("unexpected");
  return first.text;
};
```

**OpenAI** (`OPENAI_API_KEY`):

```typescript
import OpenAI from "openai";

const client = new OpenAI();
export const myLLM = async (rendered: string): Promise<string> => {
  const res = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: rendered }],
  });
  return res.choices[0]?.message?.content ?? "";
};
```

The `ui/` package ships these and four more (OpenRouter, Bedrock, Vertex, Codex) as drop-in modules under `ui/lib/providers/`. Lift any one for your app.

## 4. Read → render → call → record

`bp.get` has two valid shapes:

| Shape | Behavior |
|---|---|
| `bp.get(key)` | Returns the active revision. **Throws** if not seeded. Use when you know the artifact exists. |
| `bp.get(key, body, discriminator)` | The migration shape. The body is your literal source-of-record; the discriminator is anything that advances when you edit the body (a date, mtime, hash, build number). The substrate writes a new revision when the discriminator advances and returns the stored head when the store has evolved past code. **This is the shape you almost always want.** |

The two-argument `bp.get(key, body)` form throws — it used to seed-once-then-silently-ignore-edits and that silent ignore is the migration footgun this library refuses to ship.

```typescript
import { bp } from "./prompts.js";
import { myLLM } from "./llm.js";

const TWEET = `Write a tweet about \${topic}. Voice: dry, specific. No hashtags.`;
const TWEET_VERSION = "2026-04-27"; // bump when you edit TWEET

// First call seeds v1. Future calls return whichever revision the substrate
// considers active — the literal if nothing has been written, or whatever
// evolve has produced since.
const tweet = await bp.get("tweet", TWEET, TWEET_VERSION);

// You render — library never templates. Use whatever you already use:
// raw replaceAll, handlebars, mustache, langchain, your own.
const render = (body: string, vars: Record<string, string>) => {
  let out = body;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`\${${k}}`, v).replaceAll(`{{${k}}}`, v);
  }
  return out;
};

const vars = { topic: "a small bookstore that sells coffee" };
const rendered = render(tweet.body, vars);

// You call your LLM. Library never sees this call.
const output = await myLLM(rendered);

// Record what happened. Vars + metadata are stored verbatim as telemetry.
const inv = await bp.record({
  artifactKey: "tweet",
  revisionId: tweet.id,
  vars,
  metadata: { source: "demo", model: "claude-sonnet-4-6" },
  output,
});

console.log(output);
```

Run it. You have an Invocation pinned to revision 1.

## 5. Critique → evolve

```typescript
// You read the output, decide it's bad, attach a critique signal:
await bp.signal(inv.id, {
  verdict: "fail",
  reason: "lede repeats; em-dashes; generic hashtag stack",
  source: "manual-review",
});

// When you've accumulated some signals, evolve. The library renders the
// _enhancer meta-prompt with the active body + recent telemetry + your
// reason, hands the rendered string to your `using` callback, and stores
// whatever you return as a new revision.
await bp.evolve("tweet", {
  reason: "outputs are generic AI-tweet voice; tighten for specific detail",
  using: myLLM,
});

// Next time anyone calls bp.get("tweet", TWEET, TWEET_VERSION), they get the
// evolved body — same line of code, evolved prompt underneath. (Don't bump
// TWEET_VERSION unless you've edited TWEET; bumping it without a body change
// would create a no-op revision.)
const v2 = await bp.get("tweet", TWEET, TWEET_VERSION);
console.log(v2.version); // 2
console.log(v2.source);  // "evolution"
```

## 6. Read history

```typescript
const chain = await bp.history("tweet");
// [
//   { version: 2, source: "evolution", body: "...", createdAt: "..." },
//   { version: 1, source: "seed",      body: "...", createdAt: "..." },
// ]

const recent = await bp.invocations("tweet", { limit: 10 });
// last 10 invocations, newest first

const sigs = await bp.signals(invocationId);
// signals attached to one invocation
```

## 7. Run the admin UI (optional)

If you want a textarea-and-buttons surface to invoke / signal / evolve interactively:

```bash
cd ui && pnpm install && pnpm dev
```

Opens on http://localhost:3030. Pick a provider via `BETTER_PROMPTS_PROVIDER` (default `claude-agent`); see `ui/README.md` for the matrix.

## What you didn't do

- You didn't run a database. SQLite ships in-process.
- You didn't configure a templating engine. Your renderer is whatever you already had.
- You didn't sign up for a service. The library makes zero network calls — only the LLM callback you control does.
- You didn't lock in a provider. Swap `myLLM` for any function returning a string from a string.

## Where to next

- [SPEC.md](../SPEC.md) — the full substrate design
- [docs/MIGRATION.md](./MIGRATION.md) — how to move existing prompts (string constants, `.hbs` files, Redis, a database column) into the substrate without rewriting your app
- [CONTRIBUTING.md](../CONTRIBUTING.md) — implementation discipline if you're shipping changes back
