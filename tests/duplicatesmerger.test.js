const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadMerger(preferences = {}) {
  const context = {
    console,
    setTimeout,
    clearTimeout,
    Zotero: {
      Date: { dateToSQL: () => "now" },
      Prefs: {
        get: key => preferences[key.replace("extensions.duplicatesmerger.", "")],
      },
      Promise: { delay: async () => {} },
      debug: () => {},
      logError: () => {},
    },
  };
  vm.createContext(context);
  const source = fs.readFileSync(
    path.join(__dirname, "../chrome/content/scripts/zoteroduplicatesmerger.js"),
    "utf8",
  );
  vm.runInContext(source, context);
  return context.DuplicatesMerger;
}

function item(id, dateAdded, firstName = "", lastName = "") {
  return {
    id,
    dateAdded,
    itemTypeID: 2,
    toJSON: () => ({
      creators: firstName || lastName
        ? [{ creatorType: "author", firstName, lastName }]
        : [],
    }),
  };
}

test("selects the configured master item", () => {
  const merger = loadMerger();
  const items = [
    item(2, "2024-01-01", "A", "Short"),
    item(1, "2020-01-01", "Alexandria", "Longest"),
  ];

  assert.equal(merger.selectMasterIndex(items, "oldest"), 0);
  assert.equal(merger.selectMasterIndex(items, "newest"), 1);
  assert.equal(merger.selectMasterIndex(items, "creator"), 0);
  assert.deepEqual(Array.from(items, value => value.id), [1, 2]);
});

test("converts mismatched items before opening and completing the Zotero merge pane", async () => {
  const events = [];
  const master = item(1, "2020-01-01");
  const other = item(2, "2024-01-01");
  other.itemTypeID = 3;
  other.setType = type => {
    events.push("setType");
    other.itemTypeID = type;
  };
  master.multiDiff = () => null;
  other.multiDiff = () => null;

  const mergePane = {
    _items: [master, other],
    _infoBox: { item: { setField: () => {} }, _forceRenderAll: () => {} },
    _abstractBox: { _forceRenderAll: () => {} },
    querySelector: () => ({ selectedIndex: 0 }),
    setMaster: () => events.push("setMaster"),
    merge: async () => events.push("merge"),
  };
  const pane = {
    getSelectedItems: () => [master, other],
    mergeSelectedItems: () => events.push("openPane"),
    itemPane: { _duplicatesPane: mergePane },
  };

  const merger = loadMerger({ master: "oldest", typemismatch: "master" });
  const result = await merger.mergeSelectedItems(pane, true);

  assert.equal(result, true);
  assert.deepEqual(events, ["setType", "openPane", "setMaster", "merge"]);
});

test("leaves mismatched items untouched when configured to skip", async () => {
  const events = [];
  const master = item(1, "2020-01-01");
  const other = item(2, "2024-01-01");
  other.itemTypeID = 3;
  other.setType = () => events.push("setType");
  const pane = {
    getSelectedItems: () => [master, other],
    mergeSelectedItems: () => events.push("openPane"),
  };

  const merger = loadMerger({ master: "oldest", typemismatch: "skip" });
  const result = await merger.mergeSelectedItems(pane, true);

  assert.equal(result, false);
  assert.deepEqual(events, []);
});
