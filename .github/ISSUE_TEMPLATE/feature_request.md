---
name: Feature request
about: A change to the substrate's API or behavior
title: ''
labels: enhancement
assignees: ''
---

**What you want**

Describe the change in one or two sentences.

**Why**

What problem in your codebase does this solve? What does the current API force you to do that it shouldn't?

**Sketch**

If there's a shape you have in mind, write it as code:

```typescript
// what you'd like to be able to write
```

**Substrate fit**

Read [CONTRIBUTING.md](../../CONTRIBUTING.md#discipline) before opening this. The library is deliberately narrow: append-only telemetry, body-opaque to the substrate, BYO LLM, consumer owns rendering. Proposals that fight those invariants will get a thoughtful "no." Proposals that fit them get fast attention.

Which invariant does this respect? Which does it stress?
