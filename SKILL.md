# Obsidian 美化配置包 — 完整复现指南

> 本文档面向 AI 助手。目标:让 AI 在任意电脑的 Obsidian 仓库上,完整复现当前仓库的全部美化效果。
> 按本文档顺序执行即可,不需要人工判断。

---

## 一、美化效果总览

| 效果 | 实现方式 |
|------|----------|
| 置顶区灰色圆角卡片 | folder-pins 自研插件 |
| 拖动排序 + 跨区置顶 | folder-pins 自研插件 |
| 彩色药丸底色(文件夹/文件) | obsidian-file-color 社区插件 |
| 展开文件夹 = 连续同色色块 | folder-pins 插件 |
| 展开文件夹默认只显示最新 7 项 | folder-pins 插件(其余折叠为"展开其余 N 项"按钮) |
| 悬停 = 淡蓝色高亮 + 字体加粗 | folder-pins 插件 CSS |
| 折叠箭头加深加大 + 缩进竖线加粗 | folder-pins 插件 CSS |
| 置顶/非置顶分界:黑色加粗横线(不透明底色隔断色块) | folder-pins 插件 CSS |
| 笔记排版(字体/行高/中文字距/表格/引用) | quiet-notes.css snippet |
| 嵌入图片自动居中(1000px) | image-centered.css snippet |
| 表格与纸张同宽居中 | wider-page.css + wide-tables.css |
| 行间距 1.8 / 彩色底文件名加粗 | line-height.css snippet |
| 关系图谱深色美学 | graph-background.css snippet |
| 毛玻璃笔记背景 | frosted-notes.css snippet |
| Apple 风格 Dashboard(cssclasses: dashboard) | apple-dashboard.css snippet |
| 每周任务索引面板(cssclasses: weekly-task-index) | weekly-task-index.css snippet |
| 文件树选中/激活行高亮 | file-tree-selection.css snippet |
| 界面字体:思源黑体 / 正文:Times New Roman + 思源黑体 | appearance.json |

---

## 二、文件清单与本目录结构

```
Obsidian-美化/
├── SKILL.md                          ← 本文档(AI 按此执行)
├── plugins/folder-pins/              ← 自研插件完整源码(直接复制到目标仓库)
│   ├── manifest.json
│   ├── main.js
│   ├── styles.css
│   ├── data.json                     ← 含当前置顶/排序数据(可清空后重新配置)
│   └── README.md
├── snippets/                         ← 全部 CSS 片段(直接复制到目标仓库)
│   ├── line-height.css
│   ├── wider-page.css
│   ├── quiet-notes.css
│   ├── image-centered.css
│   ├── wide-tables.css
│   ├── frosted-notes.css
│   ├── graph-background.css
│   ├── apple-dashboard.css
│   ├── weekly-task-index.css
│   └── file-tree-selection.css
├── configs/                          ← 配置文件参考(选择性合并,不要盲目覆盖)
│   ├── appearance.json               ← 外观/字体/CSS 片段开关
│   ├── community-plugins.json        ← 启用的社区插件列表
│   ├── obsidian-file-color-data.json ← 文件夹颜色规则(核心!)
│   ├── obsidian-file-color-manifest.json
│   └── folder-pins-data.json         ← 置顶/排序数据
└── assets/                           ← 兼容旧版引用(与 plugins/folder-pins/ 内容相同)
```

---

## 三、部署步骤(AI 按顺序执行)

### 前置条件

- Obsidian ≥ 1.11(实测 1.14.4)
- 目标仓库 `.obsidian/` 目录存在
- 可访问 Obsidian 社区插件市场(或手动下载插件文件)

### 步骤 1:安装社区插件

在 Obsidian 中安装并启用以下插件(设置 → 第三方插件 → 浏览):

