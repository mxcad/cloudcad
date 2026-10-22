/**
 * 梦想网页CAD实时协同平台 打包交互菜单
 *
 * 通过交互式命令选择，避免记忆命令参数。分步维度（ADR-0075 C1）：
 *   1. 交付形态（裸机 / Docker）——产物跑在哪
 *   2. 打包类型（增量升级包 / 全量部署包）
 *   3. variant（开源 oss / 闭源 private）
 *   4. 裸机：构建通道（本机直打 / Docker 容器构建）+ OS 变体；Docker：宿主平台
 *
 * 交付形态与构建通道是两个正交维度（旧「docker 通道」= 构建通道，已更名）：
 *   - 交付形态 = 产物跑在裸机还是 Docker 容器
 *   - 构建通道 = 在哪打包（本机直打 / Docker 容器内构建），仅裸机 Linux 相关
 *
 * 置灰组合（选中即拒绝并提示，v3 逐步解锁）：
 *   - upgrade + docker   → v3（Docker 升级包）
 *
 * 已解锁（v2 #440/#441/#444）：docker + windows 宿主（Docker Desktop 检测 + 安装指引，
 * 不捆绑安装器；须在 Windows x64 打包机上打；--verify 走 verify-windows-docker.js：
 * start.bat E2E + 宿主侧二次探针 + stop.bat，#444）；
 * docker + private（impl-mx 经 implmx 命名上下文烘焙进 app 镜像，打包机须有 packages/impl-mx）
 *
 * 使用方式：
 *   node scripts/pack-menu.js     # 或 pnpm pack:menu
 *
 * 平台约束（与 pack-offline.js 一致）：
 *   - 升级包/部署包的依赖 store 原生依赖与打包环境平台强相关：
 *     Linux 包必须在 Linux 环境产出（推荐容器构建通道），Windows 上打 Linux 包会被拒绝
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
// 发行版清单单一事实源（pack-lib/linux-os.js，ADR-0059 收敛 3 glibc 档）
const { LINUX_OS } = require('./pack-lib/linux-os');

const OS_OPTIONS = Object.entries(LINUX_OS).map(([id, def]) => ({
  id,
  label: def.label,
}));

// 交付形态（ADR-0075 C1）：产物跑在哪
const FORM_OPTIONS = [
  { key: '1', id: 'bare', label: '裸机部署包（Windows / Linux 裸机，现状保留）' },
  { key: '2', id: 'docker', label: 'Docker 部署包（linux / windows 宿主；oss / private 变体）' },
];

const TYPE_OPTIONS = [
  { key: '1', id: 'upgrade', label: '升级包（业务产物全集，不含 store，依赖目标机既有 store 离线补装）' },
  { key: '2', id: 'deploy', label: '全量部署包（新部署：含构建产物 + 生产依赖 store + runtime 二进制）' },
];

const VARIANT_OPTIONS = [
  { key: '1', id: 'oss', label: '开源（oss）' },
  { key: '2', id: 'private', label: '闭源（private，含 impl-mx 私有实现包）' },
];

// 构建通道（ADR-0075 C1，旧称「docker 通道」）：在哪打包。
// win = Windows 本机直打；linux = Linux 本机直打；container = Docker 容器内构建。
const BUILD_CHANNEL_OPTIONS = {
  win: [
    { key: '1', id: 'win', label: 'Windows（本机直打）' },
    { key: '2', id: 'container', label: 'Linux（Docker 容器内构建，原生依赖为 Linux 二进制）' },
  ],
  linux: [
    { key: '1', id: 'linux', label: 'Linux（本机直打，原生依赖为本机 Linux 二进制）' },
    { key: '2', id: 'container', label: 'Linux（Docker 容器内构建，可指定发行版）' },
  ],
};

// Docker 交付形态的宿主平台（ADR-0075 #440：windows 宿主 = Docker Desktop 检测 + 安装指引，
// 不捆绑 Docker 物料；须在 Windows x64 打包机上打）
const DOCKER_HOST_OPTIONS = [
  { key: '1', id: 'linux', label: 'Linux 宿主（--network=host + rootless 兜底 + 包内静态 Docker）' },
  { key: '2', id: 'windows', label: 'Windows 宿主（Docker Desktop + bridge 网络；须在 Windows 打包机）' },
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

/**
 * 交互式选择。options 项可带 `disabled`（置灰：展示但不可选，选中即提示并重问）。
 * @param {Array<{key: string, id: string, label: string, disabled?: string}>} options
 * @param {string} question
 * @param {string} defKey 默认项 key（必须为非置灰项；空输入回落到它）
 */
function pick(options, question, defKey = options[0].key) {
  const render = () => {
    console.log('');
    for (const opt of options) {
      const marker = opt.disabled ? `  —— ${opt.disabled}` : '';
      console.log(`  [${opt.key}] ${opt.label}${marker}`);
    }
  };
  const doAsk = () => {
    render();
    return ask(`${question} [${defKey}]: `).then((ans) => {
      const found = options.find((o) => o.key === ans) || options.find((o) => o.key === defKey);
      if (found.disabled) {
        console.log(`  该选项当前不可用：${found.disabled}，请重选`);
        return doAsk();
      }
      return found;
    });
  };
  return doAsk();
}

