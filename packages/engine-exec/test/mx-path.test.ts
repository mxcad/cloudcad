import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveMxExecutablePath } from '../mx-path';

/**
 * MX 可执行文件路径解析的单测。
 *
 * 这份规则此前在 backend（configuration.ts）与 runtime 部署侧（mxcad-path.js）
 * 各有一份，conversion-service 则完全没有——它直接读 MXCAD_ASSEMBLY_PATH，
 * 于是跨平台复制 .env 后 spawn 一个不存在的路径，ENOENT 被归类为可重试的
 * not-started，每次转换都重试到超时。现在只有一份实现，测试钉住判定顺序。
 */

const WINDOWS = 'runtime/windows/mxcad/mxcadassembly.exe';
const LINUX = 'runtime/linux/mxcad/mxcadassembly';

describe('resolveMxExecutablePath', () => {
  it('Linux：环境变量指向 .exe → 判定跨平台误配置，回退 Linux 默认路径', () => {
    assert.equal(
      resolveMxExecutablePath('C:/runtime/mxcad/mxcadassembly.exe', {
        windowsDefault: WINDOWS,
        linuxDefault: LINUX,
        platform: 'linux',
      }),
      LINUX
    );
  });

  it('Linux：.EXE 大小写不敏感，同样回退', () => {
    assert.equal(
      resolveMxExecutablePath('C:/x/MXCADASSEMBLY.EXE', {
        windowsDefault: WINDOWS,
        linuxDefault: LINUX,
        platform: 'linux',
      }),
      LINUX
    );
  });

  it('Linux：非 .exe 路径原样采用（用户自定义的 Linux 安装位置）', () => {
    assert.equal(
      resolveMxExecutablePath('/opt/mxcad/mxcadassembly', {
        windowsDefault: WINDOWS,
        linuxDefault: LINUX,
        platform: 'linux',
      }),
      '/opt/mxcad/mxcadassembly'
    );
  });

  it('未配置 → 按平台取默认路径', () => {
    assert.equal(
      resolveMxExecutablePath(undefined, {
        windowsDefault: WINDOWS,
        linuxDefault: LINUX,
        platform: 'linux',
      }),
      LINUX
    );
    assert.equal(
      resolveMxExecutablePath(undefined, {
        windowsDefault: WINDOWS,
        linuxDefault: LINUX,
        platform: 'win32',
      }),
      WINDOWS
    );
  });

  it('空字符串视为未配置（不落进「原样采用空路径」的分支）', () => {
    assert.equal(
      resolveMxExecutablePath('', {
        windowsDefault: WINDOWS,
        linuxDefault: LINUX,
        platform: 'linux',
      }),
      LINUX
    );
  });

  it('Windows：环境变量优先，不做 .exe 判定（两侧都是 .exe）', () => {
    assert.equal(
      resolveMxExecutablePath('D:/custom/mxcadassembly.exe', {
        windowsDefault: WINDOWS,
        linuxDefault: LINUX,
        platform: 'win32',
      }),
      'D:/custom/mxcadassembly.exe'
    );
  });
});
