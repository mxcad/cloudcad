/**
 * 梦想网页CAD实时协同平台 统一打包脚本（仅部署包 / 升级包，已移除离线开发包）
 *
 * 功能：
 * 1. 部署包模式: 构建产物 + 生产依赖 store + runtime 二进制（新部署用）
 * 2. 升级包模式: 业务产物全集（dist/migrations/scripts），不含 store，解压覆盖即升级
 *    依赖复用目标机既有部署包 store 离线补装（路线 B，首次部署必须用部署包打底）
 *
 * 使用方式：
 *   node scripts/pack-offline.js --deploy        # 部署包，当前平台
 *   node scripts/pack-offline.js --deploy --win  # 部署包，Windows
 *   node scripts/pack-offline.js --upgrade       # 升级包，当前平台
 *   node scripts/pack-offline.js --upgrade --win # 升级包，Windows
 *   node scripts/pack-offline.js --upgrade --linux --variant private  # 升级包（Linux 闭源）
 *
 * 注意：
 *   start.bat 会自动检测是否有构建产物，决定进入交互式菜单还是部署模式
 *   升级包前置条件：目标机已用同平台/variant 的部署包部署过（生成 dist 与 store 基线）
 *
 * 打包排除：
 *   复制时应用 scripts/pack-lib/packignore.json 过滤（类 .gitignore 但极简）。
 *   默认排除 mxcad/tool 目录与 mxcad/files 内的保密图纸（.mxweb，files 保留空目录）。
 *   需增删排除项时，直接编辑该 JSON 即可，无需构建。
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawn } = require('child_process');
const crypto = require('crypto');

// 打包清单单一事实源（全量部署包 / 增量升级包 共享条目，P9 收敛双清单硬编码）
const {
  getDeployIncludeList: getDeployIncludeListFromManifest,
  getUpgradeIncludeList: getUpgradeIncludeListFromManifest,
} = require('./pack-lib/manifest');

// 打包排除规则（类 .gitignore 但极简：配置见 scripts/pack-lib/packignore.json）
const {
  isExcluded,
  isKeepEmptyDir,
  isKeepEmptyFile,
} = require('./pack-lib/packignore');

// ==================== 配置 ====================

const PROJECT_ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'release');

// 支持的 Linux OS 变体（与 pack-linux-deploy.js --os 保持一致）
const SUPPORTED_OS = ['centos7', 'debian', 'ubuntu22', 'ubuntu24', 'rocky8', 'rocky9'];

const PACKAGE_JSON = require(path.join(PROJECT_ROOT, 'package.json'));
const VERSION = PACKAGE_JSON.version || '1.0.0';
const DATE = new Date().toISOString().slice(0, 10).replace(/-/g, '');

// 品牌单一事实源（runtime/scripts/lib/branding.js）
const { PRODUCT_NAME } = require('../runtime/scripts/lib/branding');

// ==================== 公共工具函数 ====================

// ==================== 公共工具函数 ====================

function log(msg) {
  console.log(`[Pack] ${msg}`);
}
function error(msg) {
  console.error(`[Pack] ERROR: ${msg}`);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getArchName() {
  const archMap = {
    x64: 'x86_64',
    arm64: 'aarch64',
    arm: 'armv7l',
    ia32: 'i686',
  };
  return archMap[process.arch] || process.arch;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function find7z() {
  if (os.platform() === 'win32') {
    const candidates = [
      'C:\\Program Files\\7-Zip\\7z.exe',
      'C:\\Program Files (x86)\\7-Zip\\7z.exe',
      path.join(
        os.homedir(),
        'AppData',
        'Local',
        'Programs',
        '7-Zip',
        '7z.exe'
      ),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    try {
      const result = execSync('where 7z', {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const found = result.trim().split('\n')[0];
      if (found && fs.existsSync(found)) return found;
    } catch (e) {
      /* ignore */
    }
  } else {
    const candidates = [
      '/usr/bin/7z',
      '/usr/local/bin/7z',
      '/usr/bin/7za',
      '/usr/local/bin/7za',
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

function calcLockHash() {
  const lockFile = path.join(PROJECT_ROOT, 'pnpm-lock.yaml');
  if (!fs.existsSync(lockFile)) return null;
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(lockFile))
    .digest('hex');
}

/**
 * 打包完成后恢复开发环境 node_modules
 *
 * 打包流程（prepareDeployStore）会以 --prod 模式重建工作区
 * node_modules（并清理 root/packages 的 node_modules），破坏开发环境（缺 devDependencies）。
 * 此函数同步执行完整恢复：pnpm install --frozen-lockfile + 重新生成
 * Prisma Client 并编译进 db/dist（db 包无 postinstall，pnpm install 不会自动生成，
 * 且 @cloudcad/db 无 postinstall 时 client 必须显式 db:generate + build 才会进入 dist）。
 * 执行时注入 CI=true，令 pnpm 跳过 "Proceed? (Y/n)" 等交互确认，避免打包流程被挂起。
 * 恢复失败不阻断打包结果，但需明确告警。
 * 仅 Windows 开发机生效（Linux 容器内为一次性环境，容器销毁即恢复；且容器内无 dev 场景）。
 */
function restoreNodeModules() {
  if (os.platform() !== 'win32') return;

  const logFile = path.join(OUTPUT_DIR, 'node_modules-restore.log');
  ensureDir(OUTPUT_DIR);

  // 打包（prepareDeployStore 的 --store-dir install）会以 --prod 重建 workspace
  // node_modules、剔除 devDependencies（jest 等），波及所有 workspace 包（含 tests/*）。
  // 这里同步执行完整恢复，确保打包结束后开发环境（dev 依赖 + Prisma Client）完整可用。
  log('恢复开发环境（pnpm install + Prisma Client 重新生成）...');
  const steps = [
    'pnpm install --frozen-lockfile',
    'pnpm --filter backend db:generate',
    'pnpm --filter @cloudcad/db build',
  ];
  const env = { ...process.env, CI: 'true' };
  for (const cmd of steps) {
    try {
      execSync(cmd, {
        cwd: PROJECT_ROOT,
        stdio: 'inherit',
        encoding: 'utf8',
        env,
      });
    } catch (err) {
      // 恢复失败不应阻断打包结果，但需明确告警
      fs.appendFileSync(
        logFile,
        `[${new Date().toISOString()}] FAIL: ${cmd}\n${(err.stderr || err.message || '').toString()}\n`
      );
      log(`⚠ 开发环境恢复步骤失败（${cmd}），详见 ${logFile}`);
      return;
    }
  }
  fs.appendFileSync(logFile, `[${new Date().toISOString()}] 开发环境恢复完成\n`);
  log('✓ 开发环境恢复完成');
}

/**
 * 清理 node_modules
 */
function cleanNodeModules(skipRoot = false) {
  const paths = [
    ...(skipRoot ? [] : [path.join(PROJECT_ROOT, 'node_modules')]),
    path.join(PROJECT_ROOT, 'packages', 'backend', 'node_modules'),
    path.join(PROJECT_ROOT, 'packages', 'frontend', 'node_modules'),
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) {
      try {
        fs.rmSync(p, { recursive: true, force: true });
        log(`清理 ${path.relative(PROJECT_ROOT, p)}`);
      } catch (e) {
        log(`警告: 无法清理 ${path.relative(PROJECT_ROOT, p)}`);
      }
    }
  }
}

/**
 * 复制目录（递归）
 * @param {string} src 源目录（绝对路径）
 * @param {string} dest 目标目录（绝对路径）
 * @param {string} [relPath=''] 源目录相对 PROJECT_ROOT 的路径（用于打包排除匹配）
 */
