# 维护指南

这个项目只有一份 `package.json` 和锁文件。日常操作都在项目根目录执行，不需要进入不同目录分别安装依赖。

## 从一个功能找到代码

| 想修改的内容                           | 从这里开始                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 搜索栏、界面状态与键盘操作             | `src/renderer/App.jsx`                                                                                  |
| 名称、品牌图标与托盘图标               | `src/renderer/components/Brand.jsx`、`src/main/tray-icon.cjs`、[品牌资产](../resources/icons/README.md) |
| 透明感、颜色、间距                     | `src/renderer/styles.css`                                                                               |
| 结果列表和文件/文件夹图标              | `src/renderer/components/SearchResults.jsx`、`Icon.jsx`                                                 |
| 设置面板                               | `src/renderer/SettingsApp.jsx、src/renderer/components/SettingsPanel.jsx`                               |
| PDF 预览、点击目录跳转                 | `src/renderer/components/PdfPreview.jsx`、`src/renderer/lib/pdf-links.js`                               |
| 批量选择和转换进度界面                 | `src/renderer/components/BatchPreview.jsx`                                                              |
| 窗口位置、宽度规则                     | `src/main/window-layout.cjs`                                                                            |
| 托盘、快捷键、文件选择、界面与系统通信 | `src/main/main.cjs`、`preload.cjs`                                                                      |
| 保存/读取用户偏好                      | `src/main/settings.cjs`                                                                                 |
| 检查、下载和安装 GitHub 新版本         | `src/main/updates.cjs`、`src/renderer/components/UpdateControls.jsx`                                    |
| 搜索排序与结果缓存                     | `src/search/index.cjs`                                                                                  |
| 扫描磁盘、排除目录、监听变化、保存索引 | `src/search/worker.cjs`                                                                                 |
| 后台线程通信                           | `src/search/client.cjs`                                                                                 |
| 目录扫描共用规则                       | `src/search/library.cjs`                                                                                |
| Markdown 渲染与 HTML 安全处理          | `src/conversion/document.cjs`                                                                           |
| HTML 居中、宽高、表格等布局属性        | `src/conversion/html-layout.cjs`                                                                        |
| 图片和 badge 加载、缓存                | `src/conversion/images.cjs`                                                                             |
| Markdown 格式检测与内存修复            | `src/conversion/diagnostics/`                                                                           |
| 打印 PDF、等待字体图片、预览缓存       | `src/main/pdf-service.cjs`                                                                              |
| 批量队列、失败继续、文件重名处理       | `src/conversion/batch.cjs`                                                                              |
| PDF 默认排版和主题                     | `resources/styles/document.css`、`resources/themes/`                                                    |
| 中文/英文界面文案                      | `src/shared/strings.json`                                                                               |

`.cjs` 是运行在 Node.js/Electron 中的 JavaScript，使用 `require`。`.jsx` 是 React 界面文件，使用 `import`。这是两种运行环境的区别，不需要引入额外的框架来统一它们。

## 一次搜索经过哪里

`App.jsx` 接收输入 → `preload.cjs` 暴露的方法 → `main.cjs` 接收请求 → `client.cjs` 发给后台线程 → `worker.cjs` 调用 `index.cjs` → `SearchResults.jsx` 显示结果。

磁盘扫描在后台线程进行，输入时查询已建立的内存索引。排序只维护最好的 80 项，并保留重复查询缓存。这里保留了堆和后台线程，因为它们直接关系到大量文件下的速度；不要为了减少代码行数而改成每次扫描磁盘或收集所有匹配项后排序。

## 一次 PDF 转换经过哪里

`main.cjs` 校验所选文件 → `pdf-service.cjs` 请求生成文档 → `document.cjs` 读取 Markdown → `diagnostics/` 检查内存副本 → Markdown-it 渲染 → `html-layout.cjs` 保留布局、`images.cjs` 嵌入图片 → 隐藏的 Chromium 窗口打印 PDF → `PdfPreview.jsx` 显示 PDF。

导出保存的是预览对应的 PDF 字节。批量模式通过 `batch.cjs` 依次复用同一个打印服务。检测修复不写回源 Markdown。源文档格式、HTML 布局保留、PDF 输出回归是三个不同职责，不用一个大规则文件混在一起处理。

## 写法约定

- 优先使用普通函数、清楚的变量名和 `if / else`。避免多层三元表达式、表达式内赋值、为了压缩代码而复杂解构。
- 组件按界面职责拆分，服务按业务职责拆分。不要每十行再抽一层，也不用新增通用框架。
- 简单回调、展开对象、可选链可以保留；它们能直接表达“更新这些字段”或“存在时调用”。
- 注释解释原因和约束，例如为什么保留索引缓存，为什么窗口计算不能反复使用原生反馈的宽度。
- 先修改最接近功能的模块；必要时增加能复现问题的测试。修改后运行相应测试，大范围修改运行 `npm run test:all`。改搜索算法还应运行 `npm run benchmark`。
- `npm run format` 统一缩进；`.prettierignore` 排除了样本文档，避免格式化改变被测试的 Markdown 写法。

## 这次目录迁移

旧 `desktop/` 的逻辑分别进入 `src/main/`、`src/search/`、`src/conversion/`；旧 `frontend/src/desktop*` 及桌面组件进入 `src/renderer/`；测试从 `desktop/test/` 进入 `tests/`；PDF 主题从 `backend/themes/` 进入 `resources/themes/`。

旧网页界面、Python 后端、Puppeteer 打印器、重复依赖和旧启动脚本已移出工作目录，历史保留在 `aldusV1` 分支。生成文件全部放在忽略目录。Git 提交前可能先显示旧路径删除、新路径未跟踪；暂存后 Git 会依据内容识别其中的重命名。

## 设置与示例预览

src/shared/preferences.json 集中定义五类设置的默认值。main/settings.cjs 验证输入、迁移旧偏好和串行写入。main/settings-window.cjs 管理独立设置窗口，不改变搜索栏宽度或位置。

renderer/SettingsApp.jsx 负责分类、自动保存和错误反馈；SettingsPanel.jsx 负责选项；LayoutSample.jsx 在输入停止 300 毫秒后渲染 resources/samples/ 的固定示例。示例有单独的打印服务和缓存，避免争用批量转换服务；文档构建和 PDF 打印代码仍共用。

conversion/layout.cjs 定义排版快照、缓存键和纸张/字体规则。修改新增的排版字段时，同时更新默认值、验证和控件。main/export-location.cjs 决定默认目录；conversion/batch.cjs 负责排他写入与同名编号。具体行为和回归测试见 [settings.md](settings.md)。
