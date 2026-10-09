"use strict";

const obsidian = require("obsidian");
const { Plugin, Notice, PluginSettingTab, Setting, setIcon } = obsidian;

const PARENT_ROOT = "";
const DRAG_MIME = "application/x-folder-pins";
const NEWEST_VISIBLE = 7; // 展开文件夹时默认可见的"最新创建"条数

/**
 * Folder Pins — Codex 风格的文件浏览器分区:
 *  - 顶部"置顶"区域(右键 → 置顶),拖动手柄排序,跨区拖动 = 置顶/取消置顶
 *  - 展开的文件夹渲染为连续同色色块
 *  - 悬停任意行 = 选中同款高亮预览
 *  - 展开文件夹默认只显示最新创建的 7 项,其余折叠为"展开其余 N 项"
 *  - 以上视觉增强由单一开关(界面美化)统一控制
 */

class FolderPinsPlugin extends Plugin {
  async onload() {
    this.pinned = new Set(); // 置顶的路径
    this.order = new Map(); // 父路径 -> 该层的手动顺序(路径数组)
    this.settings = { beautify: true }; // 界面美化总开关
    this.expandedFull = new Set(); // 已点击"展开其余"的文件夹路径(会话内有效)
    this._ctimeCache = new Map(); // 路径 -> 创建时间缓存(大文件夹展开时避免反复查询)
    this._decorating = false; // 装饰执行中标记,防止观察者重入
    this.patchedViews = new WeakSet();
    this.knownWraps = new WeakSet();
    this.observers = [];
    this.drag = null;
    this.unloaded = false;

    await this.loadSettings();

    this.registerEvent(this.app.workspace.on("layout-change", () => this.patchExplorers()));
    this.app.workspace.onLayoutReady(() => this.patchExplorers());
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file, source) => this.addMenuItems(menu, file, source))
    );

    this.addCommand({
      id: "toggle-pin-active-folder",
      name: "置顶/取消置顶:当前文件所在文件夹",
      callback: () => this.toggleActiveFolderPin(),
    });
    this.addCommand({
      id: "clear-root-manual-order",
      name: "清除根目录手动排序(保留置顶)",
      callback: async () => {
        this.order.delete(PARENT_ROOT);
        await this.saveSettings();
        this.resortAll();
        new Notice("Folder Pins: 已恢复默认排序");
      },
    });

    this.addSettingTab(new FolderPinsSettingTab(this.app, this));

    // 周期性安全网:每 2 秒检查是否有遗漏的装饰(观察器偶尔错过用户操作)
    this.registerInterval(
      window.setInterval(() => {
        if (this.unloaded) return;
        document.querySelectorAll(".nav-files-container").forEach((wrap) => {
          // 只在有未装饰的展开行时才触发(避免空转)
          const needs = Array.from(wrap.querySelectorAll(".tree-item.file-color-type-background")).some(
            (row) => {
              const c = row.querySelector(":scope > .tree-item-children");
              return c && c.clientHeight > 0 && !row.classList.contains("fp-openrow");
            }
          );
          if (needs) this.scheduleDecorations(wrap);
        });
      }, 2000)
    );

    this.patchExplorers();
  }

  onunload() {
    this.unloaded = true;
    this.observers.forEach((o) => {
      try {
        o.disconnect();
      } catch (e) {}
    });
    this.observers = [];
    try {
      this.app.workspace.iterateAllLeaves((leaf) => {
        const v = leaf.view;
        if (!v || !v.getViewType || v.getViewType() !== "file-explorer") return;
        if (v.__fpOrigSort) {
          v.getSortedFolderItems = v.__fpOrigSort;
          delete v.__fpOrigSort;
        }
        const wrap = v.containerEl && v.containerEl.querySelector(".nav-files-container");
        if (wrap) this.cleanupDecorations(wrap);
      });
    } catch (e) {}
  }

  /* ---------------- 设置持久化 ---------------- */

  async loadSettings() {
    let data = {};
    try {
      data = (await this.loadData()) || {};
    } catch (e) {}
    const pinned = Array.isArray(data.pinned) ? data.pinned : [];
    const order = data.order && typeof data.order === "object" ? data.order : {};
    this.pinned = new Set(pinned);
    this.order = new Map();
    Object.keys(order).forEach((k) => {
      if (Array.isArray(order[k])) this.order.set(k, order[k].slice());
    });
    // 兼容旧键 openUniformColor
    if (data.beautify !== undefined) this.settings.beautify = data.beautify !== false;
    else if (data.openUniformColor !== undefined) this.settings.beautify = data.openUniformColor !== false;
  }

  async saveSettings() {
    const order = {};
    this.order.forEach((v, k) => {
      order[k] = v;
    });
    try {
      await this.saveData({
        pinned: Array.from(this.pinned),
        order: order,
        beautify: this.settings.beautify,
      });
    } catch (e) {
      console.error("[folder-pins] saveData failed", e);
    }
  }

  parentKey(folderPath) {
    return !folderPath || folderPath === "/" ? PARENT_ROOT : folderPath;
  }

  /* ---------------- 排序补丁 ---------------- */

  patchExplorers() {
    if (this.unloaded) return;
    try {
      this.app.workspace.iterateAllLeaves((leaf) => {
        const v = leaf.view;
        if (!v || !v.getViewType || v.getViewType() !== "file-explorer") return;

        if (!this.patchedViews.has(v) && typeof v.getSortedFolderItems === "function") {
          const orig = v.getSortedFolderItems;
          const plugin = this;
          v.__fpOrigSort = orig;
          v.getSortedFolderItems = function (folder) {
            const items = orig.call(this, folder);
            try {
              return plugin.reorderItems(items, folder);
            } catch (e) {
              console.error("[folder-pins] reorder failed", e);
              return items;
            }
          };
          this.patchedViews.add(v);
          // 补丁后立即触发重排,确保启动时置顶排序自动生效
          if (typeof v.requestSort === "function") {
            try {
              v.requestSort();
            } catch (e) {}
          }
        }

        const wrap = v.containerEl && v.containerEl.querySelector(".nav-files-container");
        if (wrap && !this.knownWraps.has(wrap)) {
          this.knownWraps.add(wrap);
          const obs = new MutationObserver(() => this.scheduleDecorations(wrap));
          obs.observe(wrap, { childList: true, subtree: true });
          this.observers.push(obs);
          this.attachDnD(wrap, v);
          // 点击兜底:用户点击展开/折叠后确保装饰执行
          const plugin2 = this;
          wrap.addEventListener(
            "click",
            () => {
              setTimeout(() => plugin2.scheduleDecorations(wrap), 50);
              setTimeout(() => plugin2.scheduleDecorations(wrap), 200);
            },
            true
          );
          this.scheduleDecorations(wrap);
        }
      });
    } catch (e) {
      console.error("[folder-pins] patchExplorers failed", e);
    }
  }

  // 包装的排序:置顶组在前(按手动顺序),其余组保持手动顺序/原生顺序
  reorderItems(items, folder) {
    if (!items || items.length < 2) return items;
    const key = this.parentKey(folder && folder.path ? folder.path : "/");
    const ord = this.order.get(key) || null;
    const decorated = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const p = (it && it.file && it.file.path) || (it && it.path) || null;
      decorated.push({
        it: it,
        i: i,
        p: p,
        pinned: p ? this.pinned.has(p) : false,
        ord: p && ord ? ord.indexOf(p) : -1,
      });
    }
    decorated.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      const A = a.ord === -1 ? Number.MAX_SAFE_INTEGER : a.ord;
      const B = b.ord === -1 ? Number.MAX_SAFE_INTEGER : b.ord;
      if (A !== B) return A - B;
      return a.i - b.i;
    });
    return decorated.map((x) => x.it);
  }

  /* ---------------- 行装饰(分区/手柄/图钉/色块/折叠) ---------------- */

  scheduleDecorations(wrap) {
    // 保险丝:短时间内连续高频装饰 → 暂停 2 秒冷却,防止死循环锁死应用
    const now = Date.now();
    if (wrap.__fpLastPass) {
      if (now - wrap.__fpLastPass < 20) {
        wrap.__fpBurst = (wrap.__fpBurst || 0) + 1;
        if (wrap.__fpBurst > 100) {
          if (!wrap.__fpCooldownUntil || now > wrap.__fpCooldownUntil) {
            console.warn("[folder-pins] 检测到装饰风暴,冷却 2 秒(可能是循环,请报告)");
            wrap.__fpCooldownUntil = now + 2000;
          }
        }
      } else {
        wrap.__fpBurst = 0;
      }
    }
    if (wrap.__fpCooldownUntil && now < wrap.__fpCooldownUntil) return;
    wrap.__fpLastPass = now;

    // 直接在 MutationObserver 回调中同步执行(不经过 Promise.then 额外一跳),
    // 确保排序/隐藏/上色在浏览器绘制之前完成 → 展开时直接就是连续色块。
    if (this.unloaded || this._decorating || !wrap.isConnected) return;
    this._decorating = true;
    try {
      this.applyDecorations(wrap);
    } catch (e) {
      console.error("[folder-pins] applyDecorations failed", e);
    } finally {
      this._decorating = false;
    }
  }

  ctimeOf(path) {
    if (!path) return 0;
    let t = this._ctimeCache.get(path);
    if (t === undefined) {
      t = 0;
      try {
        const f = this.app.vault.getAbstractFileByPath(path);
        if (f && f.stat) t = f.stat.ctime;
      } catch (e) {}
      this._ctimeCache.set(path, t);
    }
    return t;
  }

  rootRows(wrap) {
    const rows = [];
    const all = wrap.querySelectorAll(".tree-item");
    all.forEach((r) => {
      const parentItem = r.parentElement ? r.parentElement.closest(".tree-item") : null;
      if (!parentItem) rows.push(r);
    });
    return rows;
  }

  rowPath(row) {
    const self = row.querySelector(":scope > .tree-item-self");
    return self && self.dataset ? self.dataset.path || null : null;
  }

  applyDecorations(wrap) {
    if (this.unloaded || !wrap.isConnected) return;
    const rows = this.rootRows(wrap);

    // Pass 1:根级行 — 置顶标记、分区首尾行、图钉、拖动手柄
    const pinnedFlags = rows.map((row) => {
      const path = this.rowPath(row);
      return path ? this.pinned.has(path) : false;
    });
    const firstPinned = pinnedFlags.indexOf(true);
    let lastPinned = -1;
    pinnedFlags.forEach((p, i) => {
      if (p) lastPinned = i;
    });
    let seenUnpinned = false;

    rows.forEach((row, i) => {
      const pinned = pinnedFlags[i];
      row.classList.toggle("fp-pinned", pinned);
      row.classList.toggle("fp-unpinned", !pinned);
      row.classList.toggle("fp-first-pinned", i === firstPinned);
      row.classList.toggle("fp-last-pinned", i === lastPinned && firstPinned !== -1 && i !== firstPinned);
      row.classList.toggle("fp-first-unpinned", !pinned && !seenUnpinned && firstPinned !== -1);
      if (!pinned) seenUnpinned = true;

      const self = row.querySelector(":scope > .tree-item-self");
      if (self) {
        let flag = self.querySelector(":scope > .fp-pin-flag");
        if (!flag) {
          flag = document.createElement("div");
          flag.className = "fp-pin-flag";
          setIcon(flag, "pin");
          self.appendChild(flag);
        }
        flag.style.display = pinned ? "" : "none";

        let handle = self.querySelector(":scope > .fp-handle");
        if (!handle) {
          handle = document.createElement("div");
          handle.className = "fp-handle";
          handle.setAttribute("aria-hidden", "true");
          handle.setAttribute("draggable", "true");
          setIcon(handle, "grip-vertical");
          self.appendChild(handle);
        }
      }
    });

    // Pass 2:彩色行。
    //  - 美化开启 + 展开(内部有可见子行)→ fp-openrow:整块连续底色,子项透明
    //  - 美化开启 + 嵌套折叠/叶子行 → fp-colorrow:底色移到整行,与根级同宽
    //  - 处于 fp-openrow 内部的行:透明,由祖先色块统一着色
    if (this.settings.beautify) {
      const allRows = wrap.querySelectorAll(".tree-item");
      allRows.forEach((row) => {
        if (!row.classList.contains("file-color-type-background")) {
          if (row.classList.contains("fp-colorrow")) {
            row.classList.remove("fp-colorrow");
            row.style.removeProperty("--file-color-color");
          }
          return;
        }

        const childrenEl = row.querySelector(":scope > .tree-item-children");
        const expandedVisible = !!(childrenEl && childrenEl.clientHeight > 0);
        const insideOpenRow = !!(row.parentElement && row.parentElement.closest(".tree-item.fp-openrow"));

        if (insideOpenRow) {
          row.classList.remove("fp-colorrow");
          row.style.removeProperty("--file-color-color");
          return;
        }

        if (expandedVisible) {
          if (!row.classList.contains("fp-openrow")) {
            row.classList.add("fp-openrow");
            row.classList.remove("fp-colorrow");
            row.style.removeProperty("--file-color-color");
          }
          return;
        }
        row.classList.remove("fp-openrow");

        const isNested = !!(row.parentElement && row.parentElement.closest(".tree-item"));
        if (!isNested) return; // 根级折叠/叶子行:原生药丸已是全宽

        const self = row.querySelector(":scope > .tree-item-self");
        if (!self) return;
        // 已完成整行绘色的行直接跳过,避免大文件夹每次装饰都全量重算
        if (row.classList.contains("fp-colorrow") && row.style.getPropertyValue("--file-color-color")) return;
        const raw = getComputedStyle(self).getPropertyValue("--file-color-color").trim();
        if (!raw) {
          row.classList.remove("fp-colorrow");
          return;
        }
        row.style.setProperty("--file-color-color", raw);
        row.classList.add("fp-colorrow");
      });
    } else {
      wrap.querySelectorAll(".fp-openrow, .fp-colorrow").forEach((row) => {
        row.classList.remove("fp-openrow", "fp-colorrow");
        row.style.removeProperty("--file-color-color");
      });
    }

    // Pass 3:展开的文件夹 — 按创建时间倒序,仅显示最新 7 项,
    // 其余折叠为"展开其余 N 项"按钮(点击展开全部)。
    if (this.settings.beautify) {
      const groups = wrap.querySelectorAll(".tree-item-children");
      groups.forEach((childrenEl) => {
        const childRows = Array.from(childrenEl.querySelectorAll(":scope > .tree-item"));
        const btn = childrenEl.querySelector(":scope > .fp-expand-more");

        if (childrenEl.clientHeight <= 0 || childRows.length === 0) {
          if (btn) btn.remove();
          return;
        }

        const parentRow = childrenEl.parentElement;
        const folderPath = parentRow ? this.rowPath(parentRow) : null;
        const full = folderPath ? this.expandedFull.has(folderPath) : true;

        if (childRows.length <= NEWEST_VISIBLE) {
          childRows.forEach((r) => r.classList.remove("fp-hidden-row"));
          if (btn) btn.remove();
          return;
        }

        if (full) {
          childRows.forEach((r) => r.classList.remove("fp-hidden-row"));
          if (btn) btn.remove();
          return;
        }

        // 按创建时间倒序全量重排(仅在顺序确实不同时才写入 DOM)
        // 注意:必须全量排序并检查整体顺序是否一致,
        // 不能只移动部分行(appendChild 移到末尾,检查位置永远不匹配会死循环)
        const withTime = childRows.map((r) => {
          return { r: r, t: this.ctimeOf(this.rowPath(r)) };
        });
        withTime.sort((a, b) => b.t - a.t);

        let needsSort = false;
        for (let i = 0; i < withTime.length; i++) {
          if (withTime[i].r !== childRows[i]) {
            needsSort = true;
            break;
          }
        }
        if (needsSort) withTime.forEach((x) => childrenEl.appendChild(x.r));

        withTime.forEach((x, i) => {
          x.r.classList.toggle("fp-hidden-row", i >= NEWEST_VISIBLE);
        });

        const n = childRows.length - NEWEST_VISIBLE;
        let button = btn;
        if (!button) {
          button = document.createElement("div");
          button.className = "fp-expand-more";
          button.setAttribute("role", "button");
          const plugin = this;
          button.addEventListener("click", (e) => {
            e.stopPropagation();
            plugin.expandedFull.add(folderPath);
            plugin.scheduleDecorations(wrap);
          });
          childrenEl.appendChild(button);
        }
        // 关键:仅在文本变化时写入。textContent 即使内容相同也会替换文本节点,
        // 触发 childList 突变 → 观察者 → 再写入 → 无限微任务循环(应用卡死)。
        const label = "展开其余 " + n + " 项";
        if (button.textContent !== label) button.textContent = label;
      });
    } else {
      wrap.querySelectorAll(".fp-expand-more").forEach((b) => b.remove());
      wrap.querySelectorAll(".fp-hidden-row").forEach((r) => r.classList.remove("fp-hidden-row"));
    }
  }

  cleanupDecorations(wrap) {
    try {
      if (wrap.__fpHandlers) {
        wrap.removeEventListener("dragstart", wrap.__fpHandlers.start, true);
        wrap.removeEventListener("dragover", wrap.__fpHandlers.over, true);
        wrap.removeEventListener("drop", wrap.__fpHandlers.drop, true);
        wrap.removeEventListener("dragend", wrap.__fpHandlers.end, true);
        delete wrap.__fpHandlers;
      }
      if (wrap.__fpMicro !== undefined) {
        // 待执行的微任务无法取消,仅清除标记;回调内有 unloaded/_decorating 防护
        delete wrap.__fpMicro;
      }
      wrap.querySelectorAll(".fp-handle, .fp-pin-flag, .fp-expand-more").forEach((el) => el.remove());
      wrap.querySelectorAll(".fp-colorrow, .fp-openrow").forEach((el) => {
        el.classList.remove("fp-colorrow", "fp-openrow");
        el.style.removeProperty("--file-color-color");
      });
      wrap.querySelectorAll(".fp-hidden-row").forEach((el) => el.classList.remove("fp-hidden-row"));
      wrap.querySelectorAll(".fp-pinned, .fp-unpinned, .fp-first-pinned, .fp-last-pinned, .fp-first-unpinned, .fp-drop-above, .fp-drop-below, .fp-dragging").forEach((el) => {
        el.classList.remove("fp-pinned", "fp-unpinned", "fp-first-pinned", "fp-last-pinned", "fp-first-unpinned", "fp-drop-above", "fp-drop-below", "fp-dragging");
      });
    } catch (e) {}
  }

  /* ---------------- 拖拽排序 ---------------- */

  attachDnD(wrap, view) {
    const plugin = this;
    const handlers = {
      start: (e) => plugin.onDragStart(wrap, e),
      over: (e) => plugin.onDragOver(wrap, e),
      drop: (e) => plugin.onDrop(wrap, view, e),
      end: (e) => plugin.onDragEnd(wrap, e),
    };
    wrap.__fpHandlers = handlers;
    wrap.addEventListener("dragstart", handlers.start, true);
    wrap.addEventListener("dragover", handlers.over, true);
    wrap.addEventListener("drop", handlers.drop, true);
    wrap.addEventListener("dragend", handlers.end, true);
  }

  onDragStart(wrap, e) {
    if (this.unloaded) return;
    if (!e.target || !e.target.closest) return;
    const handle = e.target.closest(".fp-handle");
    if (!handle) return; // 让 Obsidian 原生拖拽照常工作
    const row = handle.closest(".tree-item");
    const path = row ? this.rowPath(row) : null;
    if (!row || !path) return;
    try {
      e.stopPropagation(); // 阻止行上的原生 dragstart
    } catch (err) {}
    try {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData(DRAG_MIME, path);
      e.dataTransfer.setData("text/plain", path);
      e.dataTransfer.setDragImage(row, 24, 14);
    } catch (err) {}
    this.clearDropMarks(wrap);
    this.drag = { path: path, row: row, wrap: wrap, target: null };
    row.classList.add("fp-dragging");
  }

  onDragOver(wrap, e) {
    if (!this.drag) return;
    let ours = false;
    try {
      ours = e.dataTransfer && e.dataTransfer.types && Array.prototype.indexOf.call(e.dataTransfer.types, DRAG_MIME) !== -1;
    } catch (err) {}
    if (!ours) return;
    e.preventDefault();
    try {
      e.dataTransfer.dropEffect = "move";
    } catch (err) {}

    // 边缘自动滚动
    const rect = wrap.getBoundingClientRect();
    if (e.clientY < rect.top + 36) wrap.scrollTop -= 14;
    else if (e.clientY > rect.bottom - 36) wrap.scrollTop += 14;

    const ti = e.target && e.target.closest ? e.target.closest(".tree-item") : null;
    const row = ti && ti.parentElement && !ti.parentElement.closest(".tree-item") ? ti : null;
    this.clearDropMarks(wrap);
    if (!row || row === this.drag.row) {
      this.drag.target = null;
      return;
    }
    const r = row.getBoundingClientRect();
    const after = e.clientY > r.top + r.height / 2;
    row.classList.add(after ? "fp-drop-below" : "fp-drop-above");
    this.drag.target = { row: row, after: after };
  }

  onDrop(wrap, view, e) {
    if (!this.drag) return;
    const drag = this.drag;
    this.drag = null;
    drag.row.classList.remove("fp-dragging");
    this.clearDropMarks(wrap);
    if (!drag.target) return;
    try {
      e.preventDefault();
      e.stopPropagation();
    } catch (err) {}
    try {
      this.applyMove(wrap, view, drag.path, drag.target.row, drag.target.after);
    } catch (err) {
      console.error("[folder-pins] applyMove failed", err);
    }
  }

  onDragEnd(wrap, e) {
    if (!this.drag) return;
    this.drag.row.classList.remove("fp-dragging");
    this.clearDropMarks(wrap);
    this.drag = null;
  }

  clearDropMarks(wrap) {
    wrap.querySelectorAll(".fp-drop-above, .fp-drop-below").forEach((el) => {
      el.classList.remove("fp-drop-above", "fp-drop-below");
    });
  }

  // 计算新位置:更新置顶集合与根层手动顺序,然后让浏览器重排
  applyMove(wrap, view, dragPath, targetRow, after) {
    const rows = this.rootRows(wrap);
    const paths = [];
    rows.forEach((r) => {
      const p = this.rowPath(r);
      if (p) paths.push(p);
    });
    const fromIdx = paths.indexOf(dragPath);
    if (fromIdx === -1) return;

    const targetPath = this.rowPath(targetRow);
    const targetIdx = paths.indexOf(targetPath);
    if (targetIdx === -1) return;

    // 转换为"移除拖拽项之后"的插入下标
    let insert = targetIdx + (after ? 1 : 0);
    if (fromIdx < insert) insert -= 1;

    const remaining = paths.slice();
    remaining.splice(fromIdx, 1);

    // 分区判定:插入点在第一个未置顶行(移除后坐标)之前/其上 → 置顶区;否则未置顶区
    const firstUnpinnedOrig = rows.findIndex((r) => !r.classList.contains("fp-pinned"));
    let section;
    if (firstUnpinnedOrig === -1) {
      section = "pinned"; // 全部已置顶:拖动仅在置顶区内排序
    } else {
      const firstUnpinned = firstUnpinnedOrig > fromIdx ? firstUnpinnedOrig - 1 : firstUnpinnedOrig;
      section = insert <= firstUnpinned ? "pinned" : "unpinned";
    }
    if (section === "pinned") this.pinned.add(dragPath);
    else this.pinned.delete(dragPath);

    remaining.splice(insert, 0, dragPath);
    this.order.set(PARENT_ROOT, remaining);
    this.saveSettings();

    if (view && typeof view.requestSort === "function") view.requestSort();
    else if (view && typeof view.sort === "function") view.sort();
    this.scheduleDecorations(wrap);
  }

  /* ---------------- 右键菜单 / 命令 ---------------- */

  addMenuItems(menu, file, source) {
    if (this.unloaded) return;
    try {
      if (!file || !file.path || !source) return;
      if (!/file-explorer|file-tree/i.test(String(source))) return;
      const path = file.path;
      const isPinned = this.pinned.has(path);
      menu.addItem((item) =>
        item
          .setTitle(isPinned ? "取消置顶" : "置顶")
          .setIcon(isPinned ? "pin-off" : "pin")
          .onClick(async () => {
            if (isPinned) this.pinned.delete(path);
            else this.pinned.add(path);
            await this.saveSettings();
            this.resortAll();
          })
      );
      if (this.order.has(this.parentKey(path))) {
        menu.addItem((item) =>
          item
            .setTitle("清除此层手动排序")
            .setIcon("rotate-ccw")
            .onClick(async () => {
              this.order.delete(this.parentKey(path));
              await this.saveSettings();
              this.resortAll();
            })
        );
      }
    } catch (e) {
      console.error("[folder-pins] menu failed", e);
    }
  }

  toggleActiveFolderPin() {
    const active = this.app.workspace.getActiveFile();
    if (!active) {
      new Notice("没有活动文件");
      return;
    }
    const parentPath = active.parent && active.parent.path ? active.parent.path : "/";
    if (!parentPath || parentPath === "/") {
      new Notice("根目录无需置顶");
      return;
    }
    const isPinned = this.pinned.has(parentPath);
    if (isPinned) this.pinned.delete(parentPath);
    else this.pinned.add(parentPath);
    this.saveSettings();
    this.resortAll();
    new Notice(isPinned ? "已取消置顶:" + parentPath : "已置顶:" + parentPath);
  }

  resortAll() {
    try {
      this.app.workspace.iterateAllLeaves((leaf) => {
        const v = leaf.view;
        if (!v || !v.getViewType || v.getViewType() !== "file-explorer") return;
        try {
          if (typeof v.requestSort === "function") v.requestSort();
          else if (typeof v.sort === "function") v.sort();
        } catch (e) {}
      });
    } catch (e) {}
    document.querySelectorAll(".nav-files-container").forEach((w) => this.scheduleDecorations(w));
  }
}

/* ---------------- 设置面板 ---------------- */

class FolderPinsSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Folder Pins" });

    new Setting(containerEl)
      .setName("界面美化")
      .setDesc(
        "统一控制全部视觉增强:置顶卡片与黑色分界横线、展开文件夹的连续同色色块、" +
          "悬停高亮预览、展开文件夹时仅显示最新创建的 7 项(其余折叠为「展开其余 N 项」)。" +
          "置顶与拖动排序功能不受此开关影响。"
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.beautify).onChange(async (value) => {
          this.plugin.settings.beautify = value;
          await this.plugin.saveSettings();
          this.plugin.resortAll();
        })
      );
  }
}

module.exports = FolderPinsPlugin;