| 插件名 | 用途 | 必需 |
|--------|------|------|
| File Color | 文件夹/文件彩色底色 | ✅ 核心 |
| Dataview | 笔记查询(dashboard 依赖) | 推荐 |
| Homepage | 启动时自动打开主页 | 推荐 |
| Excalidraw | 手绘白板 | 可选 |
| Kanban | 看板 | 可选 |
| Tasks | 任务管理 | 可选 |
| Templater | 模板 | 可选 |
| Virtual Linker | 自动链接 | 可选 |
| Editing Toolbar | 编辑工具栏 | 可选 |
| Hover Editor | 悬浮编辑器 | 可选 |
| Admonition | 标注块 | 可选 |
| PDF Plus | PDF 标注 | 可选 |
| Table Editor | 表格编辑 | 可选 |
| Easy Typing | 中文输入优化 | 可选 |
| Update Time on Edit | 自动更新时间 | 可选 |
| Columns | 多栏布局 | 可选 |
| Notebook Navigator | 笔记导航(备用) | 可选 |
| Heatmap Calendar | 热力图 | 可选 |
| Excalidraw Extras | Excalidraw 增强 | 可选 |
| File Tree Folder Selection | 文件树文件夹选中 | 可选 |
| Auto Collapse Closed Branches | 自动折叠 | 可选 |
| Mermaid Tools | Mermaid 图表 | 可选 |
| Editor Width Slider | 编辑宽度 | 可选 |
| Style Settings | 样式设置面板 | 可选 |
| Obsidian Importer | 导入工具 | 可选 |
| Emoji Toolbar | Emoji 工具栏 | 可选 |

> 如果无法访问市场,参考 `configs/community-plugins.json` 中的插件 ID 列表,手动从 GitHub 下载放入 `.obsidian/plugins/<插件ID>/`。

### 步骤 2:安装 folder-pins 自研插件

将 `plugins/folder-pins/` 目录下的 4 个文件复制到目标仓库:

```bash
mkdir -p <vault>/.obsidian/plugins/folder-pins
cp plugins/folder-pins/manifest.json  <vault>/.obsidian/plugins/folder-pins/
cp plugins/folder-pins/main.js        <vault>/.obsidian/plugins/folder-pins/
cp plugins/folder-pins/styles.css     <vault>/.obsidian/plugins/folder-pins/
cp plugins/folder-pins/data.json      <vault>/.obsidian/plugins/folder-pins/
```

> ⚠️ 目录名必须为 `folder-pins`(与 manifest.json 的 id 一致)。

### 步骤 3:复制 CSS 片段

将 `snippets/` 目录下所有 `.css` 文件复制到:

```bash
mkdir -p <vault>/.obsidian/snippets
cp snippets/*.css <vault>/.obsidian/snippets/
```

### 步骤 4:启用 CSS 片段

编辑 `<vault>/.obsidian/appearance.json`,确保 `enabledCssSnippets` 包含所有片段名(不含 .css 后缀):

```json
{
  "enabledCssSnippets": [
    "line-height",
    "wider-page",
    "apple-dashboard",
    "quiet-notes",
    "image-centered",
    "wide-tables",
    "graph-background",
    "weekly-task-index",
    "frosted-notes",
    "file-tree-selection"
  ]
}
```

或者在 Obsidian 中:设置 → 外观 → CSS 片段 → 逐个开启。

### 步骤 5:设置界面字体(可选)

编辑 `<vault>/.obsidian/appearance.json`:

```json
{
  "interfaceFontFamily": "思源黑体",
  "textFontFamily": "Times New Roman,思源黑体",
  "monospaceFontFamily": "3DS Fonticon",
  "baseFontSize": 16,
  "theme": "moonstone"
}
```

> 需要电脑已安装"思源黑体"(Source Han Sans)字体。未安装可改为系统字体。

### 步骤 6:配置文件夹颜色(核心视觉)

obsidian-file-color 插件的 `data.json` 定义了两件事:
1. **调色板**(palette):可用的颜色列表
2. **颜色规则**(fileColors):哪些路径用哪个颜色

参考 `configs/obsidian-file-color-data.json`。

关键字段说明:

| 字段 | 值 | 说明 |
|------|-----|------|
| `cascadeColors` | `true` | 子文件夹/文件继承父文件夹颜色 |
| `colorBackground` | `true` | 颜色作用于背景(而非文字) |

调色板(当前使用的颜色):

