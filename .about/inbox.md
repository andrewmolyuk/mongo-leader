# Inbox

## Dependabot alerts the repo can't fix

2026-10-09 · session review

8 Dependabot alerts stay open after #361. `http-cache-semantics`, `ip-address`,
`postcss-selector-parser`, `undici` and `brace-expansion` are bundled inside `npm@11.21.0`, the
latest 11.x, which `@semantic-release/npm` requires; overrides don't reach bundled packages.
`katex` (low) is held at `^0.16.0` by `micromark-extension-math`, and the fix is only in 0.18.
Settled when an npm 11.x and a
`micromark-extension-math` release with the fixed versions are out and the lockfile is updated,
or when the remaining alerts are dismissed as dev-only.
