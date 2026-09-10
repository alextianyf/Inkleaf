# 应用内更新与发布

从 0.4.7 开始，Windows 桌面版使用 `electron-updater` 下载和安装更新。旧的 0.4.6 及更早版本仍然只有网页下载提示，需要先手动安装一次支持应用内更新的版本。

## 用户流程

1. 启动时检查，之后每四小时检查；设置中也可以手动检查。
2. 发现新的稳定版本，显示“有新版本 · 下载”。检查本身不下载文件。
3. 点击后显示下载进度。安装包由 GitHub 提供，下载器依据发布元数据验证 SHA-512；失败时可以重试。
4. 下载完成后显示“重启并更新”。用户确认前不会启动安装器，普通退出也不自动安装。
5. 如果正在生成预览、批量转换、导出，或原生文件选择框尚未关闭，显示“完成当前任务后更新”。可以取消等待，保留已下载文件。
6. 空闲后先保存设置，再启动 Windows 安装器并退出应用，安装完成后重启。

批量任务会完成整个当前队列，更新不会为抢先安装而取消剩余文件。等待期间可继续使用应用，因此新任务也会延后安装。安装准备阶段拒绝新转换请求，避免与退出过程竞争。

关闭后下载缓存可继续使用；重新下载时更新器会验证缓存，损坏文件会重新获取。没有承诺断网后从精确字节位置续传。默认只接收稳定版本，不自动降级。开发模式和未经验证的 macOS/Linux 构建不启用安装更新。

## 发布给用户

当前已配置 GitHub 仓库 `alextianyf/Inkleaf` 为更新来源。没有配置 GitHub Actions 自动发布；以下是手动发布步骤：

1. 提交要发布的代码，更新 `package.json` 与锁文件版本，完成测试与打包程序检查。
2. 执行 `npm run dist:win`。该命令明确使用 `--publish never`，只构建本地文件，不会意外发布。
3. 为同一个已提交版本创建标签，例如 `v1.0.0`。在 GitHub 创建对应 Release 草稿。
4. 从**同一次构建**上传 `release/` 中的三个文件：安装包 `.exe`、对应 `.exe.blockmap` 和 `latest.yml`。不要手改校验值，也不要混用不同构建的文件。
5. 填写更新说明，确认附件齐全后发布为稳定 Release，并标为 Latest。草稿和预发行版本不属于当前稳定更新通道。
6. 使用已安装的旧版验证检测、下载和重启升级。发布错误版本时用更高补丁版本修复，不替换同一版本的安装包。

`app-update.yml` 在打包时生成并随程序携带，用于配置更新来源；`latest.yml` 是发布页上的新版信息。仅提交源代码或只上传 EXE 都不足以完成这条更新链路。

Windows 安装包统一使用 `Inkleaf-Setup-版本号.exe`，与更新清单中的文件名一致。上传时保留文件名，不要自行改名。

不需要自建下载服务器，也不向用户程序内嵌 GitHub token。当前 Windows 构建未签名：SHA-512 用于校验文件完整性，不等于代码签名。以后接入签名时，应同时验证发布者身份和跨版本升级。macOS 更新需另行完成签名与实机验证。

## 开发入口与验证

