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
