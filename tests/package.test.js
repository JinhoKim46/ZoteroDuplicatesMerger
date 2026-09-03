const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");

test("manifest targets Zotero 10 only", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  assert.equal(manifest.manifest_version, 2);
  assert.equal(manifest.version, "2.0.0");
  assert.deepEqual(manifest.applications.zotero, {
    id: "frangoudes.fotos@gmail.com",
    strict_min_version: "10.0",
    strict_max_version: "10.0.*",
  });
});

test("bootstrap registers native menus and the settings pane", async () => {
  const menuOptions = [];
  const insertedLocales = [];
  let stopped = false;
  const plugin = {
    init: () => {},
    shutdown: () => { stopped = true; },
    smartMerge: () => {},
    mergeDuplicates: () => {},
  };
  const win = {
    MozXULElement: {
      insertFTLIfNeeded: name => insertedLocales.push(name),
    },
    document: { querySelector: () => null },
  };
  const context = {
    Localization: function () {},
    Services: {
      scriptloader: {
        loadSubScript: (...args) => {
          assert.equal(args.length, 1);
          context.DuplicatesMerger = plugin;
        },
      },
    },
    Zotero: {
      initializationPromise: Promise.resolve(),
      getMainWindows: () => [win],
      MenuManager: { registerMenu: options => menuOptions.push(options) },
      PreferencePanes: { register: async () => "duplicatesmerger-preferences" },
      Utilities: { Internal: { openPreferences: () => {} } },
    },
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, "bootstrap.js"), "utf8"), context);

  await context.startup({
    id: "frangoudes.fotos@gmail.com",
    rootURI: "file:///plugin/",
  });

  assert.deepEqual(menuOptions.map(option => option.target), [
    "main/menubar/tools",
    "main/library/item",
  ]);
  assert.deepEqual(insertedLocales, ["duplicatesmerger.ftl"]);
  context.shutdown();
  assert.equal(stopped, true);
});

test("Zotero 10 package resources replace legacy overlays", () => {
  for (const file of [
    "bootstrap.js",
    "prefs.js",
    "chrome/content/preferences.xhtml",
    "locale/en-US/duplicatesmerger.ftl",
  ]) {
    assert.equal(fs.existsSync(path.join(root, file)), true, file);
  }
  for (const file of ["install.rdf", "update.rdf", "chrome.manifest", "chrome/content/overlay.xul"]) {
    assert.equal(fs.existsSync(path.join(root, file)), false, file);
  }
});

test("build creates a clean Zotero 10 XPI", () => {
  const archive = path.join(root, "ZoteroDuplicatesMerger-2.0.0.xpi");
  const build = spawnSync("sh", ["build.sh"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(build.status, 0, build.stderr || build.stdout);
  assert.equal(fs.existsSync(archive), true);

  const unzip = spawnSync("unzip", ["-Z1", archive], { encoding: "utf8" });
  assert.equal(unzip.status, 0, unzip.stderr);
  const files = unzip.stdout.trim().split("\n");
  for (const file of [
    "manifest.json",
    "bootstrap.js",
    "prefs.js",
    "chrome/content/scripts/zoteroduplicatesmerger.js",
    "chrome/content/preferences.xhtml",
    "locale/en-US/duplicatesmerger.ftl",
  ]) {
    assert.equal(files.includes(file), true, file);
  }
  for (const file of ["install.rdf", "update.rdf", "chrome.manifest"]) {
    assert.equal(files.includes(file), false, file);
  }
  fs.unlinkSync(archive);
});
