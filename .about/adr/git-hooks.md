# The Git hooks in `.githooks/` run hathi, and CI runs the same hathi on every PR

Date: 2026-11-10

The Git hooks are the scripts in `.githooks/`: each runs `hathi check <hook>` first, from the
version `mise.toml` pins, and `pre-commit` then runs `mise run test` (lint, build, typecheck,
tests). Each clone turns them on once with `git config core.hooksPath .githooks`, as the README
says. hathi has every Check baloo's Git hooks ran, `no-stale-adr-date` too since 1.2.0, and reads
its settings from `.hathi.yml`, which lists the commit types in full for `CLAUDE.md` to import
(PRD project-setup in bunderlog/claude-plugins).

A `git-hook-checks` job runs the same `hathi check ci` in CI, for commits made where the hooks
didn't run: on a PR's commits, and on commits pushed to `master`, where the release job waits for
it.

## Considered options

- The baloo plugin's Git hooks in `.git/hooks`, running its Checks and `mise run test` through
  `git-hook-commands` (until 2026-11-09): untracked, so a clone ran none until its first Claude Code
  session, and the Checks lived in two places, baloo's and hathi's. `.claude/baloo.yml` went on
  2026-11-10, once baloo read it no longer.
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

- A contributor without `hathi` installed has a commit refused until `mise install` puts it there;
  CI still runs `mise run test` and hathi's Checks on every PR.
- `npm install` on a branch from before #360, whose `prepare` script still runs husky, sets
  `core.hooksPath` back to `.husky/_`; `git config core.hooksPath .githooks` turns these back on.
