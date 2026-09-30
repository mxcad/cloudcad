/**
 * project-env.sh 生成器 单元测试
 *
 * 背景：project-env.sh 由 runtime/scripts/setup-offline.js 的 createProjectEnvFile()
 * 在部署/本地安装时生成（不含在打包清单里），Git Bash 用户 source 它后即可在项目
 * 子目录内直接用 pnpm/node/npm/npx 走离线运行时。
 *
 * 本测试锁定两个曾经让该文件彻底失效的缺陷：
 * 1. 模板尾部 `unset _in_project` —— bash 的 unset 会连函数定义一并删除，
 *    四个 wrapper 的 `if _in_project` 恒报 command not found、恒走全局分支。
 * 2. `_in_project` 拿 Git Bash 的 Unix 形态 $PWD（/d/foo）与 Node 生成的
 *    Windows 形态 _PROJECT_ROOT（D:/foo）做 == 比较，形态永不相等、恒判项目外。
 *
 * 另锁定「部署包根目录只保留 start/stop」这一约束：生成产物落在 runtime/ 下。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');
const SETUP_SRC_PATH = path.join(ROOT, 'runtime', 'scripts', 'setup-offline.js');
const SAMPLE_PATH = path.join(
  ROOT,
  'scripts',
  'pack-lib',
  'templates',
  'project-env.sh'
);

const SETUP_SRC = fs.readFileSync(SETUP_SRC_PATH, 'utf8');

/**
 * 取出 setup-offline.js 内嵌的 project-env.sh 模板串并按生成时的
 * 变量求值，得到与部署机上真实写出的文件一致的内容。
 */
function generatedProjectEnv() {
  const m = SETUP_SRC.match(/const content = `([\s\S]*?)`;/);
  expect(m).not.toBeNull();
  return new Function(
    'PRODUCT_NAME',
    'projectRootUnix',
    'nodeExeRel',
    'nodeDirRel',
    'npmBinRel',
    'pnpmCliRel',
    'return `' + m[1] + '`;'
  )(
    '梦想网页CAD实时协同平台',
    'D:/deploy/cloudcad',
    'runtime/windows/node/node.exe',
    'runtime/windows/node',
    'runtime/windows/node',
    'runtime/windows/node/node_modules/pnpm/bin/pnpm.cjs'
  );
}

/** 抽出 shell 函数体（含首尾大括号），用于比对两处分发源是否漂移。 */
function extractShellFunction(src, name) {
  const re = new RegExp(`^${name}\\(\\) \\{[\\s\\S]*?^\\}$`, 'm');
  return src.match(re)?.[0] ?? '';
}

const GENERATED = generatedProjectEnv();
const SAMPLE = fs.readFileSync(SAMPLE_PATH, 'utf8');

describe('project-env.sh 生成器', () => {
  it('生成位置在 runtime/ 下，部署包根目录只保留 start/stop', () => {
    expect(SETUP_SRC).toContain(
      "const envPath = path.join(PROJECT_ROOT, 'runtime', 'project-env.sh');"
    );
  });

  it('生成内容与面向用户的 source 提示都指向 runtime/project-env.sh', () => {
    expect(GENERATED).toContain('source "D:/deploy/cloudcad/runtime/project-env.sh"');
    expect(SETUP_SRC).toContain("projectRootUnix + '/runtime/project-env.sh'");
  });

  it('不再删除守卫函数（unset 会连函数定义一起删除）', () => {
    // 锚定独立命令行，避免匹配说明性注释里的 `unset` 字样
    expect(GENERATED).not.toMatch(/^unset\s+_in_project\b/m);
    expect(SAMPLE).not.toMatch(/^unset\s+_in_project\b/m);
  });

  it('_in_project 做路径形态归一化，Git Bash 的 /d/ 与 D:/ 能匹配', () => {
    const body = extractShellFunction(GENERATED, '_in_project');
    expect(body).not.toBe('');
    // 盘符小写转大写（/d/ → D:/）；只作用于单字符盘符，非盘符路径原样透传
    expect(body).toContain('tr');
    expect(body).toContain("[:lower:]");
    expect(body).toContain("[:upper:]");
    expect(body).toMatch(/\[a-z\]\|\[A-Z\]/);
    // 前缀包含比较（末尾多一个 /，防止 /proj-evil 误判为 /proj 内）
    expect(body).toContain('== "${_PROJECT_ROOT}"/*');
  });

  it('内嵌模板与 git 内参考样例的 _in_project 函数体逐字节一致', () => {
    expect(extractShellFunction(GENERATED, '_in_project')).not.toBe('');
    expect(extractShellFunction(GENERATED, '_in_project')).toBe(
      extractShellFunction(SAMPLE, '_in_project')
    );
  });

  it('四个 wrapper 都经 _in_project 判定后再决定离线/全局分支', () => {
    const fnCount = (name) =>
      (GENERATED.match(new RegExp(`^${name}\\(\\) \\{`, 'gm')) || []).length;
    for (const name of ['node', 'npm', 'npx', 'pnpm']) {
      expect(fnCount(name)).toBe(1);
    }
    expect((GENERATED.match(/if _in_project;/g) || []).length).toBe(4);
  });

  it('project-env.sh 不进打包清单（manifest 两平台均不引用）', () => {
    const manifest = require('../../../scripts/pack-lib/manifest');
    for (const platform of ['win', 'linux']) {
      const entries = [
        ...manifest.getLaunchScriptEntries(platform),
        ...manifest.getRuntimeScriptEntries(platform),
      ];
      expect(entries.map((e) => path.basename(e.dest))).not.toContain(
        'project-env.sh'
      );
    }
  });
});
