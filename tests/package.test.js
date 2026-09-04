const assert = require("node:assert/strict");
const crypto = require("node:crypto");
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
  const itemMenu = menuOptions[1].menus[0];
  const visibility = [];
  const menuContext = {
    items: [{}],
    collectionTreeRows: [{ isDuplicates: () => true }],
    setVisible: value => visibility.push(value),
  };
  itemMenu.onShowing(null, menuContext);
  itemMenu.menus[0].onShowing(null, menuContext);
  itemMenu.menus[1].onShowing(null, menuContext);
  assert.deepEqual(visibility, [true, false, true]);
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
  const readme = path.join(root, "README.md");
  const originalTimes = fs.statSync(readme);
  const build = () => spawnSync("sh", ["build.sh"], {
    cwd: root,
    encoding: "utf8",
  });

  try {
    const firstBuild = build();
    assert.equal(firstBuild.status, 0, firstBuild.stderr || firstBuild.stdout);
    assert.equal(fs.existsSync(archive), true);
    const firstHash = crypto.createHash("sha256").update(fs.readFileSync(archive)).digest("hex");

    fs.utimesSync(readme, new Date("2030-01-01"), new Date("2030-01-01"));
    const secondBuild = build();
    assert.equal(secondBuild.status, 0, secondBuild.stderr || secondBuild.stdout);
    const secondHash = crypto.createHash("sha256").update(fs.readFileSync(archive)).digest("hex");
    assert.equal(secondHash, firstHash);

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
  }
  finally {
    fs.utimesSync(readme, originalTimes.atime, originalTimes.mtime);
    if (fs.existsSync(archive)) {
      fs.unlinkSync(archive);
    }
  }
});
