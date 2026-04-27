# migration

Moving existing prompts into the substrate. Common shapes; minimum-invasive paths.

## The principle

Wherever your prompts live today — string constants in code, `.hbs` files, a Redis list, a database column, a config file, langchain templates, system prompts in env vars — replace the *read site* with `bp.get(key, currentValue, discriminator)`. Everything else stays. Your renderer keeps rendering. Your LLM keeps being called. The library captures the read so it can replace the value with an evolved one over time.

The `discriminator` is the load-bearing argument. It is whatever signal already exists in your setup that says "this prompt's body has been revised" — an ISO date you bump on edit, a file's mtime, a database `updated_at` column, a content hash, a build number. The substrate uses it to detect when your code-side body is a new edit versus the same body that produced the existing stored revision. Without it, the library would silently ignore your edits and the entire migration story would break — which is why the two-argument `bp.get(key, body)` form throws.

You do not need to delete the source-of-truth on day one. The current value becomes the seed; the store grows past it through evolution.

## Pattern A: hardcoded string constants

You have prompts as string literals in TS or Python:

```typescript
// before
const SUMMARIZE = `Summarize the following text in three sentences. Voice: \${voice}.`;

async function summarize(text: string, voice: string) {
  const rendered = SUMMARIZE.replaceAll("${voice}", voice).replace("text", text);
  return await myLLM(rendered);
}
```

Wrap the read:

```typescript
// after
const SUMMARIZE = `Summarize the following text in three sentences. Voice: \${voice}.`;
const SUMMARIZE_DATE = "2026-04-27"; // bump when you edit the literal above

async function summarize(text: string, voice: string) {
  const active = await bp.get("summarize", SUMMARIZE, SUMMARIZE_DATE);
  const rendered = active.body.replaceAll("${voice}", voice).replace("text", text);
  const output = await myLLM(rendered);
  await bp.record({ artifactKey: "summarize", revisionId: active.id, vars: { voice }, output });
  return output;
}
```

Now: the literal is the seed. The library returns the active revision (initially equal to the literal). When you edit the literal, bump `SUMMARIZE_DATE` — the new value becomes a new revision automatically. When you call `bp.evolve("summarize", ...)` instead, the store grows past the literal entirely; the literal stays in code as documentation but is no longer the canonical value.

You can drop the date bump once you've stopped editing the literal (if the date doesn't advance, the store's evolved version stays canonical).

## Pattern B: `.hbs` / `.md` / template files on disk

You have prompts in files:

```typescript
// before
import { readFileSync } from "node:fs";
const TEMPLATE = readFileSync("./prompts/writer.hbs", "utf8");

async function write(vars: Record<string, string>) {
  const rendered = handlebars.compile(TEMPLATE)(vars);
  return await myLLM(rendered);
}
```

Use `bp.fromFile` — it does the read + stat + codeDate dance for you:

```typescript
// after
async function write(vars: Record<string, string>) {
  const active = await bp.fromFile("./prompts/writer.hbs");
  // active.artifactKey defaults to "writer" (basename without extension);
  // pass { key: "..." } to override.

  const rendered = handlebars.compile(active.body)(vars);
  const output = await myLLM(rendered);
  await bp.record({ artifactKey: active.artifactKey, revisionId: active.id, vars, output });
  return output;
}
```

The file is now the seed-of-record. Editing the file bumps mtime, which beats the stored codeDate, which appends a manual revision automatically on next read. Same workflow as before, plus the option to evolve through the library when you'd otherwise be hand-editing the file.

For prompt files shipped alongside source code, pass a `URL` to resolve relative to the calling file:

```typescript
const active = await bp.fromFile(new URL("./prompts/writer.hbs", import.meta.url));
```

If you're moving away from on-disk files entirely (the file becomes a frozen seed and all real edits happen through evolution), drop `bp.fromFile` and pass a string literal as the seed instead — same as Pattern A.

## Pattern C: Existing prompts in a database column

You have prompts in `ai_prompts` rows:

```typescript
// before
const row = await db.query("SELECT body FROM ai_prompts WHERE name = $1", ["writer"]);
const rendered = renderTemplate(row.body, vars);
```

One-time backfill seeds them, then read through the library:

```typescript
// one-time backfill script
const rows = await db.query("SELECT name, body FROM ai_prompts");
for (const row of rows) {
  await bp.set(row.name, row.body); // seeds v1 if missing
}
// then in your app — Shape 1, since the artifact is now seeded:
const active = await bp.get("writer");
```