直接运行源码会进入独立的 Inkleaf Dev：不检查、下载或安装正式版更新，“关于与更新”显示本地源码说明。打包后的 Windows 程序继续使用原更新流程。两版数据隔离及旧 Aldus 设置迁移见[开发指南](development.md#独立开发模式)。

- `src/main/updates.cjs`：更新状态、单次下载、失败重试、等待/取消安装。
- `src/main/main.cjs`：连接更新器，判断转换/导出是否忙碌，保存设置与退出。
- `src/renderer/components/UpdateControls.jsx`：搜索栏与设置中共用的中英文更新交互。
- `tests/unit/updates.test.cjs`：用户确认、并发调用、错误恢复、取消等待、关闭不安装。
- `npm run test:updates`：真实 HTTP 下载、校验失败与重试、缓存损坏重取、中英文界面、导出期间等待和取消；拦截最后的安装器启动，不执行测试数据文件。
- `npm run test:installed-update`：可选的 Windows 安装升级回归。构建两个独立测试应用，使用隔离的应用 ID、临时安装路径、设置和本地更新服务器，实际执行 NSIS 覆盖升级并验证新版本重启。测试完成后卸载测试应用。

普通更新测试支持 `ALDUS_EXECUTABLE`，可直接验证打包后的 Inkleaf。测试报告与截图在忽略目录 `artifacts/`。公开 GitHub Release 的实际分发仍需在首次发布时再验证一次。

本机已实际验证隔离测试版 `9.0.0 → 9.0.1`：通过应用内下载真实 NSIS 安装包，旧进程退出，新版本安装到原目录并重启，作者、语言及搜索栏宽度保留。报告位于 `artifacts/installed-update/report.json`；这两个版本号仅用于本地测试，未发布到 GitHub。

## 0.4.9 品牌更新

应用和安装包显示为印页 · Inkleaf，安装包文件名从 Aldus-Setup 改为 Inkleaf-Setup。应用 ID 与原用户数据路径保留。旧版按新版 latest.yml 中的文件名下载，无需猜测或拼接新名称。

本机已用隔离安装测试验证 `Aldus Update Test 9.0.0 → Inkleaf Update Test 9.0.1`：新 EXE 名称生效，在原目录重启，作者、语言和搜索栏宽度保留。测试不会发布这些版本，也不会安装到正常应用目录。

## 0.4.10 仓库改名

GitHub 仓库已改为 `alextianyf/Inkleaf`，本地 origin、README、反馈链接和新安装包的更新配置均使用新地址。应用 ID 与用户数据目录继续兼容旧版。

旧仓库地址依赖 GitHub 的改名重定向；不要另建同名的 `alextianyf/Aldus` 仓库，以免旧链接失效。参见 [GitHub 仓库改名说明](https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository)。

## 首个正式 Release：0.4.10

2026-09-08，已发布 [Inkleaf 0.4.10](https://github.com/alextianyf/Inkleaf/releases/tag/v0.4.10)，不是预发行版本，并已设为 Latest。标签 `v0.4.10` 指向 `main` 的提交 `7dfe7274b317c9c6a1b4862bb91f3817561d7a1f`。发布包含当时的完整功能及已知问题，没有为此次发布修改应用功能。

Windows x64 安装包、对应 blockmap 与 `latest.yml` 来自同一次构建。为避开正在运行的应用目录，本次构建使用 `npm run dist:win -- --config.directories.output=artifacts/publish-0.4.10`。安装包大小为 113,996,764 字节，SHA-256 为 `524ef9d207fc766257fe134dc4e21ec4e046c078a87b2f01dd2959252aa674f3`。

发布验证：完整 `npm run test:all` 通过，打包后的 `test:desktop` 通过；程序内 23 个主进程、搜索、转换及共享源码文件与发布工作区一致。公开下载的更新清单和 blockmap 与本地文件一致。

使用隔离配置启动打包后的 0.4.10，真实连接 GitHub：同版本正确报告无更新；仅在测试进程内将更新器的当前版本模拟为 0.4.9 后，成功检测并下载公开的 0.4.10 安装包，SHA-512 与本地构建一致。此项验证没有执行安装器，不代表在另一台电脑上完成了旧版覆盖安装。此前的实际安装升级验证使用独立测试应用，见上文。

日志与报告保存在忽略目录：`artifacts/release-checks-0.4.10.log`、`artifacts/release-packaged-check-0.4.10.log`、`artifacts/public-update-check-0.4.10.json`。后续发布更高版本时，仍需验证已安装旧版的完整升级；不要替换本次 Release 的既有安装包。

## 正式 Release：0.5.0

2026-09-09，已发布 [Inkleaf 0.5.0](https://github.com/alextianyf/Inkleaf/releases/tag/v0.5.0)，为正式版并设为 Latest。[完整更新说明](releases/0.5.0.md)涵盖 Folio、外观模式、设置与高级排版、窗口交互、开发模式和许可。标签 `v0.5.0` 对应代码提交 `2eebf8396bec27b2ddaccd032926388be64aba81`。

从该提交执行 `npm.cmd run dist:win -- --config.directories.output=artifacts/publish-0.5.0`，安装包、blockmap 和 latest.yml 来自同一次构建。安装包大小 114856546 字节，SHA-256：`63d03605bd57a0e13a6a921710aab04054d0c26101d86218ed640eee91f87174`。

`test:all` 覆盖的各项检查及打包后的桌面回归均通过；打包中的源码、PDF 主题、样例、界面资源和 LICENSE 已与发布工作区核对。公开附件的大小与 SHA-256、更新清单的 SHA-512 均完成验证。

使用真实打包的 0.4.11 在隔离配置中连接 GitHub，成功检测并下载 0.5.0，下载文件 SHA-512 与本地安装包相同；0.5.0 自身正确报告没有更新。本次没有运行正式安装器，也没有覆盖用户正在使用的安装；实际旧版覆盖安装的既有隔离测试记录见上文。

验证报告保存在忽略目录 `artifacts/release-checks-0.5.0.log`、`artifacts/release-packaged-check-0.5.0.log`、`artifacts/package-manifest-0.5.0.json` 和 `artifacts/public-update-check-0.5.0.json`。

## 正式 Release：0.5.1

2026-09-09，已发布 [Inkleaf 0.5.1](https://github.com/alextianyf/Inkleaf/releases/tag/v0.5.1)，为正式版并设为 Latest。[完整更新说明](releases/0.5.1.md)涵盖恢复 Classic 默认、下架 Folio、保留原有标题编号、搜索结果单击预览和标题分页修复。标签 v0.5.1 对应提交 1d451d889753654b5e834472c7ec7c4bc691c553。

安装包、blockmap 和 latest.yml 来自同一次 Windows x64 构建，输出位于 artifacts/publish-0.5.1。安装包大小 114855363 字节，SHA-256：11844fd4d92dba6b163c005aa94e61178265a48480288cd6d1c27f69963dd14f。test:all 覆盖的各项检查及打包后的桌面检查均通过；修正两处测试预期／环境问题后，失败项与剩余项分别补跑通过，包内 70 个源码与资源文件核对一致，确认不再包含 Folio 与自动标题编号模块。

使用打包的 0.5.0 和隔离配置连接 GitHub，实际检测并下载 0.5.1，下载文件的 SHA-512 与本地构建一致；0.5.1 自身正确报告没有更新。本次未执行正式安装器、未覆盖用户安装。报告在忽略目录 artifacts/release-checks-0.5.1.log、artifacts/release-final-checks-0.5.1.log、artifacts/release-appearance-check-0.5.1.log、artifacts/release-packaged-check-0.5.1.log、artifacts/package-manifest-0.5.1.json 和 artifacts/public-update-check-0.5.1.json。
