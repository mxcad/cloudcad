/**
 * 启动 MxCAD 协同服务
 * 运行方式：node scripts/start-cooperate.js
 */
const { spawn } = require('child_process');
const path = require('path');

// MxCAD 协同服务可执行文件路径
const MXCAD_ASSEMBLY_PATH =
  process.env.MXCAD_ASSEMBLY_PATH ||
  path.resolve(__dirname, '../../mxcadassembly/windows/release/mxcadassembly.exe');

// 协同服务启动参数
const COOPERATE_ARGS = JSON.stringify({
  run_cooperate_server: true,
  print_server: true,
});

console.log('[Cooperate] 启动 MxCAD 协同服务...');
console.log('[Cooperate] 路径:', MXCAD_ASSEMBLY_PATH);
console.log('[Cooperate] 参数:', COOPERATE_ARGS);

// 启动协同服务进程
const cooperateProcess = spawn(MXCAD_ASSEMBLY_PATH, [COOPERATE_ARGS], {
  stdio: 'inherit',
  shell: true,
});

// 处理进程事件
cooperateProcess.on('error', (err) => {
  console.error('[Cooperate] 启动失败:', err.message);
  process.exit(1);
});

cooperateProcess.on('exit', (code, signal) => {
  if (code !== 0 && code !== null) {
    console.error(`[Cooperate] 进程异常退出，退出码: ${code}`);
    process.exit(code);
  }
  console.log('[Cooperate] 服务已停止');
});

// 优雅退出处理
process.on('SIGINT', () => {
  console.log('\n[Cooperate] 正在停止服务...');
  cooperateProcess.kill('SIGTERM');
});

process.on('SIGTERM', () => {
  cooperateProcess.kill('SIGTERM');
});
