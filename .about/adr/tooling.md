# Everything is TypeScript: the library built to CommonJS, tested with Vitest, linted by oxlint

Date: 2026-10-09

The source is TypeScript in `src/`, compiled by `tsc` to CommonJS in `dist/`, which is all the
package ships. `prepack` runs the build, so semantic-release's `npm publish` always ships a fresh
one. The type definitions are generated from the source with internals hidden, replacing the
hand-written `index.d.ts`, and `tests/types` checks the built `dist/index.d.ts`.

Tests run on Vitest with v8 coverage. It runs TypeScript itself, so there is no Babel step, and
the integration test needs no `runtimeAdapters` workaround as it did under Jest's VM.

The examples are TypeScript too, `.mts` files that Node 24 runs directly (`node example/simple.mts`),
so `erasableSyntaxOnly` keeps every file to syntax Node can strip. They import the built `dist/`, as
a user would; `example/297/reproduce.mts` imports `src/index.ts` instead, since it reads internals
the published types hide. `.mts` marks them as ES modules, which a package without `"type"` would
otherwise make Node detect with a warning.

oxlint lints everything, type-aware through `oxlint-tsgolint`, which is built on typescript-go, the
TypeScript 7 compiler; `.oxlintrc.json` turns on `no-floating-promises` and `no-misused-promises`,
and warnings fail the lint. A promise left unawaited on purpose, such as a timer's call to
`elect()`, which catches its own errors, says so with `void`. Strict `tsc` with `noUnusedLocals`
and `noUnusedParameters`, plus Prettier, covers the rest.

`skipLibCheck` is on because `mongodb-memory-server`'s type definitions reference `semver` types
that aren't installed. It doesn't apply to `tests/types`, which checks the built `.d.ts` on its own.

## Considered options

- Jest with Babel (until 2026-10-09): replaced by Vitest, which runs TypeScript without a build step.
- Staying on TypeScript 6.0 to keep ESLint on the `.ts` files: rejected to stay on TypeScript 7.
- ESLint (until 2026-10-09): it linted only the JavaScript examples, since typescript-eslint supports
  only TypeScript below 6.1; with everything in TypeScript it had nothing left to lint.
- Staying without a linter: oxlint's type-aware rules found an `await` of a cursor that isn't a
  promise, and unawaited `stop()` calls in tests and examples, on its first run.
- Examples as `.ts`: Node runs them, but warns that it re-parses each as an ES module.

## Consequences

- The examples no longer show plain JavaScript usage, though most of the package's users may write
  JavaScript; the README's usage snippets still do.
- oxlint has fewer rules than ESLint's ecosystem and no custom plugins; this repo used neither.
- Lint depends on the build: the examples' types come from `dist/`, so type-aware oxlint in a fresh
  checkout without it reports `Leader` as unknown. The `lint` task in `mise.toml` builds first.
