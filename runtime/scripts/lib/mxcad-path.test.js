/**
 * mxcad-path.js 回归测试（node:test，0 外部依赖）
 *
 * 锁定跨平台误配置回退：后端 configuration.ts 的 resolveMxExecutablePath 在 Linux 上会把
 * Windows .exe 配置静默回退到平台默认（.env.example 明写"跨平台复制 .env 无需删除此配置"），
 * 但独立 conversion-service 直接读 MXCAD_ASSEMBLY_PATH 无守卫。部署侧（start.js 拉起转换服务
 * / verify-deploy.js 验收）原样注入会让转换服务去 spawn 部署包里不存在的
 * runtime/windows/mxcad/mxcadassembly.exe（ubuntu22 包内无 runtime/windows/）→ 每次转换 ENOENT。
 *
 * 运行：node --test runtime/scripts/lib/mxcad-path.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  resolveMxcadAssemblyPath,
  LINUX_DEFAULT,
  WINDOWS_DEFAULT,
} = require('./mxcad-path');

const WINDOWS_BIN = 'runtime/windows/mxcad/mxcadassembly.exe';
const LINUX_BIN = 'runtime/linux/mxcad/mxcadassembly';

test('未配置 MXCAD_ASSEMBLY_PATH → 目标平台默认路径', () => {
  assert.equal(resolveMxcadAssemblyPath({}, true), LINUX_DEFAULT);
  assert.equal(resolveMxcadAssemblyPath(undefined, false), WINDOWS_DEFAULT);
});

test('配置值为空字符串 → 视为未配置，回退平台默认', () => {
  assert.equal(
    resolveMxcadAssemblyPath({ MXCAD_ASSEMBLY_PATH: '' }, true),
    LINUX_DEFAULT
  );
});

test('Linux 上配成 Windows .exe 路径 → 回退 Linux 默认（跨平台复制 .env 的误配置）', () => {
  assert.equal(
    resolveMxcadAssemblyPath({ MXCAD_ASSEMBLY_PATH: WINDOWS_BIN }, true),
    LINUX_DEFAULT
  );
});

test('Linux 上绝对路径形式的 Windows 二进制 → 同样回退 Linux 默认', () => {
  const absWindowsBin = '/opt/cloudcad/runtime/windows/mxcad/mxcadassembly.exe';
  assert.equal(
    resolveMxcadAssemblyPath({ MXCAD_ASSEMBLY_PATH: absWindowsBin }, true),
    LINUX_DEFAULT
  );
});

test('Linux 上配置 Linux 相对路径 → 原样保留（自定义安装位置）', () => {
  assert.equal(
    resolveMxcadAssemblyPath({ MXCAD_ASSEMBLY_PATH: LINUX_BIN }, true),
    LINUX_BIN
  );
});

test('Linux 上配置 Linux 绝对路径 → 原样保留', () => {
  const absLinuxBin = '/opt/mxcad/mxcadassembly';
  assert.equal(
    resolveMxcadAssemblyPath({ MXCAD_ASSEMBLY_PATH: absLinuxBin }, true),
    absLinuxBin
  );
});

test('Linux 上大写 .EXE 后缀 → 也识别为 Windows 二进制并回退', () => {
  assert.equal(
    resolveMxcadAssemblyPath(
      { MXCAD_ASSEMBLY_PATH: 'D:/mxcad/MXCADASEMBLY.EXE' },
      true
    ),
    LINUX_DEFAULT
  );
});

test('Windows 上配置 .exe 路径 → 原样保留（不做任何回退）', () => {
  assert.equal(
    resolveMxcadAssemblyPath({ MXCAD_ASSEMBLY_PATH: WINDOWS_BIN }, false),
    WINDOWS_BIN
  );
});

test('与后端 resolveMxExecutablePath 的语义一致（Linux + .exe 配置）', () => {
  // 复刻后端 packages/backend/src/config/configuration.ts 的同名函数，防止两侧语义再次漂移
  const backendResolve = (envPath, windowsDefault, linuxDefault, isLinux) => {
    if (envPath) {
      if (!isLinux) return envPath;
      if (require('path').extname(envPath).toLowerCase() !== '.exe')
        return envPath;
    }
    return !isLinux ? windowsDefault : linuxDefault;
  };

  const env = { MXCAD_ASSEMBLY_PATH: WINDOWS_BIN };
  assert.equal(
    resolveMxcadAssemblyPath(env, true),
    backendResolve(
      env.MXCAD_ASSEMBLY_PATH,
      WINDOWS_DEFAULT,
      LINUX_DEFAULT,
      true
    )
  );
  assert.equal(
    resolveMxcadAssemblyPath(env, false),
    backendResolve(
      env.MXCAD_ASSEMBLY_PATH,
      WINDOWS_DEFAULT,
      LINUX_DEFAULT,
      false
    )
  );
});
