# baloo runs the Git hook Checks, locally in its Git hooks and on every PR in CI

Date: 2026-10-10

The baloo plugin writes the Git hooks in `.git/hooks`, and its pre-commit hook runs
`mise run test` (lint, build, typecheck, tests) after its own Checks, set by
`git-hook-commands.pre-commit` in `.claude/baloo.yml`. Husky was removed: once baloo could run that
command itself (baloo 0.25.0), husky was left with nothing baloo's Checks don't cover.

The PR workflow's `git-hook-checks` job runs the same Checks on a PR's commits, for those made where
the hooks didn't run: it downloads a pinned baloo Release from GitHub, verifies it against the
Release's `SHA256SUMS`, and runs each Check as baloo's README shows, all but `no-stale-adr-date`.
The Checks read their settings from `.claude/baloo.yml`, the same as the hooks. Bumping the pinned
version is a change to the workflow.

## Considered options

- Husky running `mise run test` and commitlint (until 2026-10-09): baloo works through husky 9 too,
  but that kept a second hook manager, its install step and two commit-message linters for what
  baloo now does alone.
- commitlint in CI through `wagoid/commitlint-github-action` (until 2026-10-10): its Docker image
  failed to pull from Docker Hub on a rate limit and turned a PR red without running anything,
  and it was a second commit-message linter, with its own config, beside baloo's.

## Consequences

- Only someone with the baloo plugin runs the Checks and `mise run test` before a commit; a
  contributor without it, or a fresh clone before its first Claude Code session, runs none. CI
  still runs `mise run test` and baloo's Checks on every PR.
- `npm install` on a branch from before #360, whose `prepare` script still runs husky, sets
  `core.hooksPath` back to `.husky/_`; `git config --unset core.hooksPath` and a new session
  restore baloo's hooks.
