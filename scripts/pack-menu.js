/**
 * 梦想网页CAD实时协同平台 打包交互菜单
 *
 * 通过交互式命令选择：打包类型（增量升级包 / 全量部署包 / 离线开发包）、
 * variant（开源 oss / 闭源 private）、平台通道（本机 / Linux 容器）与 OS 变体，
 * 避免记忆命令参数。
 *
 * 使用方式：
 *   node scripts/pack-menu.js     # 或 pnpm pack:menu
 *
 * 平台约束（与 pack-offline.js 一致）：
 *   - 升级包/部署包的依赖 store 原生依赖与打包环境平台强相关：
 *     Linux 包必须在 Linux 环境产出（推荐容器通道），Windows 上打 Linux 包会被拒绝
 *   - 闭源（private）依赖本地 packages/impl-mx 存在
 */
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const readline = require('readline');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const IS_WINDOWS = os.platform() === 'win32';

// 品牌单一事实源（runtime/scripts/lib/branding.js）
const { PRODUCT_NAME } = require('../runtime/scripts/lib/branding');

const OS_OPTIONS = ['centos7', 'ubuntu22', 'ubuntu24', 'rocky8', 'rocky9', 'debian'];

const TYPE_OPTIONS = [
  { key: '1', id: 'upgrade', label: '升级包（业务产物全集，不含 store，依赖目标机既有 store 离线补装）' },
  { key: '2', id: 'deploy', label: '全量部署包（新部署：含构建产物 + 生产依赖 store + runtime 二进制）' },
];

const VARIANT_OPTIONS = [
  { key: '1', id: 'oss', label: '开源（oss）' },
  { key: '2', id: 'private', label: '闭源（private，含 impl-mx 私有实现包）' },
];

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// 自管理行队列：rl.question() 在管道（非 TTY）输入下多次提问会丢失后续行事件。
// line 事件可能同步连发而 resolver 异步注册，因此行先到则入缓冲，ask 时先取缓冲：
// 行到达与 ask 调用的先后顺序任意，均不会丢失输入。
const inputBuffer = [];
const pendingAnswers = [];
rl.on('line', (line) => {
  const resolve = pendingAnswers.shift();
  if (resolve) {
    resolve(line.trim());
  } else {
    inputBuffer.push(line.trim());
  }
});
rl.on('close', () => {
  // 输入提前结束（管道 EOF / Ctrl+D）：剩余问题以空串兜底，由默认值处理
  while (pendingAnswers.length) {
    const resolve = pendingAnswers.shift();
    resolve(inputBuffer.length ? inputBuffer.shift() : '');
  }
});

function log(msg) {
  console.log(`[Pack-Menu] ${msg}`);
}
function error(msg) {
  console.error(`[Pack-Menu] ERROR: ${msg}`);
}

function ask(question) {
  process.stdout.write(question);
  return new Promise((resolve) => {
    const buffered = inputBuffer.shift();
    if (buffered !== undefined) {
      resolve(buffered);
    } else {
      pendingAnswers.push(resolve);
    }
  });
}

function pick(options, question, defKey = options[0].key) {
  return new Promise((resolve) => {
    console.log('');
    for (const opt of options) {
      console.log(`  [${opt.key}] ${opt.label}`);
    }
    ask(`${question} [${defKey}]: `).then((ans) => {
      const found = options.find((o) => o.key === ans);
      resolve(found || options.find((o) => o.key === defKey));
    });
  });
}

/**
 * 拼装打包命令
 * @param {string} type upgrade / deploy
 * @param {string} variant oss / private
 * @param {string} channel win / linux / docker / all
 * @param {string|null} osArg Linux OS 变体（容器通道）
 */
