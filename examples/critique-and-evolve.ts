/**
 * Read the existing tweet invocation in harness.db, attach a substantive
 * critique signal, and evolve. Prints the diff.
 */

import { resolve } from "node:path";

import { betterPrompts } from "../src/index.js";
import { SqliteStore } from "../src/store/index.js";
import { claudeAgentProvider } from "./claude-agent-provider.js";

const DB_PATH = resolve(process.cwd(), "harness.db");

const CRITIQUE = `Reads as generic AI-tweet voice. Concrete issues with the output ("☕📚 That magical place where you can't decide what to love more — the plot twist in chapter 12 or the caramel latte in your hand. Small bookstore, big soul. Come in for the coffee, stay for the story (or three). #Bookstore #CoffeeAndBooks #LocalLove"):

1. Stacked opening emojis (☕📚) are an AI-tweet tell. Real high-engagement tweets rarely lead with two stacked decorative emojis.
2. "That magical place where..." — anaphoric "that" with no antecedent. Stock AI marketing tic.
3. The supposed specifics are pseudo-specific: "chapter 12" and "caramel latte" pattern-match specificity without naming any real book, shop, or moment. They feel generated.
4. "Big soul" is empty marketing filler.
5. "Come in for the X, stay for the Y" is a stock template construction. Instantly recognizable as AI/marketing copy.
6. The "(or three)" parenthetical wink is a familiar AI cuteness pattern.
7. Three trailing hashtags read as spammy on modern Twitter; #LocalLove is exactly the kind of empty generic hashtag.
8. The em-dash is itself a tell of AI-generated prose. Avoid em-dashes entirely.

The prompt needs to push for:
- A specific moment or detail, not a list of features
- A human voice, not a brand voice
- No stacked opening emojis; no em-dashes; no template constructions; no parenthetical winks
- 0 or 1 hashtag, topical not generic
- Concrete specificity (a real book title, a real coffee, a real time of day) over pseudo-specific archetypes`;

async function main() {
  const store = new SqliteStore({ path: DB_PATH });
  const bp = betterPrompts({ store });
  const callMyLLM = claudeAgentProvider({
    model: "claude-sonnet-4-6",
    debug: true,
  });

  divider("EXISTING STATE");
  const head = await store.latestRevision("tweet");
  if (!head) {
    console.error('No "tweet" artifact in harness.db. Run pnpm walkthrough:fresh first.');
    process.exit(1);
  }
  console.log(`tweet revision: v${head.version} (${head.source})`);
  console.log(`body: ${head.body}`);

  const recent = await bp.invocations("tweet", { limit: 5 });
  console.log(`\ninvocations on this revision: ${recent.length}`);
  if (recent.length === 0) {
    console.error("No invocations to critique. Run pnpm walkthrough:fresh first.");
    process.exit(1);
  }
  const target = recent[0]!;
  console.log(`target invocation: ${target.id}`);
  console.log(`  topic : ${target.vars.topic}`);
  console.log(`  output: ${target.output}`);

  divider("ATTACHING CRITIQUE SIGNAL");
  const sig = await bp.signal(target.id, {
    verdict: "fail",
    reason: CRITIQUE,
    severity: 0.85,
    source: "human-review",
  });
  console.log(`signal ${sig.id} attached`);

  divider("EVOLVING");
  const t0 = Date.now();
  const result = await bp.evolve("tweet", {
    reason: "Outputs are generic AI-tweet voice. See the attached signal for the concrete critique. Tighten the prompt to push for specific moments and real detail, eliminate template constructions, em-dashes, stacked emojis, and generic hashtag stacks.",
    using: callMyLLM,
  });
  console.log(`elapsed: ${Date.now() - t0}ms`);

  if (!result.ok) {
    console.error(`\n❌ evolve failed: ${result.reason}`);
    store.close();
    process.exit(1);
  }

  divider("BEFORE — v" + head.version);
  console.log(head.body);
  divider("AFTER  — v" + result.revision.version);
  console.log(result.revision.body);

  divider("DONE");
  console.log(`tweet history: ${(await bp.history("tweet")).length} revisions`);
  console.log(`enhancer history: ${(await bp.history("_enhancer")).length} revisions`);
  store.close();
}

function divider(label: string) {
  const line = "━".repeat(Math.max(2, 70 - label.length - 2));
  console.log(`\n\n━━━ ${label} ${line}\n`);
}

main().catch((err) => {
  console.error("\nfailed:", err);
  process.exit(1);
});