function copyDir(src, dest, relPath = '') {
  // 打包排除：整棵目录完全排除（不创建）
  if (isExcluded(relPath)) {
    log(`排除（不打包）: ${relPath}/`);
    return;
  }
  // 打包排除：保留空目录（目录创建，内容不复制）
  if (isKeepEmptyDir(relPath)) {
    ensureDir(dest);
    log(`保留空目录（内容不打包）: ${relPath}/`);
    return;
  }

  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    const entryRel = relPath ? `${relPath}/${entry.name}` : entry.name;

    // 处理符号链接（pnpm node_modules 结构）
    if (entry.isSymbolicLink()) {
      const linkTarget = fs.readlinkSync(srcPath);
      // 如果链接目标是目录，递归复制实际内容
      const realPath = fs.realpathSync(srcPath);
      if (fs.statSync(realPath).isDirectory()) {
        copyDir(realPath, destPath, entryRel);
      } else {
        // 文件链接，复制实际文件
        if (!isExcluded(entryRel) && !isKeepEmptyFile(entryRel)) {
          fs.copyFileSync(realPath, destPath);
        }
      }
    } else if (entry.isDirectory()) {
      copyDir(srcPath, destPath, entryRel);
    } else {
      // 打包排除：文件不打包
      if (isExcluded(entryRel)) {
        log(`排除（不打包）: ${entryRel}`);
        continue;
      }
      if (isKeepEmptyFile(entryRel)) {
        log(`排除（不打包）: ${entryRel}`);
        continue;
      }
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * 压缩目录
 * @param {string} sourceDir - 要压缩的目录
 * @param {string} outputPath - 输出文件路径
 * @param {string} format - 压缩格式: '7z', 'tar.gz', 'zip'
 */
async function createArchive(sourceDir, outputPath, format = null) {
  // 根据文件扩展名或参数确定格式
  if (!format) {
    if (outputPath.endsWith('.tar.gz') || outputPath.endsWith('.tgz')) {
      format = 'tar.gz';
    } else if (outputPath.endsWith('.7z')) {
      format = '7z';
    } else {
      format = 'zip';
    }
  }

  if (format === 'tar.gz') {
    return createTarGzArchive(sourceDir, outputPath);
  }

  const sevenZip = find7z();

  if (sevenZip && format === '7z') {
    return create7zArchive(sevenZip, sourceDir, outputPath);
  } else {
    log('未找到 7-Zip 或使用 zip 格式...');
    return createZipArchive(sourceDir, outputPath.replace(/\.7z$/, '.zip'));
  }
}

/**
 * 创建 tar.gz 压缩包（Linux 默认格式，无需额外工具）
 */
function createTarGzArchive(sourceDir, outputPath) {
  return new Promise((resolve, reject) => {
    log('创建 tar.gz 压缩包...');

    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }

    // 使用 tar 命令（Windows 10+ 自带，Linux/macOS 原生支持）
    const tarArgs = ['-czf', outputPath, '.'];

    const proc = spawn('tar', tarArgs, {
      cwd: sourceDir,
      stdio: 'inherit',
      shell: true,
    });

    proc.on('close', (code) => {
      if (code === 0) {
        try {
          const stat = fs.statSync(outputPath);
          if (stat.size > 0) {
            resolve(outputPath);
            return;
          }
        } catch (e) {}
      }
      reject(new Error(`tar 退出码: ${code}`));
    });

    proc.on('error', reject);
  });
}

function create7zArchive(sevenZip, sourceDir, outputPath) {
  return new Promise((resolve, reject) => {
    log(`使用 7-Zip: ${sevenZip}`);

    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }

    const args = [
      'a',
      '-t7z',
      '-mx=5',
      '-m0=lzma2',
      '-mmt=on',
      outputPath,
      '.',
    ];

    const proc = spawn(`"${sevenZip}"`, args, {
      cwd: sourceDir,
      stdio: 'inherit',
      shell: true,
    });

    proc.on('close', (code) => {
      if (code === 0 || code === 1) {
        try {
          const stat = fs.statSync(outputPath);
          if (stat.size > 0) {
            resolve(outputPath);
            return;
          }
        } catch (e) {}
      }
      reject(new Error(`7z 退出码: ${code}`));
    });

    proc.on('error', reject);
  });
}

