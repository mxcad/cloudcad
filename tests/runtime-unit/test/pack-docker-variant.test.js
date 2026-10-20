/**
 * Docker 包 private 变体（ADR-0075 #441）单测
 *
 * 覆盖 pack-linux-docker.js 导出的纯函数：
 * - generateDockerEnvExample：private 变体激活 IMPL=1（基础文件里是注释行 # IMPL=），
 *   oss 保持注释；windows 宿主路径覆盖与 IMPL 叠加
 * - dockerPackageName：private 变体包名加 -private 段（与裸机包 variantSuffix 同位）
 *
 * dockerPackageName 依赖模块级 VARIANT/HOST（从 process.argv 解析），
 * 用子进程设 argv 后 require 读取（模块顶层无副作用，require.main 守卫挡住 main()）。
 */
const { spawnSync } = require('child_process');
const path = require('path');

const PACK_SCRIPT = path.join(__dirname, '..', '..', '..', 'scripts', 'pack-linux-docker.js');
const { generateDockerEnvExample, dockerPackageName } = require(PACK_SCRIPT);

/** 子进程以指定 argv require 打包脚本并求值表达式（模块级常量按 argv 解析） */
function evalInPackScript(argvParts, expression) {
  const argvJson = JSON.stringify(['node', 'pack-linux-docker.js', ...argvParts]);
  const code = `process.argv = ${argvJson};\n` +
    `const m = require(${JSON.stringify(PACK_SCRIPT)});\n` +
    `process.stdout.write(String(${expression}));`;
  const res = spawnSync(process.execPath, ['-e', code], { encoding: 'utf8' });
  if (res.status !== 0) throw new Error(`子进程失败: ${res.stderr}`);
  return res.stdout;
}

describe('generateDockerEnvExample（#441 IMPL 变体）', () => {
  test('oss/linux：IMPL 保持注释行（不激活）', () => {
    const out = generateDockerEnvExample('1.0.0', 'linux', 'oss');
    expect(out).toMatch(/^# IMPL=$/m);
    expect(out).not.toMatch(/^IMPL=/m);
    expect(out).toContain('DEPLOY_FORM=docker');
  });

  test('private/linux：IMPL=1 激活（重写注释行），容器 backend 据此 require impl-mx/dist', () => {
    const out = generateDockerEnvExample('1.0.0', 'linux', 'private');
    expect(out).toMatch(/^IMPL=1$/m);
    expect(out).not.toMatch(/^# IMPL=$/m);
    expect(out).toContain('DEPLOY_FORM=docker');
  });

  test('private/windows：IMPL=1 与容器视角路径覆盖叠加', () => {
    const out = generateDockerEnvExample('1.0.0', 'windows', 'private');
    expect(out).toMatch(/^IMPL=1$/m);
    expect(out).toMatch(/^FILES_DATA_PATH=\/app\/data\/files$/m);
    expect(out).toMatch(/^FUNCTION_EXECUTOR=conversion-service$/m);
  });

  test('oss/windows：路径覆盖生效但 IMPL 不激活', () => {
    const out = generateDockerEnvExample('1.0.0', 'windows', 'oss');
    expect(out).toMatch(/^FILES_DATA_PATH=\/app\/data\/files$/m);
    expect(out).toMatch(/^# IMPL=$/m);
  });
});

describe('dockerPackageName（#441 -private 段）', () => {
  test('oss/linux：无 -private 段', () => {
    const name = evalInPackScript(['--host-platform', 'linux'], 'm.dockerPackageName("1.0.0", "x86_64")');
    expect(name).toMatch(/^cloudcad-deploy-1\.0\.0-\d{8}-docker-linux-x86_64$/);
  });

  test('private/linux：-private 段在前缀后（与裸机包 variantSuffix 同位）', () => {
    const name = evalInPackScript(['--host-platform', 'linux', '--variant', 'private'], 'm.dockerPackageName("1.0.0", "x86_64")');
    expect(name).toMatch(/^cloudcad-deploy-private-1\.0\.0-\d{8}-docker-linux-x86_64$/);
  });

  test('private/windows：-private 段 + windows 宿主段', () => {
    const name = evalInPackScript(['--host-platform', 'windows', '--variant', 'private'], 'm.dockerPackageName("1.0.0", "x86_64")');
    expect(name).toMatch(/^cloudcad-deploy-private-1\.0\.0-\d{8}-docker-windows-x86_64$/);
  });

  test('裸机挑包正则不受影响：docker 包名恒含 -docker- 段', () => {
    for (const argv of [['--host-platform', 'linux'], ['--host-platform', 'linux', '--variant', 'private']]) {
      const name = evalInPackScript(argv, 'm.dockerPackageName("1.0.0", "x86_64")');
      expect(name).toContain('-docker-');
    }
  });
});
