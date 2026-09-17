import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runMxcadAssembly } from '../mxcad-exec';
import type { TestContext } from 'node:test';

/**
 * 定位真实 mxcadassembly：从本测试文件所在目录（编译后为 dist/test/）向上逐层查找
 * runtime/{windows,mxcad|linux,mxcad} 下的可执行文件。
 *
 * 为何不直接用 MXCAD_CONFIG.assemblyPath：编译产物 dist/lib/constants.js 比源码 lib/
 * 深一层，其 `PROJECT_ROOT = __dirname/../../..` 会解析到 packages/（少爬一层），
 * 导致 assemblyPath 指向不存在的 packages/runtime/...。故这里从 __dirname 独立向上
 * 查找，与 dist 嵌套深度无关（CI 无 runtime 资产时找不到 → 整组跳过）。
 */
function locateExe(): { exePath: string; mxcadDir: string } | null {
  const isWin = process.platform === 'win32';
  const exeName = isWin ? 'mxcadassembly.exe' : 'mxcadassembly';
  const sub = isWin ? ['runtime', 'windows', 'mxcad'] : ['runtime', 'linux', 'mxcad'];
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, ...sub, exeName);
    if (fs.existsSync(candidate)) {
      return { exePath: candidate, mxcadDir: path.join(dir, ...sub) };
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * 端到端真实转换测试（非 mock）：用运行时自带的真实 mxcadassembly 可执行文件 + 真实图纸
 * 1.dwg 跑 runMxcadAssembly（与 runner.ts 相同的真实代码路径），验证「真实文件 → 真实
 * 转换」在各情况下的行为。
 *
 * 与 mxcad-exec.test.ts 的分工：
 * - mxcad-exec.test.ts 用 fake child / 真实孙进程验证「进程组杀除 / 超时 / verbatim 传参」
 *   这些机制（跨平台、不依赖真实 exe）。
 * - 本文件验证「真实 exe + 真实 dwg」的转换结果契约，尤其固化一条关键事实：
 *   mxcadassembly 成功与失败的退出码恒 2123，成败只能认 stdout 里的 {"code":...}，
 *   绝不能按退出码判成败（否则会把失败误判成成功）。
 *
 * CI 安全：exe 不存在（CI 无 runtime 资产）时整组跳过，不 fail。
 */

const isWindows = process.platform === 'win32';
const located = locateExe();
const exePath = located?.exePath || '';
const mxcadDir = located?.mxcadDir || '';
const inputDwg = mxcadDir ? path.join(mxcadDir, '1.dwg') : '';
const exeExists = Boolean(exePath) && fs.existsSync(exePath);
const inputExists = Boolean(inputDwg) && fs.existsSync(inputDwg);

// 成败判定：解析 stdout/stderr 里最后一段 {"code":...}（与 runner._parseOutput 一致）
function parseCode(output: string): { code: number; message: string } {
  const str = String(output);
  const pos = str.lastIndexOf('{"code"');
  const slice = pos === -1 ? str : str.substring(pos);
  try {
    const parsed = JSON.parse(slice);
    return { code: parsed.code, message: parsed.message || '' };
  } catch {
    return { code: -1, message: `无法解析输出: ${slice.slice(0, 200)}` };
  }
}

// node:test 运行时支持 it(name, fn, options)，但 @types/node 的 it 重载未覆盖该顺序。
const itWithOptions = it as unknown as (
  name: string,
  fn: (t: TestContext) => Promise<void>,
  options?: { timeout?: number },
) => Promise<void>;

describe('e2e 真实转换（真实 mxcadassembly + 1.dwg）', () => {
  // 实测契约（真实 exe 跑通后固化）：
  // - 成功 1.dwg→mxweb：stdout code=0，产物落位到「exe 自身所在目录」（mxcadDir），与 cwd 无关。
  // - 源文件不存在：stdout code=1 / "read file error"（注意不是 233；233 是 dwg/dxf 内容转换错误）。
  // - 成败退出码恒 2123：成功与失败的 exitCode 相同，成败只能认 stdout 的 code。
  const createdProducts: string[] = [];

  // 每个场景开头调用：exe / 1.dwg 任一缺失（CI 无 runtime 资产）则跳过本场景，返回 true
  function shouldSkip(t: TestContext): boolean {
    if (!exeExists || !inputExists) {
      t.skip(`CI 无 runtime 资产：exe=${exePath || '(未找到)'} 1.dwg=${inputDwg || '(未找到)'}`);
      return true;
    }
    return false;
  }

  // 真实参数契约（与 runner.ts 一致：Windows 原始 JSON，Linux 单引号）
  function buildArg(param: Record<string, unknown>): string {
    const json = JSON.stringify(param);
    return isWindows ? json : json.replace(/"/g, "'");
  }

  after(() => {
    // 清理本测试写入 mxcadDir 的产物（用唯一 outname，不碰既有 1.dwg.mxweb）
    for (const p of createdProducts) {
      try {
        if (fs.existsSync(p)) fs.rmSync(p, { force: true });
      } catch {
        /* 忽略清理失败 */
      }
    }
  });

  // 场景 1：成功转换 1.dwg → mxweb。stdout code=0，产物文件真实落盘（落位 exe 所在目录）。
  itWithOptions(
    '成功：1.dwg → mxweb，stdout code=0 且产物文件真实落盘',
    async (t: TestContext) => {
      if (shouldSkip(t)) return;
      // 唯一 outname，避免覆盖既有 1.dwg.mxweb
      const outname = `e2e-${Date.now()}.mxweb`;
      const product = path.join(mxcadDir, outname);
      const param: Record<string, unknown> = {
        srcpath: inputDwg.replace(/\\/g, '/'),
        src_file_md5: '',
        create_preloading_data: false,
        outname,
      };

      const r = await runMxcadAssembly(exePath, buildArg(param), { timeoutMs: 60000 });
      const out = parseCode(r.stdout || r.stderr);
      assert.equal(
        out.code, 0,
        `成功转换应 code=0，实际 code=${out.code} message=${out.message} exitCode=${r.exitCode} stderr=${(r.stderr || '').slice(0, 200)}`,
      );
      assert.equal(r.timedOut, false, '成功转换不应超时');

      // 产物落位到 exe 自身所在目录（mxcadDir），与 cwd 无关
      assert.ok(
        fs.existsSync(product) && fs.statSync(product).size > 0,
        `产物应真实落盘且非空：${product}（stdout=${(r.stdout || '').slice(0, 200)}）`,
      );
      createdProducts.push(product);
      t.diagnostic(`成功转换产物大小=${fs.statSync(product).size} bytes`);
    },
    { timeout: 90000 },
  );

  // 场景 2：源文件不存在 → 转换失败，code=1（"read file error"）。
  itWithOptions(
    '源文件不存在：转换失败 code=1（read file error）',
    async (t: TestContext) => {
      if (shouldSkip(t)) return;
      const missing = path.join(mxcadDir, `definitely-not-exist-${Date.now()}.dwg`);
      const param: Record<string, unknown> = {
        srcpath: missing.replace(/\\/g, '/'),
        src_file_md5: '',
        create_preloading_data: false,
        outname: 'definitely-not-exist.mxweb',
      };

      const r = await runMxcadAssembly(exePath, buildArg(param), { timeoutMs: 60000 });
      const out = parseCode(r.stdout || r.stderr);
      // 源文件不存在时 mxcadassembly 返回 code=1 / "read file error"。
      // 关键：退出码仍恒 2123（见场景 3），所以这里必须认 code 而非 exitCode。
      assert.equal(
        out.code, 1,
        `源文件不存在应 code=1，实际 code=${out.code} message=${out.message} exitCode=${r.exitCode}`,
      );
      assert.match(out.message, /read file error/i);
      t.diagnostic(`源文件不存在 message=${out.message}`);
    },
    { timeout: 90000 },
  );

  // 场景 3：退出码恒 2123——成功与失败都是 2123，证明「只认 code 勿按退出码判成败」。
  // 这是 mxcadassembly 的固有关键契约，若将来某次按 exitCode 判成败的改动引入回归，本测试会红。
  itWithOptions(
    '退出码恒 2123：成功与失败 exitCode 相同，成败只能认 stdout code',
    async (t: TestContext) => {
      if (shouldSkip(t)) return;
      // 成功一次
      const okOutname = `e2e-exitcode-${Date.now()}.mxweb`;
      const okRes = await runMxcadAssembly(
        exePath,
        buildArg({
          srcpath: inputDwg.replace(/\\/g, '/'),
          src_file_md5: '',
          create_preloading_data: false,
          outname: okOutname,
        }),
        { timeoutMs: 60000 },
      );
      createdProducts.push(path.join(mxcadDir, okOutname));
      assert.equal(parseCode(okRes.stdout || okRes.stderr).code, 0, '前置：成功转换 code=0');

      // 失败一次（源文件不存在）
      const failRes = await runMxcadAssembly(
        exePath,
        buildArg({
          srcpath: path.join(mxcadDir, `no-such-file-${Date.now()}.dwg`).replace(/\\/g, '/'),
          src_file_md5: '',
          create_preloading_data: false,
          outname: 'no-such-file.mxweb',
        }),
        { timeoutMs: 60000 },
      );
      assert.equal(parseCode(failRes.stdout || failRes.stderr).code, 1, '前置：失败转换 code=1');

      // 核心断言：成功与失败的退出码都是 2123（mxcadassembly 固有关键契约）
      assert.equal(
        okRes.exitCode, 2123,
        `成功时 exitCode 应恒 2123，实际=${okRes.exitCode}`,
      );
      assert.equal(
        failRes.exitCode, 2123,
        `失败时 exitCode 也应恒 2123（成败不可按退出码区分），实际=${failRes.exitCode}`,
      );
      t.diagnostic(`成功 exitCode=${okRes.exitCode}，失败 exitCode=${failRes.exitCode}（两者相同，须认 code）`);
    },
    { timeout: 120000 },
  );
});
