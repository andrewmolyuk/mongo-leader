# Local Git hooks come from baloo; commit messages are linted in CI

Date: 2026-10-09

The baloo plugin writes the Git hooks in `.git/hooks`, and its pre-commit hook runs
`mise run test` (lint, build, typecheck, tests) after its own Checks, set by
`git-hook-commands.pre-commit` in `.claude/baloo.yml`. Husky was removed: once baloo could run that
command itself (baloo 0.25.0), husky was left with nothing baloo's Checks don't cover.

`.commitlintrc.json` stays although commitlint is no longer a devDependency: the PR workflow's
commitlint step reads it.

## Considered options

- Husky running `mise run test` and commitlint (until 2026-10-09): baloo works through husky 9 too,
  but that kept a second hook manager, its install step and two commit-message linters for what
  baloo now does alone.

## Consequences

- Only someone with the baloo plugin runs the Checks and `mise run test` before a commit; a
  contributor without it, or a fresh clone before its first Claude Code session, runs none. CI
  still runs `mise run test` and commitlint on every PR.
- `npm install` on a branch from before #360, whose `prepare` script still runs husky, sets
  `core.hooksPath` back to `.husky/_`; `git config --unset core.hooksPath` and a new session
  restore baloo's hooks.
