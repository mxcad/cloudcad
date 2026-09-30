/**
 * P9：打包清单单一事实源 单元测试
 *
 * 断言目标（消灭 pack-offline.js 全量部署包/增量升级包双清单硬编码漂移）：
 * 1. upgrade 清单 = 共享条目全集（不含 runtime 二进制 / store / 部署说明 / 入口脚本）
 * 2. deploy 清单 = 共享条目 + 入口脚本 + 平台运行时 + store + 部署说明（顺序正确）
 * 3. private variant 额外包含 impl-mx/dist
 * 4. deploy 独有条目顺序：runtime/store 在 pnpm-lock.yaml 之前，部署说明在末尾
 * 5. 入口脚本为 deploy 独有，追加顺序与历史清单一致（V6 产物顺序审计无回归）
 *
 * 部署包根目录布局回归（根目录只留 start/stop）：
 * 6. 根目录只出当前平台的 start/stop，运维入口（cloudcad.* / cloudcad-shell.*）落 runtime/
 * 7. 平台隔离：win 包不含 .sh 入口，linux 包不含 .bat/.cmd 入口
 */
const {
  getSharedEntries,
  getLaunchScriptEntries,
  getRuntimeScriptEntries,
  getDeployIncludeList,
  getUpgradeIncludeList,
} = require('../../../scripts/pack-lib/manifest');

function srcs(list) {
  return list.map((x) => x.src);
}

function dests(list) {
  return list.map((x) => x.dest);
}

/** 模板目录下的入口脚本模板（两个平台全量），用于断言"升级包一律不带" */
function allTemplateScriptSrcs() {
  return [
    ...srcs(getLaunchScriptEntries('win')),
    ...srcs(getRuntimeScriptEntries('win')),
    ...srcs(getLaunchScriptEntries('linux')),
    ...srcs(getRuntimeScriptEntries('linux')),
  ];
}

