# Obsidian Beautify — Codex 风格文件浏览器 + 中文排版美化包

[![Version](https://img.shields.io/badge/version-0.0.1-blue)]()
[![Obsidian](https://img.shields.io/badge/Obsidian-%E2%89%A51.11-purple)]()
[![License](https://img.shields.io/badge/license-MIT-green)]()

一套完整的 Obsidian 文件浏览器美化方案。将默认文件浏览器改造为 **Codex 风格**的分区布局,配合中文写作排版优化和 Apple 风格 Dashboard,让 Obsidian 既好看又好用。

> 📖 **AI 用户**:请阅读 [SKILL.md](SKILL.md)——它是一份面向 AI 助手的完整复现指南,按步骤执行即可在任意电脑的 Obsidian 仓库上复现全部效果。

## ✨ 效果预览

| 功能 | 说明 |
|------|------|
| 📌 置顶卡片 | 右键置顶,集中显示在顶部浅灰圆角卡片,附图钉标记 |
| 🖱️ 拖动排序 | 悬停行尾拖动手柄排序;拖过置顶/非置顶分界线 = 置顶/取消置顶 |
| 🎨 连续色块 | 展开彩色文件夹时,子项与父级连成一整块同色底色 |
| 📂 展开其余 N 项 | 展开文件夹默认只显示最新创建的 7 项,其余折叠为安静按钮 |
| 🔵 悬停高亮 | 鼠标悬停显示淡蓝色底色,选中/悬停时文字加粗 |
| 🌈 彩色药丸 | 文件夹/文件按规则显示彩色底色(7 色调色板 + 级联继承) |
| ➡️ 醒目箭头 | 折叠箭头加深加大(14px / stroke 3.5),缩进竖线加粗 |
| ✍️ 中文排版 | 17px 正文 / 1.8 行高 / 0.03em 中文字距 / 思源黑体 |
| 🖼️ 图片居中 | 嵌入图片自动 1000px 居中显示 |
| 📊 Apple Dashboard | cssclasses: dashboard 即可启用苹果风格仪表盘 |

## 📦 内容清单

```
obsidian-beautify/
├── SKILL.md                    ← AI 复现指南(入口文档,按此执行)
├── plugins/folder-pins/        ← 自研插件:置顶/排序/色块/折叠(完整源码)
│   ├── manifest.json
│   ├── main.js                 ← 核心逻辑(~700 行,无依赖)
│   ├── styles.css              ← 全部视觉样式
│   ├── data.json               ← 置顶/排序数据
│   └── README.md
├── snippets/                   ← 10 个 CSS 美化片段
│   ├── quiet-notes.css         ← 中文写作排版(17px/1.8行高/字距)
│   ├── line-height.css         ← 行间距 + 彩色底文件名加粗
│   ├── apple-dashboard.css     ← Apple 风格仪表盘(cssclasses: dashboard)
│   ├── frosted-notes.css       ← 毛玻璃笔记背景
│   ├── image-centered.css      ← 图片自动居中
│   ├── wider-page.css          ← 页面加宽至 1200px
│   ├── wide-tables.css         ← 表格与纸张同宽
│   ├── graph-background.css    ← 关系图谱深色美学
│   ├── weekly-task-index.css   ← 每周任务面板
│   └── file-tree-selection.css ← 文件树选中/激活高亮
└── configs/                    ← 配置参考
    ├── appearance.json         ← 字体/主题/CSS 片段开关
    ├── community-plugins.json  ← 启用的社区插件列表(27 个)
    ├── obsidian-file-color-data.json  ← 文件夹颜色规则(7 色调色板)
    └── folder-pins-data.json   ← 置顶/排序数据
```

## 🚀 快速开始

### 方式一:让 AI 帮你装(推荐)

把本仓库 clone 到本地,然后让 AI 助手阅读 `SKILL.md` 并按步骤执行:

```
请阅读 Obsidian-美化/SKILL.md,按照步骤帮我把美化应用到我的 Obsidian 仓库
```

### 方式二:手动安装

1. **安装社区插件**:Obsidian → 设置 → 第三方插件 → 浏览,安装并启用 **File Color**
2. **安装 folder-pins**:复制 `plugins/folder-pins/` 到 `<vault>/.obsidian/plugins/folder-pins/`
3. **复制 CSS 片段**:复制 `snippets/*.css` 到 `<vault>/.obsidian/snippets/`
4. **启用**:设置 → 外观 → CSS 片段,开启所有片段;设置 → 第三方插件,启用 folder-pins
5. **重启 Obsidian**

详见 [SKILL.md](SKILL.md) 完整步骤。

## 🔧 folder-pins 插件技术要点

自研 Obsidian 插件,无外部依赖,核心约 700 行 JavaScript:

- **排序注入**:包装 file-explorer 视图的 `getSortedFolderItems()`,补丁后立即 `requestSort()` 确保启动生效
- **同步装饰**:MutationObserver 回调内直接执行(不经过 Promise 二跳),排序/着色在浏览器绘制前完成——展开文件夹无闪烁
- **三重保险**:MutationObserver + 点击兜底(50ms/200ms)+ 周期 2 秒安全网
- **防死循环**:按钮文本写入守卫 + 全量排序 `needsSort` 检查 + 装饰风暴保险丝(100 次连续 → 冷却 2 秒)
- **性能优化**:ctime 缓存 + 已处理行跳过,大文件夹(676+ 项)展开流畅

## ⚙️ 可调参数

| 参数 | 默认值 | 位置 |
|------|--------|------|
| 置顶卡片灰色深度 | 4% | styles.css `fp-pinned` color-mix |
| 分界线高度/粗细 | 18px / 3px | styles.css `fp-first-unpinned::before` |
| 悬停高亮色 | rgba(96,165,250,0.22) | styles.css 5 处 |
| 最新可见条数 | 7 | main.js `NEWEST_VISIBLE` |
| 置顶/非置顶行间距 | 6px / 4px | styles.css padding-bottom |

## 📋 依赖

- Obsidian ≥ 1.11(实测 1.14.4)
- [File Color](https://github.com/teralifeguard/obsidian-file-color) 社区插件(彩色药丸)
- 可选:Dataview(Apple Dashboard 的 dataviewjs 查询)

## 📄 License

MIT
