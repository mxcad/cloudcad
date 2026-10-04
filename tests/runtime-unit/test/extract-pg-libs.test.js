/**
 * extract-linux-runtime.js 的 PostgreSQL 库提取单元测试
 *
 * 断言目标（部署包去 JIT：libLLVM-15.so.1 ~112M + bitcode ~26M 合计 ~138M 死重）：
 * 1. isJitLib 识别 libLLVM-* / llvmjit*，放行其余 so
 * 2. isPgSoFile 区分 yum 版（仅 .so）与 apt 版（含 libfoo.so.N）语义
 * 3. copyPgLibs 实跑排除：libLLVM/llvmjit/bitcode 不进包，pgxs 与其余 so 保留
 * 4. 源目录缺失时不抛错（与原 shell cp 的 `|| true` 容错语义一致）
 *
 * 必须在复制阶段排除而非事后删：collectLibDependencies 会遍历 libDir 里所有
 * *.so* 跑 ldd，若 llvmjit.so 留在目录里会把 libLLVM 当 DT_NEEDED 依赖拷回来。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  isJitLib,
  isPgSoFile,
  copyPgLibs,
} = require('../../../scripts/extract-linux-runtime');

const created = [];
afterAll(() => {
  for (const d of created) fs.rmSync(d, { recursive: true, force: true });
});

function mkdtemp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-libs-'));
  created.push(d);
  return d;
}

/** 建真实文件（稀疏分配，仅占元数据） */
function put(dir, rel) {
  const p = path.join(dir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, 'x');
  return p;
}

describe('isJitLib', () => {
  it('识别 JIT 组件', () => {
    expect(isJitLib('libLLVM-15.so.1')).toBe(true);
    expect(isJitLib('llvmjit.so')).toBe(true);
    expect(isJitLib('llvmjit.so.1')).toBe(true);
  });

  it('放行非 JIT 库', () => {
    expect(isJitLib('libpq.so.5')).toBe(false);
    expect(isJitLib('libcrypto.so.3')).toBe(false);
    expect(isJitLib('libicuuc.so.70')).toBe(false);
  });
});

describe('isPgSoFile', () => {
  it('includeVersioned=false 只认 .so 结尾（yum 版语义）', () => {
    expect(isPgSoFile('libpq.so', false)).toBe(true);
    expect(isPgSoFile('libpq.so.5', false)).toBe(false);
  });

  it('includeVersioned=true 含 libfoo.so.N（apt 版语义）', () => {
    expect(isPgSoFile('libpq.so', true)).toBe(true);
    expect(isPgSoFile('libpq.so.5', true)).toBe(true);
    expect(isPgSoFile('libpq.so.5.14.1', true)).toBe(true);
  });

  it('目录名与无关文件不放行', () => {
    expect(isPgSoFile('pgxs', true)).toBe(false);
    expect(isPgSoFile('bitcode', true)).toBe(false);
    expect(isPgSoFile('libpq.a', true)).toBe(false);
    expect(isPgSoFile('README', true)).toBe(false);
  });
});

describe('copyPgLibs', () => {
  it('排除 libLLVM/llvmjit/bitcode，保留其余 so 与 pgxs', () => {
    const src = mkdtemp();
    const dst = mkdtemp();
    put(src, 'libLLVM-15.so.1');
    put(src, 'llvmjit.so');
    put(src, 'libpq.so');
    put(src, 'libpq.so.5');
    put(src, 'libcrypto.so.3');
    put(src, 'bitcode/OpenSSL/bitcode.bc');
    put(src, 'pgxs/Makefile.global');

    copyPgLibs(src, dst);

    expect(fs.readdirSync(dst).sort()).toEqual([
      'libcrypto.so.3',
      'libpq.so',
      'libpq.so.5',
      'pgxs',
    ]);
  });

  it('includeVersioned=false 只拷 .so 结尾', () => {
    const src = mkdtemp();
    const dst = mkdtemp();
    put(src, 'libpq.so');
    put(src, 'libpq.so.5');
    put(src, 'libLLVM-15.so.1');

    copyPgLibs(src, dst, { includeVersioned: false });

    expect(fs.readdirSync(dst)).toEqual(['libpq.so']);
  });

  it('源目录不存在时不抛错且目标保持为空', () => {
    const dst = mkdtemp();
    expect(() =>
      copyPgLibs(path.join(os.tmpdir(), 'no-such-pglib'), dst)
    ).not.toThrow();
    expect(fs.readdirSync(dst)).toEqual([]);
  });

  it('bitcode 即使存在也绝不进入 libDir（JIT 编译支撑）', () => {
    const src = mkdtemp();
    const dst = mkdtemp();
    put(src, 'bitcode/llvm/ir/bitcode.ll');
    put(src, 'libpq.so.5');

    copyPgLibs(src, dst);

    expect(fs.existsSync(path.join(dst, 'bitcode'))).toBe(false);
    expect(fs.readdirSync(dst)).toEqual(['libpq.so.5']);
  });
});
