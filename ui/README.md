# better-prompts admin

Reference UI for the library. Drops on top of the same `betterPrompts({ store })` instance everything else uses. Lets an operator: create artifacts, edit the active body, fill in vars, hit invoke, see the output, signal pass/fail, evolve.

The UI is a thin surface. All the substrate logic lives in the parent library — this is just the easiest way to drive it during testing.

## Setup

```bash
pnpm install
pnpm dev
```

Opens on http://localhost:3030.

The store is a SQLite file at `./promptlib-ui.db` by default; override with `PROMPTLIB_DB`.

## Providers

The UI ships six interchangeable LLM provider modules under `lib/providers/`. Pick one with `BETTER_PROMPTS_PROVIDER`. Each reads its own auth from env. Default is `claude-agent` (matches the library's reference example). Adding a new provider is one file under `lib/providers/` plus a case in `lib/llm.ts` — every provider exports the same `make(): LLMCallback` shape, the dispatcher just routes by env.

| `BETTER_PROMPTS_PROVIDER` | Auth | Model env | Notes |
|---|---|---|---|
| `claude-agent` (default) | Local Claude credentials at `~/.claude` (or mounted into containers) | `BETTER_PROMPTS_MODEL` (default `claude-sonnet-4-6`) | Same auth path as the library's `claude-agent-provider.ts` example. |
| `anthropic` | `ANTHROPIC_API_KEY` from console.anthropic.com | `BETTER_PROMPTS_MODEL` (default `claude-sonnet-4-6`) | Direct Messages API. |
| `openai` | `OPENAI_API_KEY` from platform.openai.com | `BETTER_PROMPTS_MODEL` (default `gpt-4o`) | Codex models like `gpt-4o-codex` go here. `OPENAI_BASE_URL` overrides for self-hosted gateways. |
| `openrouter` | `OPENROUTER_API_KEY` from openrouter.ai | `BETTER_PROMPTS_MODEL` (default `anthropic/claude-sonnet-4.6`) | Provider-prefixed slugs unlock Llama, Mistral, Gemini, etc. Optional `OPENROUTER_REFERER` / `OPENROUTER_APP_TITLE` for OpenRouter's leaderboards. |
| `bedrock` | Standard AWS SDK chain (`AWS_REGION`, env / `~/.aws/credentials` / IAM role) | `BETTER_PROMPTS_MODEL` (required, e.g. `us.anthropic.claude-sonnet-4-20250514-v1:0`) | Anthropic models on AWS Bedrock. |
| `vertex` | GCP Application Default Credentials (`gcloud auth application-default login` / GCE metadata) plus `CLOUD_ML_REGION`, `ANTHROPIC_VERTEX_PROJECT_ID` | `BETTER_PROMPTS_MODEL` (required, e.g. `claude-sonnet-4@20250514`) | Anthropic models on GCP Vertex AI. |

Optional: `BETTER_PROMPTS_MAX_TOKENS` caps response length; defaults to 8192 where the SDK requires a max-tokens param.

Provider modules are lazy-loaded — only the SDK for the selected provider gets constructed. Bring whichever auth shape your environment already has; don't bring all of them.

## What's wired

- **GET /** — artifact list. Hides reserved `_*` keys (mostly) so the consumer's prompts are front and centre. The library's own `_enhancer` artifact has a discreet link at the bottom.
- **GET /[key]** — artifact detail. Shows: active body in an editable textarea, vars input grid, invoke / save buttons, recent invocations with their signals, evolve panel, revision history.
- **POST /api/invoke** — operator invoke flow. Reads the active revision, renders the (possibly operator-tweaked) body with the vars, calls Anthropic via the same `LLMCallback` shape `evolve` uses, records an invocation pinned to the active revision. If the operator edited the body, that goes into the invocation's `metadata.body` for honest provenance.
- **POST /api/save** — `bp.set(key, body)`. Commits the textarea body as a new revision.
- **POST /api/signal** — `bp.signal(invocationId, { verdict, reason, source: "admin-ui" })`.
- **POST /api/evolve** — `bp.evolve(key, { reason, using: callLLM })`. The library renders `_enhancer`'s active body + the active artifact's body + telemetry + reason, hands that to Anthropic, gets the new body back, appends it as a new revision.
- **POST /api/create** — seeds a new artifact via `bp.get(key, body)`.

## What's not wired

- No auth. Localhost-only assumption. Wrap behind a reverse proxy or NextAuth before exposing.
- No diff view. Revision history shows version numbers + sources; no inline diff between versions yet.
- No held-out evaluation. Toolstac doesn't have one either; signals + operator review are the trusted judge for now.
- No CLI. Use `examples/walkthrough.ts` from the library root for headless smoke tests.

## How the UI's invoke maps to the library

The substrate API is `bp.get` → operator-side render → operator-side LLM → `bp.record` → `bp.signal`. The UI button labelled "invoke" is exactly that, composed server-side in `/api/invoke`. No new substrate operation; the substrate stays five-verb minimal. See [SPEC.md](../SPEC.md) and the discussion in `reference/toolstac/` for context.
