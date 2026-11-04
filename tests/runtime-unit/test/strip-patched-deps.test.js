/**
 * 部署包「剥离 pnpm.patchedDependencies」纯函数单元测试
 *
 * 背景（2026-11-04 windows 部署包 ENOENT 事故）：根 package.json 的
 * pnpm.patchedDependencies（@voerkai18n/cli，dev-only i18n 翻译 CLI 补丁）
 * 随部署包到目标机后，pnpm install --offline --prod 即使装不到该包也会按声明
 * 校验 patch 文件哈希 → 包内无 patches/ 即 ENOENT 中断。部署包不携带 patches/，
 * 须同步剥离包内 package.json + pnpm-lock.yaml 的 patch 声明。
 *
 * 断言目标：
 * 1. 无 patchedDependencies 时为空操作（输出逐字节不变，changed=false）
 * 2. package.json：删 pnpm.patchedDependencies，pnpm 块空则整块删除，兄弟键保留
 * 3. lockfile：删顶层 patchedDependencies 段、importers 的 patch_hash 引用改写、
 *    packages 的补丁条目块删除（纯版本条目保留）、无引用残留
 * 4. 幂等：对已剥离输出再跑 = 空操作
 */
const {
  stripPatchedDependencies,
  stripLockfilePatchRefs,
} = require('../../../scripts/pack-lib/strip-patched-deps');

const PKG_WITH_PATCH = JSON.stringify(
  {
    name: 'cloudcad',
    version: '1.0.0',
    pnpm: {
      overrides: { 'uuid@9': '^11.1.1' },
      patchedDependencies: {
        '@voerkai18n/cli@3.0.12': 'patches/@voerkai18n__cli@3.0.12.patch',
      },
    },
  },
  null,
  2
) + '\n';

const PKG_NO_PATCH =
  JSON.stringify({ name: 'cloudcad', version: '1.0.0' }, null, 2) + '\n';

// 精确模拟 pnpm 9 lockfile 结构：顶层段 + importers 引用 + 纯/补丁双条目
const LOCK_WITH_PATCH = [
  "lockfileVersion: '9.0'",
  '',
  'settings:',
  '  autoInstallPeers: true',
  '',
  'overrides:',
  "  uuid@9: ^11.1.1",
  '',
  'patchedDependencies:',
  "  '@voerkai18n/cli@3.0.12':",
  '    hash: xpik52vkfgrkvelvanlomdzxhm',
  '    path: patches/@voerkai18n__cli@3.0.12.patch',
  '',
  'importers:',
  '',
  '  .:',
  '    devDependencies:',
  "      '@voerkai18n/cli':",
  '        specifier: 3.0.12',
  '        version: 3.0.12(patch_hash=xpik52vkfgrkvelvanlomdzxhm)',
  '',
  'packages:',
  '',
  "  '@voerkai18n/cli@3.0.12':",
  '    resolution: {integrity: sha512-abc}',
  '    hasBin: true',
  '',
  "  '@voerkai18n/cli@3.0.12(patch_hash=xpik52vkfgrkvelvanlomdzxhm)':",
  '    dependencies:',
  '      axios: 1.18.1',
  '',
  "  'other-pkg@1.0.0':",
  '    resolution: {integrity: sha512-xyz}',
  '',
].join('\n');

const LOCK_NO_PATCH = [
  "lockfileVersion: '9.0'",
  '',
  'settings:',
  '  autoInstallPeers: true',
  '',
  'overrides:',
  "  uuid@9: ^11.1.1",
  '',
  'importers:',
  '',
  '  .:',
  '    devDependencies:',
  "      '@voerkai18n/cli':",
  '        specifier: 3.0.12',
  '        version: 3.0.12',
  '',
  'packages:',
  '',
  "  '@voerkai18n/cli@3.0.12':",
  '    resolution: {integrity: sha512-abc}',
  '    hasBin: true',
  '',
  "  'other-pkg@1.0.0':",
  '    resolution: {integrity: sha512-xyz}',
  '',
].join('\n');

describe('pack-lib/strip-patched-deps.js（部署包剥离 patchedDependencies）', () => {
  it('无补丁声明时为空操作：输出逐字节不变，changed=false', () => {
    const r = stripPatchedDependencies(PKG_NO_PATCH, LOCK_NO_PATCH);
    expect(r.packageJson).toBe(PKG_NO_PATCH);
    expect(r.lockfile).toBe(LOCK_NO_PATCH);
    expect(r.changed).toBe(false);
  });

  it('package.json：删 pnpm.patchedDependencies，兄弟键（overrides）保留', () => {
    const r = stripPatchedDependencies(PKG_WITH_PATCH, LOCK_NO_PATCH);
    const pkg = JSON.parse(r.packageJson);
    expect(pkg.pnpm.patchedDependencies).toBeUndefined();
    expect(pkg.pnpm.overrides).toEqual({ 'uuid@9': '^11.1.1' });
    expect(r.changed).toBe(true);
  });

  it('package.json：pnpm 块仅剩 patchedDependencies 时整块删除', () => {
    const raw =
      JSON.stringify(
        {
          name: 'cloudcad',
          pnpm: {
            patchedDependencies: {
              '@voerkai18n/cli@3.0.12': 'patches/x.patch',
            },
          },
        },
        null,
        2
      ) + '\n';
    const r = stripPatchedDependencies(raw, LOCK_NO_PATCH);
    expect(JSON.parse(r.packageJson).pnpm).toBeUndefined();
  });

  it('lockfile：删顶层段 + 改写 importers 引用 + 删补丁条目，纯条目保留', () => {
    const r = stripPatchedDependencies(PKG_WITH_PATCH, LOCK_WITH_PATCH);
    expect(r.lockfile).toBe(LOCK_NO_PATCH);
    expect(r.changed).toBe(true);
  });

  it('lockfile：转换后无任何 patch 引用残留（门禁）', () => {
    const r = stripPatchedDependencies(PKG_WITH_PATCH, LOCK_WITH_PATCH);
    expect(r.lockfile).not.toContain('patchedDependencies');
    expect(r.lockfile).not.toContain('patch_hash');
  });

  it('lockfile：只改 lockfile 不改 package.json 时（package.json 无声明）', () => {
    const r = stripPatchedDependencies(PKG_NO_PATCH, LOCK_WITH_PATCH);
    expect(r.packageJson).toBe(PKG_NO_PATCH);
    expect(r.lockfile).toBe(LOCK_NO_PATCH);
    expect(r.changed).toBe(true);
  });

  it('幂等：对已剥离输出再跑 = 空操作', () => {
    const first = stripPatchedDependencies(PKG_WITH_PATCH, LOCK_WITH_PATCH);
    const second = stripPatchedDependencies(first.packageJson, first.lockfile);
    expect(second.packageJson).toBe(first.packageJson);
    expect(second.lockfile).toBe(first.lockfile);
    expect(second.changed).toBe(false);
  });

  it('stripLockfilePatchRefs：补丁条目为 packages 段最后一条时不越界', () => {
    const lock = [
      'packages:',
      '',
      "  'a@1.0.0':",
      '    resolution: {integrity: sha512-a}',
      '',
      "  'b@2.0.0(patch_hash=abc123def456ghijklmnopqrstuvwxyz)':",
      '    dependencies:',
      '      c: 3.0.0',
      '',
    ].join('\n');
    const out = stripLockfilePatchRefs(lock);
    expect(out).toBe(
      [
        'packages:',
        '',
        "  'a@1.0.0':",
        '    resolution: {integrity: sha512-a}',
        '',
      ].join('\n')
    );
    expect(out).not.toContain('patch_hash');
  });
});
