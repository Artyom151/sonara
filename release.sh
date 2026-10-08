#!/usr/bin/env bash
# Cut a release:  ./release.sh 1.1.0         (or 1.2.0-beta.1 for a pre-release)
#                 ./release.sh 1.1.0 --dry-run   checks and preview only, changes nothing
#                 ./release.sh 1.1.0 --yes       no confirmation prompt
#
# What it does
#   1. checks: clean working tree, branch, in sync with origin, tag is free,
#      CHANGELOG.md and CHANGELOG_ru.md both have a "## [<version>]" section;
#   2. type-checks and builds the app;
#   3. syncs the version everywhere (package.json, Tauri, Android, iOS) and commits it;
#   4. tags v<version>, shows the release notes, then pushes the commit and the tag.
# Pushing the tag starts .github/workflows/release.yml: it builds Android, iOS, Windows, macOS,
# Linux (glibc + musl) and publishes the GitHub release with EN + RU notes.
set -euo pipefail

VERSION=""
DRY=0
YES=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY=1 ;;
    --yes | -y) YES=1 ;;
    -h | --help) sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) echo "unknown option: $arg" >&2; exit 1 ;;
    *) VERSION="${arg#v}" ;;
  esac
done

red() { printf '\033[31m%s\033[0m\n' "$*" >&2; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
die() { red "error: $*"; exit 1; }

[[ -n "$VERSION" ]] || die "usage: ./release.sh <version> [--dry-run] [--yes]   e.g. ./release.sh 1.1.0"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]] || die "'$VERSION' is not a semantic version (1.2.3 or 1.2.3-beta.1)"
TAG="v$VERSION"

cd "$(dirname "$0")"
command -v git >/dev/null || die "git not found"
command -v pnpm >/dev/null || die "pnpm not found"
command -v node >/dev/null || die "node not found"

step "Checking the repository"
BRANCH="$(git branch --show-current)"
[[ "$BRANCH" == "main" ]] || die "releases are cut from main (you are on '$BRANCH')"
[[ -z "$(git status --porcelain)" ]] || { git status --short; die "working tree is not clean: commit or stash first"; }
git fetch --tags --quiet origin || die "cannot reach origin"
BEHIND="$(git rev-list --count HEAD..origin/main)"
[[ "$BEHIND" == "0" ]] || die "main is $BEHIND commit(s) behind origin/main: pull first"
if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null || git ls-remote --exit-code --tags origin "refs/tags/$TAG" >/dev/null 2>&1; then
  die "tag $TAG already exists"
fi
green "main is clean and up to date, $TAG is free"

step "Checking the changelogs"
for f in CHANGELOG.md CHANGELOG_ru.md; do
  [[ -f "$f" ]] || die "$f is missing"
  body="$(awk -v v="$VERSION" '
    $0 ~ "^## \\[" v "\\]" { on = 1; next }
    /^## / { on = 0 }
    on && NF { print }
  ' "$f")"
  [[ -n "$body" ]] || die "$f has no '## [$VERSION]' section with content (move the [Unreleased] notes there)"
done
green "both changelogs describe $VERSION"

step "Type-check and build"
pnpm exec tsc --noEmit
pnpm build >/dev/null
green "build ok"

step "Release notes preview"
node scripts/release-notes.mjs "$VERSION" | head -60

if [[ "$DRY" == "1" ]]; then
  green "dry run finished: nothing was changed or pushed"
  exit 0
fi

if [[ "$YES" != "1" ]]; then
  echo
  read -r -p "Release $TAG now? This pushes main and the tag to origin. [y/N] " ans
  [[ "$ans" == "y" || "$ans" == "Y" ]] || die "aborted"
fi

step "Syncing the version ($VERSION)"
node scripts/set-version.mjs "$VERSION"
if [[ -n "$(git status --porcelain)" ]]; then
  git add -A
  git commit -q -F - <<EOF
chore(release): $VERSION

- Sync the version in package.json, Tauri, Cargo, Android and iOS
- Prepare the $TAG release
EOF
fi

step "Tagging and pushing"
git tag -a "$TAG" -m "Sonara $VERSION"
git push origin main
git push origin "$TAG"

green "pushed $TAG"
echo "Build progress: https://github.com/Artyom151/sonara/actions/workflows/release.yml"
echo "The release appears at https://github.com/Artyom151/sonara/releases once every platform is built."
