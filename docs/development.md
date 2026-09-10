# 开发指南

印页 · Inkleaf 的开发、构建与项目目录说明。应用与安装包使用 Inkleaf 名称；GitHub 仓库地址为 `alextianyf/Inkleaf`。

只想查启动、打包和发版步骤？看[开发与发版命令速查](commands.md)。

安装器的应用 ID `com.alextian.aldus` 保持兼容，避免破坏已有安装的覆盖升级。内部 IPC / 协议名和 `ALDUS_*` 测试环境变量也保留；这些标识不作为产品名称显示。用户数据目录已改为 Inkleaf，并提供旧设置迁移。

## 开发与运行

安装 Node.js 22.12 或更新版本，在项目根目录执行：

```powershell
npm.cmd ci
npm.cmd run dev
```

`npm.cmd run dev` 会先构建界面，再启动 **Inkleaf Dev**。修改代码后，从开发版托盘选择退出，再重新运行；目前没有热更新。`npm start` 也是同一个开发入口。PowerShell 使用 `npm.cmd` 可以避免 `npm.ps1` 被执行策略拦截；下方其他命令同样可以换成 `npm.cmd`。

## 独立开发模式

模式由运行方式决定：直接运行源码是开发版，打包后的程序是正式版，无需在设置里切换。

| 项目             | 开发版                  | 正式版                 |
| ---------------- | ----------------------- | ---------------------- |
| 窗口、托盘名称   | Inkleaf Dev             | Inkleaf                |
| Windows 数据目录 | `%APPDATA%\Inkleaf-Dev` | `%APPDATA%\Inkleaf`    |
| 默认全局快捷键   | `Ctrl + Alt + Shift + Space`    | `Ctrl + Shift + Space` |
| 应用内更新       | 关闭                    | 检查、手动下载与安装   |
| 开机启动         | 禁用                    | 可在设置中开启         |

两版可同时运行，每版各自只允许一个实例。设置、搜索索引、Chromium 缓存和日志都位于各自的数据目录，开发版不会读取正式版偏好。第一次启动开发版会单独建立索引；两个版本的转换引擎和界面效果相同。快捷键可以各自修改，如果手动选成同一个组合，后启动的一版会提示快捷键被占用。

开发版原默认值 `Ctrl + Alt + Space` 会在下次启动时自动改用 `Ctrl + Alt + Shift + Space`；其他自定义组合保留。通用设置中的“重置此分类”也会恢复为新默认值。修改源码后，需要退出开发版并重新运行 `npm.cmd run dev` 才生效。

导出目标属于用户设置，不是隔离目录：两版仍可选择同一个 Downloads 或 Markdown 文件夹。自动导出沿用已有的同名编号规则。

### 从 Aldus 数据目录迁移

包含此改动的正式安装包首次启动时，如果 Inkleaf 中尚无 `settings.json`，会从 `%APPDATA%\Aldus` 复制旧设置，包括搜索范围、语言、排版和快捷键。索引与缓存重新生成。已有 Inkleaf 设置优先，旧 Aldus 目录保留原样，不删除、不覆盖。

迁移先验证 JSON，再完整写入并以不覆盖目标的方式提交；失败会报告错误，避免悄悄重置偏好。开发版不会执行这项迁移。**已安装的 0.4.11 不会仅因源码改动而改变目录，要安装包含此改动的后续版本才生效。**

自动测试仍用 `ALDUS_TEST_DIR` 指定临时目录；只有指定此目录时，测试才能通过 `INKLEAF_TEST_MODE` 模拟 development / production。它不会触碰真实旧版数据。`npm run test:runtime` 验证两版并行、重复启动、独立设置/缓存、开发版限制及重启恢复；单元测试覆盖迁移与不覆盖已有设置。

## 目录

```text
src/
  main/           窗口、托盘、快捷键、设置、PDF 打印和更新检查
  renderer/       React 界面、组件和界面样式
  search/         搜索索引、磁盘扫描、后台线程
  conversion/     Markdown、HTML、图片和转换前检测
  shared/         中英文文案
resources/
  themes/         PDF 的 Folio（默认）/ Classic / Minimal 主题
  styles/         PDF 通用排版规则
tests/
  unit/           规则和业务逻辑测试
  integration/    真实 Electron 窗口及 PDF 回归测试
  performance/    搜索速度基准
  fixtures/       测试用 Markdown 与图片
docs/             使用、架构与引擎说明
```

`node_modules/` 是安装的依赖，`dist/` 是编译后的界面，`release/` 是安装包，`artifacts/` 是测试报告。这四个目录都是本地产物，不提交到 Git；源码和测试样本在上面的目录中。

## 常用命令

| 命令                | 用途                                 |
| ------------------- | ------------------------------------ |
| `npm run lint`      | 检查代码                             |
| `npm run format`    | 统一排版；不会改写 Markdown 测试样本 |
| `npm test`          | 单元测试                             |
| `npm run test:all`  | 界面构建和全部自动回归               |
| `npm run benchmark` | 搜索速度测试                         |
| `npm run pack`      | 生成可运行的完整程序目录             |
| `npm run dist:win`  | 生成 Windows 安装包                  |

安装包位于 `release/`。使用安装包的人无需安装 Node.js 或 Python。Windows 构建和回归已验证；macOS、Linux 目标尚未验证。

## 使用许可与分发

项目采用 [Inkleaf Personal Noncommercial License](../LICENSE)：个人非商业使用免费，商业使用需事先取得 Alex Tian 的书面授权，费用另议；作者本人及其控制的公司适用条款中的免费商业使用例外。中文说明见[使用许可](license.zh-CN.md)。第三方材料保留各自的许可。

打包配置会将根目录 `LICENSE` 放入应用，并在 Windows 安装向导中显示许可。发布时保留该文件，发布说明应明确许可范围；不要用 MIT 或“无限制免费商用”描述本项目，也不要为添加许可而替换已发布版本的安装包。

## 进一步阅读

- [维护指南：要改一个功能，去哪个文件？](architecture.md)
- [桌面版使用、打包与更新说明](desktop.md)
- [Markdown/PDF 兼容范围](engine.md)
- [搜索机制与性能记录](search.md)
- [源文档检测规则](source-checks.md)
- [重新录制 README 中英文演示](demo/README.md)

Windows 版会提示新版本；点击后在应用内下载并校验，下载完成后可选择“重启并更新”。正在转换或导出时会等待任务完成，等待期间可以取消。普通退出不会自动安装。用户设置与搜索索引保存在系统的应用数据目录。发布时需要同时上传安装包和更新元数据，详见[更新与发布指南](updates.md)。