Or skip the backfill and seed lazily — every read site can carry the row's current value as the default:

```typescript
const row = await db.query("SELECT body FROM ai_prompts WHERE name = $1", ["writer"]);
const active = await bp.get("writer", row.body, row.updated_at);
const rendered = renderTemplate(active.body, vars);
```

`row.updated_at` is a natural codeDate. If the DBA edits the row, the new value beats the stored value. Once everything moves to evolve-through-library, retire the `ai_prompts` table.

## Pattern D: Toolstac-style Redis prompts

If you have toolstac's `prompt:KEY:list` + `prompt:KEY:ID` Redis layout:

```typescript
// migration script
import { Redis } from "ioredis";
const old = new Redis(process.env.OLD_REDIS_URL!);

const keys = await old.keys("prompt:*:list");
for (const listKey of keys) {
  const name = listKey.split(":")[1]; // prompt:NAME:list → NAME
  const latestId = await old.lindex(listKey, 0);
  if (!latestId) continue;
  const json = await old.get(`prompt:${name}:${latestId}`);
  if (!json) continue;
  const promptObj = JSON.parse(json) as { prompt: string };
  await bp.set(name, promptObj.prompt); // appends a v1 (or vN+1) into better-prompts
}
```

History from the old store doesn't carry forward by default — you import head only. If you need to preserve the full revision chain, walk `lrange(listKey, 0, -1)` newest→oldest and `bp.set` each in reverse. That way the oldest entry becomes v1 and you preserve order.

Telemetry from the old store (toolstac's `prompt:KEY:invocations` list) maps directly: each invocation becomes a `bp.record(...)` call against whichever revision was active at that timestamp. Backfilling telemetry is optional; most consumers just start fresh.

## Pattern E: LangChain / framework prompt templates

LangChain (and similar) wrap prompts in their own template objects. The library doesn't conflict with that — it just gives you a substrate for the *body* the framework templates over.

```typescript
// before
import { PromptTemplate } from "langchain/prompts";
const prompt = PromptTemplate.fromTemplate("Summarize {topic}. Voice: {voice}.");
const rendered = await prompt.format({ topic, voice });
```

```typescript
// after
const active = await bp.get("summarize", "Summarize {topic}. Voice: {voice}.", "2026-04-27");
const prompt = PromptTemplate.fromTemplate(active.body);
const rendered = await prompt.format({ topic, voice });
const output = await myLLM(rendered);
await bp.record({ artifactKey: "summarize", revisionId: active.id, vars: { topic, voice }, output });
```

LangChain still does the templating. The library just owns the body. Same for any framework that takes a template string — Mustache, Liquid, Pebble, your own.

## Pattern F: Multiple prompts, one config file

You have a `prompts.yaml` or similar:

```yaml
writer: |
  Write a {kind} about {topic}.
summarizer: |
  Summarize {text} in {sentences} sentences.
```

Load once, seed all:

```typescript
import yaml from "yaml";
import { readFileSync } from "node:fs";

const prompts = yaml.parse(readFileSync("./prompts.yaml", "utf8")) as Record<string, string>;
for (const [key, body] of Object.entries(prompts)) {
  await bp.get(key, body, "2026-04-27"); // codeDate to be the date of the file
}
```

Bump the codeDate when you edit the YAML. Or, again, drop the YAML once everything goes through evolve.

## What if my prompts have multiple versions / revisions / a/b variants today?

The library's substrate is one active revision per artifact. If you currently have explicit a/b variants, decide whether they should be:

1. **Separate artifacts** — `tweet.formal` and `tweet.casual` are two artifact keys. Each evolves independently. Your code picks which to invoke. (Most common.)
2. **One artifact with a variant token in the body** — the variant is part of `vars` and the prompt branches internally. Single evolve track; the LLM rewrites the whole thing.
3. **A/B in your runtime layer above the library** — feature-flag which artifact key to read. Library doesn't see the experiment; you do.

The library doesn't ship A/B traffic-split machinery. That's a separate concern; consumer brings (and most consumers' existing infra already has it).

## Don't migrate if you don't need to

The library is a substrate — adopt where you'd benefit from versioning, telemetry, evolution. If a prompt has been stable for two years and never failed, leave it. Migration carries cost; the library returns value when prompts decay under production traffic, not before.

Adopt incrementally: pick the prompt that fails most often, wrap it first, see whether the evolve loop produces a better revision than your manual edits. Add more once the loop has paid for itself.
