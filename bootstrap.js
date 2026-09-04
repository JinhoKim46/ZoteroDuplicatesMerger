var DuplicatesMerger;
var preferencePaneID;

function getPane(context) {
  return context.menuElem.ownerDocument.defaultView.ZoteroPane;
}

function addLocalization(window) {
  window.MozXULElement.insertFTLIfNeeded("duplicatesmerger.ftl");
}

async function startup({ id, rootURI }) {
  await Zotero.initializationPromise;

  Services.scriptloader.loadSubScript(
    rootURI + "chrome/content/scripts/zoteroduplicatesmerger.js",
  );
  DuplicatesMerger.init({
    localization: new Localization(["duplicatesmerger.ftl"]),
  });

  preferencePaneID = await Zotero.PreferencePanes.register({
    pluginID: id,
    id: "duplicatesmerger-preferences",
    src: rootURI + "chrome/content/preferences.xhtml",
    label: "Duplicates Merger",
    helpURL: "https://github.com/JinhoKim46/ZoteroDuplicatesMerger",
  });

  Zotero.MenuManager.registerMenu({
    menuID: "duplicatesmerger-tools",
    pluginID: id,
    target: "main/menubar/tools",
    menus: [{
      menuType: "submenu",
      l10nID: "duplicatesmerger-menu-root",
      enableForTabTypes: ["library"],
      menus: [{
        menuType: "menuitem",
        l10nID: "duplicatesmerger-menu-settings",
        onCommand: () => Zotero.Utilities.Internal.openPreferences(preferencePaneID),
      }],
    }],
  });

  Zotero.MenuManager.registerMenu({
    menuID: "duplicatesmerger-items",
    pluginID: id,
    target: "main/library/item",
    menus: [{
      menuType: "submenu",
      l10nID: "duplicatesmerger-menu-root",
      onShowing: (_event, context) => context.setVisible(
        context.items.length > 1
          || context.collectionTreeRows?.[0]?.isDuplicates() === true,
      ),
      menus: [
        {
          menuType: "menuitem",
          l10nID: "duplicatesmerger-menu-smart",
          onShowing: (_event, context) => context.setVisible(context.items.length > 1),
          onCommand: (_event, context) => DuplicatesMerger.smartMerge(getPane(context)),
        },
        {
          menuType: "menuitem",
          l10nID: "duplicatesmerger-menu-bulk",
          onShowing: (_event, context) => context.setVisible(
            context.collectionTreeRows?.[0]?.isDuplicates() === true,
          ),
          onCommand: (_event, context) => DuplicatesMerger.mergeDuplicates(getPane(context)),
        },
      ],
    }],
  });

  for (const window of Zotero.getMainWindows()) {
    addLocalization(window);
  }
}

function onMainWindowLoad({ window }) {
  addLocalization(window);
}

function onMainWindowUnload() {}

function shutdown() {
  DuplicatesMerger?.shutdown();
  DuplicatesMerger = null;
  preferencePaneID = null;
  for (const window of Zotero.getMainWindows()) {
    window.document.querySelector('[href="duplicatesmerger.ftl"]')?.remove();
  }
}

function install() {}

function uninstall() {}
