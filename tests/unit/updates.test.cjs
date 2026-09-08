const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { setTimeout: delay } = require("node:timers/promises");
const { createUpdateService } = require("../../src/main/updates.cjs");

function setup(t, options = {}) {
  const updater = new EventEmitter();
  const calls = { check: 0, download: 0, install: 0, prepare: 0 };
  updater.checkForUpdates = async () => {
    calls.check++;
    updater.emit("update-available", { version: "1.1.0" });
  };
  updater.downloadUpdate = async () => {
    calls.download++;
    await delay(10);
    updater.emit("download-progress", { percent: 55.8 });
    updater.emit("update-downloaded", { version: "1.1.0" });
  };
  updater.quitAndInstall = (silent, restart) => {
    calls.install++;
    assert.equal(silent, true);
    assert.equal(restart, true);
  };
  const states = [];
  const service = createUpdateService({
    updater,
    enabled: true,
    isBusy: () => false,
    beforeInstall: async () => {
      calls.prepare++;
    },
    onChange: (state) => states.push(state),
    ...options,
  });
  t.after(() => service.close());
  return { updater, service, calls, states };
}

test("updates require explicit download and install; concurrent requests are coalesced", async (t) => {
  const { updater, service, calls, states } = setup(t);
  assert.equal(updater.autoDownload, false);
  assert.equal(updater.autoInstallOnAppQuit, false);
  assert.equal(updater.allowDowngrade, false);
  await Promise.all([service.check(), service.check()]);
  assert.equal(calls.check, 1);
  assert.equal(calls.download, 0);
  await service.install();
  assert.equal(calls.install, 0);
  await Promise.all([service.download(), service.download()]);
  assert.equal(calls.download, 1);
  assert.ok(states.some((state) => state.percent === 55));
  assert.equal(service.getState().status, "downloaded");
  await service.check();
  assert.equal(
    calls.check,
    1,
    "scheduled checks cannot discard a ready update",
  );
  assert.equal(calls.install, 0);
  await Promise.all([service.install(), service.install()]);
  assert.equal(calls.prepare, 1);
  assert.equal(calls.install, 1);
});

test("download or checksum failure cannot install and can retry", async (t) => {
  const { updater, service, calls } = setup(t);
  const download = updater.downloadUpdate;
  await service.check();
  updater.downloadUpdate = async () => {
    throw new Error("checksum mismatch");
  };
  await service.download();
  assert.equal(service.getState().phase, "download");
  assert.equal(service.getState().downloaded, false);
  await service.install();
  assert.equal(calls.install, 0);
  updater.downloadUpdate = download;
  await service.download();
  assert.equal(service.getState().status, "downloaded");
});

test("busy work defers installation; cancellation preserves the download", async (t) => {
  let busy = true;
  const { service, calls } = setup(t, { isBusy: () => busy });
  await service.check();
  await service.download();
  await service.install();
  assert.equal(service.getState().status, "waiting");
  service.cancelInstall();
  busy = false;
  await delay(300);
  assert.equal(calls.install, 0);
  busy = true;
  await service.install();
  busy = false;
  await delay(350);
  assert.equal(calls.install, 1);
});

test("settings must be saved before installation; errors allow retry", async (t) => {
  let failSave = true;
  const { updater, service, calls } = setup(t, {
    beforeInstall: async () => {
      if (failSave) throw new Error("disk full");
    },
  });
  await service.check();
  await service.download();
  await service.install();
  assert.equal(service.getState().phase, "install");
  assert.equal(calls.install, 0);
  failSave = false;
  updater.quitAndInstall = () =>
    updater.emit("error", new Error("installer failed"));
  await service.install();
  assert.equal(service.getState().status, "error");
  updater.quitAndInstall = () => calls.install++;
  await service.install();
  assert.equal(calls.install, 1);
});

test("closing during a queued update never installs on quit", async (t) => {
  let busy = true;
  const { service, calls } = setup(t, { isBusy: () => busy });
  await service.check();
  await service.download();
  await service.install();
  service.close();
  busy = false;
  await delay(300);
  assert.equal(calls.install, 0);
});

test("network errors can be retried immediately, and unsupported builds do nothing", async (t) => {
  const { updater, service } = setup(t);
  const check = updater.checkForUpdates;
  updater.checkForUpdates = async () => {
    throw new Error("offline");
  };
  await service.check();
  assert.equal(service.getState().status, "offline");
  updater.checkForUpdates = check;
  await service.check();
  assert.equal(service.getState().status, "available");
  const disabled = setup(t, { enabled: false });
  await disabled.service.check();
  await disabled.service.download();
  await disabled.service.install();
  assert.equal(disabled.service.getState().status, "unsupported");
  assert.equal(disabled.calls.check, 0);
});
