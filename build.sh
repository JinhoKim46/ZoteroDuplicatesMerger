#!/bin/sh
set -eu

version=$(node -p "JSON.parse(require('fs').readFileSync('manifest.json')).version")
archive="ZoteroDuplicatesMerger-${version}.xpi"

node --check bootstrap.js
node --check chrome/content/scripts/zoteroduplicatesmerger.js
rm -f "$archive"
zip -q "$archive" \
  manifest.json \
  bootstrap.js \
  prefs.js \
  chrome/content/scripts/zoteroduplicatesmerger.js \
  chrome/content/preferences.xhtml \
  locale/en-US/duplicatesmerger.ftl \
  LICENSE \
  README.md
unzip -tq "$archive"
echo "Built $archive"
