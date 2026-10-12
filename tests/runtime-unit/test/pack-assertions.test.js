/**
 * 出包前门禁纯判定 + 共享删除策略 单元测试（架构审查 ⑪ C9）
 *
 * 断言目标：
 * 1. checkDeployStore：store 缺失 / 缺 v3/files / 包数<100 / 包数>=100 四分支
 * 2. findMissingWindowsComponents：全缺失返回 5 项、齐全返回空
 * 3. findMissingLinuxComponents：按清单判定缺失（存在的放过、缺失的列出）
 * 4. checkScriptLineEndings：bat 独立 LF / sh 含 CR / 干净无 BOM / BOM / 子目录递归 / 目录不存在跳过
 * 5. removeJunkWithSudoFallback：删除成功回调 + 空列表无操作 + win32 被占用目录失败分支
 *    （sudo 分支需 root、非 sudo 失败分支 linux 下无法确定性触发，均不在此测）
 * 6. enableImplInEnvExample：裸设置行 # IMPL= → IMPL=1；文档/示例注释行不动；已激活幂等
 * 7. resolveMobileAccessPath：缺文件/字段非字符串/JSON 损坏均回落 mxcad_mobile
 * 8. findMissingKeyArtifacts：齐全/缺项/空目录/移动端合并目录/variant/private impl-mx
 *
 * 这些纯函数从 pack-offline.js（2390 行编排器）抽出，此前唯一测试方式是打完整包。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  checkDeployStore,
  findMissingWindowsComponents,
  findMissingLinuxComponents,
  checkScriptLineEndings,
  removeJunkWithSudoFallback,
  resolveMobileAccessPath,
  findMissingKeyArtifacts,
  enableImplInEnvExample,
} = require('../../../scripts/pack-lib/pack-assertions');

describe('pack-assertions', () => {
  let tmp;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-assert-'));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  describe('checkDeployStore', () => {
    it('store 目录不存在 → invalid（不存在）', () => {
      const r = checkDeployStore(path.join(tmp, 'nope'));
      expect(r.valid).toBe(false);
      expect(r.reason).toMatch(/不存在/);
    });

    it('缺 v3/files → invalid', () => {
      const store = path.join(tmp, 'store');
      fs.mkdirSync(store, { recursive: true });
      const r = checkDeployStore(store);
      expect(r.valid).toBe(false);
      expect(r.reason).toMatch(/v3\/files/);
    });

    it('包数 <100 → invalid（不符合预期）', () => {
      const filesDir = path.join(tmp, 'store', 'v3', 'files');
      fs.mkdirSync(filesDir, { recursive: true });
      fs.writeFileSync(path.join(filesDir, 'a'), 'x');
      const r = checkDeployStore(path.join(tmp, 'store'));
      expect(r.valid).toBe(false);
      expect(r.reason).toMatch(/不符合预期/);
    });

    it('包数 >=100 → valid + count', () => {
      const filesDir = path.join(tmp, 'store', 'v3', 'files');
      fs.mkdirSync(filesDir, { recursive: true });
      for (let i = 0; i < 100; i++) fs.writeFileSync(path.join(filesDir, `f${i}`), 'x');
      const r = checkDeployStore(path.join(tmp, 'store'));
      expect(r.valid).toBe(true);
      expect(r.count).toBe(100);
    });
  });

  describe('findMissingWindowsComponents', () => {
    const LAYOUT = [
      'node/node.exe',
      'node/node_modules/pm2/bin/pm2',
      'postgresql/pgsql/bin/initdb.exe',
      'postgresql/pgsql/bin/pg_ctl.exe',
      'redis/redis-server.exe',
    ];

    it('全缺失 → 5 项（runtime/windows/ 前缀）', () => {
      const dir = path.join(tmp, 'runtime', 'windows');
      fs.mkdirSync(dir, { recursive: true });
      const missing = findMissingWindowsComponents(dir);
      expect(missing).toHaveLength(5);
      for (const m of missing) expect(m).toMatch(/^runtime\/windows\//);
    });

    it('齐全 → 空', () => {
      const dir = path.join(tmp, 'runtime', 'windows');
      for (const rel of LAYOUT) {
        const p = path.join(dir, rel);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, 'x');
      }
      expect(findMissingWindowsComponents(dir)).toHaveLength(0);
    });
  });

  describe('findMissingLinuxComponents', () => {
    it('存在的放过、缺失的列出（runtime/linux/ 前缀）', () => {
      const dir = path.join(tmp, 'runtime', 'linux');
      const req = ['node/bin/node', 'redis/redis-server'];
      const nodeBin = path.join(dir, 'node', 'bin');
      fs.mkdirSync(nodeBin, { recursive: true });
      fs.writeFileSync(path.join(nodeBin, 'node'), 'x');
      // redis/redis-server 缺失
      const missing = findMissingLinuxComponents(dir, req);
      expect(missing).toEqual(['runtime/linux/redis/redis-server']);
    });

    it('全存在 → 空', () => {
      const dir = path.join(tmp, 'runtime', 'linux');
      const req = ['node/bin/node'];
      fs.mkdirSync(path.join(dir, 'node', 'bin'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'node', 'bin', 'node'), 'x');
      expect(findMissingLinuxComponents(dir, req)).toHaveLength(0);
    });
  });

  describe('checkScriptLineEndings', () => {
    it('bat 含独立 LF → 报「独立 LF」', () => {
      const dir = path.join(tmp, 'scripts');
      fs.mkdirSync(dir, { recursive: true });
      // 第二行是独立 LF（前一行 CRLF，此行只有 \n 无 \r）
      fs.writeFileSync(path.join(dir, 'a.bat'), 'echo hi\r\necho bad\n');
      const problems = checkScriptLineEndings([dir], tmp);
      expect(problems.some((p) => p.includes('独立 LF'))).toBe(true);
    });

    it('sh 含 CR → 报「CR」', () => {
      const dir = path.join(tmp, 'scripts');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'a.sh'), 'echo hi\r\n');
      const problems = checkScriptLineEndings([dir], tmp);
      expect(problems.some((p) => p.includes('CR'))).toBe(true);
    });

    it('bat=CRLF + sh=LF 且无 BOM → 无 problem', () => {
      const dir = path.join(tmp, 'scripts');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'a.bat'), 'echo hi\r\n');
      fs.writeFileSync(path.join(dir, 'b.sh'), 'echo hi\n');
      expect(checkScriptLineEndings([dir], tmp)).toHaveLength(0);
    });

    it('含 BOM → 报「BOM」', () => {
      const dir = path.join(tmp, 'scripts');
      fs.mkdirSync(dir, { recursive: true });
      // 写入真正的 BOM 字节（0xEF 0xBB 0xBF）；字符串 '\xef\xbb\xbf' 经 utf8 编码会变多字节，非 BOM
      const buf = Buffer.concat([
        Buffer.from([0xef, 0xbb, 0xbf]),
        Buffer.from('echo hi\n', 'utf8'),
      ]);
      fs.writeFileSync(path.join(dir, 'a.sh'), buf);
      const problems = checkScriptLineEndings([dir], tmp);
      expect(problems.some((p) => p.includes('BOM'))).toBe(true);
    });

    it('子目录递归：深层脚本也被扫描', () => {
      const nested = path.join(tmp, 'scripts', 'nested');
      fs.mkdirSync(nested, { recursive: true });
      // 深层 sh 含 CR → 应被递归检出
      fs.writeFileSync(path.join(nested, 'deep.sh'), 'echo hi\r\n');
      const problems = checkScriptLineEndings([path.join(tmp, 'scripts')], tmp);
      expect(problems.some((p) => p.includes('CR'))).toBe(true);
    });

    it('目录不存在 → 跳过（不抛错、无 problem）', () => {
      expect(checkScriptLineEndings([path.join(tmp, 'nope')], tmp)).toHaveLength(0);
    });
  });

  describe('removeJunkWithSudoFallback', () => {
    it('删除存在的项，onItem 回调（viaSudo=false），failed 空', () => {
      const dir = path.join(tmp, 'junk');
      fs.mkdirSync(dir, { recursive: true });
      const f = path.join(dir, 'a.txt');
      fs.writeFileSync(f, 'x');
      const calls = [];
      const { failed, usedSudo } = removeJunkWithSudoFallback([f], {
        onItem: (p, viaSudo) => calls.push([path.basename(p), viaSudo]),
      });
      expect(failed).toHaveLength(0);
      expect(usedSudo).toBe(false);
      expect(calls).toEqual([['a.txt', false]]);
      expect(fs.existsSync(f)).toBe(false);
    });

    it('空列表 → 无操作（failed 空、usedSudo false）', () => {
      const { failed, usedSudo } = removeJunkWithSudoFallback([]);
      expect(failed).toHaveLength(0);
      expect(usedSudo).toBe(false);
    });

    // 非 sudo 失败分支（failed.push）：win32 下删除被占用目录抛 ENOTEMPTY（非 EACCES/EPERM，
    // 不进 sudo 重试）→ 记入 failed。linux 下 rmSync 对打开句柄的目录直接成功，无法确定性
    // 触发，故仅 win32 测（sudo 分支需 root，亦不在此测）。
    const itOnWin = process.platform === 'win32' ? it : it.skip;
    itOnWin('win32: 删除被占用目录 → failed 记录（非 sudo 失败分支）', () => {
      const dir = path.join(tmp, 'locked');
      fs.mkdirSync(dir, { recursive: true });
      const f = path.join(dir, 'keep.txt');
      fs.writeFileSync(f, 'x');
      const fd = fs.openSync(f, 'r');
      let result;
      try {
        result = removeJunkWithSudoFallback([dir]);
      } finally {
        fs.closeSync(fd);
      }
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]).toMatch(/^locked/);
      expect(result.usedSudo).toBe(false);
    });
  });

  describe('enableImplInEnvExample', () => {
    // 真实 .env.example 的 IMPL 段（与 packages/backend/.env.example 保持同步，防模板漂移）
    const IMPL_SECTION = [
      '# 自定义认证实现模块路径（可选）',
      '# 为空则使用内置默认认证实现（auth/impl/index.ts 的 createDefaultAuthProviders）',
      '# IMPL=true 或 IMPL=1 → 加载私有包默认路径 packages/impl-mx/dist',
      '# 其他值 → 任意绝对/相对路径，从该模块加载 createAuthProviders()/createRealProviders() 导出的 Provider',
      '# 例如: IMPL=./dist/auth/impl-custom/index.js',
      '# IMPL=',
      '',
      '# ============================================',
    ].join('\n');

    it('裸设置行 # IMPL= → IMPL=1（文档/示例注释行不动）', () => {
      const { content, changed } = enableImplInEnvExample(IMPL_SECTION);
      expect(changed).toBe(true);
      expect(content).not.toContain('# IMPL=\n');
      expect(content).toContain('# IMPL=true 或 IMPL=1 → 加载私有包默认路径 packages/impl-mx/dist');
      expect(content).toContain('# 例如: IMPL=./dist/auth/impl-custom/index.js');
      // 设置行后的空行与分节线不丢失
      expect(content).toContain('IMPL=1\n\n# ============================================');
    });

    it('已激活（IMPL=1）→ 幂等无变化', () => {
      const once = enableImplInEnvExample(IMPL_SECTION);
      const twice = enableImplInEnvExample(once.content);
      expect(twice.changed).toBe(false);
      expect(twice.content).toBe(once.content);
    });

    it('无 IMPL 行 → 无变化', () => {
      const content = 'FOO=1\n# FOO=2\n';
      const r = enableImplInEnvExample(content);
      expect(r.changed).toBe(false);
      expect(r.content).toBe(content);
    });

    it('裸设置行带尾随空白也识别（# IMPL=   ）', () => {
      const r = enableImplInEnvExample('A=1\n# IMPL=   \nB=2\n');
      expect(r.changed).toBe(true);
      expect(r.content).toBe('A=1\nIMPL=1\nB=2\n');
    });
  });

  describe('resolveMobileAccessPath', () => {
    const iniDir = () => path.join(tmp, 'packages', 'frontend', 'public', 'ini');
    const writeConfig = (value) => {
      fs.mkdirSync(iniDir(), { recursive: true });
      fs.writeFileSync(
        path.join(iniDir(), 'myServerConfig.json'),
        JSON.stringify({ mobileAccessPath: value })
      );
    };

    it('配置文件不存在 → 默认 mxcad_mobile', () => {
      expect(resolveMobileAccessPath(path.join(tmp, 'nope'))).toBe('mxcad_mobile');
    });

    it('读取 myServerConfig.json 的 mobileAccessPath', () => {
      writeConfig('mx_mobile');
      expect(resolveMobileAccessPath(tmp)).toBe('mx_mobile');
    });

    it('字段非字符串 → 默认值', () => {
      writeConfig(42);
      expect(resolveMobileAccessPath(tmp)).toBe('mxcad_mobile');
    });

    it('JSON 损坏 → 默认值（不抛错）', () => {
      fs.mkdirSync(iniDir(), { recursive: true });
      fs.writeFileSync(path.join(iniDir(), 'myServerConfig.json'), '{ not json');
      expect(resolveMobileAccessPath(tmp)).toBe('mxcad_mobile');
    });
  });

  describe('findMissingKeyArtifacts', () => {
    // 建一个"非空目录"（含 1 个文件）
    const fill = (rel) => {
      const p = path.join(tmp, ...rel.split('/'));
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, 'x');
    };
    // 齐全（oss）：backend/db/contracts/frontend/conversion-service dist + 移动端合并目录
    const fillAll = (mobile = 'mxcad_mobile') => {
      fill('packages/backend/dist/a.js');
      fill('packages/db/dist/a.js');
      fill('packages/contracts/dist/a.js');
      fill('packages/frontend/dist/index.html');
      fill('packages/conversion-service/dist/server.js');
      fill('packages/frontend/dist/' + mobile + '/index.html');
    };
    // 除移动端合并目录外的 5 项
    const fillNonMobile = () => {
      fill('packages/backend/dist/a.js');
      fill('packages/db/dist/a.js');
      fill('packages/contracts/dist/a.js');
      fill('packages/frontend/dist/index.html');
      fill('packages/conversion-service/dist/server.js');
    };

    it('齐全 → 空', () => {
      fillAll();
      expect(findMissingKeyArtifacts(tmp, 'oss', 'mxcad_mobile')).toHaveLength(0);
    });

    it('缺 frontend/dist → 列出（正斜杠相对路径，移动端合并目录随之缺失）', () => {
      // 移动端合并目录位于 frontend/dist 之内，故只填其余 4 项、不建 frontend/dist
      fill('packages/backend/dist/a.js');
      fill('packages/db/dist/a.js');
      fill('packages/contracts/dist/a.js');
      fill('packages/conversion-service/dist/server.js');
      const missing = findMissingKeyArtifacts(tmp, 'oss', 'mxcad_mobile');
      expect(missing).toContain('packages/frontend/dist');
      expect(missing).toContain('packages/frontend/dist/mxcad_mobile');
    });

    it('目录存在但为空也算缺失（vite 半途失败会留空 dist）', () => {
      fill('packages/db/dist/a.js');
      fill('packages/contracts/dist/a.js');
      fill('packages/frontend/dist/index.html');
      fill('packages/frontend/dist/mxcad_mobile/index.html');
      fill('packages/conversion-service/dist/server.js');
      // backend/dist 存在但完全为空 → 仍应判定为缺失
      fs.mkdirSync(path.join(tmp, 'packages', 'backend', 'dist'), { recursive: true });
      const missing = findMissingKeyArtifacts(tmp, 'oss', 'mxcad_mobile');
      expect(missing).toContain('packages/backend/dist');
    });

    it('缺移动端合并目录 → 列出', () => {
      fillNonMobile();
      const missing = findMissingKeyArtifacts(tmp, 'oss', 'mxcad_mobile');
      expect(missing).toContain('packages/frontend/dist/mxcad_mobile');
    });

    it('mobileAccessPath 生效（自定义子目录名）', () => {
      fillAll('mx_mobile');
      expect(findMissingKeyArtifacts(tmp, 'oss', 'mx_mobile')).toHaveLength(0);
      // 同一目录按 mxcad_mobile 判定即为缺失
      expect(findMissingKeyArtifacts(tmp, 'oss', 'mxcad_mobile')).toContain(
        'packages/frontend/dist/mxcad_mobile'
      );
    });

    it('private 变体额外检查 impl-mx/dist', () => {
      fillAll();
      expect(findMissingKeyArtifacts(tmp, 'private', 'mxcad_mobile')).toEqual([
        'packages/impl-mx/dist',
      ]);
    });

    it('oss 变体不检查 impl-mx/dist（存在与否都不影响）', () => {
      fillAll();
      fill('packages/impl-mx/dist/a.js');
      expect(findMissingKeyArtifacts(tmp, 'oss', 'mxcad_mobile')).toHaveLength(0);
    });

    it('全部缺失 → 6 项（oss）/ 7 项（private）', () => {
      expect(findMissingKeyArtifacts(tmp, 'oss', 'mxcad_mobile')).toHaveLength(6);
      expect(findMissingKeyArtifacts(tmp, 'private', 'mxcad_mobile')).toHaveLength(7);
    });
  });
});