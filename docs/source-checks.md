# 文档检测与转换前修复

两层职责不同：

- `src/conversion/diagnostics/markdown/`：检查原始 Markdown 的写法，在内存副本上做有限修复。
- `src/conversion/html-layout.cjs` 与 `tests/integration/`：保留 HTML 布局属性，并检查真实输出的居中、宽度和分页。居中指令未被保留属于渲染/布局错误，不应通过改写 Markdown 掩盖。未来需要新的布局检测器时再新增模块，不保留没有实现的空目录。

流程：原文件 → `checkMarkdown` → 内存副本 → Markdown/HTML 渲染 → PDF → 预览/导出。

`src/conversion/diagnostics/` 不访问文件系统。`src/conversion/document.cjs` 只读原文件，检测结果通过 `sourceDiagnostics` 进入单文件/批量预览；修复不会写回原文件，也不会新建一份“修复后的 Markdown”。导出仍使用预览对应的 PDF 字节。

## 当前列表规则

`markdown/list-spacing.cjs` 首先利用当前解析器的 token 和源行映射限定范围，只检查顶层普通段落，跳过代码、HTML、公式、引用和嵌套列表。

`solution:` 后直接换行写 `- xxxx`，不需要空白行，当前解析器已经支持；此规则不将它误报为错误。

第一版自动修复的启发式范围：一个独占一行、以中英文冒号结尾的短标签，紧接至少两个同级的连续列表候选行；横杠后直接跟文字，且没有其他混杂段落。仅补横杠后的空格，不修改内容、换行符或缩进。常见命令选项标签、单字母选项、数字/负数等不自动改写。

例如 `solution:\n-xxxx\n-xxx` 在转换副本中成为 `solution:\n- xxxx\n- xxx`。这是有限的意图推断，不能保证识别所有普通文本与命令选项。预览明确显示补空格的提示和源行号。

额外缩进的列表、单个疑似漏空格的列表项、同一物理行里的多个列表项，只提示并保留原样。代码缩进、数学减号和命令参数不能靠全局正则安全判断。没有尝试自动修复“所有不正确的 Markdown”。

## 添加规则

1. 在 `src/conversion/diagnostics/markdown/` 添加纯函数规则，导出稳定的 `id` 与 `check({ lines, paragraphs })` 生成器，在同级的 `index.cjs` 注册。生成器逐项返回发现，避免大文件一次性创建过多报告对象。
2. 每个发现包含翻译 `key`、原文的一基 `line` / `endLine`；可选 `edits: [{ line, text }]`。没有 edits 就只提示。
3. 第一版只允许原行替换，不允许新增/删除行，保证原文定位准确；未来若需要结构改写，先扩展源行映射。冲突编辑会被拒绝。
4. 补中英文消息、能复现问题的测试和“看似相似但不能改”的反例。验证重复执行不再改变文本，并通过实际 PDF 检查。
5. 检测报告最多展示前 100 项。报告上限不截断可确定的修复。

运行 `npm run test:diagnostics` 检查实际 PDF、双语提示、批量转换以及源文件字节/修改时间不变。`npm test` 包含纯规则与转换管线的边界测试。
