/**
 * @fileoverview 帮助命令（--help 输出，逐字节保持）
 *
 * Step A-1 机械拆分自 runtime/scripts/cli.js:showHelp（cli.js:2847-2933）。
 * 验收①：--help 输出与拆分前逐字节一致（diff）。
 */

const { colors, log, clearScreen, printHeader } = require('../lib/logger');

function showHelp() {
  clearScreen();
  printHeader();
  log('bright', '>>> 帮助信息');
  console.log('');
  console.log(`${colors.cyan}用法：${colors.reset}`);
  console.log(`  ${colors.green}./cloudcad.sh <命令> [选项]${colors.reset}`);
  console.log('');
  console.log(`${colors.cyan}命令：${colors.reset}`);
  console.log(
    `  ${colors.green}dev${colors.reset}               开发模式（启动基础服务 + 开发服务器）`
  );
  console.log(
    `  ${colors.green}deploy${colors.reset}            部署模式（构建 + 启动生产服务）`
  );
  console.log(
    `  ${colors.green}deploy --skip-build${colors.reset}  部署模式（使用现有构建产物）`
  );
  console.log(
    `  ${colors.green}start${colors.reset}              启动服务（选择 PM2/前台模式）`
  );
  console.log(`  ${colors.green}stop${colors.reset}              停止所有服务`);
  console.log(
    `  ${colors.green}migrate${colors.reset}            执行数据库迁移`
  );
  console.log(`  ${colors.green}seed${colors.reset}              执行种子数据`);
  console.log(
    `  ${colors.green}init${colors.reset}              Linux 环境初始化`
  );
  console.log(
    `  ${colors.green}status${colors.reset}             查看服务状态`
  );
  console.log(`  ${colors.green}logs${colors.reset}              查看服务日志`);
  console.log('');
  console.log(`${colors.cyan}数据库备份与恢复：${colors.reset}`);
  console.log(
    `  ${colors.green}db:backup${colors.reset}            手动备份数据库`
  );
  console.log(
    `  ${colors.green}db:restore [文件]${colors.reset}  恢复数据库（可选指定备份文件）`
  );
  console.log(
    `  ${colors.green}db:list${colors.reset}              查看备份列表`
  );
  console.log(
    `  ${colors.green}db:cleanup --keep N${colors.reset} 清理旧备份，保留 N 个（默认 10）`
  );
  console.log('');
  console.log(`${colors.cyan}图纸版本控制：${colors.reset}`);
  console.log(
    `  ${colors.green}version:check${colors.reset}        图纸版本部署前检查（CLI/仓库/工作副本/磁盘）`
  );
  console.log(
    `  ${colors.green}version:verify${colors.reset}       图纸版本部署后验证（status/info/log/cat/commit）`
  );
  console.log('');
  console.log(`${colors.cyan}启动模式说明：${colors.reset}`);
  console.log(
    `  ${colors.green}PM2 后台模式${colors.reset}  服务在后台运行，关闭终端不影响`
  );
  console.log(
    `  ${colors.green}前台模式${colors.reset}     服务在前台运行，关闭终端则服务停止`
  );
  console.log('');
  console.log(`${colors.cyan}示例：${colors.reset}`);
  console.log(
    `  ${colors.yellow}./cloudcad.sh start${colors.reset}           # 启动服务`
  );
  console.log(
    `  ${colors.yellow}./cloudcad.sh deploy${colors.reset}         # 部署模式`
  );
  console.log(
    `  ${colors.yellow}./cloudcad.sh stop${colors.reset}          # 停止服务`
  );
  console.log(
    `  ${colors.yellow}./cloudcad.sh logs${colors.reset}          # 查看日志`
  );
  console.log(
    `  ${colors.yellow}./cloudcad.sh db:backup${colors.reset}     # 手动备份数据库`
  );
  console.log(
    `  ${colors.yellow}./cloudcad.sh db:list${colors.reset}       # 查看备份列表`
  );
  console.log(
    `  ${colors.yellow}./cloudcad.sh db:restore${colors.reset}    # 恢复数据库`
  );
}

module.exports = {
  showHelp,
};