| 名称 | 色值 | 用途 |
|------|------|------|
| 综合文件夹 | `#e1acec` | 淡紫:通用文件夹 |
| 专项技术文件夹 | `#00ffcc` | 青绿:技术类文件夹 |
| Home | `#ffea00` | 黄色:主页/重要入口 |
| File | `#6200f5` | 深紫:文件 |
| 任务待办 | `#ff0000` | 红色:待办 |
| Ai 交互 | `#ff00f7` | 洋红:AI 相关 |
| 重要 | `#00ff2a` | 绿色:重要标记 |

颜色规则是 `path → 调色板ID` 的映射。AI 应根据目标仓库的实际文件夹结构,参照当前仓库的规则逻辑来分配:
- 技术类文件夹 → 青绿(`xGj79IqQkWy361T8WmGoP`)
- 通用/附件类 → 淡紫(`xB39_KzX3_wsbAAqlafDg`)
- 主页/入口 → 黄色(`EPVJzYrw7yLsZqjw_CCBu`)
- AI 相关 → 洋红(`oILHYqukLv6INUu5jeaHV`)

将配置写入 `<vault>/.obsidian/plugins/obsidian-file-color/data.json`。

### 步骤 7:配置 folder-pins 置顶数据

编辑 `<vault>/.obsidian/plugins/folder-pins/data.json`:

```json
{
  "pinned": ["要置顶的文件夹路径1", "路径2"],
  "order": {
    "": ["手动排序的完整路径列表"]
  },
  "beautify": true
}
```

- `pinned`:置顶项的路径数组(按置顶顺序)
- `order.""`:根目录的完整手动排序(包含所有可见项)
- `beautify`:界面美化总开关(true = 启用全部视觉增强)

### 步骤 8:注册插件到启用列表

编辑 `<vault>/.obsidian/community-plugins.json`,确保包含:

```json
"folder-pins",
"obsidian-file-color"
```

以及所有其他要启用的社区插件 ID。

### 步骤 9:重启 Obsidian

关闭并重新打开 Obsidian。如果 Obsidian 正在运行,直接编辑配置文件不会生效,必须重启。

### 步骤 10:AI 验证清单

重启后,AI 按以下清单验证(通过 CLI eval 或让用户确认):

| 检查项 | 预期 |
|--------|------|
| 文件浏览器有灰色圆角置顶卡片 | ✅ |
| 置顶行有图钉图标 | ✅ |
| 右键文件夹有"置顶"选项 | ✅ |
| 悬停任意行 → 淡蓝色高亮 + 文字加粗 | ✅ |
| 折叠箭头深色加粗(14px) | ✅ |
| 置顶/非置顶之间有黑色横线(不透明底色) | ✅ |
| 展开彩色文件夹 → 连续同色色块 | ✅ |
| 展开子项 > 7 的文件夹 → "展开其余 N 项"按钮 | ✅ |
| 重启 Obsidian → 置顶排序自动生效 | ✅ |
| 笔记排版:17px 字体、1.8 行高、中文字距 | ✅ |
| 嵌入图片自动居中 1000px | ✅ |

---

## 四、技术架构(folder-pins 插件调试参考)

### 核心原理

- **排序**:包装 file-explorer 视图的 `getSortedFolderItems()`,置顶组在前,补丁后立即 `requestSort()` 触发重排
- **装饰**:MutationObserver(同步执行,绘制前完成)+ 点击兜底(50ms/200ms)+ 周期 2 秒安全网,三重保险
- **色块**:`fp-openrow` CSS 类驱动,展开行整行绘制底色,子项透明
- **防死循环**:按钮文本写入守卫 + needsSort 检查 + 装饰风暴保险丝(100 次连续 → 冷却 2 秒)+ 全量排序 needsSort 检查

### 关键 CSS 类

| 类名 | 用途 |
|------|------|
| `fp-pinned` | 置顶行(淡灰卡片底色) |
| `fp-unpinned` | 非置顶行 |
| `fp-first-pinned` / `fp-last-pinned` | 卡片首尾行(圆角) |
| `fp-first-unpinned` | 分界横线所在行 |
| `fp-openrow` | 展开的彩色文件夹(连续色块) |
| `fp-colorrow` | 嵌套彩色行(底色移到整行) |
| `fp-hidden-row` | 被"展开其余"折叠隐藏的行 |
| `fp-expand-more` | "展开其余 N 项"按钮 |
| `fp-pin-flag` | 图钉图标 |
| `fp-handle` | 拖动手柄 |

