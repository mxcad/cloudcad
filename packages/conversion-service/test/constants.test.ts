import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PROJECT_ROOT, MXCAD_CONFIG } from '../lib/constants';

/**
 * 独立定位含 runtime/ 的项目根（与 constants.resolveProjectRoot 同逻辑，但不复用被测函数，
 * 避免"用被测代码验证被测代码"）。
 *
 * 回归背景：tsconfig rootDir="."+outDir="dist"，编译产物 dist/lib/constants.js 比源码 lib/
 * 深一层，写死 path.resolve(__dirname,'..','..','..') 会从 dist/lib/ 只爬到 packages/（少爬
 * 一层 dist），致 assemblyPath 指向不存在的 packages/runtime/... → spawn ENOENT。修复改为
 * 向上查找含 runtime/ 的目录（与嵌套深度无关）。
 */
function locateRuntimeRoot(): string | null {
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, 'runtime'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

describe('constants.PROJECT_ROOT', () => {
  it('解析到含 runtime/ 的项目根（非少爬一层到 packages/），assemblyPath 指向存在的二进制', () => {
    const root = locateRuntimeRoot();
    // CI 无 runtime 资产时跳过（与 e2e-real-conversion 一致），不 fail
    if (!root) return;

    // 核心回归：PROJECT_ROOT 必须等于含 runtime/ 的那一层（而非 dist/lib 少爬一层得到的 packages/）
    assert.equal(PROJECT_ROOT, root);
    // 显式排除旧 bug 签名：不得解析到 __dirname 往上 3 层（dist/lib 下即 packages/）
    assert.notEqual(PROJECT_ROOT, path.resolve(__dirname, '..', '..', '..'));
    // assemblyPath 必须指向真实存在的 mxcadassembly 二进制（否则 spawn ENOENT）
    assert.ok(
      fs.existsSync(MXCAD_CONFIG.assemblyPath),
      `assemblyPath 不存在: ${MXCAD_CONFIG.assemblyPath}`
    );
  });
});
