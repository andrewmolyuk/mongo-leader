#!/bin/sh
# Runs baloo's Git hook Checks on the commits from $BASE to HEAD going to $BRANCH, for commits made
# where its hooks didn't run, as baloo's README CI section shows. Moves HEAD back to $BASE (git reset
# --soft) to check the commits' changes, so it runs in a job of its own.
set -e
version=0.25.1
file=baloo_${version}_linux_amd64
dir=$(mktemp -d)
for f in "$file" SHA256SUMS; do
  curl -fsSL -o "$dir/$f" "https://github.com/bunderlog/claude-plugins/releases/download/v$version/$f"
done
(cd "$dir" && grep " $file\$" SHA256SUMS | sha256sum -c -)
baloo=$dir/$file
chmod +x "$baloo"
# A first push or a force push has no earlier commit here: check the last one alone
if ! git cat-file -e "$BASE^{commit}" 2>/dev/null; then BASE=$(git rev-parse HEAD~1); fi
for sha in $(git rev-list "$BASE"..HEAD); do
  git log -1 --format=%B "$sha" > "$dir/msg"
  "$baloo" check conventional-commits "$dir/msg"
  "$baloo" check no-ai-coauthor "$dir/msg"
done
echo "refs/heads/ci $(git rev-parse HEAD) refs/heads/$BRANCH $BASE" | "$baloo" check linear-history
git reset -q --soft "$BASE"
"$baloo" check no-secrets-in-commits
"$baloo" check no-conflict-markers
"$baloo" check no-large-files