### 可调参数

| 参数 | 位置 | 当前值 |
|------|------|--------|
| 置顶卡片灰色深度 | `fp-pinned` 的 `color-mix` 第二个百分比 | 4% |
| 分界线区域高度 | `fp-first-unpinned::before` 的 `height` | 18px |
| 黑线粗细 | 同上 gradient 的 7px-10px 段 | 3px |
| 悬停/选中高亮色 | `rgba(96, 165, 250, 0.22)` | 淡蓝色 |
| 最新可见条数 | main.js 的 `NEWEST_VISIBLE` 常量 | 7 |
| 置顶区行间距 | `fp-pinned` padding-bottom | 6px |
| 非置顶区行间距 | `fp-unpinned` padding-bottom | 4px |
| 折叠箭头大小/粗细 | `collapse-icon svg` 的 width/height 和 stroke-width | 14px / 3.5 |
| 展开过渡动画 | `tree-item-self` 的 transition | 80ms ease |

---

## 五、CSS Snippet 详细说明

### quiet-notes.css — 中文写作排版
- 正文 17px,行高 1.8(阅读)/ 2(阅读视图),中文字距 0.03em
- 标题层级:1.6em/1.3em/1.12em,递减粗细
- 表格:细边框 + 灰底表头
- 引用块:左竖线 + 灰色文字
- 明暗主题自适应颜色变量

### apple-dashboard.css — Apple 风格仪表盘
- 仅作用于 `cssclasses: dashboard` 的页面
- 毛玻璃卡片 + 淡彩 mesh 背景 + 左侧导航栏
- 需配合 Dataview 插件的 dataviewjs 查询
- 深色模式自动适配

### frosted-notes.css — 毛玻璃笔记
- 所有 Markdown 页面加毛玻璃效果(blur 18px)
- 明暗主题不同透明度

### file-tree-selection.css — 文件树选中高亮
- 选中行:淡蓝色叠加 + 左侧蓝色标记线
- 激活行:更深的蓝色叠加 + 粗标记线
- 确保在 File Color 彩色底之上仍可见

### image-centered.css — 图片居中
- 嵌入图片 1000px 宽度居中
- Emoji 保持行内

### graph-background.css — 图谱深色
- 关系图谱背景强制深色 #1c1c1e
- 节点/连线/文字亮色配对

### weekly-task-index.css — 每周任务面板
- 仅作用于 `cssclasses: weekly-task-index` 的页面
- 蓝色待办区 + 黄色计划区,毛玻璃面板

---

## 六、故障排除

| 症状 | 原因 | 解决 |
|------|------|------|
| 展开后没有色块 | 装饰未触发 | 确认"界面美化"开启;重启 Obsidian |
| 无"展开其余"按钮 | 子项 ≤ 7 | 正常,仅 >7 显示 |
| 不显示彩色药丸 | obsidian-file-color 未启用 | 安装并启用 |
| folder-pins 不加载 | 目录名不匹配 | 确保目录名为 `folder-pins` |
| 重启后置顶排序丢失 | 未触发 requestSort | 确认使用最新 main.js(含启动自动排序) |
| 应用卡死 | 装饰风暴 | 关"界面美化"开关;删除 folder-pins 文件夹后重启 |
| CSS 片段不生效 | 未在 appearance.json 中启用 | 步骤 4 |
| 思源黑体不生效 | 电脑未安装该字体 | 安装 Source Han Sans 或改为系统字体 |

---

## 七、已知限制

- folder-pins 要求 Obsidian ≥ 1.11(依赖新版 getSortedFolderItems API)
- 最新 7 项的展开状态是会话级的(重启后恢复默认折叠)
- 置顶数据存储在插件 data.json 中,通过 OneDrive 同步到其他电脑后自动生效
- 安装思源黑体字体需要在操作系统层面安装,非 Obsidian 内配置
