/**
 * @fileoverview mxcad 运行时探针 + SystemLib 替换（ADR-0074 D6）
 *
 * 取代构建期按发行版硬编码的 SystemLib 替换（NEEDS_SYSTEM_LIB 缺陷）：
 * 用包内自带 1.dwg 做一次**真实转换**，成功 = 当前 mxcad 二进制在本机可用；
 * 失败才把 SystemLib/ 覆盖进 mxcad 目录并重试。
 *
 * 铁律对齐：
 * - 引擎启动与结果判定**只走** @cloudcad/engine-exec 的 runMxcadAssembly +
 *   interpretEngineRun（引擎唯一出口，禁止自写 spawn/判定分支）。
 * - 判据只认引擎 JSON stdout 的 code（interpretEngineRun 的 outcome.ok），
 *   **不按退出码**（mxcadAssembly 成败恒 2123）。
 * - 参数序列化沿用生产链路同一约定：Linux 单引号 JSON（buildEngineParams 生成
 *   低层小写参数形状，@cloudcad/contracts 唯一翻译点）。
 *
 * 已知局限（产品侧知情接受）：探针无法区分 glibc 失败与授权/机器码失败，
 * SystemLib 替换是启发式；两次都失败时不阻塞启动（转换不可用不影响登录与协同）。
 *
 * 仅依赖 node 内置 + 包内 engine-exec/contracts（由 deployDir 定位）。
 */

const fs = require('fs');
const path = require('path');

/**
 * 执行一次 1.dwg 真实转换探针。
 * @param {Object} deps { engineExec, contracts, bin, mxcadDir, outDir }
 * @returns {Promise<{ ok: boolean, category?: string, detail: string, salvaged?: boolean }>}
 */
