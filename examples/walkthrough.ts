/**
 * better-prompts walkthrough: every operation, top to bottom, in order.
 *
 * Run: pnpm walkthrough
 *      pnpm walkthrough:fresh   (deletes walkthrough.db first)
 *
 * Read top to bottom. The library's API surface lays out in sequence:
 *
 *   1. wire(store)            — once, at app startup. Library has no LLM.
 *   2. get(key, body,
 *          codeDate?)         — seed an artifact OR push a manual edit
 *   3. render(body, vars)     — substitute placeholders. Your code, not lib's.
 *   4. consumer LLM call      — YOU call your model. Library doesn't see it.
 *   5. record(...)            — write the (revisionId, vars, output) row
 *   6. signal(invocationId,   — attach a verdict to a recorded invocation
 *             ...)
 *   7. evolve(key, { reason,  — library renders meta-prompt + hands it to your
 *             using })          callback; whatever you return is the new body.
 *   8. get + render + LLM
 *      + record again         — same call site, evolved body now active
 *   9. get with new codeDate  — operator pushes a manual edit
 *  10. history(key)           — read the append-only chain
 *
 * The library owns: storage of revisions, invocations, signals; the meta-prompt
 * for evolve; token-preservation enforcement; append semantics.
 *
 * The library does NOT own: your LLM calls, your rendering choices, when you
 * decide to evolve. Step 4 and Step 7's `using` are *your* code.
 */

import { unlinkSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import { betterPrompts } from "../src/index.js";
import { SqliteStore } from "../src/store/index.js";
import { claudeAgentProvider } from "./claude-agent-provider.js";

const DB_PATH = resolve(process.cwd(), "walkthrough.db");
if (process.argv.includes("FRESH=1") || process.env.FRESH === "1") {
  if (existsSync(DB_PATH)) unlinkSync(DB_PATH);
}

// ────────────────────────────────────────────────────────────────────────────
// 1. WIRE
// ────────────────────────────────────────────────────────────────────────────
// No `provider` field. The library doesn't talk to LLMs except when you tell
// it to (during evolve, via callback).

const store = new SqliteStore({ path: DB_PATH });
const bp = betterPrompts({ store });

// Your LLM is yours. Wire it however you like; the library never sees the
// reference. This particular helper happens to use the Claude Agent SDK.
const callMyLLM = claudeAgentProvider({ model: "claude-sonnet-4-6" });

// Your renderer is yours. The library doesn't ship one — variable substitution
// is not its concern. The vars you report back via `record(...)` are metadata
// for telemetry, not a request for the library to template anything.
function render(body: string, vars: Record<string, string>): string {
  let out = body;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`\${${k}}`, v).replaceAll(`{{${k}}}`, v);
  }
  return out;
}


// ────────────────────────────────────────────────────────────────────────────
// 2. GET — seed an artifact (first call) OR push a manual edit (later calls)
// ────────────────────────────────────────────────────────────────────────────
// `get` is how an artifact enters the substrate. Args:
//
//   key       : "tweet" — the artifact's stable id
//   body      : the source-code default body
//   codeDate? : ISO timestamp marking when this body was written in source
//
// First time you call get for a key, it seeds revision v1 from the body.
// Later calls behave according to codeDate:
//
//   no codeDate          → return the head; the store is canonical
//   codeDate ≤ head.date → return the head; evolution is ahead of code
//   codeDate >  head.date → append a new revision (source: "manual")
//
// codeDate is how an operator pushes a manual edit. Bump source default + bump
// codeDate + redeploy. Next get() catches the store up.

const TWEET_DEFAULT_V1 = `Write a tweet about \${topic}. Make it engaging.`;

const seeded = await bp.get("tweet", TWEET_DEFAULT_V1, "2026-04-26");
console.log(`step 2: seeded ${seeded.artifactKey} v${seeded.version} (source=${seeded.source})`);


// ────────────────────────────────────────────────────────────────────────────
// 3-5. RENDER → CALL YOUR LLM → RECORD
// ────────────────────────────────────────────────────────────────────────────
// Three explicit steps the consumer composes. No magic.

const TOPIC = "a small bookstore that sells coffee";

// 3. Render: substitute ${topic}/{{topic}} with the value. Pure, no I/O.
const rendered = render(seeded.body, { topic: TOPIC });

// 4. Call your LLM. Library never sees this call.
const firstOutput = await callMyLLM(rendered);

