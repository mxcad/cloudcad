/**
 * L1 特征测试 —— lib/deploy-install-filter.js（部署包后端生产依赖 pnpm --filter 单一事实源）
 *
 * 背景：setup-offline.js 与 verify-deploy.js 此前各手写一份 filter 清单，
 * verify-deploy 漏掉 @cloudcad/impl-mx 条件项 → 私有包断网验证不建 impl-mx workspace 链接。
 * 收敛到本模块后，本测试钉死：基础清单精确、impl-mx 按目录存在性条件纳入。
 *
 * 被测模块：runtime/scripts/lib/deploy-install-filter.js（纯函数，无顶层副作用）
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  DEPLOY_PROD_FILTER_PACKAGES,
  hasImplMx,
  buildDeployInstallFilters,
} = require('../../../runtime/scripts/lib/deploy-install-filter');

// 造一个「部署包根」临时目录，可选地放入 packages/impl-mx/package.json
function makeRoot(withImplMx) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-filter-test-'));
  if (withImplMx) {
    const dir = path.join(root, 'packages', 'impl-mx');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), '{}', 'utf8');
  }
  return root;
}

describe('deploy-install-filter', () => {
  let roots = [];
  afterAll(() => {
    for (const r of roots) {
      try { fs.rmSync(r, { recursive: true, force: true }); } catch (e) {}
    }
  });

  it('基础清单精确等于 6 个后端生产依赖包（无 impl-mx）', () => {
    expect(DEPLOY_PROD_FILTER_PACKAGES).toEqual([
      'backend',
      '@cloudcad/db',
      '@cloudcad/contracts',
      '@cloudcad/engine-exec',
      '@cloudcad/conversion-service',
      '@cloudcad/config-service',
    ]);
  });

  it('OSS 包（无 impl-mx 目录）→ filter 不含 impl-mx', () => {
    const root = makeRoot(false);
    roots.push(root);
    expect(hasImplMx(root)).toBe(false);
    expect(buildDeployInstallFilters(root)).toEqual([
      '--filter', 'backend',
      '--filter', '@cloudcad/db',
      '--filter', '@cloudcad/contracts',
      '--filter', '@cloudcad/engine-exec',
      '--filter', '@cloudcad/conversion-service',
      '--filter', '@cloudcad/config-service',
    ]);
  });

  it('私有包（有 impl-mx 目录）→ filter 追加 @cloudcad/impl-mx（verify-deploy 此前的分叉点）', () => {
    const root = makeRoot(true);
    roots.push(root);
    expect(hasImplMx(root)).toBe(true);
    expect(buildDeployInstallFilters(root)).toEqual([
      '--filter', 'backend',
      '--filter', '@cloudcad/db',
      '--filter', '@cloudcad/contracts',
      '--filter', '@cloudcad/engine-exec',
      '--filter', '@cloudcad/conversion-service',
      '--filter', '@cloudcad/config-service',
      '--filter', '@cloudcad/impl-mx',
    ]);
  });

  it('显式 includeImplMx 覆盖目录判定', () => {
    const root = makeRoot(false);
    roots.push(root);
    // 目录不存在但显式要求纳入 → 仍追加
    expect(buildDeployInstallFilters(root, true)).toEqual([
      '--filter', 'backend',
      '--filter', '@cloudcad/db',
      '--filter', '@cloudcad/contracts',
      '--filter', '@cloudcad/engine-exec',
      '--filter', '@cloudcad/conversion-service',
      '--filter', '@cloudcad/config-service',
      '--filter', '@cloudcad/impl-mx',
    ]);
    // 显式排除 → 不追加（即便目录存在）
    const root2 = makeRoot(true);
    roots.push(root2);
    expect(buildDeployInstallFilters(root2, false)).not.toContain('@cloudcad/impl-mx');
  });
});
