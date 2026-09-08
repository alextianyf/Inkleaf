# 开发指南

印页 · Inkleaf 的开发、构建与项目目录说明。应用与安装包使用 Inkleaf 名称；GitHub 仓库地址为 `alextianyf/Inkleaf`。

为保留已有安装和用户设置，应用 ID `com.alextian.aldus`、用户数据目录 `Aldus`、内部 IPC / 协议名和 `ALDUS_*` 测试环境变量保持兼容。重命名这些内部标识前需要设计迁移，不能直接全文替换。

## 开发与运行

安装 Node.js 22.12 或更新版本，在项目根目录执行：

```powershell
npm ci
npm start
```

`npm start` 会先构建界面，再启动 Electron。修改代码后重新运行即可。

## 目录

```text
src/
  main/           窗口、托盘、快捷键、设置、PDF 打印和更新检查
  renderer/       React 界面、组件和界面样式
  search/         搜索索引、磁盘扫描、后台线程
  conversion/     Markdown、HTML、图片和转换前检测
  shared/         中英文文案
resources/
  themes/         PDF 的三套主题
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

## 进一步阅读

- [维护指南：要改一个功能，去哪个文件？](architecture.md)
- [桌面版使用、打包与更新说明](desktop.md)
- [Markdown/PDF 兼容范围](engine.md)
- [搜索机制与性能记录](search.md)
- [源文档检测规则](source-checks.md)
- [重新录制 README 中英文演示](demo/README.md)

Windows 版会提示新版本；点击后在应用内下载并校验，下载完成后可选择“重启并更新”。正在转换或导出时会等待任务完成，等待期间可以取消。普通退出不会自动安装。用户设置与搜索索引保存在系统的应用数据目录。发布时需要同时上传安装包和更新元数据，详见[更新与发布指南](updates.md)。
