'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { resolvePm2Invocation } = require('../lib/pm2');
const { PROJECT_ROOT } = require('../lib/constants');

// 假 pm2 脚本：只回一个空的 jlist 结果，用来验证解析出的调用方式真的可执行
const FAKE_PM2_SCRIPT = '#!/usr/bin/env node\nprocess.stdout.write("[]");\n';

// 按部署包布局伪造一个内嵌 runtime：
//   runtime/<platform>/node{ /bin/node | node.exe }
//   runtime/<platform>/node/node_modules/pm2/bin/pm2
// copyRealNode=false 时 node 可执行文件写成空文件（只做路径断言，不真正执行）
function buildFakeRuntime(runtimeDir, platform, copyRealNode) {
  const isWindows = platform === 'win32';
  const nodeDir = path.join(
    runtimeDir,
    isWindows ? 'windows' : 'linux',
    'node'
  );
  const nodeBinDir = isWindows ? nodeDir : path.join(nodeDir, 'bin');
  const pm2BinDir = path.join(nodeDir, 'node_modules', 'pm2', 'bin');
  const nodeExePath = path.join(nodeBinDir, isWindows ? 'node.exe' : 'node');

  fs.mkdirSync(nodeBinDir, { recursive: true });
  fs.mkdirSync(pm2BinDir, { recursive: true });
  if (copyRealNode) {
    fs.copyFileSync(process.execPath, nodeExePath);
  } else {
    fs.writeFileSync(nodeExePath, '');
  }
  fs.writeFileSync(path.join(pm2BinDir, 'pm2'), FAKE_PM2_SCRIPT);
  return nodeDir;
}

describe('pm2 调用解析（部署包根目录 pm2 包装脚本已移除后的回归）', () => {
  let tmpDir;
  let runtimeDir;
  const hostPlatform = process.platform === 'win32' ? 'win32' : 'linux';
  const otherPlatform = hostPlatform === 'win32' ? 'linux' : 'win32';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-svc-pm2-'));
    runtimeDir = path.join(tmpDir, 'runtime');
    buildFakeRuntime(runtimeDir, hostPlatform, true);
    buildFakeRuntime(runtimeDir, otherPlatform, false);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('内嵌 runtime 存在时用绝对 node + pm2 脚本调用（Linux 布局）', () => {
    const nodeDir = path.join(runtimeDir, 'linux', 'node');

    const invocation = resolvePm2Invocation(runtimeDir, 'linux');

    assert.equal(invocation.command, path.join(nodeDir, 'bin', 'node'));
    assert.deepEqual(
      invocation.argsPrefix,
      [path.join(nodeDir, 'node_modules', 'pm2', 'bin', 'pm2')]
    );
    assert.equal(invocation.shell, false);
    assert.equal(invocation.extraPath, path.join(nodeDir, 'bin'));
  });

  it('内嵌 runtime 存在时用绝对 node.exe + pm2 脚本调用（Windows 布局）', () => {
    const nodeDir = path.join(runtimeDir, 'windows', 'node');

    const invocation = resolvePm2Invocation(runtimeDir, 'win32');

    assert.equal(invocation.command, path.join(nodeDir, 'node.exe'));
    assert.deepEqual(
      invocation.argsPrefix,
      [path.join(nodeDir, 'node_modules', 'pm2', 'bin', 'pm2')]
    );
    assert.equal(invocation.shell, false);
    assert.equal(invocation.extraPath, nodeDir);
  });

  it('绝不解析到项目根目录的 pm2 包装脚本（回归：部署包里不存在该文件）', () => {
    const invocation = resolvePm2Invocation(runtimeDir, hostPlatform);
    const nodeDir = path.join(runtimeDir, hostPlatform === 'win32' ? 'windows' : 'linux', 'node');

    assert.notEqual(invocation.command, path.join(PROJECT_ROOT, 'pm2'));
    assert.notEqual(invocation.command, path.join(PROJECT_ROOT, 'pm2.cmd'));
    assert.ok(
      invocation.command.startsWith(nodeDir),
      'command 必须落在内嵌 runtime 的 node 目录下'
    );
  });

  it('无内嵌 runtime 时回退到系统 PATH 中的 pm2', () => {
    const emptyRuntime = path.join(tmpDir, 'runtime-empty');
    fs.mkdirSync(emptyRuntime, { recursive: true });

    for (const [platform, expectedShell] of [
      ['linux', false],
      ['win32', true], // pm2 是 .cmd 脚本，需 shell 按 PATHEXT 解析
    ]) {
      const invocation = resolvePm2Invocation(emptyRuntime, platform);

      assert.equal(invocation.command, 'pm2');
      assert.deepEqual(invocation.argsPrefix, []);
      assert.equal(invocation.extraPath, null);
      assert.equal(invocation.shell, expectedShell);
    }
  });

  it('解析出的调用方式可以真实执行（不是拼出来的死路径）', () => {
    const invocation = resolvePm2Invocation(runtimeDir, hostPlatform);

    const result = spawnSync(invocation.command, [...invocation.argsPrefix, 'jlist'], {
      encoding: 'utf8',
      shell: invocation.shell,
    });

    assert.equal(result.error, undefined);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, '[]');
  });
});

