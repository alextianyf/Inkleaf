<p align="center">
  <img src="resources/icons/inkleaf-128.png" width="88" height="88" alt="印页印章图标">
</p>

<h1 align="center">印页 · Inkleaf</h1>

<p align="center">
  <strong>让文字成页。</strong><br>
  搜索 Markdown，预览 PDF，保存到你的电脑。
</p>

<p align="center">这是一个献给所有 Markdown 爱好者的免费工具！</p>

<p align="center">
  <a href="README.md">English</a> · <strong>简体中文</strong>
</p>

<p align="center">
  <a href="#获取印页"><img src="https://img.shields.io/badge/Windows-30343B?style=flat-square" alt="仅支持 Windows"></a>
  <img src="https://img.shields.io/badge/免费-30343B?style=flat-square" alt="免费使用">
  <img src="https://img.shields.io/badge/English_%C2%B7_%E4%B8%AD%E6%96%87-30343B?style=flat-square" alt="支持中文与英文">
</p>

<p align="center">
  <a href="#获取印页">获取印页</a> ·
  <a href="#生成第一份-pdf">开始使用</a> ·
  <a href="docs/todo.md">后续计划</a> ·
  <a href="https://github.com/alextianyf/Inkleaf/issues">反馈问题</a>
</p>

## 一小块空间，完成一份 PDF

印页是一个 Windows 桌面工具，把 Markdown 笔记、项目 README 和技术文档转换为 PDF。按下快捷键，搜索文件，检查排版，再导出。无需账号、订阅或上传文档。

[![真实应用演示：搜索 Markdown，预览公式与表格，点击目录链接，再导出 PDF](docs/media/demo-zh.gif)](docs/media/demo-zh.png)

<p align="center"><sub>使用示例文档在真实应用中录制。<a href="docs/media/demo-zh.png">查看静态预览</a>。</sub></p>

## 名字的由来

一块印版，可以反复印刷。一份 Markdown，也可以反复成页。

灵感来自中国传统印刷术，**印页**将印刷的过程与完成的纸页连在一起。**Inkleaf** 则由墨（ink）与纸页（leaf）组成。继续用 Markdown 写作，需要分享时，就印成一份 PDF。

## 印页能做什么

| 需求         | 使用体验                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------ |
| **找到文档** | 输入部分文件名或路径即可搜索，结果会区分 Markdown 文件和包含 Markdown 的文件夹。                 |
| **先看成品** | 预览实际生成的 PDF，检查分页、点击目录跳转。导出使用的就是这份 PDF 数据。                        |
| **保留细节** | 渲染公式、表格、图片、对齐的徽章、任务列表与脚注。缺失资源及部分不支持的内容会显示提示。         |
| **整批转换** | 选择文件夹中的 Markdown，逐份检查并批量导出。可保留子目录，自动保存时为同名 PDF 编号，避免覆盖。 |
| **调整排版** | 三套主题，A4 或 Letter，横竖方向、页边距、字号、行距、作者信息与页码均可调整。                   |
| **留在本机** | 转换不改写 Markdown 原文件。PDF 可保存到下载文件夹、原文件旁，或你指定的位置。                   |

## 为什么选择印页？

- **免费使用。** 无需订阅、购买转换额度或注册账号。
- **界面简单，步骤少。** 唤起搜索栏、选择文件、查看预览；不用时收在系统托盘里。
- **快速查找文件。** 已有 Windows 基准测试中，查询 **10 万个已索引 Markdown 文件，中位耗时约 23 ms**。首次扫描、启动和界面显示另计。[测试数据与限制](docs/search.md)。
- **文档留在本机。** 本地转换，不改写 Markdown 原文件；使用本地资源的文档与公式可离线处理。
- **分享前先检查。** 预览的就是实际 PDF，先看分页、公式与链接，再决定导出。
- **少做重复操作。** 整个文件夹一起转换，并保留输出文件的子目录结构。

远程图片和更新检查需要联网，文档转换在你的电脑上完成。

## Markdown 变成 PDF，是什么样子？

下面左侧是 **Markdown 原文**，右侧是**印页实际生成的 PDF**，统一使用简约主题、A4 纸张和 10.5 pt 正文字号。图片仅裁去空白页边距；点击可放大，下载 PDF 可体验其中的链接。

### 标题与文字

一级至六级标题、**粗体**、_斜体_、删除线、中英混排和引用段落。

[![Markdown 与真实 PDF 对照：六级标题、文字强调、中英文和引用段落](docs/media/examples/typography.png)](docs/media/examples/typography.png)

[Markdown 原文](docs/demo/examples/typography.md) · [实际 PDF](docs/media/examples/typography.pdf)

### 代码与公式

代码保留文字与缩进，目前尚无语法高亮。KaTeX 渲染行内公式、积分与分式。

[![Markdown 与真实 PDF 对照：JavaScript 代码、行内公式、高斯积分与求根公式](docs/media/examples/code-math.png)](docs/media/examples/code-math.png)

[Markdown 原文](docs/demo/examples/code-math.md) · [实际 PDF](docs/media/examples/code-math.pdf)

### 表格与列表

