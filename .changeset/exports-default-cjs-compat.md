---
"@wopr-network/better-prompts": patch
---

Add `default` keys alongside `import` in every conditional export. Resolves `ERR_PACKAGE_PATH_NOT_EXPORTED` when CommonJS consumers (e.g. provekit's tsx 4.21 + `"type": "commonjs"` setup) try to load any subpath. Backwards-compatible — ESM consumers continue to resolve via the `import` condition; CJS resolvers now find the `default` fallback at the same target file.

The package remains ESM-only at the file level (`"type": "module"`); this only fixes the resolution layer so loaders that walk the exports map find a target instead of bailing.
