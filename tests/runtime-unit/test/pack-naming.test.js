/**
 * 包命名契约 + 形态过滤 单元测试（ADR-0075 C4，v1 Step 2）
 *
 * 断言目标：
 * 1. dockerPackageName：格式 cloudcad-deploy-{version}-{YYYYMMDD}-docker-linux-{arch}
 *    （日期段 8 位，与 pack-offline.js 约定一致；与裸机包共享 cloudcad-deploy- 前缀）
 * 2. findDeployPackage 形态过滤：docker 全量包（共享 cloudcad-deploy- 前缀）
 *    不被裸机 deploy 挑选命中；upgrade 挑选不受影响
 * 3. findDeployPackage 最新优先：多裸机包并存取 mtime 最新
 * 4. findDeployPackage 边界：仅 docker 包 → null；目录不存在 → null
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { dockerPackageName } = require('../../../scripts/pack-linux-docker');
const { findDeployPackage } = require('../../../scripts/pack-linux-deploy');

describe('pack-naming (ADR-0075)', () => {
  let tmp;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-naming-'));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function touch(name, mtime) {
    const p = path.join(tmp, name);
    fs.writeFileSync(p, '');
    fs.utimesSync(p, mtime, mtime);
    return p;
  }

  describe('dockerPackageName', () => {
    test('格式: cloudcad-deploy-{version}-{YYYYMMDD}-docker-linux-{arch}', () => {
      const name = dockerPackageName('1.2.3', 'x86_64');
      expect(name).toMatch(/^cloudcad-deploy-1\.2\.3-\d{8}-docker-linux-x86_64$/);
    });

    test('日期段与 pack-offline.js 约定一致（YYYYMMDD）', () => {
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      expect(dockerPackageName('1.0.0', 'aarch64')).toBe(`cloudcad-deploy-1.0.0-${date}-docker-linux-aarch64`);
    });

    test('与裸机包共享 cloudcad-deploy- 前缀，-docker- 段区分形态', () => {
      const name = dockerPackageName('1.0.0', 'x86_64');
      expect(name.startsWith('cloudcad-deploy-')).toBe(true);
      expect(name).toContain('-docker-');
    });
  });

  describe('findDeployPackage 形态过滤', () => {
    test('deploy 挑选不命中 docker 全量包（共享 deploy 前缀，mtime 更新也不选）', () => {
      touch('cloudcad-deploy-1.0.0-20261019-linux-x86_64.tar.gz', 1000);
      touch('cloudcad-deploy-1.0.0-20261019-docker-linux-x86_64.tar.gz', 2000);
      const picked = findDeployPackage('deploy', tmp);
      expect(picked).toBe(path.join(tmp, 'cloudcad-deploy-1.0.0-20261019-linux-x86_64.tar.gz'));
    });

    test('upgrade 挑选不受 docker 包影响', () => {
      touch('cloudcad-upgrade-1.0.0-20261019-linux-x86_64.tar.gz', 1000);
      touch('cloudcad-deploy-1.0.0-20261019-docker-linux-x86_64.tar.gz', 2000);
      const picked = findDeployPackage('upgrade', tmp);
      expect(picked).toBe(path.join(tmp, 'cloudcad-upgrade-1.0.0-20261019-linux-x86_64.tar.gz'));
    });

    test('目录内仅 docker 包时 deploy 挑选返回 null', () => {
      touch('cloudcad-deploy-1.0.0-20261019-docker-linux-x86_64.tar.gz', 1000);
      expect(findDeployPackage('deploy', tmp)).toBeNull();
    });

    test('最新优先：多裸机包并存取 mtime 最新', () => {
      touch('cloudcad-deploy-1.0.0-20260101-linux-x86_64.tar.gz', 1000);
      touch('cloudcad-deploy-1.0.0-20261019-linux-x86_64.tar.gz', 2000);
      const picked = findDeployPackage('deploy', tmp);
      expect(picked).toBe(path.join(tmp, 'cloudcad-deploy-1.0.0-20261019-linux-x86_64.tar.gz'));
    });

    test('噪声文件不命中（非 cloudcad- 前缀 / 非 tar.gz 后缀）', () => {
      touch('cloudcad-deploy-1.0.0-20261019-linux-x86_64.tar.gz', 1000);
      touch('staging-1.0.0', 2000);
      touch('README.txt', 3000);
      const picked = findDeployPackage('deploy', tmp);
      expect(picked).toBe(path.join(tmp, 'cloudcad-deploy-1.0.0-20261019-linux-x86_64.tar.gz'));
    });

    test('目录不存在 → null', () => {
      expect(findDeployPackage('deploy', path.join(tmp, 'no-such-dir'))).toBeNull();
    });
  });
});
