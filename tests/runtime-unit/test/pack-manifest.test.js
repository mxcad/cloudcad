/**
 * P9：打包清单单一事实源 单元测试
 *
 * 断言目标（消灭 pack-offline.js 全量部署包/增量升级包双清单硬编码漂移）：
 * 1. upgrade 清单 = 共享条目全集（不含 runtime 二进制 / store / 部署说明 / 入口脚本）
 * 2. deploy 清单 = 共享条目 + 入口脚本 + 平台运行时 + store + 部署说明（顺序正确）
 * 3. private variant 额外包含 impl-mx/dist
 * 4. deploy 独有条目顺序：runtime/store 在 pnpm-lock.yaml 之前，部署说明在末尾
 * 5. 入口脚本为 deploy 独有，追加顺序与历史清单一致（V6 产物顺序审计无回归）
 */
const path = require('path');
const {
  getSharedEntries,
  getLaunchScriptEntries,
  getDeployIncludeList,
  getUpgradeIncludeList,
} = require('../../../scripts/pack-lib/manifest');

function srcs(list) {
  return list.map((x) => x.src);
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
      for (const src of srcs(getLaunchScriptEntries())) {
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
    it('部署包清单 = 共享条目 + 入口脚本 + runtime + store + 部署说明', () => {
      const shared = srcs(getSharedEntries());
      const launch = srcs(getLaunchScriptEntries());
      const deploy = srcs(getDeployIncludeList('linux', 'oss'));
      // 共享条目全部在内
      for (const s of shared) {
        expect(deploy).toContain(s);
      }
      // deploy 独有：入口脚本 + 平台运行时 + store + 部署说明
      for (const s of launch) {
        expect(deploy).toContain(s);
      }
      expect(deploy).toContain('runtime/linux');
      expect(deploy).toContain('.pnpm-store-deploy');
      expect(deploy).toContain('部署说明.txt');
      // 独有条目恰好是这三组
      const only = deploy.filter((s) => !shared.includes(s));
      expect(only.sort()).toEqual(
        [...launch, '.pnpm-store-deploy', 'runtime/linux', '部署说明.txt'].sort()
      );
    });

    it('入口脚本追加在 package.json 之后、部署说明之前（V6 顺序无回归）', () => {
      const deploy = srcs(getDeployIncludeList('linux', 'oss'));
      const launch = srcs(getLaunchScriptEntries());
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
  });

  describe('getLaunchScriptEntries', () => {
    it('入口脚本 src 指向模板目录、dest 落在包根目录', () => {
      const entries = getLaunchScriptEntries();
      for (const name of [
        'cloudcad.bat',
        'cloudcad.sh',
        'start.bat',
        'start.sh',
        'stop.bat',
        'stop.sh',
        'cloudcad-shell.sh',
        'cloudcad-shell.cmd',
      ]) {
        const entry = entries.find((e) => e.dest === name);
        expect(entry).toBeTruthy();
        expect(entry.src).toBe(`scripts/pack-lib/templates/${name}`);
      }
    });

    it('入口脚本不与共享清单重复', () => {
      const shared = srcs(getSharedEntries());
      for (const src of srcs(getLaunchScriptEntries())) {
        expect(shared).not.toContain(src);
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