async function runProbe({ engineExec, contracts, bin, mxcadDir, outDir }) {
  const srcFile = path.join(mxcadDir, '1.dwg');
  if (!fs.existsSync(srcFile)) {
    return { ok: false, category: 'probe-missing', detail: `探针源文件缺失：${srcFile}` };
  }
  if (!fs.existsSync(bin)) {
    return { ok: false, category: 'not-started', detail: `mxcadAssembly 不存在：${bin}` };
  }
  fs.mkdirSync(outDir, { recursive: true });

  const param = contracts.buildEngineParams({
    srcPath: srcFile,
    outPath: outDir,
    outName: 'probe.mxweb',
    compression: true,
  });
  // 参数序列化按宿主平台（与生产链路同一约定）：
  // - Linux：单引号 JSON（mxcadassembly 约定，与 backend 进程内 spawn 同一序列化）
  // - Windows：保留双引号 JSON——runMxcadAssembly 走 windowsVerbatimArguments 原样传参，
  //   引擎按原始命令行以双引号分词；单引号不被识别为定界符，部署路径含空格时参数会被拆散
  const paramStr =
    process.platform === 'win32' ? JSON.stringify(param) : JSON.stringify(param).replace(/"/g, "'");

  const runResult = await engineExec.runMxcadAssembly(bin, paramStr, {
    cwd: mxcadDir,
    timeoutMs: 60000,
  });
  const outcome = engineExec.interpretEngineRun(runResult, { param });

  if (outcome.ok) {
    return { ok: true, detail: '转换成功（code=0）', salvaged: outcome.salvaged };
  }
  const detail =
    outcome.rawFragment ||
    (outcome.result && outcome.result.message) ||
    runResult.stderr.slice(0, 300) ||
    runResult.stdout.slice(0, 300) ||
    '（无输出）';
  return { ok: false, category: outcome.category, detail: detail.slice(0, 500) };
}

/**
 * 完整探针流程：先试当前二进制，失败则 SystemLib 覆盖后重试。
 * 结果落标记文件（data/.systemlib-applied / data/.mxcad-unavailable），幂等。
 *
 * @param {Object} opts
 * @param {string} opts.deployDir 部署目录（定位包内 engine-exec/contracts）
 * @param {string} opts.mxcadDir runtime/linux/mxcad 目录
 * @param {string} opts.dataDir data/ 目录（标记文件与探针输出）
 * @param {Function} [log]
 * @returns {Promise<{ status: 'ok'|'ok-systemlib'|'unavailable', detail: string }>}
 */
async function probeAndFix({ deployDir, mxcadDir, dataDir, log = () => {} }) {
  // 引擎二进制名按宿主平台（#440：windows 宿主 = mxcadAssembly.exe）
  const bin = path.join(mxcadDir, process.platform === 'win32' ? 'mxcadAssembly.exe' : 'mxcadassembly');
  const systemLibDir = path.join(mxcadDir, 'SystemLib');
  const appliedMarker = path.join(dataDir, '.systemlib-applied');
  const unavailableMarker = path.join(dataDir, '.mxcad-unavailable');
  const outDir = path.join(dataDir, 'temp', 'probe');

  // 已判定过 → 直接复用结论（用户替换 mxcad 目录为正版后应删除 data/.systemlib-applied 重新探针）
  if (fs.existsSync(appliedMarker)) {
    const note = fs.readFileSync(appliedMarker, 'utf8').trim();
    log(`[mxcad-probe] 已有判定记录，跳过探针：${note}`);
    return { status: 'ok', detail: note };
  }
  if (fs.existsSync(unavailableMarker)) {
    const note = fs.readFileSync(unavailableMarker, 'utf8').trim();
    log(`[mxcad-probe] 上次探针判定 mxcad 不可用：${note}`);
    return { status: 'unavailable', detail: note };
  }

  let engineExec;
  let contracts;
  try {
    engineExec = require(path.join(deployDir, 'packages', 'engine-exec', 'dist', 'index.js'));
    contracts = require(path.join(deployDir, 'packages', 'contracts', 'dist', 'index.js'));
  } catch (err) {
    log(`[mxcad-probe] 引擎执行层加载失败，跳过探针（不影响启动）：${err.message}`);
    return { status: 'unavailable', detail: `引擎执行层加载失败：${err.message}` };
  }

  log('[mxcad-probe] 用 1.dwg 做真实转换探针...');
  let first = await runProbe({ engineExec, contracts, bin, mxcadDir, outDir });
  if (first.ok) {
    fs.writeFileSync(appliedMarker, `无需 SystemLib（${new Date().toISOString()}）：${first.detail}`);
    log(`[mxcad-probe] ✓ 当前 mxcad 二进制可用：${first.detail}`);
    return { status: 'ok', detail: first.detail };
  }
  log(`[mxcad-probe] 首次探针失败（${first.category}）：${first.detail}`);

  if (!fs.existsSync(systemLibDir)) {
    const note = `SystemLib 目录缺失且默认二进制不可用（${first.category}：${first.detail}）`;
    fs.writeFileSync(unavailableMarker, note);
    log(`[mxcad-probe] ✗ ${note}`);
    return { status: 'unavailable', detail: note };
  }

  log('[mxcad-probe] 用 SystemLib 覆盖 mxcad 目录后重试...');
  fs.cpSync(systemLibDir, mxcadDir, { recursive: true, force: true });
  // 覆盖进来的二进制补执行位（打包链路可能丢失）
  try {
    fs.chmodSync(bin, 0o755);
  } catch {
    // 忽略
  }
  const second = await runProbe({ engineExec, contracts, bin, mxcadDir, outDir });
  if (second.ok) {
    const note = `已应用 SystemLib（${new Date().toISOString()}）：${second.detail}`;
    fs.writeFileSync(appliedMarker, note);
    log(`[mxcad-probe] ✓ SystemLib 替换后转换成功：${second.detail}`);
    return { status: 'ok-systemlib', detail: note };
  }

  const note =
    `两次探针均失败（首次 ${first.category}：${first.detail}；` +
    `SystemLib 后 ${second.category}：${second.detail}）。` +
    '可能原因：glibc 不兼容，或授权/机器码问题（探针无法区分）。转换功能不可用，登录与协同不受影响。';
  fs.writeFileSync(unavailableMarker, note);
  log(`[mxcad-probe] ✗ ${note}`);
  return { status: 'unavailable', detail: note };
}

module.exports = { runProbe, probeAndFix };
