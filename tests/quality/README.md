# Markdown → PDF 质量检查

一份覆盖当前支持内容类别的模板，加上两个脚本：每次改动主题、排版或转换引擎后运行一次，可看到三种主题在中英文界面下的实际 PDF，并检查声明的内容标记是否丢失。它不是所有 Markdown 方言的完整合规测试，也不能替代人工看图。

首次使用前构建一次界面：

```powershell
npm run build:ui
```

## 全面检查

```powershell
npm run check:quality
```

默认用 `template/quality.md`，通过真实应用导出 Modern、Classic、Minimal × 中文、英文界面共 6 份 PDF，然后：

- 检查缺失图片、排版提示（如失效的文内链接、无法解析的公式）；
- 检查有没有文字被印到纸张外；
- 检查模板里声明的每个标记（`<!-- quality-markers: … -->`）是否都出现在 PDF 文字中，确认没有内容在转换中丢失；
- 检查声明的标题／正文颜色对白底的对比度基准（4.5:1）；
- 生成每一页的图片、彩色与灰度总览，以及各主题声明的标题颜色层级。

结果在 `output/quality/<文档名>/report.html`。上述自动检查失败时命令以失败退出，并列出原因。复用输出目录时覆盖同名报告，不递归删除传入的目录；报告之外可能保留以前的页面图片。

检查其他文档或只看部分组合：

```powershell
npm run check:quality -- tests/quality/samples/handout-zh.md
npm run check:quality -- notes.md --themes=modern --langs=zh
```

## 灰度检查

大部分学校只能黑白打印，层级必须在没有颜色时依然成立。

```powershell
npm run check:grayscale
npm run check:grayscale -- notes.md --theme=all --lang=zh
```

逐页导出灰度图片和总览，并打印主题声明的标题颜色亮度。灰度图是屏幕加权转换的近似，打印机结果可能不同；文字对比度按白底计算，不覆盖所有背景、图像或作者自定义样式。资源／排版提示或白底文字对比度低于 4.5:1 时以失败退出。报告会指出灰度下颜色接近的相邻标题级别；这时还应检查字号、字重、大小写或标记是否足以区分，不一定是缺陷。结果在 `output/grayscale/<文档名>/`。

## 目录

| 路径                  | 内容                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| `template/quality.md` | 全量模板：标题、行内样式、链接、列表、引用与标注、代码、公式、表格、图片、HTML、中文排版、脚注 |
| `template/assets/`    | 模板用到的 PNG、SVG 与徽章                                                                     |
| `samples/`            | 真实讲义样本（中英文），用来检查整体观感                                                       |
| `check.cjs`           | 全面检查                                                                                       |
| `grayscale.cjs`       | 灰度检查                                                                                       |
| `lib/`                | 通过应用导出 PDF、读取 PDF 文字、渲染页面图片                                                  |

给模板新增内容时，在文件开头的 `quality-markers` 里加上对应标记，检查就会确认它确实出现在 PDF 中。模板与样本不参与 `npm run format`，以免格式化改掉要测试的写法。