function createZipArchive(sourceDir, outputPath) {
  return new Promise((resolve, reject) => {
    let archiver;
    try {
      archiver = require('archiver');
    } catch (e) {
      try {
        archiver = require(
          path.join(
            PROJECT_ROOT,
            'packages',
            'backend',
            'node_modules',
            'archiver'
          )
        );
      } catch (e2) {
        reject(new Error('archiver 模块未安装，请运行: pnpm add archiver -D'));
        return;
      }
    }

    log('使用 archiver 创建 zip...');

    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve(outputPath));
    archive.on('error', reject);
    archive.pipe(output);

    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

// ==================== 部署包 ====================

/**
 * 部署包需要包含的文件（正向列表）
 * start.bat 会自动检测是否有构建产物，决定进入部署模式还是交互式菜单
 */
function getDeployIncludeList(platform, variant = 'oss') {
  // 清单单一事实源见 scripts/pack-lib/manifest.js（P9 收敛双清单硬编码）
  return getDeployIncludeListFromManifest(platform, variant);
}

/**
 * 部署包：安装完整依赖
 */
async function installFullDeps(variant = 'oss') {
  cleanNodeModules(true);

  // conversion-service 现依赖 @cloudcad/contracts（ADR-0069），与 backend 一样须在 install
  // filter 内，否则打包机建不出它的 workspace 链接；构建它还需要 typescript（devDep）。
  const filter = variant === 'private'
    ? 'pnpm install --frozen-lockfile --filter backend --filter @cloudcad/mx-version-tool --filter @cloudcad/config-service --filter @cloudcad/db --filter @cloudcad/contracts --filter @cloudcad/conversion-service --filter @cloudcad/impl-mx'
    : 'pnpm install --frozen-lockfile --filter backend --filter @cloudcad/mx-version-tool --filter @cloudcad/config-service --filter @cloudcad/db --filter @cloudcad/contracts --filter @cloudcad/conversion-service';

  try {
    execSync(filter, {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
    });
    log('✓ 后端依赖安装完成');
  } catch (err) {
    error('依赖安装失败');
    throw err;
  }
}

/**
 * 私有 variant：构建 impl-mx
 */
async function buildImplMx() {
  log('构建 impl-mx (私有实现)...');
  try {
    execSync('pnpm --filter @cloudcad/impl-mx build', {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
    });
    log('✓ impl-mx 构建完成');
    return true;
  } catch (err) {
    error('impl-mx 构建失败');
    return false;
  }
}

/**
 * 部署包：构建项目
 */
async function buildProject(variant = 'oss') {
  log('构建后端...');

  // 清理旧构建
  const dirs = [
    path.join(PROJECT_ROOT, 'packages', 'backend', 'dist'),
    path.join(PROJECT_ROOT, 'packages', 'db', 'dist'),
    path.join(PROJECT_ROOT, 'packages', 'contracts', 'dist'),
    // 转换服务 dist（tsc 产物；运行时日志目录 data/logs 由 logger 自建，clean 后重建安全）
    path.join(PROJECT_ROOT, 'packages', 'conversion-service', 'dist'),
  ];
  if (variant === 'private') {
    dirs.push(path.join(PROJECT_ROOT, 'packages', 'impl-mx', 'dist'));
  }
  for (const dir of dirs) {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  // 私有 variant：先构建 impl-mx（容器内已安装其依赖）
  if (variant === 'private') {
    if (!(await buildImplMx())) return false;
  }

  // 确保 backend 依赖已安装（db:generate 需要 prisma CLI）。
  // 仅 Windows 本机打包路径生效——Linux 容器依赖由 Dockerfile `--filter backend` 装好，
  // 不在此处补装（installFullDeps 会 cleanNodeModules + 联网重装，破坏容器）。
  if (os.platform() === 'win32') {
    const prismaBin = path.join(
      PROJECT_ROOT,
      'packages',
      'backend',
      'node_modules',
      '.bin',
      'prisma.cmd'
    );
    if (!fs.existsSync(prismaBin)) {
      log('⚠ backend 未安装 prisma，自动补装依赖（联网）...');
      try {
        await installFullDeps(variant);
      } catch (err) {
        error('依赖自动补装失败，无法继续构建');
        return false;
      }
    }
  }

  // 先生成 Prisma client
  log('生成 Prisma client...');
  try {
    execSync('pnpm --filter backend db:generate', {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
    });
  } catch (err) {
    error('Prisma client 生成失败');
    return false;
  }

  try {
    // 构建后端（前端已在本地构建好，dist/ 已通过 COPY 带入容器）
    execSync('pnpm --filter backend build', {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
    });
    // 构建转换服务（纯 tsc，无 workspace 依赖，独立于 backend；dist 自包含随包分发）
    execSync('pnpm --filter @cloudcad/conversion-service build', {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
    });
    log('✓ 构建完成（含转换服务）');
    return true;
  } catch (err) {
    error('构建失败');
    return false;
  }
}

/**
 * 统计 node_modules 中的包数量
 */
function countPackages(nodeModulesPath) {
  if (!fs.existsSync(nodeModulesPath)) {
    return 0;
  }
  try {
    const entries = fs.readdirSync(nodeModulesPath, { withFileTypes: true });
    return entries.filter((e) => {
      if (e.isDirectory() && !e.name.startsWith('.pnpm')) return true;
      if (e.isSymbolicLink()) return true;
      return false;
    }).length;
  } catch {
    return 0;
  }
}

function verifyDeployStore(storePath) {
  if (!fs.existsSync(storePath)) {
    return { valid: false, reason: 'store 目录不存在' };
  }
  const filesDir = path.join(storePath, 'v3', 'files');
  if (!fs.existsSync(filesDir)) {
    return { valid: false, reason: 'store/v3/files 目录不存在' };
  }
  try {
    const files = fs.readdirSync(filesDir);
    if (files.length < 100) {
      return { valid: false, reason: `仅有 ${files.length} 个包，不符合预期` };
    }
    return { valid: true, count: files.length };
  } catch {
    return { valid: false, reason: '无法读取 store 内容' };
  }
}

/**
 * 获取 lockfile hash，用于检测依赖是否变化
 */
function getLockfileHash() {
  const lockfilePath = path.join(PROJECT_ROOT, 'pnpm-lock.yaml');
  if (!fs.existsSync(lockfilePath)) return null;
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(lockfilePath, 'utf8'));
  return hash.digest('hex').slice(0, 16);
}

/**
 * 部署/升级包 filter（与 prepareDeployStore 保持一致）
 * private 额外纳入 @cloudcad/impl-mx
 * @param {string} variant - oss | private
 */
function getDeployStoreInstallFilter(variant = 'oss') {
  // 必须含 @cloudcad/conversion-service：它现依赖 @cloudcad/contracts（ADR-0069），
  // 若不在 filter 里，目标机 --prod 安装不会建 packages/conversion-service/node_modules
  // 的 workspace 链接，dist/server.js 的 require('@cloudcad/contracts') 解析失败→3100 起不来。
  return variant === 'private'
    ? 'pnpm --filter backend --filter @cloudcad/impl-mx --filter @cloudcad/db --filter @cloudcad/contracts --filter @cloudcad/conversion-service install --frozen-lockfile --prod'
    : 'pnpm --filter backend --filter @cloudcad/db --filter @cloudcad/contracts --filter @cloudcad/conversion-service install --frozen-lockfile --prod';
}

/**
 * 对部署 store 做一次"离线安装预演"校验。
 *
 * 用 --offline 让 pnpm 自行判定每个生产依赖是否都能从 store 离线解析。
 * 缺任一包（如 ERR_PNPM_NO_OFFLINE_TARBALL）则判定 store 不完整——这是
 * verifyDeployStore 只数数量（>=100）测不出来的缺口。
 *
 * @param {string} storePath - store 目录（用 --store-dir 显式指定，比 npm_config_store_dir 环境变量可靠）
 * @param {string} variant - oss | private
 * @returns {boolean} true=store 完整可离线解析；false=缺包
 */
function verifyDeployStoreOffline(storePath, variant = 'oss') {
  const installFilter = getDeployStoreInstallFilter(variant);
  const env = { ...process.env, CI: 'true' };
  try {
    execSync(`${installFilter} --offline --store-dir "${storePath}"`, {
      cwd: PROJECT_ROOT,
      stdio: 'pipe',
      env,
      encoding: 'utf8',
    });
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * 确保部署 store 完整（平台感知，机制防漏）。
 *
 * 流程：
 *   1. 离线预演校验（verifyDeployStoreOffline）——完整则直接返回（零副作用，无网络开销）；
 *   2. 缺包时按平台分流：
 *      - Windows 打包：自动联网补齐（不带 --offline，用 --store-dir 可靠落盘到指定 store），再离线复验；
 *      - Linux 容器打包：不自动补齐（容器 store 是 Dockerfile 一次性构建、含平台相关二进制，
 *        自动补齐可能混入错误平台二进制/用默认 store 重装破坏结构），改为直接出包失败拦截。
 *   3. 补齐/校验后离线复验 —— 仍缺则 error + throw，出包失败。
 *
 * 注意：Windows 补齐命令不带 cleanNodeModules，保持增量语义（不破坏开发 node_modules）。
 *
 * @param {string} storePath - store 目录
 * @param {string} variant - oss | private
 * @param {string} [storeName='.pnpm-store-deploy'] - 仅用于日志
 */
function ensureDeployStoreComplete(storePath, variant = 'oss', storeName = '.pnpm-store-deploy') {
  if (verifyDeployStoreOffline(storePath, variant)) {
    log(`✓ ${storeName} 离线解析校验通过（所有生产依赖均可离线安装）`);
    return true;
  }

  // Linux 容器路径：不自动补齐，直接出包失败（保护平台 store）。
  // Windows 本机路径：自动联网补齐。
  if (os.platform() !== 'win32') {
    error(
      `${storeName} 离线解析缺包——Linux 容器路径不自动补齐（避免破坏平台相关 store）。` +
        '请检查 Dockerfile 依赖层是否完整（pnpm install --store-dir .pnpm-store-deploy）。'
    );
    throw new Error('Linux 部署 store 不完整');
  }

  log(`⚠ ${storeName} 离线解析缺包，自动联网补齐...`);
  const installFilter = getDeployStoreInstallFilter(variant);
  const env = { ...process.env, CI: 'true' };
  try {
    execSync(`${installFilter} --store-dir "${storePath}"`, {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      env,
      encoding: 'utf8',
    });
  } catch (err) {
    error(`${storeName} 联网补齐失败，请检查网络：${err.message.split('\n')[0]}`);
    throw new Error('部署 store 联网补齐失败');
  }

  if (!verifyDeployStoreOffline(storePath, variant)) {
    error(
      `${storeName} 补齐后离线解析仍失败——store 仍不完整，拒绝出包。` +
        '请检查 pnpm-lock.yaml 与依赖声明是否一致。'
    );
    throw new Error('部署 store 补齐后仍不完整');
  }
  log(`✓ ${storeName} 补齐完成，离线解析校验通过`);
  return true;
}

/**
 * 部署包：准备生产依赖 store
 *
 * 关键：必须生成 Prisma Client 并下载引擎二进制，确保完全离线可用
 * 优化：无 lockfile 变化时跳过重建
 */
async function prepareDeployStore(variant = 'oss') {
  const storeName = '.pnpm-store-deploy';
  const storePath = path.join(PROJECT_ROOT, storeName);

  // store 来源分流：
  //   - Linux 通道：容器内由 Dockerfile `pnpm install --store-dir /app/.pnpm-store-deploy`
  //     构建期写好，本函数只校验，不重装（重装会 cleanNodeModules + 用错误 store
  //     增量安装，产出残缺 store——历史教训）；缺失或为空直接失败。
  //   - Windows 本机直打：无容器镜像可复用，首次打包时由本函数联网创建（pnpm install
  //     --store-dir 落盘，无 cleanNodeModules），随后进入与缺包补齐相同的离线复验门禁。
  //
  // 调用顺序：本函数在 buildProject 之后执行（packDeploy 步骤 2/3），因为 --prod install
  // 会剔除整个 workspace 的 devDependencies，先构建可保住 tsc/vite；devDeps 由 finally 的
  // restoreNodeModules 在打包结束后恢复。

  let storeCheck;

  // 1. store 缺失或为空：Windows 本机直打首次联网创建（上次中断可能留下空目录，同样走创建）
  if (!fs.existsSync(storePath)) {
    if (os.platform() !== 'win32') {
      error(`${storeName} 不存在——Docker 构建可能未正确安装依赖`);
      throw new Error('Docker store 缺失');
    }
    log(`⚠ ${storeName} 不存在，首次联网创建部署 store（约需一次生产依赖下载）...`);
  } else {
    const preCheck = verifyDeployStore(storePath);
    if (!preCheck.valid && preCheck.reason === 'store/v3/files 目录不存在') {
      if (os.platform() !== 'win32') {
        error(`${storeName} ${preCheck.reason}——Docker 构建可能未正确安装依赖`);
        throw new Error('Docker store 缺失');
      }
      log(`⚠ ${storeName} 为空（上次中断残留），联网重新创建...`);
    }
  }

  // 2. 离线解析预演校验 + 缺包自动补齐（机制防漏，store 不存在/为空时即为首次创建）
  //    verifyDeployStore 只数数量（>=100）测不出"数量够但缺个别包"（如 pino-roll）。
  //    ensureDeployStoreComplete 用 --offline 让 pnpm 逐个判定生产依赖：缺包时按平台分流
  //    （Windows 联网补齐 / Linux 直接失败），补齐后离线复验，仍缺则出包失败——
  //    缺依赖在打包机就被拦截，不泄漏到部署机。
  ensureDeployStoreComplete(storePath, variant, storeName);

  // 3. 数量门禁（>=100 个包）。放在补齐/创建完成之后判定，避免空 store 被误报「不完整」。
  storeCheck = verifyDeployStore(storePath);
  if (!storeCheck.valid) {
    error(`${storeName} ${storeCheck.reason}`);
    throw new Error('部署 store 不完整');
  }
  log(`✓ ${storeName} 已就绪 (${storeCheck.count} 个包)`);

  // 4. 生成本地 Prisma Client（buildProject 已生成过，此处幂等）
  //    PRISMA_CLI_BINARY_TARGETS 确保下载所有平台的 schema engine（离线用）
  const PRISMA_BINARY_TARGETS = [
    'windows',
    'debian-openssl-1.1.x',
    'debian-openssl-3.0.x',
    'rhel-openssl-1.0.x',
    'rhel-openssl-3.0.x',
    'linux-musl',
  ].join(',');

  const env = {
    ...process.env,
    CI: 'true',
    PRISMA_CLI_BINARY_TARGETS: PRISMA_BINARY_TARGETS,
  };

  log('生成 Prisma Client 并下载所有平台引擎二进制...');
  execSync('pnpm --filter backend db:generate', {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    env,
  });

  // 5. 预置 schema-engine 二进制到包内 runtime/prisma-engines/（离线 migrate deploy 用）
  //    根因：@prisma/engines 包目录含当前平台 schema-engine（postinstall 下载），
  //    但 pnpm store 的 manifest 未引用该二进制（reconstruct 后包目录缺失），
  //    prisma CLI 经 getEnginesPath() 在包目录找不到 → 回退联网下载 → 断网 migrate deploy 失败。
  //    故把 schema-engine 预置到 runtime/prisma-engines/，verify-deploy.js / migrate.js
  //    设 PRISMA_SCHEMA_ENGINE_BINARY 指向该预置二进制（绝对路径，Ry() 按 process.cwd() 解析）。
  bundlePrismaSchemaEngine();

  log(`✓ ${storeName} 准备完成 (${storeCheck.count} 个包)`);
}

/**
 * 把 @prisma/engines 包目录的 schema-engine 二进制复制到包内 runtime/prisma-engines/。
 *
 * 背景：pnpm store 的 manifest 只引用 npm registry 文件，不含 postinstall 下载的
 * schema-engine 二进制。部署机 pnpm install --offline 重建 @prisma/engines 包目录时
 * 缺该二进制，prisma CLI（getEnginesPath）找不到 → 回退联网下载 → 断网 migrate deploy 失败。
 * 故打包时把当前平台（构建机=目标机平台）的 schema-engine 预置到 runtime/prisma-engines/，
 * 由 verify-deploy.js / migrate.js 设 PRISMA_SCHEMA_ENGINE_BINARY 指向它（绝对路径）。
 *
 * @returns {boolean} true=已预置；false=未找到 schema-engine（警告，不阻断——目标机可回退下载）
 */
function bundlePrismaSchemaEngine() {
  const destDir = path.join(PROJECT_ROOT, 'runtime', 'prisma-engines');
  // @prisma/engines 包目录：优先 node_modules/@prisma/engines（pnpm 符号链接），
  // 回退 .pnpm 布局（node_modules/.pnpm/@prisma+engines@*/node_modules/@prisma/engines）
  let enginesDir = path.join(PROJECT_ROOT, 'node_modules', '@prisma', 'engines');
  if (!fs.existsSync(enginesDir)) {
    const pnpmDir = path.join(PROJECT_ROOT, 'node_modules', '.pnpm');
    if (fs.existsSync(pnpmDir)) {
      const candidates = fs
        .readdirSync(pnpmDir)
        .filter((d) => d.startsWith('@prisma+engines@'))
        .map((d) => path.join(pnpmDir, d, 'node_modules', '@prisma', 'engines'))
        .filter((d) => fs.existsSync(d));
      if (candidates.length > 0) enginesDir = candidates[0];
    }
  }
  if (!fs.existsSync(enginesDir)) {
    log('警告: 未找到 @prisma/engines 包目录，跳过 schema-engine 预置（目标机可回退联网下载）');
    return false;
  }
  // schema-engine 文件名平台相关：linux= schema-engine，windows= schema-engine-windows.exe
  // 取包目录内所有 schema-engine* 二进制（当前平台构建机=目标机平台，取全部预置）
  const engines = fs
    .readdirSync(enginesDir)
    .filter((f) => f.startsWith('schema-engine') && !f.endsWith('.sha256') && !f.endsWith('.gz.sha256'));
  if (engines.length === 0) {
    log('警告: @prisma/engines 包目录无 schema-engine 二进制，跳过预置');
    return false;
  }
  ensureDir(destDir);
  for (const engine of engines) {
    const src = path.join(enginesDir, engine);
    const dest = path.join(destDir, engine);
    fs.copyFileSync(src, dest);
    // 二进制须可执行（部署机直接 spawn schema-engine）
    try {
      fs.chmodSync(dest, 0o755);
    } catch {}
    log(`✓ 预置 schema-engine: runtime/prisma-engines/${engine} (${formatSize(fs.statSync(dest).size)})`);
  }
  return true;
}

/**
 * 复制移动端前端构建产物到前端 dist 子目录下
 * 目标子目录名读自 frontend/public/ini/myServerConfig.json 的 mobileAccessPath（默认 mxcad_mobile）
 * 部署包与升级包共用：保证升级后的 frontend/dist 与部署包一致（含移动端）
 * @param {string} tempDir - 打包临时目录
 */
function mergeMobileDist(tempDir) {
  const mobileDistSrc = path.join(
    PROJECT_ROOT, 'packages', 'frontend_mobile', 'dist'
  );
  const sourceConfigPath = path.join(
    PROJECT_ROOT, 'packages', 'frontend', 'public', 'ini', 'myServerConfig.json'
  );
  let mobileAccessPath = 'mxcad_mobile';
  if (fs.existsSync(sourceConfigPath)) {
    try {
      const sourceConfig = JSON.parse(fs.readFileSync(sourceConfigPath, 'utf8'));
      if (sourceConfig.mobileAccessPath && typeof sourceConfig.mobileAccessPath === 'string') {
        mobileAccessPath = sourceConfig.mobileAccessPath;
      }
    } catch (e) {
      // 读取失败用默认值
    }
  }
  const mobileDistDest = path.join(tempDir, 'packages', 'frontend', 'dist', mobileAccessPath);
  if (fs.existsSync(mobileDistSrc)) {
    copyDir(
      mobileDistSrc,
      mobileDistDest,
      `packages/frontend/dist/${mobileAccessPath}`
    );
    log(`复制移动端前端: packages/frontend_mobile/dist/ → packages/frontend/dist/${mobileAccessPath}/`);
  } else {
    log('警告: packages/frontend_mobile/dist 不存在，跳过移动端复制');
  }
}

/**
 * 重命名前端静态资源配置为 .example
 * 避免部署包覆盖用户自定义配置
 * 处理 public 目录下所有子目录中的：
 *   - JSON 配置文件 → *.json.example
 *   - 品牌资源文件（如 logo.png）→ *.png.example
 *
 * @param {string} tempDir - 临时目录路径
 */
function renameFrontendConfigFiles(tempDir) {
  const publicDir = path.join(tempDir, 'packages', 'frontend', 'dist');

  if (!fs.existsSync(publicDir)) {
    log('警告：前端 public 目录不存在，跳过配置文件重命名');
    return;
  }

  let totalRenamed = 0;

  // 递归遍历 public 目录下所有子目录
  function processDirectory(dir) {
    if (!fs.existsSync(dir)) {
      return;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // 递归处理子目录
        processDirectory(fullPath);
      } else if (entry.isFile()) {
        // 检查是否需要重命名
        const fileName = entry.name;
        let shouldRename = false;
        let newFileName = null;

        // JSON 文件：重命名为 .json.example
        if (fileName.endsWith('.json') && !fileName.endsWith('.example')) {
          newFileName = `${fileName}.example`;
          shouldRename = true;
        }
        // brand 目录下的图片文件：重命名为 .example
        // 这些是用户上传的品牌资源，需要保留用户的
        else if (
          dir.includes(path.sep + 'brand' + path.sep) ||
          dir.endsWith(path.sep + 'brand')
        ) {
          if (
            (fileName.endsWith('.png') ||
              fileName.endsWith('.jpg') ||
              fileName.endsWith('.jpeg') ||
              fileName.endsWith('.svg') ||
              fileName.endsWith('.gif')) &&
            !fileName.endsWith('.example')
          ) {
            newFileName = `${fileName}.example`;
            shouldRename = true;
          }
        }

        // 执行重命名
        if (shouldRename && newFileName) {
          const newPath = path.join(dir, newFileName);
          try {
            fs.renameSync(fullPath, newPath);
            log(
              `重命名：${path.relative(publicDir, fullPath)} -> ${path.relative(publicDir, newPath)}`
            );
            totalRenamed++;
          } catch (err) {
            error(`重命名失败：${fullPath} - ${err.message}`);
          }
        }
      }
    }
  }

  processDirectory(publicDir);

  if (totalRenamed > 0) {
    log(`✓ 前端配置文件重命名完成：${totalRenamed} 个文件`);
  }
}

/**
 * 读取前端构建时的 VITE_ADMIN_LOGIN_PATH（打包机上的 packages/frontend/.env.local / .env）
 * 该值在打包时确定（Vite 构建时编译进 bundle），部署时需展示给用户作为管理员登录入口。
 * @returns {string} 管理员登录路径（以 / 开头），未配置回退 /admin-login
 */
function getAdminLoginPathFromEnv() {
  const candidates = [
    path.join(PROJECT_ROOT, 'packages', 'frontend', '.env.local'),
    path.join(PROJECT_ROOT, 'packages', 'frontend', '.env'),
  ];
  for (const envFile of candidates) {
    if (!fs.existsSync(envFile)) continue;
    const content = fs.readFileSync(envFile, 'utf-8');
    const match = content.match(/^\s*VITE_ADMIN_LOGIN_PATH\s*=\s*(.+?)\s*$/m);
    if (match && match[1]) {
      const value = match[1].trim().replace(/['"]/g, '');
      if (value.startsWith('/')) {
        return value.length > 1 ? value.replace(/\/+$/, '') : '/';
      }
    }
  }
  return '/admin-login';
}

/**
 * 写入部署元信息（runtime/scripts/config/deploy-meta.json）
 * CLI 首次部署时读取管理员登录路径展示给用户。该值在打包时确定。
 * @param {string} tempDir 部署包临时目录
 */
function writeDeployMeta(tempDir) {
  const deployMeta = {
    adminLoginPath: getAdminLoginPathFromEnv(),
  };
  const metaDir = path.join(tempDir, 'runtime', 'scripts', 'config');
  ensureDir(metaDir);
  fs.writeFileSync(
    path.join(metaDir, 'deploy-meta.json'),
    JSON.stringify(deployMeta, null, 2)
  );
  log(`写入部署元信息: runtime/scripts/config/deploy-meta.json (adminLoginPath=${deployMeta.adminLoginPath})`);
}

/**
 * Windows 标准运行时组件出包前校验（node / pm2 / postgresql / redis）。
 *
 * 背景：runtime/windows/ 在 manifest 中是整目录复制，只要 node/ 存在即可通过，
 * 缺 postgresql/redis 子目录或 node_modules/pm2 完全无感知——曾因 build-windows-runtime.js
 * 下载源失效且错误被静默吞掉，导致线上 Windows 离线包缺 pg/redis、目标机启动失败。
 * 此处在打压缩包前按关键可执行文件逐项断言（路径与 runtime/scripts 的
 * pg-manager.js / redis-manager.js、lib/proc.js 的 PM2_JS 引用保持一致）。
 */
function assertWindowsRuntimeComponents() {
  const required = [
    path.join('node', 'node.exe'),
    path.join('node', 'node_modules', 'pm2', 'bin', 'pm2'),
    path.join('postgresql', 'pgsql', 'bin', 'initdb.exe'),
    path.join('postgresql', 'pgsql', 'bin', 'pg_ctl.exe'),
    path.join('redis', 'redis-server.exe'),
  ];
  const missing = [];
  for (const rel of required) {
    const p = path.join(PROJECT_ROOT, 'runtime', 'windows', rel);
    if (!fs.existsSync(p)) missing.push(`runtime/windows/${rel}`);
  }
  if (missing.length > 0) {
    error(`Windows 标准运行时组件缺失，中止打包:\n  ${missing.join('\n  ')}`);
    error('修复方式:');
    error('  - node/pm2/redis: node scripts/build-windows-runtime.js --force');
    error('    （node_modules 里的 pm2 由 reinstall-node-tools.js 重建）');
    error('  - postgresql: 本地 PG binaries zip（顶层含 pgsql/ 目录）放入');
    error('    mxcad-dist/windows-x64/postgresql.zip 后运行 node scripts/upload-mxcad.js，');
    error('    再由 release.yml「下载产品二进制」步骤解压到 runtime/windows/postgresql');
    process.exit(1);
  }
  log('Windows 标准运行时组件校验通过（node / pm2 / postgresql / redis）');
}

/**
 * Linux 标准运行时组件出包前校验（node / pm2 / postgres / redis / svn）。
 *
 * 背景：runtime/linux/ 在 manifest 中是整目录复制，目录非空即通过，
 * node/ 内容残缺（bin/node 或 node_modules/pm2/bin/pm2 缺失）完全无感知——
 * 坏提取缓存被复用后打出缺 node 的包，目标机 start.sh 报"找不到 Node.js 运行时"。
 * 此处在打压缩包前按关键可执行文件逐项断言（路径与 start.sh / verify-deploy.js /
 * lib/proc.js 的 PM2_JS、packages/config-service/lib/pm2.js 引用保持一致）。
 */
function assertLinuxRuntimeComponents() {
  const required = [
    path.join('node', 'bin', 'node'),
    path.join('node', 'node_modules', 'pm2', 'bin', 'pm2'),
    path.join('postgres', 'bin', 'postgres'),
    path.join('redis', 'redis-server'),
    path.join('subversion', 'svn'),
  ];
  const missing = [];
  for (const rel of required) {
    const p = path.join(PROJECT_ROOT, 'runtime', 'linux', rel);
    if (!fs.existsSync(p)) missing.push(`runtime/linux/${rel}`);
  }
  if (missing.length > 0) {
    error(`Linux 标准运行时组件缺失，中止打包:\n  ${missing.join('\n  ')}`);
    error('修复方式:');
    error('  - 删除坏提取缓存后重跑打包（容器内重新全量提取）:');
    error('    rm -rf runtime/cache/linux-extract/<os>');
    error('  - 或重新下载 runtime 依赖资产解压到 runtime/cache/linux-extract/<os>/');
    error('  注: pm2 属 node 组件提取，缺 pm2 即 node 产物残缺，须重新提取');
    process.exit(1);
  }
  log('Linux 标准运行时组件校验通过（node / pm2 / postgres / redis / svn）');
}

/**
 * 部署包：复制文件到临时目录
 */
function prepareDeployDir(platform, variant = 'oss') {
  const tempDir = path.join(PROJECT_ROOT, 'temp', `deploy-${Date.now()}`);

  // 清理可能存在的旧目录
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  ensureDir(tempDir);

  const includeList = getDeployIncludeList(platform, variant);

  for (const item of includeList) {
    const srcPath = path.join(PROJECT_ROOT, item.src);
    const destPath = path.join(tempDir, item.dest);

    if (!fs.existsSync(srcPath)) {
      log(`警告: ${item.src} 不存在，跳过`);
      continue;
    }

    if (item.isDir) {
      copyDir(srcPath, destPath, item.src);
      log(`复制 ${item.src}/`);
    } else {
      ensureDir(path.dirname(destPath));
      fs.copyFileSync(srcPath, destPath);
      log(`复制 ${item.src}`);
    }
  }

  // 复制移动端前端构建产物到前端 dist 子目录下
  mergeMobileDist(tempDir);

  // 创建部署包标记文件（让 start.bat 能够识别这是部署包）
  fs.writeFileSync(path.join(tempDir, '.deploy'), '');
  log('创建 .deploy 标记文件');

  // 重命名前端 JSON 配置文件为 .example（避免覆盖用户自定义配置）
  renameFrontendConfigFiles(tempDir);

  // 写入部署元信息（含管理员登录路径，打包时确定，CLI 首次部署展示用）
  writeDeployMeta(tempDir);

  // 创建 .npmrc 文件，指向部署包专用的 pnpm store
  fs.writeFileSync(
    path.join(tempDir, '.npmrc'),
    'store-dir=./.pnpm-store-deploy\n'
  );
  log('创建 .npmrc (store-dir=./.pnpm-store-deploy)');

  // 生成 Prisma 7.x 配置文件（ES Module 格式）
  // schema 单一源在 packages/db/prisma，离线包内相对此 config 路径为 ../db/prisma/schema.prisma
  const prismaConfigContent = `import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: '../db/prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node dist/prisma/seed.js',
  },
  datasource: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/cloudcad',
  },
});
`;
  const prismaConfigPath = path.join(
    tempDir,
    'packages',
    'backend',
    'prisma.config.mjs'
  );
  ensureDir(path.dirname(prismaConfigPath));
  fs.writeFileSync(prismaConfigPath, prismaConfigContent);
  log('创建 prisma.config.mjs');

  return tempDir;
}

/**
 * 部署包打包
 */
async function packDeploy(platform, variant = 'oss') {
  log('============================================');
  log(` ${PRODUCT_NAME} v${VERSION} 部署包打包工具`);
  log('============================================');
  log(`输出目录: ${OUTPUT_DIR}`);
  const deployLabel =
    platform === 'all'
      ? '全平台'
      : platform === 'win'
        ? 'Windows'
        : process.env.TARGET_OS
          ? `${process.env.TARGET_OS} (${getArchName()})`
          : 'Linux';
  log(`目标平台: ${deployLabel}`);
  log(`Variant: ${variant}`);
  log('');

  // 检查 Linux runtime
  if (platform === 'linux' || platform === 'all') {
    const linuxRuntime = path.join(PROJECT_ROOT, 'runtime', 'linux');
    if (
      !fs.existsSync(linuxRuntime) ||
      fs.readdirSync(linuxRuntime).length === 0
    ) {
      error(
        'runtime/linux/ 不存在，请先运行: node scripts/extract-linux-runtime.js'
      );
      process.exit(1);
    }
    assertLinuxRuntimeComponents();
  }

  // 检查 Windows 标准运行时组件（node/postgresql/redis 关键可执行文件）
  if (platform === 'win' || platform === 'all') {
    assertWindowsRuntimeComponents();
  }

  // 本机 Windows 打包路径：先重建运行时 node 工具依赖，再确保根依赖完整。
  // Linux 打包路径（容器/本机）跳过——容器依赖由 Dockerfile `pnpm install
  // --store-dir .pnpm-store-deploy` 在构建阶段装好，重装会破坏 store 创建；
  // 本机 Linux 打包通常也是按容器流程准备依赖。
  if (os.platform() === 'win32') {
    // 运行时 node 工具（pnpm/pm2）依赖：以 package.json + package-lock.json 为
    // 唯一事实源重建，确保打进部署包的 node 运行时干净、版本对齐（不被 IDE 缓存
    // 或漂移版本污染）。需联网 npm ci（实测约 30s）。无网打包机可用环境变量
    // SKIP_NODE_TOOLS_REBUILD=1 跳过。
    log('[0/3] 重建运行时 node 工具依赖（pnpm/pm2）...');
    const rebuildNodeTools = path.join(
      PROJECT_ROOT,
      'scripts',
      'reinstall-node-tools.js'
    );
    if (process.env.SKIP_NODE_TOOLS_REBUILD === '1') {
      log('  已通过 SKIP_NODE_TOOLS_REBUILD=1 跳过（打包机无网或已手动重建）。');
      log('  警告：请确保 runtime/windows/node 的 node_modules 是干净、版本对齐的，否则部署包会携带脏运行时。');
    } else {
      try {
        execSync(`node "${rebuildNodeTools}"`, {
          cwd: PROJECT_ROOT,
          stdio: 'inherit',
          encoding: 'utf8',
        });
      } catch (err) {
        error(`运行时 node 工具重建失败，中止打包：${err.message.split('\n')[0]}`);
        throw err;
      }
    }

    log('[0/3] 确保根依赖完整（pnpm install）...');
    try {
      execSync('pnpm install', {
        cwd: PROJECT_ROOT,
        stdio: 'inherit',
        encoding: 'utf8',
      });
    } catch (err) {
      error(`根依赖安装失败，无法继续打包：${err.message.split('\n')[0]}`);
      throw err;
    }
  }

  // 1. 构建（前端已在本地预构建，dist/ 已 COPY 入容器）
  log('[1/3] 构建后端...');
  if (!(await buildProject(variant))) {
    process.exit(1);
  }

  // 2. 验证生产依赖 store + 补充全平台 Prisma 引擎（复用 Docker 已建 store，不重装）
  log('');
  log('[2/3] 准备生产依赖 store...');
  await prepareDeployStore(variant);

  // 3. 准备打包目录
  log('');
  log('[3/3] 打包...');
  const tempDir = prepareDeployDir(platform, variant);

  try {
    const platformSuffix =
      platform === 'all'
        ? 'all-platforms'
        : platform === 'win'
          ? 'windows'
          : process.env.TARGET_OS
            ? `${process.env.TARGET_OS}-${getArchName()}`
            : 'linux';
    const variantSuffix = variant === 'private' ? '-private' : '';
    const baseName = `cloudcad-deploy${variantSuffix}-${VERSION}-${DATE}-${platformSuffix}`;

    // Linux 平台使用 tar.gz（Linux 默认支持，无需额外工具）
    // Windows 平台使用 7z（压缩率更高，Windows 用户通常有 7-Zip）
    const archiveExt = platform === 'linux' ? 'tar.gz' : '7z';
    const outputPath = path.join(OUTPUT_DIR, `${baseName}.${archiveExt}`);

    ensureDir(OUTPUT_DIR);

    await createArchive(tempDir, outputPath);

    const stat = fs.statSync(outputPath);
    log('');
    log('============================================');
    log(' 打包完成');
    log('============================================');
    log(`✓ ${outputPath}`);
    log(`大小: ${formatSize(stat.size)}`);
    log('');
    log('使用说明:');
    log('  1. 解压到目标目录');
    log('  2. 配置 packages/backend/.env');
    if (platform === 'linux') {
      log('  3. 运行: tar -xzf *.tar.gz && ./start.sh');
    } else {
      log('  3. 运行: start.bat');
    }
  } finally {
    // 清理临时目录
    log('');
    log('清理临时目录...');
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {}

    // 恢复开发环境依赖（打包以 --prod 重建了 node_modules，破坏 dev 依赖）
    restoreNodeModules();
  }
}

// ==================== 升级包 ====================

/**
 * 升级包正向清单（固定业务产物全集）
 * 与部署包的差异：不含 runtime 二进制、不含生产依赖 store、不含配置与用户数据
 * 依赖更新由目标机自动完成：start → cli.js bootstrap → shouldReinstallDependencies
 * （.deploy-lock-hash vs pnpm-lock.yaml 对比）→ 不一致时自动 pnpm install --offline
 * 复用目标机已有的部署包 store（首次部署必须用部署包打底，见路线 B）
 */
function getUpgradeIncludeList(platform, variant = 'oss') {
  // 清单单一事实源见 scripts/pack-lib/manifest.js（P9 收敛双清单硬编码）
  return getUpgradeIncludeListFromManifest(platform, variant);
}

/**
 * 在本地构建前端（纯静态，三端通用；移动端 dist 打包时合并进 frontend/dist/<mobileAccessPath>）
 * 升级包/部署包均需先构建前端，保证产物为最新源码。
 */
function buildFrontendLocally() {
  log('构建前端 (本地)...');
  try {
    execSync('pnpm build', {
      cwd: path.join(PROJECT_ROOT, 'packages/frontend'),
      stdio: 'inherit',
    });
    execSync('pnpm build', {
      cwd: path.join(PROJECT_ROOT, 'packages/frontend_mobile'),
      stdio: 'inherit',
    });
    log('✓ 前端构建完成');
  } catch (err) {
    error(`前端构建失败: ${err.message.split('\n')[0]}`);
    process.exit(1);
  }
}

/**
 * 升级包打包（路线 B：不带 store，只推业务产物全集）
 * - 固定业务产物全集：backend/db/contracts/frontend dist + prisma migrations +
 *   runtime/scripts + ecosystem + 根启动脚本 + pnpm-lock.yaml
 * - 不含 .pnpm-store-deploy：依赖复用目标机已有部署包 store，离线补装缺失依赖
 * - 前置要求：目标机已用同平台部署包部署过（首次部署必须用部署包打底）
 * 依赖更新与 DB 迁移由目标机 start 流程自动完成
 * （bootstrap → shouldReinstallDependencies → install --offline --prod → migrate deploy）
 * 前置条件：dist 构建产物存在（可来自全量部署包产出或本地构建）
 */
async function packUpgrade(platform, variant = 'oss') {
  log('============================================');
  log(` ${PRODUCT_NAME} v${VERSION} 升级包打包工具（不含 store）`);
  log('============================================');
  log(`输出目录: ${OUTPUT_DIR}`);
  log(`目标平台: ${platform === 'win' ? 'Windows' : 'Linux'}`);
  log(`Variant: ${variant}`);
  log('');

  // 0. 构建产物（始终重新构建，保证升级包是最新源码产物）
  // 后端链路（backend/db/contracts，private 含 impl-mx）：始终强制重build
  // （db:generate + backend build），确保改动的 TS 源码编译进 dist，而非复用旧产物。
  // 注意：db:generate 按打包机平台生成 prisma engine，但升级包只复制 dist 等 JS 产物、
  // 不带 engine 二进制（engine 在目标机 node_modules，线上 engine 不动），因此跨平台直打安全。
  log('构建后端链路（db:generate + backend build）...');
  if (!(await buildProject(variant))) {
    process.exit(1);
  }

  // 前端为纯静态产物：始终强制重build（PC + 移动端），保证最新源码
  buildFrontendLocally();

  // 路线 B：升级包不带 store，复用目标机已有部署包 store 离线补装依赖
  // （首次部署必须用部署包打底；依赖变更由目标机 shouldReinstallDependencies 判定）

  // [1/2] 准备打包目录
  log('');
  log('[1/2] 准备升级包目录...');
  const tempDir = path.join(PROJECT_ROOT, 'temp', `upgrade-${Date.now()}`);
  ensureDir(tempDir);

  try {
    const includeList = getUpgradeIncludeList(platform, variant);
    for (const item of includeList) {
      const srcPath = path.join(PROJECT_ROOT, item.src);
      const destPath = path.join(tempDir, item.dest);
      if (!fs.existsSync(srcPath)) {
        log(`警告: ${item.src} 不存在，跳过`);
        continue;
      }
      if (item.isDir) {
        copyDir(srcPath, destPath, item.src);
        log(`复制 ${item.src}/`);
      } else {
        ensureDir(path.dirname(destPath));
        fs.copyFileSync(srcPath, destPath);
        log(`复制 ${item.src}`);
      }
    }

    // 复制移动端前端构建产物到前端 dist 子目录下（与部署包一致）
    mergeMobileDist(tempDir);

    // 关键产物复查：防止"打包成功但缺内容"的静默失败
    // （曾发生：容器内 impl-mx 因 Windows 风格路径构建假成功，dist 缺失却被警告跳过）
    const verifyDirs = [
      path.join(tempDir, 'packages', 'backend', 'dist'),
      path.join(tempDir, 'packages', 'db', 'dist'),
      path.join(tempDir, 'packages', 'contracts', 'dist'),
      path.join(tempDir, 'packages', 'frontend', 'dist'),
      // 转换服务 dist 恒在包内（共享清单两类包都带），缺失即打包不完整
      path.join(tempDir, 'packages', 'conversion-service', 'dist'),
    ];
    if (variant === 'private') {
      verifyDirs.push(path.join(tempDir, 'packages', 'impl-mx', 'dist'));
    }
    // 移动端合并目录（与 mergeMobileDist 同一默认值）
    const sourceConfigPath = path.join(
      PROJECT_ROOT, 'packages', 'frontend', 'public', 'ini', 'myServerConfig.json'
    );
    let mobileAccessPath = 'mxcad_mobile';
    if (fs.existsSync(sourceConfigPath)) {
      try {
        const cfg = JSON.parse(fs.readFileSync(sourceConfigPath, 'utf8'));
        if (cfg.mobileAccessPath && typeof cfg.mobileAccessPath === 'string') {
          mobileAccessPath = cfg.mobileAccessPath;
        }
      } catch (e) { /* 默认值 */ }
    }
    verifyDirs.push(path.join(tempDir, 'packages', 'frontend', 'dist', mobileAccessPath));
    for (const dir of verifyDirs) {
      if (!fs.existsSync(dir) || fs.readdirSync(dir).length === 0) {
        error(`关键产物缺失: ${path.relative(tempDir, dir)}，升级包不完整，中止`);
        process.exit(1);
      }
    }
    log(`✓ 关键产物复查通过（${verifyDirs.length} 项）`);

    // .npmrc（指向目标机已有的 .pnpm-store-deploy：升级包不带 store，
    // 目标机 install --offline 时复用首次部署包留下的 store 补装缺失依赖）
    fs.writeFileSync(
      path.join(tempDir, '.npmrc'),
      'store-dir=./.pnpm-store-deploy\n'
    );
    log('创建 .npmrc (store-dir=./.pnpm-store-deploy，指向目标机既有 store)');

    // .deploy 标记（保证 start.bat 进入部署模式）
    fs.writeFileSync(path.join(tempDir, '.deploy'), '');
    log('创建 .deploy 标记文件');

    // 重命名前端 JSON 配置文件为 .example（避免覆盖用户自定义配置）
    renameFrontendConfigFiles(tempDir);

    // manifest.json（targetVersion 仅作日志审计，不参与任何逻辑判断）
    const migrationsDir = path.join(
      PROJECT_ROOT,
      'packages',
      'backend',
      'prisma',
      'migrations'
    );
    let migrationsCount = 0;
    if (fs.existsSync(migrationsDir)) {
      migrationsCount = fs
        .readdirSync(migrationsDir)
        .filter((n) => {
          try {
            return fs.statSync(path.join(migrationsDir, n)).isDirectory();
          } catch {
            return false;
          }
        }).length;
    }
    const manifest = {
      format: 'cloudcad-upgrade',
      version: VERSION,
      platform: platform === 'all' ? 'all' : platform,
      variant,
      createdAt: new Date().toISOString(),
      lockfileHash: getLockfileHash(),
      store: 'none',
      migrationsCount,
      notes: [
        '解压到部署根目录覆盖即完成升级',
        '升级包不含生产依赖 store，依赖复用目标机已有部署包 store 离线补装',
        '前置要求：目标机已用同平台部署包部署过（首次部署必须用部署包打底）',
        '依赖变更由目标机 shouldReinstallDependencies（.deploy-lock-hash vs pnpm-lock.yaml）判定后自动 install --offline',
        'DB 迁移由 prisma migrate deploy 幂等执行',
      ],
    };
    fs.writeFileSync(
      path.join(tempDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2)
    );
    log('创建 manifest.json');

    // [2/2] 压缩
    log('');
    log('[2/2] 创建压缩包...');
    const platformSuffix =
      platform === 'all'
        ? 'all-platforms'
        : platform === 'win'
          ? 'windows'
          : 'linux';
    const variantSuffix = variant === 'private' ? '-private' : '';
    const baseName = `cloudcad-upgrade${variantSuffix}-${VERSION}-${DATE}-${platformSuffix}`;
    const archiveExt = platform === 'linux' ? 'tar.gz' : '7z';
    const outputPath = path.join(OUTPUT_DIR, `${baseName}.${archiveExt}`);

    ensureDir(OUTPUT_DIR);
    await createArchive(tempDir, outputPath);

    const stat = fs.statSync(outputPath);
    log('');
    log('============================================');
    log(' 打包完成');
    log('============================================');
    log(`✓ ${outputPath}`);
    log(`大小: ${formatSize(stat.size)}`);
    log('');
    log('使用说明:');
    log('  1. 解压到目标部署根目录（覆盖现有文件）');
    log('  2. 运行: start.bat（Windows）或 ./start.sh（Linux）');
    log('  3. 启动流程自动完成依赖重装检测与数据库迁移');
  } finally {
    // 清理临时目录
    log('');
    log('清理临时目录...');
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {}

    // 恢复开发环境依赖（打包以 --prod 重建了 node_modules，破坏 dev 依赖）
    restoreNodeModules();
  }
}

// ==================== 入口 ====================

async function main() {
  const args = process.argv.slice(2);

  // 打包前同步静态文件品牌名，保证部署包产物与 branding.js 一致（幂等）
  try {
    require('./sync-brand').applySyncBrand();
  } catch (err) {
    console.warn(`[Pack] 品牌名同步跳过: ${err.message}`);
  }

  let platform = null;
  // 已移除离线开发包：仅支持 deploy / upgrade 两种产物（见 scripts/pack-lib/manifest.js 头部说明）
  let mode = null;
  let variant = 'oss';

  if (args.includes('--win')) platform = 'win';
  else if (args.includes('--linux')) platform = 'linux';
  else if (args.includes('--all')) platform = 'all';
  else platform = os.platform() === 'win32' ? 'win' : 'linux';

  if (args.includes('--deploy')) mode = 'deploy';
  else if (args.includes('--upgrade')) mode = 'upgrade';

  // 解析 --os 参数（Linux OS 变体，等价于 TARGET_OS 环境变量，
  // 与 pack-linux-deploy.js --os 命名保持一致，如 ubuntu22）
  const osIndex = args.indexOf('--os');
  if (osIndex !== -1 && args[osIndex + 1]) {
    const osArg = args[osIndex + 1].toLowerCase();
    if (SUPPORTED_OS.includes(osArg)) {
      process.env.TARGET_OS = osArg;
    } else {
      error(`不支持的 OS: ${osArg}`);
      error(`支持的 OS: ${SUPPORTED_OS.join(', ')}`);
      process.exit(1);
    }
  }

  const variantIndex = args.indexOf('--variant');
  if (variantIndex !== -1 && args[variantIndex + 1]) {
    const v = args[variantIndex + 1].toLowerCase();
    if (v === 'oss' || v === 'private') variant = v;
    else { error(`不支持的 variant: ${v}，可选 oss/private`); process.exit(1); }
  }

  try {
    if (mode === 'deploy') {
      if (platform === 'all') {
        await packDeploy('win', variant);
        log('');
        await packDeploy('linux', variant);
      } else {
        await packDeploy(platform, variant);
      }
    } else if (mode === 'upgrade') {
      // store 原生依赖与打包环境平台强相关：升级包只能在目标平台对应的打包环境产出
      // （esbuild/swc/prisma engine 等为打包机平台二进制），跨平台打出的 store 无法在目标机使用
      if (platform === 'all') {
        error('升级包不支持 --all：原生依赖与打包环境平台强相关，请分别打包');
        error('  Windows: pnpm pack:upgrade:win；Linux: pnpm pack:linux-upgrade');
        process.exit(1);
      }
      const hostIsWindows = os.platform() === 'win32';
      const hostIsLinux = os.platform() === 'linux';
      // 平台强校验：升级包本质是"构建产物增量覆盖包"，只复制 dist 等 JS 产物，
      // 不含 engine 二进制（engine 在目标机 node_modules，线上 engine 不动）。
      // 因此在目标平台直打升级包是安全的（仅前端/纯 JS 增量的常见升级场景）。
      // 若要强制跨平台直打（例如 Windows 打包机直出 Linux 升级包），设置
      // SKIP_PLATFORM_GUARD=1 可放行；deploy 全量包仍受本校验保护（store 为平台二进制）。
      const skipPlatformGuard = process.env.SKIP_PLATFORM_GUARD === '1';
      if (
        !skipPlatformGuard &&
        ((platform === 'win' && !hostIsWindows) || (platform === 'linux' && !hostIsLinux))
      ) {
        error('store 原生依赖与打包环境平台强相关，升级包必须在目标平台环境打包');
        if (platform === 'linux') {
          error('请使用 Linux 容器通道: pnpm pack:linux-upgrade，或设置 SKIP_PLATFORM_GUARD=1 在本机直打（仅纯 JS/dist 增量升级）');
        } else {
          error('Linux 环境无法产出 Windows 升级包，请使用 Windows 打包机');
        }
        process.exit(1);
      }
      await packUpgrade(platform, variant);
    } else {
      // 已移除离线开发包，必须显式指定产物类型
      error('未指定打包类型。离线开发包已移除，仅支持：');
      error('  --deploy   全量部署包（新部署：含构建产物 + 生产依赖 store + runtime 二进制）');
      error('  --upgrade  升级包（升级：业务产物全集，不含 store，依赖目标机既有 store 离线补装）');
      error('  或使用交互菜单: pnpm pack:menu');
      process.exit(1);
    }
  } catch (err) {
    error(err.message);
    process.exit(1);
  }
}

main();
