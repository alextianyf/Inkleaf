// 下载、校验与安装交给 electron-updater；这里管理用户看到的状态。
// 接收 updater 参数，让测试能核对失败/重试等情况而不真的退出程序。
function createUpdateService({
  updater,
  enabled,
  isBusy,
  beforeInstall,
  onChange,
}) {
  let state = { status: enabled ? "idle" : "unsupported" };
  let checking;
  let downloading;
  let lastCheck = 0;
  let waitTimer;
  let closed = false;

  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.autoRunAppAfterInstall = true;
  updater.allowPrerelease = false;
  updater.allowDowngrade = false;
  updater.disableWebInstaller = true;

  function update(fields) {
    state = { ...state, ...fields };
    if (!closed) onChange(state);
  }

  function fail(error, phase) {
    if (closed) return;
    clearInterval(waitTimer);
    console.error(`Update ${phase} failed:`, error.message);
    if (phase === "check") {
      const unpublished =
        error.code === "ERR_UPDATER_NO_PUBLISHED_VERSIONS" ||
        /No published versions on GitHub/.test(error.message);
      update({ status: unpublished ? "unpublished" : "offline", phase });
      lastCheck = 0;
    } else {
      update({ status: "error", phase });
    }
  }

  updater.on("update-available", (info) => {
    update({
      status: "available",
      version: info.version,
      downloaded: false,
      percent: 0,
      phase: null,
    });
  });
  updater.on("update-not-available", () => {
    update({
      status: "current",
      version: null,
      downloaded: false,
      phase: null,
    });
  });
  updater.on("download-progress", (progress) => {
    update({
      status: "downloading",
      percent: Math.max(0, Math.min(100, Math.floor(progress.percent || 0))),
    });
  });
  updater.on("update-downloaded", (info) => {
    update({
      status: "downloaded",
      version: info.version,
      downloaded: true,
      percent: 100,
      phase: null,
    });
  });
  // 检查和下载的 Promise 也会报告错误；安装阶段的异步错误只能从事件接收。
  updater.on("error", (error) => {
    if (state.status === "installing") fail(error, "install");
  });

  async function check() {
    if (!enabled || closed || downloading || state.downloaded) return state;
    if (checking) return checking;
    if (lastCheck && Date.now() - lastCheck < 60000) return state;
    lastCheck = Date.now();
    update({ status: "checking", phase: null });
    checking = (async () => {
      try {
        await updater.checkForUpdates();
      } catch (error) {
        fail(error, "check");
      }
      return state;
    })();
    try {
      return await checking;
    } finally {
      checking = null;
    }
  }

  async function download() {
    if (!enabled || closed || state.downloaded || checking) return state;
    if (downloading) return downloading;
    if (
      state.status !== "available" &&
      !(state.status === "error" && state.phase === "download")
    )
      return state;
    update({ status: "downloading", percent: 0, phase: null });
    downloading = (async () => {
      try {
        await updater.downloadUpdate();
      } catch (error) {
        fail(error, "download");
      }
      return state;
    })();
    try {
      return await downloading;
    } finally {
      downloading = null;
    }
  }

  async function resumeInstall() {
    if (closed || state.status !== "waiting" || isBusy()) return;
    clearInterval(waitTimer);
    // 主进程会拒绝新的转换/设置请求，避免保存设置期间又开始一项任务。
    update({ status: "installing", phase: null });
    try {
      await beforeInstall();
      if (closed) return;
      updater.quitAndInstall(true, true);
    } catch (error) {
      fail(error, "install");
    }
  }

  async function install() {
    if (
      !enabled ||
      closed ||
      !state.downloaded ||
      state.status === "installing" ||
      state.status === "waiting"
    )
      return state;
    update({ status: "waiting", phase: null });
    waitTimer = setInterval(() => void resumeInstall(), 250);
    waitTimer.unref();
    await resumeInstall();
    return state;
  }

  function cancelInstall() {
    if (state.status === "waiting") {
      clearInterval(waitTimer);
      update({ status: "downloaded" });
    }
    return state;
  }

  function close() {
    closed = true;
    clearInterval(waitTimer);
  }

  return {
    check,
    download,
    install,
    cancelInstall,
    close,
    getState: () => state,
  };
}

module.exports = { createUpdateService };