function buildCommand(type, variant, channel, osArg) {
  const variantArgs = variant === 'private' ? ['--variant', 'private'] : [];

  if (channel === 'docker') {
    const args = ['scripts/pack-linux-deploy.js'];
    if (type === 'upgrade') args.push('--upgrade');
    if (osArg) args.push('--os', osArg);
    return [...args, ...variantArgs];
  }

  // 本机直打（win 通道仅 Windows 打包机；linux 通道仅 Linux 打包机）
  const args = ['scripts/pack-offline.js'];
  if (type === 'upgrade') args.push('--upgrade');
  else if (type === 'deploy') args.push('--deploy');
  if (channel === 'win') args.push('--win');
  else if (channel === 'linux') args.push('--linux');
  return [...args, ...variantArgs];
}

function run(cmdArgs) {
  return new Promise((resolve, reject) => {
    log(`执行: node ${cmdArgs.join(' ')}`);
    log('');
    const child = spawn(process.execPath, cmdArgs, {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      shell: false,
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`打包命令退出码: ${code}`));
    });
    child.on('error', reject);
  });
}

async function main() {
  log('============================================');
  log(` ${PRODUCT_NAME} 打包交互菜单`);
  log('============================================');
  log(`打包机: ${IS_WINDOWS ? 'Windows' : 'Linux'}`);
  log('');

  // 1. 打包类型
  const type = await pick(TYPE_OPTIONS, '请选择打包类型');
  const typeLabel = type.label.split('（')[0];

  // 2. variant（升级包/部署包均区分 oss/private）
  const variant = await pick(VARIANT_OPTIONS, '请选择 variant');
  if (variant.id === 'private') {
    const implMxPkg = path.join(PROJECT_ROOT, 'packages', 'impl-mx', 'package.json');
    if (!require('fs').existsSync(implMxPkg)) {
      error('闭源（private）需要本地存在 packages/impl-mx（私有实现包）');
      process.exit(1);
    }
  }

  // 3. 平台通道
  const isUpgrade = type.id === 'upgrade';
  const label = isUpgrade ? '升级包' : '全量部署包';
  const channelOptions = [];
  if (IS_WINDOWS) {
    channelOptions.push({ key: '1', id: 'win', label: `Windows ${label}（本机直打）` });
    channelOptions.push({ key: '2', id: 'docker', label: `Linux ${label}（Docker 容器内打包，原生依赖为 Linux 二进制）` });
  } else {
    channelOptions.push({ key: '1', id: 'linux', label: `Linux ${label}（本机直打，原生依赖为本机 Linux 二进制）` });
    channelOptions.push({ key: '2', id: 'docker', label: `Linux ${label}（Docker 容器内打包，可指定发行版）` });
  }
  const channel = await pick(channelOptions, '请选择平台通道');

  // 4. Linux 容器通道：选择 OS 变体
  let osArg = null;
  if (channel.id === 'docker') {
    osArg = (
      await pick(
        OS_OPTIONS.map((o, i) => ({ key: String(i + 1), id: o, label: o })),
        '请选择目标 Linux 发行版',
        '1'
      )
    ).id;
  }

  // 5. 汇总确认
  const cmdArgs = buildCommand(type.id, variant.id, channel.id, osArg);
  const osLabel = osArg ? ` / ${osArg}` : '';
  const channelLabel =
    channel.id === 'docker' ? 'Linux 容器' : channel.id === 'all' ? '全部平台' : channel.id === 'win' ? 'Windows' : 'Linux';

  console.log('');
  log('============================================');
  log(' 打包配置确认');
  log('============================================');
  log(`  类型   : ${typeLabel}`);
  log(`  variant: ${variant.label}`);
  log(`  平台   : ${channelLabel}${osLabel}`);
  log(`  命令   : node ${cmdArgs.join(' ')}`);
  log('============================================');
  console.log('');

  const confirm = await ask('确认执行打包？(y/N): ');
  if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
    log('已取消');
    process.exit(0);
  }

  try {
    await run(cmdArgs);
    log('');
    log('✓ 打包完成');
    process.exit(0);
  } catch (err) {
    error(err.message);
    process.exit(1);
  }
}

main();
