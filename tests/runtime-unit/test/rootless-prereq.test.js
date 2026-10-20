/**
 * rootless 前置检查分类不变式 单元测试（ADR-0075 D11：完全无 root）
 *
 * 断言目标（checkPrerequisites 的 missing/notes 分类是「零管理员前置」的契约）：
 * 1. newuidmap/newgidmap/subuid/subgid 缺失**永不进 missing**（只进 notes）——
 *    包内镜像全部层文件均 0:0 属主（打包时归一化）且容器以 uid 0 运行，
 *    单段 0→euid 映射即够，缺它们不阻塞 rootless 启动
 * 2. missing 只可能含 rootless-ns 与 slirp4netns 两项（slirp 缺失可降级 plain-netns）
 * 3. 包内 rootless-ns 二进制缺失 → 进 missing（部署包不完整，硬失败）
 * 4. rootless-ns 架构与本机不符 → 进 missing（错架构二进制 exec 是 ENOEXEC）
 * 5. slirp4netns 系统/包内皆不可用 → 进 missing（可降级，不中止）
 *
 * 跨平台说明：rootless 栈只跑在 Linux，但本测试只验证「分类逻辑」，Windows 亦可跑：
 * - process.getuid 在 Windows 不存在 → 测试内临时覆盖为固定 uid
 * - which() 用 POSIX shell 语法（`2>/dev/null`），Windows cmd 下会在 cwd 建 `dev` 空文件
 *   → 测试期间 chdir 到临时目录隔离
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const rootless = require('../../../runtime/docker-runtime/lib/rootless');

/** 构造最小 ELF64 头（magic + class=2 + LE + e_machine），e_machine: 62=x86_64, 183=aarch64 */
function fakeElf(eMachine) {
  const buf = Buffer.alloc(20);
  buf.write('\x7fELF', 0, 'latin1');
  buf[4] = 2;
  buf[5] = 1;
  buf.writeUInt16LE(eMachine, 18);
  return buf;
}

const E_MACHINE = { x64: 62, arm64: 183 };

describe('rootless-prereq (ADR-0075 D11 完全无 root)', () => {
  let tmp;
  let cwd;
  let origGetuid;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rootless-prereq-'));
    cwd = process.cwd();
    process.chdir(tmp);
    origGetuid = process.getuid;
    process.getuid = () => 1000;
  });

  afterEach(() => {
    process.chdir(cwd);
    if (typeof origGetuid === 'function') {
      process.getuid = origGetuid;
    } else {
      delete process.getuid;
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  /** 在临时目录建 toolsDir，可选写入指定架构的 rootless-ns 假 ELF */
  function makeToolsDir({ nsArch = null } = {}) {
    const toolsDir = path.join(tmp, 'tools');
    fs.mkdirSync(toolsDir, { recursive: true });
    if (nsArch !== null) {
      fs.writeFileSync(path.join(toolsDir, 'rootless-ns'), fakeElf(nsArch));
    }
    return toolsDir;
  }

  function missingNames(r) {
    return r.missing.map((m) => m.name);
  }

  test('不变式: missing 只可能含 rootless-ns / slirp4netns（newuidmap/subuid 永不阻塞）', () => {
    const toolsDir = makeToolsDir({ nsArch: E_MACHINE[process.arch] ?? 62 });
    const r = rootless.checkPrerequisites({ toolsDir });
    for (const n of missingNames(r)) {
      expect(['rootless-ns', 'slirp4netns']).toContain(n);
    }
  });

  test('newuidmap/newgidmap/subuid/subgid 缺失只进 notes 不进 missing', () => {
    const toolsDir = makeToolsDir({ nsArch: E_MACHINE[process.arch] ?? 62 });
    const r = rootless.checkPrerequisites({ toolsDir });
    const names = missingNames(r);
    for (const n of ['newuidmap', 'newgidmap', 'subuid', 'subgid']) {
      expect(names).not.toContain(n);
    }
    // 环境自适应：本机确实没有 newuidmap 时，notes 必须给出单段映射说明
    if (!rootless._which('newuidmap')) {
      expect(r.notes.join('\n')).toMatch(/newuidmap/);
    }
  });

  test('包内 rootless-ns 缺失 → 进 missing（部署包不完整）', () => {
    const toolsDir = makeToolsDir({ nsArch: null });
    const r = rootless.checkPrerequisites({ toolsDir });
    expect(missingNames(r)).toContain('rootless-ns');
    expect(r.ok).toBe(false);
  });

  test('rootless-ns 架构与本机不符 → 进 missing（错架构 = ENOEXEC 无指向性报错）', () => {
    const want = E_MACHINE[process.arch];
    if (want === undefined) return; // 非 x64/arm64 平台（如 ia32）无对照架构
    const wrong = process.arch === 'x64' ? 183 : 62;
    const toolsDir = makeToolsDir({ nsArch: wrong });
    const r = rootless.checkPrerequisites({ toolsDir });
    const hit = r.missing.find((m) => m.name === 'rootless-ns');
    expect(hit).toBeDefined();
    expect(hit.hint).toMatch(/架构/);
  });

  test('架构匹配时 rootless-ns 不进 missing', () => {
    const want = E_MACHINE[process.arch];
    if (want === undefined) return;
    const toolsDir = makeToolsDir({ nsArch: want });
    const r = rootless.checkPrerequisites({ toolsDir });
    expect(missingNames(r)).not.toContain('rootless-ns');
  });

  test('slirp4netns 系统/包内皆不可用 → 进 missing（可降级 plain-netns）', () => {
    const toolsDir = makeToolsDir({ nsArch: E_MACHINE[process.arch] ?? 62 });
    // 环境自适应：仅当系统 PATH 无 slirp4netns 且包内未提供时断言
    if (rootless._which('slirp4netns') || fs.existsSync(path.join(toolsDir, 'slirp4netns'))) {
      return;
    }
    const r = rootless.checkPrerequisites({ toolsDir });
    expect(missingNames(r)).toContain('slirp4netns');
  });
});