/**
 * 拼装裸机包命令
 * @param {string} type upgrade / deploy
 * @param {string} variant oss / private
 * @param {string} channel win / linux / container（构建通道）
 * @param {string|null} osArg Linux OS 变体（container 构建通道）
 */
function buildCommand(type, variant, channel, osArg) {
  const variantArgs = variant === 'private' ? ['--variant', 'private'] : [];

  if (channel === 'container') {
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

/**
 * 拼装升级包命令（平台无关，免 Docker 本机直打）
 * 升级包只含业务产物（dist/migrations/scripts），不含生产依赖 store 与 engine 二进制
 * （线上 engine 不动），因此不区分 Windows/Linux 通道，统一走 pack-linux-deploy.js --upgrade
 * （其内部已实现免 Docker 本机直打）。
 * @param {string} variant oss / private
 * @returns {string[]} node 命令参数数组
 */
function buildUpgradeCommand(variant) {
  const variantArgs = variant === 'private' ? ['--variant', 'private'] : [];
  return ['scripts/pack-linux-deploy.js', '--upgrade', ...variantArgs];
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

  // 1. 交付形态（裸机 / Docker）
  const form = await pick(FORM_OPTIONS, '请选择交付形态');

  // 2. 打包类型（Docker 形态：upgrade 置灰，v3）
  const typeOptions = TYPE_OPTIONS.map((o) =>
    form.id === 'docker' && o.id === 'upgrade' ? { ...o, disabled: 'v3 不可用（Docker 升级包）' } : o
  );
  const type = await pick(typeOptions, '请选择打包类型', form.id === 'docker' ? '2' : '1');
  const typeLabel = type.label.split('（')[0];

  // 3. variant（Docker 形态 private 自 #441 起可用：implmx 命名上下文烘焙 impl-mx）
  const variant = await pick(VARIANT_OPTIONS, '请选择 variant');
  if (variant.id === 'private') {
    const implMxPkg = path.join(PROJECT_ROOT, 'packages', 'impl-mx', 'package.json');
    if (!require('fs').existsSync(implMxPkg)) {
      error('闭源（private）需要本地存在 packages/impl-mx（私有实现包）');
      process.exit(1);
    }
  }

  let cmdArgs;
  let channelLabel;

  if (form.id === 'docker') {
    // Docker 交付形态：宿主平台透传 --host-platform（#440）；variant 透传 --variant（#441）；
    // 路由 pack-linux-docker.js
    const host = await pick(DOCKER_HOST_OPTIONS, '请选择宿主平台');
    const variantArgs = variant.id === 'private' ? ['--variant', 'private'] : [];
    cmdArgs = ['scripts/pack-linux-docker.js', '--host-platform', host.id, ...variantArgs];
    channelLabel = `Docker 部署包（${host.id} 宿主）`;
  } else {
    // 裸机交付形态
    const isUpgrade = type.id === 'upgrade';
    const label = isUpgrade ? '升级包' : '全量部署包';
    let osArg = null;

    if (isUpgrade) {
      // 升级包：免 Docker 本机直打，内容为业务产物（dist/scripts），不含生产依赖 store 与
      // engine 二进制（线上 engine 不动），因此平台无关，无需区分构建通道。
      // 统一走 pack-linux-deploy.js --upgrade（其内部已实现免 Docker 本机直打）。
      log('');
      log('升级包为平台无关的业务产物增量包（免 Docker 本机直打，线上 engine 不动）');
      cmdArgs = buildUpgradeCommand(variant.id);
      channelLabel = '平台无关（免 Docker 本机直打）';
    } else {
      // 全量部署包：需区分构建通道（store/运行时二进制与平台强相关）
      const channel = await pick(BUILD_CHANNEL_OPTIONS[IS_WINDOWS ? 'win' : 'linux'], '请选择构建通道');

      // Linux 容器构建通道：选择 OS 变体（清单与 pack-linux-deploy --os 同源）
      if (channel.id === 'container') {
        osArg = (
          await pick(
            OS_OPTIONS.map((o, i) => ({ key: String(i + 1), id: o.id, label: o.label })),
            '请选择目标 Linux 发行版',
            '1'
          )
        ).id;
      }
      cmdArgs = buildCommand(type.id, variant.id, channel.id, osArg);
      const osLabel = osArg ? ` / ${osArg}` : '';
      channelLabel =
        channel.id === 'container'
          ? `Linux（Docker 容器构建）${osLabel}`
          : channel.id === 'win'
            ? `Windows（本机直打）${osLabel}`
            : `Linux（本机直打）${osLabel}`;
    }
  }

  // 汇总确认
  console.log('');
  log('============================================');
  log(' 打包配置确认');
  log('============================================');
  log(`  交付形态: ${form.id === 'docker' ? 'Docker' : '裸机'}`);
  log(`  类型   : ${typeLabel}`);
  log(`  variant: ${variant.label}`);
  log(`  平台   : ${channelLabel}`);
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
