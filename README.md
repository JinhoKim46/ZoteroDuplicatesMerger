# Zotero Duplicates Merger

A Zotero 10 plugin for merging duplicate library items using configurable
master-item rules.

## Requirements

- Zotero 10.0 (64-bit or ARM64)

Zotero 5–7 are not supported by version 2.x of this plugin.

## Installation

1. Download the ZoteroDuplicatesMerger-2.0.0.xpi release file.
2. In Zotero, open **Tools → Plugins**.
3. Choose **Install Plugin From File** from the gear menu.
4. Select the downloaded XPI.

## Usage

Select at least two items and open their context menu:

- **Smart merge items** chooses a master item, fills missing fields with the
  longest available value, and opens Zotero's merge preview. The preview can
  be disabled in the plugin settings.
- **Bulk merge duplicates** is available in Zotero's **Duplicate Items**
  collection and processes each displayed duplicate set automatically.

Open **Tools → Duplicates Merger → Settings** to choose:

- the oldest, newest, or longest-first-author item as the master;
- whether different item types are skipped or changed to the master's type;
- the delay between bulk merge updates;
- whether Smart Merge skips the preview.

Bulk merge uses Zotero's own duplicate detection and merge operation. Review
the Duplicate Items collection first and keep a current backup before running
it across a large library.

## Build and test

    node --test tests/*.test.js
    sh build.sh

The build creates ZoteroDuplicatesMerger-2.0.0.xpi.

## License

Copyright © 2022 Fotos Frangoudes

Distributed under the Mozilla Public License 2.0.
