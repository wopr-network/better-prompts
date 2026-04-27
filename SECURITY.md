# Security policy

## Supported versions

Pre-release. The most recent main-branch commit is the only supported version. Once v1 ships, supported versions will be listed here.

## Reporting a vulnerability

Email security disclosures to **evilgenius@nefariousplan.com**. PGP key at https://nefariousplan.com/pgp.

Please include:

- A description of the issue
- Reproduction steps or proof-of-concept code
- Affected version (commit SHA for now, since the package is unpublished)
- Your proposed fix, if any

You'll get an acknowledgement within 72 hours. Coordinated disclosure preferred — typical embargo window is 14 days from the acknowledgement, extendable for complex fixes.

## Threat model

`better-prompts` is a substrate that:

- Stores prompt revisions, invocations, and signals in a backend the consumer chooses (SQLite by default; KV via unstorage; consumer-implemented `Store` for other shapes).
- Calls an LLM **only via callbacks the consumer provides**. The library never holds API keys, never opens network connections of its own (the optional `agent-api` shim makes HTTP calls to a localhost-by-default URL the consumer points it at).
- Reads prompt bodies the consumer wrote and feeds them to LLMs the consumer chose. Body content is opaque to the substrate.

The substrate's failure modes that warrant security attention:

- **Stored prompts may contain secrets.** Consumers sometimes seed prompts that include API keys, system prompts with embedded credentials, or sensitive context. The store treats bodies as opaque text; if your stored bodies contain secrets, your store's at-rest encryption story is the relevant control.
- **Telemetry leaks user input.** `record({ vars, output })` stores whatever the consumer passes. If `vars` contain PII or `output` contains sensitive completions, that data lives in the store.
- **`evolve` invocations send the active body + recent telemetry to the chosen LLM.** Any sensitive content in either ends up in the LLM provider's logs.

The library does not implement at-rest encryption, secrets scrubbing, or PII detection. Consumers handling sensitive data should layer those controls in their store implementation or before recording.
