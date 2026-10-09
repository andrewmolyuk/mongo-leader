# The library is written in TypeScript, built to CommonJS, and tested with Vitest

Date: 2026-10-09

The source is TypeScript in `src/`, compiled by `tsc` to CommonJS in `dist/`, which is all the
package ships. `prepack` runs the build, so semantic-release's `npm publish` always ships a fresh
one. The type definitions are generated from the source with internals hidden, replacing the
hand-written `index.d.ts`, and `tests/types` checks the built `dist/index.d.ts`.

Tests run on Vitest with v8 coverage. It runs TypeScript itself, so there is no Babel step, and
the integration test needs no `runtimeAdapters` workaround as it did under Jest's VM.

ESLint doesn't lint the `.ts` files: typescript-eslint supports only TypeScript below 6.1, and the
project is on 7. Strict `tsc` with `noUnusedLocals` and `noUnusedParameters`, plus Prettier, covers
them instead.

`skipLibCheck` is on because `mongodb-memory-server`'s type definitions reference `semver` types
that aren't installed. It doesn't apply to `tests/types`, which checks the built `.d.ts` on its own.

## Considered options

- Jest with Babel (until 2026-10-09): replaced by Vitest, which runs TypeScript without a build step.
- Staying on TypeScript 6.0 to keep ESLint on the `.ts` files: rejected to stay on TypeScript 7.

## Consequences

- Revisit ESLint on the `.ts` files once typescript-eslint supports TypeScript 7.