表格的左、中、右对齐，已完成和未完成任务，以及有序步骤和嵌套无序列表。PDF 中的任务复选框为静态显示。

[![Markdown 与真实 PDF 对照：表格列对齐、任务复选框与嵌套列表](docs/media/examples/tables-lists.png)](docs/media/examples/tables-lists.png)

[Markdown 原文](docs/demo/examples/tables-lists.md) · [实际 PDF](docs/media/examples/tables-lists.pdf)

### 图片、徽章与链接

本地图片和 SVG 徽章遵循父段落的居中设置。PDF 包含文内跳转、外部链接，以及带返回链接的脚注。链接可在 PDF 中操作，对照图片本身没有这些交互。

[![Markdown 与真实 PDF 对照：居中图片与徽章、内部及外部链接、脚注](docs/media/examples/images-links.png)](docs/media/examples/images-links.png)

[Markdown 原文及本地图片](docs/demo/examples/) · [实际 PDF](docs/media/examples/images-links.pdf)

这些示例展示已支持的内容，并不代表兼容所有 Markdown 方言。尚未支持的扩展与排版限制见[兼容性说明](docs/engine.md)。

## 获取印页

**目前仅支持 Windows，首个公开版本正在准备中。** 暂无公开安装包；发布后可从 [GitHub Releases](https://github.com/alextianyf/Inkleaf/releases) 获取。也可以先[从源码运行](#技术与开发)。

Windows 安装包自带运行环境，使用者无需安装 Node.js 或 Python。目前不提供 macOS 和 Linux 版本，Windows 构建尚未进行代码签名。

安装版会检查新的稳定版本。发现更新后，点击**下载**，准备好后再选择**重启并更新**。有转换或导出任务时会等待完成；普通退出不会自动安装。[更新与发布说明](docs/updates.md)。

## 生成第一份 PDF

1. 启动印页，按 **Ctrl + Shift + Space** 唤起搜索栏。
2. 输入部分 Markdown 文件名，选中结果后按 **Enter**。
3. 检查 PDF 预览，点击**导出 PDF**，默认保存到下载文件夹。

选中文件夹结果可准备批量转换。按 **Esc** 收起搜索栏；右键**系统托盘图标**可打开设置或退出应用。

设置分为**通用、搜索、排版、导出、关于与更新**。排版使用固定示例文档实时预览，目前设置在修改后立即保存。[完整设置说明](docs/settings.md)。

## 你可能想知道

<details>
<summary><strong>搜索范围是什么？</strong></summary>

搜索本地 Markdown 文件名、路径，以及包含已索引 Markdown 的文件夹。首次扫描需要时间，文件会随扫描进度逐步出现。可在设置中添加目录或排除位置。目前不支持正文、拼音或拼写纠错搜索。

</details>

<details>
<summary><strong>断网可以用吗？</strong></summary>

使用本地资源的文档可以离线转换，公式渲染及其字体已随应用提供。远程图片和徽章在获取时需要联网，更新检查会连接 GitHub。文档本身不会上传到服务器进行转换。

</details>

<details>
<summary><strong>所有 Markdown 扩展都支持吗？</strong></summary>

支持常见 Markdown 及部分扩展，包括 KaTeX 公式和脚注。尚未实现 Mermaid、PlantUML、Obsidian 双链与代码语法高亮。复杂 HTML/CSS、过宽的表格和公式仍可能需要调整。[支持范围与限制](docs/engine.md)。

</details>

<details>
<summary><strong>会修改我的原文件吗？</strong></summary>

不会。转换只读取 Markdown。有限的格式修复在内存中完成，并显示修改提示；它不能自动修复所有 Markdown 问题。[文档检测说明](docs/source-checks.md)。

</details>

## 还在打磨的地方

转换流程已经实现，桌面体验仍在完善。已知问题包括搜索栏尺寸调整、排版设置中的示例预览偏小，以及编辑作者信息时反馈不够直观。排版操作、PDF 美观性和搜索也会继续改进，详见[后续计划](docs/todo.md)。

如果遇到渲染问题，欢迎[提交反馈](https://github.com/alextianyf/Inkleaf/issues)，附上应用版本、Windows 版本、最小 Markdown 示例和预期效果。分享前请移除私人信息。

## 技术与开发

**Electron 与 React** 构建桌面应用，**Markdown-it** 解析文档，**KaTeX** 渲染公式，**Chromium** 生成 PDF，**PDF.js** 显示预览。更新由 **electron-updater** 与 GitHub Releases 提供。

从源码运行桌面版，需要 Node.js 22.12 或更新版本：

```sh
git clone https://github.com/alextianyf/Inkleaf.git
cd Inkleaf
npm ci
npm start
```

桌面版已合并到 `main`，早期版本保存在 `aldusV1` 分支。[开发与构建](docs/development.md) · [项目结构](docs/architecture.md)。

---

<p align="center">
  <sub>印页 · Inkleaf · 让文字成页。</sub><br>
  <a href="resources/icons/README.md">品牌资产</a> ·
  <a href="docs/engine.md">Markdown 支持范围</a> ·
  <a href="https://github.com/alextianyf/Inkleaf/issues">反馈问题</a>
</p>