// 服务名白名单回归：serviceName 来自 URL 路径段，系统 PM2 回退路径走 shell:true
// （Windows），未校验的 & / ; 元字符会致命令注入。白名单外一律前置拒绝、不触达 pm2。
describe('pm2 服务名白名单（命令注入回归）', () => {
  const { restartService, stopService, startService } = require('../lib/pm2');

  it('restartService 拒绝含 shell 元字符的服务名', () => {
    assert.deepEqual(restartService('x & whoami'), {
      success: false,
      error: '非法的服务名',
    });
  });

  it('stopService 拒绝白名单外的服务名', () => {
    assert.deepEqual(stopService('nonexistent'), {
      success: false,
      error: '非法的服务名',
    });
  });

  it('startService 拒绝含路径遍历元字符的服务名', () => {
    assert.deepEqual(startService('../etc/passwd'), {
      success: false,
      error: '非法的服务名',
    });
  });

  it('白名单内的服务名不被白名单拦截（config-service 走专属分支）', () => {
    const result = restartService('config-service');
    assert.equal(result.success, false);
    assert.notEqual(result.error, '非法的服务名');
  });
});

// 冷启动回归：pm2 首次调用拉起守护进程时，jlist 的 stdout 是「ASCII 横幅 + JSON」
// （退出码 0、stderr 为空）——整段 JSON.parse 必然失败，部署包首次访问「服务管理」
// 恒报「解析 PM2 状态失败」。parsePm2JlistOutput 截取数组段必须兼容两种输出。
describe('pm2 jlist 输出解析（冷启动 ASCII 横幅污染回归）', () => {
  const { parsePm2JlistOutput } = require('../lib/pm2');

  // 真实冷启动 stdout 样本（2026-10-06 实测：横幅 1252 字符 + JSON）
  const COLD_START_STDOUT =
    '\n                        -------------\n' +
    '__/\\\\\\\\\\\\\____/\\\\____________/\\\\____/\\\\\\\\\_____\n' +
    '  _\/\\\_____________\/\\\____\///___/\\/\\/\\/_____/\\\\\\\\\\__\n' +
    '[{"name":"backend","pm2_env":{"status":"online","pm_uptime":1,"restart_time":0},"monit":{"memory":2,"cpu":3}}]';

  it('横幅污染的 stdout 能解析出进程列表', () => {
    const processes = parsePm2JlistOutput(COLD_START_STDOUT);
    assert.equal(processes.length, 1);
    assert.equal(processes[0].name, 'backend');
    assert.equal(processes[0].pm2_env.status, 'online');
  });

  it('纯净 JSON 数组照常解析', () => {
    const processes = parsePm2JlistOutput('[{"name":"frontend"}]');
    assert.equal(processes.length, 1);
    assert.equal(processes[0].name, 'frontend');
  });

  // 实测形态 2（2026-10-06 抓包）：守护进程被杀后重拉，"[PM2]" 前缀行以 '[' 开头，
  // 「首个 '[' 起截取」的朴素修复会被它打炸——必须从后往前取可解析数组段
  const DAEMON_RESPAWN_STDOUT =
    '[PM2] Spawning PM2 daemon with pm2_home=D:\\web\\MxCADOnline\\cloudcad\\data\\pm2\n' +
    '[PM2] PM2 Successfully daemonized\n' +
    '[{"name":"backend","pm2_env":{"status":"online"},"monit":{"memory":1,"cpu":2}}]';

  it('[PM2] 前缀横幅（以 [ 开头）污染的 stdout 能解析出进程列表', () => {
    const processes = parsePm2JlistOutput(DAEMON_RESPAWN_STDOUT);
    assert.equal(processes.length, 1);
    assert.equal(processes[0].name, 'backend');
  });

  it('空输出回落为空数组', () => {
    assert.deepEqual(parsePm2JlistOutput(''), []);
    assert.deepEqual(parsePm2JlistOutput(undefined), []);
  });

  it('无数组段的输出抛错（与旧行为一致，由调用方 catch）', () => {
    assert.throws(() => parsePm2JlistOutput('not json'));
  });
});
