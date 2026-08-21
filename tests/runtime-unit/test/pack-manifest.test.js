/**
 * P9：打包清单单一事实源 单元测试
 *
 * 断言目标（消灭 pack-offline.js 全量部署包/增量升级包双清单硬编码漂移）：
 * 1. upgrade 清单 = 共享条目全集（不含 runtime 二进制 / store / 部署说明）
 * 2. deploy 清单 = 共享条目 + 平台运行时 + store + 部署说明（顺序正确）
 * 3. private variant 额外包含 impl-mx/dist
 * 4. deploy 独有条目顺序：runtime/store 在 pnpm-lock.yaml 之前，部署说明在末尾
 */
const path = require('path');
const {
  getSharedEntries,
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

    it('升级包清单不包含 runtime 二进制 / store / 部署说明', () => {
      const upgrade = srcs(getUpgradeIncludeList('win', 'oss'));
      expect(upgrade.some((s) => s.includes('runtime/windows'))).toBe(false);
      expect(upgrade.some((s) => s.includes('runtime/linux'))).toBe(false);
      expect(upgrade.some((s) => s.includes('.pnpm-store-deploy'))).toBe(false);
      expect(upgrade.some((s) => s.includes('部署说明'))).toBe(false);
    });

    it('private variant 额外包含 impl-mx/dist，oss 不包含', () => {
      const upgradeP = srcs(getUpgradeIncludeList('linux', 'private'));
      const upgradeO = srcs(getUpgradeIncludeList('linux', 'oss'));
      expect(upgradeP.some((s) => s.includes('impl-mx'))).toBe(true);
      expect(upgradeO.some((s) => s.includes('impl-mx'))).toBe(false);
    });
  });

  describe('getDeployIncludeList', () => {
    it('部署包清单 = 共享条目 + runtime + store + 部署说明', () => {
      const shared = srcs(getSharedEntries());
      const deploy = srcs(getDeployIncludeList('linux', 'oss'));
      // 共享条目全部在内
      for (const s of shared) {
        expect(deploy).toContain(s);
      }
      // deploy 独有：平台运行时 + store + 部署说明
      expect(deploy).toContain('runtime/linux');
      expect(deploy).toContain('.pnpm-store-deploy');
      expect(deploy).toContain('部署说明.txt');
      // 独有条目恰好是这三项
      const only = deploy.filter((s) => !shared.includes(s));
      expect(only.sort()).toEqual(
        ['.pnpm-store-deploy', 'runtime/linux', '部署说明.txt'].sort()
      );
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

  describe('getSharedEntries', () => {
    it('共享清单含关键业务产物与启动脚本', () => {
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
        'scripts/pack-lib/templates/cloudcad.bat',
        'scripts/pack-lib/templates/cloudcad.sh',
        'scripts/pack-lib/templates/start.bat',
        'scripts/pack-lib/templates/start.sh',
        'scripts/pack-lib/templates/stop.bat',
        'scripts/pack-lib/templates/stop.sh',
        'scripts/pack-lib/templates/cloudcad-shell.sh',
        'scripts/pack-lib/templates/cloudcad-shell.cmd',
      ]) {
        expect(shared).toContain(key);
      }
    });

    it('根目录脚本模板 src 指向模板目录、dest 落在包根目录', () => {
      const entries = getSharedEntries();
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

    it('每条目都含 src 与 dest', () => {
      for (const e of getSharedEntries()) {
        expect(e.src).toBeTruthy();
        expect(e.dest).toBeTruthy();
      }
    });
  });
});
