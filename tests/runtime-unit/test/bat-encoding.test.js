/**
 * .bat/.cmd 编码回归守卫
 *
 * cmd.exe 按系统 OEM 代码页（中文系统为 GBK）解析批处理文件。含中文的 .bat/.cmd
 * 若以 UTF-8（无 BOM）保存，中文字节被按 GBK 误读，行被撕碎成
 * '鍚屽钩鍙?Stop' / 'd' / 'xit' 等乱码命令（实例：stop.bat 模板 UTF-8 化后
 * 双击运行整段报错，停止服务失败）。
 *
 * 约定：含中文的 .bat/.cmd 一律 GBK 编码（与 start.bat / cloudcad.bat 一致），
 * 由 sync-brand.js 自动识别 GBK 并回写，品牌名同步不会破坏编码。
 * 本测试锁定该约定：任何含非 ASCII 字节的 .bat/.cmd 不得是合法 UTF-8。
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../../..');

/** 相对 ROOT 的正斜杠路径（Windows 下 path.relative 返回反斜杠，统一转换） */
function rel(p) {
  return path.relative(ROOT, p).split(path.sep).join('/');
}

/** 仓库跟踪的 .bat/.cmd 文件（git ls-files，天然排除 node_modules / 产物） */
function listTrackedBatchFiles() {
  const out = execFileSync('git', ['ls-files', '*.bat', '*.cmd'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((r) => path.join(ROOT, ...r.split('/')));
}

/** 文件是否为合法 UTF-8（fatal 解码不抛错即合法） */
function isValidUtf8(buf) {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buf);
    return true;
  } catch {
    return false;
  }
}

describe('.bat/.cmd 编码守卫', () => {
  it('仓库至少存在 start.bat / stop.bat 模板（防清单漂移）', () => {
    const files = listTrackedBatchFiles().map(rel);
    expect(files).toEqual(expect.arrayContaining([
      'scripts/pack-lib/templates/start.bat',
      'scripts/pack-lib/templates/stop.bat',
    ]));
  });

  it('含中文（非 ASCII 字节）的 .bat/.cmd 必须是 GBK 编码，禁止 UTF-8', () => {
    const offenders = [];
    for (const file of listTrackedBatchFiles()) {
      const buf = fs.readFileSync(file);
      const hasNonAscii = [...buf].some((b) => b > 0x7f);
      if (!hasNonAscii) continue; // 纯 ASCII 无编码问题
      if (isValidUtf8(buf)) {
        offenders.push(rel(file));
      }
    }
    // UTF-8 含中文的批处理会被 cmd 按 GBK 误读撕碎命令，必须为 GBK
    expect(offenders).toEqual([]);
  });
});
