/**
 * Redis 启动参数构建（纯函数，0 外部依赖）
 *
 * 从 redis-manager.js 的 startRedis() 抽出：argv 数组此前是内联构造，
 * 要断言它只能真的 spawn 一个 redis-server。抽成纯函数后单测直接断言数组，
 * 覆盖两件事——ADR-0076 的「--logfile 非空即关闭 stdout」，以及密码经
 * 配置文件传入、不出现在进程列表里的可见性约束。
 *
 * 纯函数库，无顶层副作用（与 lib/redis-takeover.js 同约定），require 安全。
 * 密码配置文件的写入（IO）仍留在 startRedis()：写不进去时退回
 * --requirepass 命令行参数是降级分支，不在此函数内表达。
 */

// notice 是 Redis 的常规信息级（debug/verbose/notice/warning 中第三档）：
// 细节留痕但体量很小（AOF/fsync/主从事件），配合 Redis 不自带轮转可以接受。
const REDIS_LOG_LEVEL = 'notice';

/**
 * 构建 redis-server 的 argv。
 *
 * @param {object} params
 * @param {number} params.port 监听端口
 * @param {string} params.dataDir 工作目录（RDB/AOF 落点）
 * @param {string} params.logFile 日志文件绝对路径；Redis 不创建父目录
 * @param {string} [params.authConfPath] 密码配置文件路径，非空时置于 argv 首位
 * @returns {string[]} redis-server 的 argv
 */
function buildRedisArgs({ port, dataDir, logFile, authConfPath }) {
  const args = [
    '--port',
    String(port),
    '--dir',
    dataDir,
    '--appendonly',
    'yes',
    // --logfile 非空即关闭 stdout 输出（ADR-0076 级别分裂）：实时日志只看 error，
    // notice 级细节全落盘留痕
    '--logfile',
    logFile,
    '--loglevel',
    REDIS_LOG_LEVEL,
  ];

  if (authConfPath) {
    args.unshift(authConfPath);
  }

  return args;
}

module.exports = { buildRedisArgs, REDIS_LOG_LEVEL };