describe('pack-lib/manifest.js（P9 单一事实源）', () => {
  describe('getUpgradeIncludeList', () => {
    it('升级包清单 = 共享条目全集（oss）', () => {
      const shared = srcs(getSharedEntries());
      const upgrade = srcs(getUpgradeIncludeList('linux', 'oss'));
      expect(upgrade).toEqual(shared);
    });

    it('升级包清单不包含 runtime 二进制 / store / 部署说明 / 入口脚本', () => {
      const upgrade = srcs(getUpgradeIncludeList('win', 'oss'));
      expect(upgrade.some((s) => s.includes('runtime/windows'))).toBe(false);
      expect(upgrade.some((s) => s.includes('runtime/linux'))).toBe(false);
      expect(upgrade.some((s) => s.includes('.pnpm-store-deploy'))).toBe(false);
      expect(upgrade.some((s) => s.includes('部署说明'))).toBe(false);
      // 入口脚本回归锁定：升级包不含 .sh/.bat 入口，否则 Windows 打包机直打 tar
      // 会把目标机部署包的 -rwxr-xr-x 入口覆盖成 0666，用户 ./start.sh 报 Permission denied
      // 根目录与 runtime/ 下的入口脚本一律不带（两个平台都检查）
      for (const src of allTemplateScriptSrcs()) {
        expect(upgrade).not.toContain(src);
      }
    });

    it('private variant 额外包含 impl-mx/dist，oss 不包含', () => {
      const upgradeP = srcs(getUpgradeIncludeList('linux', 'private'));
      const upgradeO = srcs(getUpgradeIncludeList('linux', 'oss'));
      expect(upgradeP.some((s) => s.includes('impl-mx'))).toBe(true);
      expect(upgradeO.some((s) => s.includes('impl-mx'))).toBe(false);
    });
  });

  describe('getDeployIncludeList', () => {
    it('部署包清单 = 共享条目 + 入口脚本 + runtime 入口 + runtime + store + 部署说明', () => {
      const shared = srcs(getSharedEntries());
      const launch = srcs(getLaunchScriptEntries('linux'));
      const runtimeScripts = srcs(getRuntimeScriptEntries('linux'));
      const deploy = srcs(getDeployIncludeList('linux', 'oss'));
      // 共享条目全部在内
      for (const s of shared) {
        expect(deploy).toContain(s);
      }
      // deploy 独有：入口脚本 + 平台运行时 + store + 部署说明
      for (const s of launch) {
        expect(deploy).toContain(s);
      }
      for (const s of runtimeScripts) {
        expect(deploy).toContain(s);
      }
      expect(deploy).toContain('runtime/linux');
      expect(deploy).toContain('.pnpm-store-deploy');
      expect(deploy).toContain('部署说明.txt');
      // 独有条目恰好是这四组
      const only = deploy.filter((s) => !shared.includes(s));
      expect(only.sort()).toEqual(
        [...launch, ...runtimeScripts, '.pnpm-store-deploy', 'runtime/linux', '部署说明.txt'].sort()
      );
    });

    it('入口脚本追加在 package.json 之后、部署说明之前（V6 顺序无回归）', () => {
      const deploy = srcs(getDeployIncludeList('linux', 'oss'));
      const launch = srcs(getLaunchScriptEntries('linux'));
      const runtimeScripts = srcs(getRuntimeScriptEntries('linux'));
      const lockIdx = deploy.indexOf('pnpm-lock.yaml');
      const docIdx = deploy.indexOf('部署说明.txt');
      // 入口脚本保持历史相对顺序，且整体位于根目录文件之后、部署说明之前
      for (let i = 0; i < launch.length; i += 1) {
        const idx = deploy.indexOf(launch[i]);
        expect(idx).toBeGreaterThan(lockIdx);
        expect(idx).toBeLessThan(docIdx);
        if (i > 0) {
          expect(idx).toBeGreaterThan(deploy.indexOf(launch[i - 1]));
        }
      }
      // runtime 入口紧随根目录入口之后
      const lastLaunchIdx = deploy.indexOf(launch[launch.length - 1]);
      const firstRuntimeIdx = deploy.indexOf(runtimeScripts[0]);
      expect(firstRuntimeIdx).toBeGreaterThan(lastLaunchIdx);
      expect(firstRuntimeIdx).toBeLessThan(docIdx);
    });

    it('win 平台使用 runtime/windows', () => {
      const deploy = srcs(getDeployIncludeList('win', 'oss'));
      expect(deploy).toContain('runtime/windows');
      expect(deploy).not.toContain('runtime/linux');
    });

    it('部署包顺序：runtime 与 store 在 pnpm-lock.yaml 之前，部署说明在末尾', () => {
      const deploy = srcs(getDeployIncludeList('win', 'oss'));
      const runtimeIdx = deploy.indexOf('runtime/windows');
      const storeIdx = deploy.indexOf('.pnpm-store-deploy');
      const lockIdx = deploy.indexOf('pnpm-lock.yaml');
      expect(runtimeIdx).toBeGreaterThan(-1);
      expect(storeIdx).toBeGreaterThan(-1);
      expect(runtimeIdx).toBeLessThan(lockIdx);
      expect(storeIdx).toBeLessThan(lockIdx);
      // 部署说明在末尾（private 时在其前一条）
      expect(deploy[deploy.length - 1]).toBe('部署说明.txt');
    });

    it('private variant 额外包含 impl-mx/dist', () => {
      const deployP = srcs(getDeployIncludeList('win', 'private'));
      expect(deployP).toContain('packages/impl-mx/dist');
    });

    it('根目录脚本 dest 只有当前平台的 start/stop', () => {
      const rootScripts = (platform) =>
        dests(getDeployIncludeList(platform, 'oss')).filter(
          (d) => !d.includes('/') && /\.(sh|bat|cmd)$/.test(d)
        );
      expect(rootScripts('linux')).toEqual(['start.sh', 'stop.sh']);
      expect(rootScripts('win')).toEqual(['start.bat', 'stop.bat']);
    });

    it('平台隔离：win 包只出 .bat/.cmd，linux 包只出 .sh', () => {
      const winDest = dests(getDeployIncludeList('win', 'oss'));
      const linuxDest = dests(getDeployIncludeList('linux', 'oss'));
      // win 包不含任何根目录/sh 入口，也不含 runtime/cloudcad.sh
      expect(winDest).not.toContain('start.sh');
      expect(winDest).not.toContain('stop.sh');
      expect(winDest).not.toContain('runtime/cloudcad.sh');
      expect(winDest).not.toContain('runtime/cloudcad-shell.sh');
      expect(winDest.some((d) => d.startsWith('runtime/') && d.endsWith('.sh'))).toBe(false);
      // linux 包不含任何 bat/cmd 入口
      expect(linuxDest).not.toContain('start.bat');
      expect(linuxDest).not.toContain('stop.bat');
      expect(linuxDest).not.toContain('runtime/cloudcad.bat');
      expect(linuxDest).not.toContain('runtime/cloudcad-shell.cmd');
      expect(
        linuxDest.some((d) => /\.(bat|cmd)$/.test(d))
      ).toBe(false);
    });

    it('运维入口落在 runtime/ 下（与 runtime/scripts 同级）', () => {
      expect(dests(getRuntimeScriptEntries('win'))).toEqual([
        'runtime/cloudcad.bat',
        'runtime/cloudcad-shell.cmd',
      ]);
      expect(dests(getRuntimeScriptEntries('linux'))).toEqual([
        'runtime/cloudcad.sh',
        'runtime/cloudcad-shell.sh',
      ]);
    });
  });

  describe('getLaunchScriptEntries', () => {
    it('每个平台只出 start/stop，src 指向模板目录、dest 落在包根目录', () => {
      const expected = {
        win: ['start.bat', 'stop.bat'],
        linux: ['start.sh', 'stop.sh'],
      };
      for (const platform of ['win', 'linux']) {
        const entries = getLaunchScriptEntries(platform);
        expect(dests(entries)).toEqual(expected[platform]);
        for (const entry of entries) {
          expect(entry.src).toBe(`scripts/pack-lib/templates/${entry.dest}`);
        }
      }
    });

    it('入口脚本不与共享清单重复', () => {
      const shared = srcs(getSharedEntries());
      for (const platform of ['win', 'linux']) {
        for (const src of srcs(getLaunchScriptEntries(platform))) {
          expect(shared).not.toContain(src);
        }
      }
    });
  });

  describe('getRuntimeScriptEntries', () => {
    it('每个平台只出 cloudcad.* 与 cloudcad-shell.*，src 指向模板目录', () => {
      const expected = {
        win: ['cloudcad.bat', 'cloudcad-shell.cmd'],
        linux: ['cloudcad.sh', 'cloudcad-shell.sh'],
      };
      for (const platform of ['win', 'linux']) {
        const entries = getRuntimeScriptEntries(platform);
        expect(entries.map((e) => e.dest.replace(/^runtime\//, ''))).toEqual(
          expected[platform]
        );
        for (const entry of entries) {
          expect(entry.src).toBe(
            `scripts/pack-lib/templates/${entry.dest.replace(/^runtime\//, '')}`
          );
        }
      }
    });

    it('运维入口不与根目录入口 / 共享清单重复', () => {
      const shared = srcs(getSharedEntries());
      for (const platform of ['win', 'linux']) {
        const runtimeSrcs = srcs(getRuntimeScriptEntries(platform));
        for (const src of runtimeSrcs) {
          expect(shared).not.toContain(src);
          expect(srcs(getLaunchScriptEntries(platform))).not.toContain(src);
          expect(srcs(getLaunchScriptEntries(platform === 'win' ? 'linux' : 'win'))).not.toContain(
            src
          );
        }
      }
    });
  });

  describe('getSharedEntries', () => {
    it('共享清单含关键业务产物', () => {
      const shared = srcs(getSharedEntries());
      for (const key of [
        'packages/backend/dist',
        'packages/backend/prisma',
        'packages/backend/.env.example',
        'packages/db/dist',
        'packages/contracts/dist',
        'packages/frontend/dist',
        'packages/mxVersionTool',
        'packages/config-service',
        'runtime/scripts',
        'runtime/ecosystem.config.js',
        'pnpm-lock.yaml',
        'pnpm-workspace.yaml',
        'package.json',
      ]) {
        expect(shared).toContain(key);
      }
    });

    it('每条目都含 src 与 dest', () => {
      for (const e of getSharedEntries()) {
        expect(e.src).toBeTruthy();
        expect(e.dest).toBeTruthy();
      }
    });
  });
});
