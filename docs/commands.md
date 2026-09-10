# 开发与发版命令速查

以下在 **Windows PowerShell** 中执行，打包 Windows 版也用这个终端。

## 日常开发

```powershell
cd C:\Projects\Inkleaf
npm.cmd run dev
```

启动的是独立的 **Inkleaf Dev**，默认快捷键 `Ctrl + Alt + Shift + Space`，设置保存在 `%APPDATA%\Inkleaf-Dev`。

旧开发版默认快捷键会在重启后自动更新；其他自定义快捷键保留。正式版仍默认使用 `Ctrl + Shift + Space`。

**以前的 `npm.cmd start` 仍然能用，与 `npm.cmd run dev` 完全相同。** 推荐记住 `dev`，更容易区分开发和正式版。目前没有热更新：改完代码，从开发版托盘退出，再运行一次。

首次下载源码，或依赖文件更新后，先安装依赖（不用每次启动都执行）：

```powershell
npm.cmd ci
```

## 发布新版本

以下以 **0.5.1** 为例，实际发布时换成高于已发布版本的新版本号。

1. 在开发分支改好代码，更新版本号：

   ```powershell
   npm.cmd version 0.5.1 --no-git-tag-version
   ```

   这会同时修改 `package.json` 和 `package-lock.json`，不会自动提交或创建标签。

2. 运行检查，全部通过后继续：

   ```powershell
   npm.cmd run test:all
   ```

3. 在 GitHub Desktop 中检查修改，**Commit → Push**；把开发分支合并到 `main` 并推送。然后切到最新的 `main`，确认没有未提交修改。接下来从这份代码打包。

4. 生成 Windows 安装包，并运行检查实际效果：

   ```powershell
   npm.cmd run dist:win
   ```

   文件在 `release/`。这条命令**只打包，不会上传或发布**。

5. 打开 [GitHub Releases](https://github.com/alextianyf/Inkleaf/releases)，新建 Release：标签 `v0.5.1`，目标 `main`，标题 `Inkleaf 0.5.1`，填写更新说明。上传本次构建的三个文件：
   - `Inkleaf-Setup-0.5.1.exe`
   - `Inkleaf-Setup-0.5.1.exe.blockmap`
   - `latest.yml`

   三个文件必须来自同一次构建，保留原文件名；不上传 `win-unpacked`、调试文件或旧安装包。标签对应的代码必须与打包时一致。

6. 选 **Latest**，发布正式 Release。随后用已安装的旧正式版检查：发现更新 → 点击下载 → 重启并更新。**开发版不会检查更新；正式版也不会未经用户确认就安装。**

7. 确认公开下载可用后，更新中英文 README 的版本号、安装包链接和发布说明，更新 TODO 的发布状态与 `docs/updates.md` 的验证记录，再提交并推送文档。发布标签仍保留在打包所用的代码提交上。

## 其他常用命令

| 命令               | 用途                                   |
| ------------------ | -------------------------------------- |
| `npm.cmd run lint` | 检查代码                               |
| `npm.cmd test`     | 运行单元测试                           |
| `npm.cmd run pack` | 生成可直接运行的程序目录，不生成安装器 |

更多说明：[开发指南](development.md) · [更新与发布机制](updates.md)。
