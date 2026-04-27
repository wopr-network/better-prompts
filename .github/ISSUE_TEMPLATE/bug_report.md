---
name: Bug report
about: Something the substrate does that it shouldn't, or doesn't do that it should
title: ''
labels: bug
assignees: ''
---

**What happened**

A clear description of the actual behavior.

**What you expected**

What you thought would happen.

**Reproduction**

Smallest snippet that demonstrates the issue. If possible, include the artifact key, the relevant revision body (or a redacted version), and the call sequence.

```typescript
// minimal repro
```

**Environment**

- `@wopr-network/better-prompts` version (or commit if from git):
- Node version:
- Store: SqliteStore / KVStore (which backend?) / custom
- LLM seam used in `using` callback (if relevant): claude-agent / ai-sdk / agent-api / custom

**Anything else**

Logs, stack traces, telemetry rows from `bp.invocations(...)`, whatever helps.
