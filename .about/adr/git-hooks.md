# baloo runs the Git hook Checks locally in its Git hooks, and hathi on every PR in CI

Date: 2026-11-06

The baloo plugin writes the Git hooks in `.git/hooks`, and its pre-commit hook runs
`mise run test` (lint, build, typecheck, tests) after its own Checks, set by
`git-hook-commands.pre-commit` in `.claude/baloo.yml`. Husky was removed: once baloo could run that
command itself (baloo 0.25.0), husky was left with nothing baloo's Checks don't cover.

A `git-hook-checks` job runs the same Checks in CI, for commits made where the hooks didn't run: on
a PR's commits, and on commits pushed to `master`, where the release job waits for it. Both run
`hathi check ci`, the same Checks as a binary of their own, pinned in `mise.toml` and installed by
mise; it checks each commit's message and changes, all but `no-stale-adr-date`, which stays in
baloo. hathi reads its settings from `.hathi.yml`; without one every Check is on with its defaults,
as `.claude/baloo.yml` has them, so the two agree until one of them changes.

## Considered options

- `.github/scripts/baloo-checks.sh` (until 2026-11-06): it downloaded a pinned baloo Release and ran
  each Check by hand over the PR's changes together, moving `HEAD` back to read them, and missed a
  Secret one commit adds and the next removes. hathi checks each commit on its own.

- Husky running `mise run test` and commitlint (until 2026-10-09): baloo works through husky 9 too,
  but that kept a second hook manager, its install step and two commit-message linters for what
  baloo now does alone.
- commitlint in CI through `wagoid/commitlint-github-action` (until 2026-10-10): its Docker image
  failed to pull from Docker Hub on a rate limit and turned a PR red without running anything,
  and it was a second commit-message linter, with its own config, beside baloo's.

## Consequences

- Only someone with the baloo plugin runs the Checks and `mise run test` before a commit; a
  contributor without it, or a fresh clone before its first Claude Code session, runs none. CI
  still runs `mise run test` and hathi's Checks on every PR.
- A setting a Check gets in `.claude/baloo.yml` goes into `.hathi.yml` too, or CI checks with
  another one.
- `npm install` on a branch from before #360, whose `prepare` script still runs husky, sets
  `core.hooksPath` back to `.husky/_`; `git config --unset core.hooksPath` and a new session
  restore baloo's hooks.