// 5. Record what happened. The Invocation is pinned to the exact revisionId.
const firstInvocation = await bp.record({
  artifactKey: "tweet",
  revisionId: seeded.id,
  vars: { topic: TOPIC },
  output: firstOutput,
});
console.log(`step 5: recorded invocation ${firstInvocation.id} (${firstOutput.length} chars)`);
console.log(`        output: ${firstOutput}\n`);


// ────────────────────────────────────────────────────────────────────────────
// 6. SIGNAL — attach a verdict to a recorded invocation
// ────────────────────────────────────────────────────────────────────────────
// Read the output. Decide it's bad. Attach a signal explaining why.
// The signal is keyed to the invocation, which is keyed to the revision —
// so the verdict lives forever pinned to the prompt that produced it.

await bp.signal(firstInvocation.id, {
  verdict: "fail",
  severity: 0.85,
  source: "walkthrough",
  reason: `Reads as generic AI-tweet voice. Stacked opening emojis, em-dashes, "that magical place," "come for the X stay for the Y" template, parenthetical winks, marketing filler, three trailing hashtags. Push the prompt for concrete specifics (real book titles, real drinks, real moments) and a human first-person voice. No em-dashes. 0–1 hashtag.`,
});
console.log(`step 6: signal attached to invocation ${firstInvocation.id}`);


// ────────────────────────────────────────────────────────────────────────────
// 7. EVOLVE — library renders meta-prompt; your callback runs your LLM
// ────────────────────────────────────────────────────────────────────────────
// `evolve` is the only function that needs an LLM, and it asks for one via
// callback. The library:
//   1. Reads the active revision and its telemetry (invocations + signals).
//   2. Renders the seeded `_enhancer` meta-prompt with that context.
//   3. Hands the rendered string to your `using` callback.
//   4. Takes whatever you return as the candidate new body.
//   5. Validates that all declared tokens still appear.
//   6. Appends the candidate as the next revision.

const evolved = await bp.evolve("tweet", {
  reason: "Outputs read as generic AI-tweet voice. Tighten the prompt to push for specific moments and real detail; ban template constructions, em-dashes, stacked emojis, generic hashtag stacks.",
  using: callMyLLM,
});
if (!evolved.ok) throw new Error(`evolve failed: ${evolved.reason}`);
console.log(`step 7: evolved → v${evolved.revision.version} (source=${evolved.revision.source})`);


// ────────────────────────────────────────────────────────────────────────────
// 8. SAME CALL SITE — evolved body now active
// ────────────────────────────────────────────────────────────────────────────
// Re-fetch the active revision. It's v2 now. Same render → LLM → record steps.

const head2 = await bp.get("tweet"); // Shape 1 — artifact already seeded; throws if missing
const rendered2 = render(head2.body, { topic: TOPIC });
const secondOutput = await callMyLLM(rendered2);
const secondInvocation = await bp.record({
  artifactKey: "tweet",
  revisionId: head2.id,
  vars: { topic: TOPIC },
  output: secondOutput,
});
console.log(`step 8: recorded invocation ${secondInvocation.id} on v${head2.version} (${secondOutput.length} chars)`);
console.log(`        output: ${secondOutput}\n`);


// ────────────────────────────────────────────────────────────────────────────
// 9. GET WITH A NEW codeDate — operator pushes a manual edit
// ────────────────────────────────────────────────────────────────────────────
// Operator decides to add a constraint evolution wouldn't have figured out.
// Edit source default + bump codeDate + redeploy. On next call to bp.get,
// store sees codeDate is fresher than head.createdAt and appends v3 (manual).

const TWEET_DEFAULT_V3 = `${TWEET_DEFAULT_V1}\n\nAdditional rule: never include a question mark. Tweets must be statements.`;
const manual = await bp.get(
  "tweet",
  TWEET_DEFAULT_V3,
  new Date(Date.now() + 1000).toISOString(),
);
console.log(`step 9: manual edit landed → v${manual.version} (source=${manual.source})`);


// ────────────────────────────────────────────────────────────────────────────
// 10. HISTORY — the append-only chain
// ────────────────────────────────────────────────────────────────────────────
// Newest first. Sources: "seed", "evolution", "manual", "rollback".

const chain = await bp.history("tweet");
console.log(`step 10: chain (newest first):`);
for (const rev of chain) {
  console.log(`         v${rev.version}  source=${rev.source}  ${rev.createdAt}`);
}

store.close();
