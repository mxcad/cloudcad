/**
 * Docker 形态 status 命令的状态格式化 —— 纯函数（#434，ADR-0075 D3）
 *
 * 容器状态（docker inspect 的 State.Status / State.Health.Status）与宿主进程状态
 * （pidfile 存活 + 端口可连，双判据同 host-process.js）→ 人类可读文案。
 * 纯函数、无 IO、无依赖，单测覆盖；cmdStatus（docker-runtime/index.js）消费。
 */

/**
 * 容器状态文案。
 * @param {string} state docker State.Status（running / exited / created / ...）
 * @param {string} health docker State.Health.Status（healthy / unhealthy / starting；无健康检查时为 '-'）
 * @returns {string}
 */
function formatContainerState(state, health) {
  if (state === 'running') {
    return health && health !== '-' ? `运行中 / ${health}` : '运行中';
  }
  return `已停止（${state}）`;
}

/**
 * 宿主进程状态文案（双判据：pidfile 存活 且 端口可连）。
 * @param {number|null} pid pidfile 读到的 pid（无 pidfile = null）
 * @param {boolean} alive pid 进程是否存活
 * @param {boolean} portOk 端口是否可连（alive 时才有意义）
 * @returns {string}
 */
function formatHostProcState(pid, alive, portOk) {
  if (!pid) return '未运行';
  if (!alive) return '已停止';
  return portOk ? '运行中' : '运行中（端口未就绪）';
}

module.exports = { formatContainerState, formatHostProcState };
