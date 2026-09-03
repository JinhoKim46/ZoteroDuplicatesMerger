var DuplicatesMerger = {
  _ignoreFields: ["dateAdded", "dateModified", "accessDate"],
  isRunning: false,

  init({ localization }) {
    this.localization = localization;
    this.reset();
  },

  shutdown() {
    this.isRunning = false;
    this.progressWindow?.close();
    this.progressWindow = null;
  },

  reset() {
    this.noMismatchedItemsSkipped = 0;
    this.noSkippedItems = 0;
    this.lastProcessedItemId = 0;
    this.currentRowCount = 0;
    this.initialNoItems = 0;
    this.errorCount = 0;
    this.elapsedTimeSinceLastAction = 0;
    this.selectedItemsList = [];
    this.selectedItemsIds = [];
    this.mismatchedIds = [];
  },

  getPref(name) {
    return Zotero.Prefs.get("extensions.duplicatesmerger." + name, true);
  },

  async getString(id, args) {
    return this.localization.formatValue(id, args);
  },

  getCreatorName(creator) {
    return creator.name ?? [creator.lastName, creator.firstName].filter(Boolean).join(" ");
  },

  selectMasterIndex(items, preference) {
    items.sort((a, b) => a.dateAdded.localeCompare(b.dateAdded));
    if (preference === "newest") {
      return items.length - 1;
    }
    if (preference !== "creator") {
      return 0;
    }

    let longest = -1;
    let masterIndex = 0;
    items.forEach((item, index) => {
      const creator = item.toJSON().creators.find(value => value.creatorType === "author");
      const length = creator ? this.getCreatorName(creator).length : 0;
      if (length > longest) {
        longest = length;
        masterIndex = index;
      }
    });
    return masterIndex;
  },

  smartMerge(pane) {
    return this.mergeSelectedItems(pane, this.getPref("skippreview"));
  },

  async mergeSelectedItems(pane, performMerge) {
    const items = pane.getSelectedItems();
    if (items.length < 2) {
      return false;
    }

    const masterIndex = this.selectMasterIndex(items, this.getPref("master"));
    const masterTypeID = items[masterIndex].itemTypeID;
    const mismatchedItems = items.filter(item => item.itemTypeID !== masterTypeID);
    if (mismatchedItems.length) {
      if (this.getPref("typemismatch") !== "master") {
        return false;
      }
      for (const item of mismatchedItems) {
        item.setType(masterTypeID);
      }
    }

    pane.mergeSelectedItems();
    await Zotero.Promise.delay(1);

    const mergePane = pane.itemPane._duplicatesPane;
    const versionSelector = mergePane.querySelector("#zotero-duplicates-merge-original-date");
    versionSelector.selectedIndex = masterIndex;
    mergePane.setMaster(masterIndex);

    const masterItem = items[masterIndex];
    const otherItems = items.filter((_, index) => index !== masterIndex);
    const alternatives = masterItem.multiDiff(otherItems, this._ignoreFields);
    if (alternatives) {
      const mergedItem = mergePane._infoBox.item;
      for (const [field, values] of Object.entries(alternatives)) {
        if (["creators", "tags", "relations", "collections"].includes(field)) {
          continue;
        }
        const longest = values.reduce(
          (selected, value) => String(value ?? "").length > String(selected ?? "").length
            ? value
            : selected,
          masterItem.toJSON()[field] ?? "",
        );
        mergedItem.setField(field, longest);
      }
      mergePane._infoBox._forceRenderAll();
      mergePane._abstractBox?._forceRenderAll();
    }

    if (performMerge) {
      await mergePane.merge();
    }
    return true;
  },

  async createProgressWindow() {
    this.progressWindow?.close();
    this.progressWindow = new Zotero.ProgressWindow({ closeOnClick: false });
    this.progressWindow.changeHeadline(
      await this.getString("duplicatesmerger-progress-start-title"),
    );
    this.progressWindow.progress = new this.progressWindow.ItemProgress(
      "book",
      await this.getString("duplicatesmerger-progress-start", {
        total: this.initialNoItems,
      }),
    );
    this.progressWindow.progress.setProgress(0);
    this.progressWindow.show();
  },

  async updateProgressWindow() {
    if (!this.progressWindow) {
      return;
    }
    const processed = this.initialNoItems - this.currentRowCount
      + this.noMismatchedItemsSkipped;
    const percent = Math.round((processed / this.initialNoItems) * 100);
    this.progressWindow.progress.setProgress(percent);
    this.progressWindow.progress.setText(
      await this.getString("duplicatesmerger-progress-items", {
        processed,
        total: this.initialNoItems,
        remaining: this.currentRowCount - this.noMismatchedItemsSkipped,
      }),
    );
    this.progressWindow.show();
  },

  async finishProgress(success, processed) {
    if (!this.progressWindow) {
      return;
    }
    const prefix = success ? "complete" : "interrupted";
    this.progressWindow.changeHeadline(
      await this.getString(`duplicatesmerger-progress-${prefix}-title`),
    );
    this.progressWindow.progress.setProgress(100);
    this.progressWindow.progress.setText(
      await this.getString(`duplicatesmerger-progress-${prefix}`, { processed }),
    );
    this.progressWindow.show();
    this.progressWindow.startCloseTimer(5000);
  },

  async getNextDuplicatedItems(pane) {
    if (!pane || this.selectedItemsList.length) {
      return false;
    }

    for (let waited = 0; this.isRunning && waited < 30000; waited += 100) {
      const items = pane.getSelectedItems();
      if (items.length > 1) {
        const ids = items.map(item => item.id);
        if (ids.some(id => this.mismatchedIds.includes(id))) {
          return this.selectNextDuplicatedItems(pane);
        }
        this.selectedItemsIds = ids;
        this.selectedItemsList = items;
        this.lastProcessedItemId = ids[0];
        this.noSkippedItems = 0;
        return true;
      }
      await Zotero.Promise.delay(100);
    }
    return this.selectNextDuplicatedItems(pane);
  },

  async selectNextDuplicatedItems(pane) {
    if (!pane || this.selectedItemsList.length) {
      return false;
    }

    this.noSkippedItems = 0;
    let index = this.noMismatchedItemsSkipped;
    while (this.isRunning && pane.itemsView.rowCount > index) {
      const row = pane.itemsView.getRow(index);
      if (!row) {
        break;
      }
      const itemID = row.ref.id;
      const mismatchIndex = this.mismatchedIds.indexOf(itemID);
      if (mismatchIndex !== -1) {
        this.mismatchedIds.splice(mismatchIndex, 1);
        this.noMismatchedItemsSkipped++;
        index = this.noMismatchedItemsSkipped + this.noSkippedItems;
        continue;
      }

      const ids = pane.getCollectionTreeRow().ref.getSetItemsByItemID(itemID);
      if (ids.length < 2) {
        this.noSkippedItems++;
        index = this.noMismatchedItemsSkipped + this.noSkippedItems;
        await Zotero.Promise.delay(100);
        continue;
      }

      this.lastProcessedItemId = itemID;
      this.selectedItemsIds = ids;
      await pane.itemsView.selectItems(ids);
      this.selectedItemsList = pane.getSelectedItems();
      this.noSkippedItems = 0;
      return true;
    }

    this.selectedItemsList = [];
    this.noSkippedItems = 0;
    return false;
  },

  async checkFocus(pane) {
    while (this.isRunning) {
      await Zotero.Promise.delay(1000);
      this.elapsedTimeSinceLastAction += 1000;
      const row = pane.getCollectionTreeRow();
      this.isRunning = this.isRunning
        && Zotero.getActiveZoteroPane() === pane
        && row?.isDuplicates()
        && this.elapsedTimeSinceLastAction < 120000;
    }
    if (this.elapsedTimeSinceLastAction >= 120000) {
      Zotero.logError("Duplicates Merger timed out");
    }
  },

  async mergeDuplicates(pane) {
    if (this.isRunning) {
      Zotero.debug("Duplicates Merger is already running");
      return;
    }
    if (!pane.getCollectionTreeRow()?.isDuplicates()) {
      Zotero.logError("Duplicates Merger requires the Duplicate Items collection");
      return;
    }

    this.reset();
    this.isRunning = true;
    const delay = this.getPref("delay");
    this.initialNoItems = pane.itemsView.rowCount;
    this.currentRowCount = this.initialNoItems;

    try {
      await pane.getCollectionTreeRow().ref.getSearchObject();
      await this.createProgressWindow();
      await this.selectNextDuplicatedItems(pane);
      void this.checkFocus(pane);

      while (
        this.isRunning
        && this.currentRowCount > this.noMismatchedItemsSkipped + 1
        && this.errorCount <= 5
      ) {
        try {
          if (this.selectedItemsList.length > 1) {
            const merged = await this.mergeSelectedItems(pane, true);
            if (merged) {
              const previousID = this.lastProcessedItemId;
              for (let waited = 0; this.isRunning && waited < 20000; waited += 500) {
                const selected = pane.getSelectedItems();
                if (!selected.length || selected[0].id !== previousID) {
                  this.elapsedTimeSinceLastAction = 0;
                  break;
                }
                await Zotero.Promise.delay(500);
              }
            }
            else {
              this.mismatchedIds.unshift(...this.selectedItemsIds);
              this.elapsedTimeSinceLastAction = 0;
            }
            this.errorCount = 0;
            await this.updateProgressWindow();
          }
        }
        catch (error) {
          this.errorCount++;
          Zotero.logError(error);
          if (this.errorCount > 5) {
            break;
          }
          await Zotero.Promise.delay(2000);
        }
        finally {
          this.selectedItemsList = [];
          this.noSkippedItems = 0;
        }

        if (!this.isRunning) {
          break;
        }
        await Zotero.Promise.delay(delay);
        await this.getNextDuplicatedItems(pane);
        this.currentRowCount = pane.itemsView.rowCount;
      }

      const processed = this.initialNoItems - this.currentRowCount
        + this.noMismatchedItemsSkipped;
      const complete = this.errorCount <= 5
        && this.currentRowCount === this.noMismatchedItemsSkipped;
      await this.finishProgress(complete, processed);
    }
    catch (error) {
      Zotero.logError(error);
      await this.finishProgress(false, 0);
    }
    finally {
      this.isRunning = false;
      this.reset();
      this.progressWindow = null;
    }
  },
};
