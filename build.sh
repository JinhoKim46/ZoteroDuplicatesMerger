#!/bin/sh
set -eu

cd "$(dirname "$0")"
root=$(pwd)
version=$(node -p "JSON.parse(require('fs').readFileSync('manifest.json')).version")
archive="ZoteroDuplicatesMerger-${version}.xpi"
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
files="
manifest.json
bootstrap.js
prefs.js
chrome/content/scripts/zoteroduplicatesmerger.js
chrome/content/preferences.xhtml
locale/en-US/duplicatesmerger.ftl
LICENSE
README.md
"

node --check bootstrap.js
node --check chrome/content/scripts/zoteroduplicatesmerger.js
for file in $files; do
  mkdir -p "$stage/$(dirname "$file")"
  cp "$file" "$stage/$file"
  touch -t 198001010000 "$stage/$file"
done
rm -f "$archive"
(
  cd "$stage"
  zip -Xq "$root/$archive" $files
)
unzip -tq "$archive"
echo "Built $archive"
