
const { spawn } = require('child_process');

console.log('🚀 启动后端服务...');
console.log('📍 工作目录:', __dirname);

const child = spawn(
  'pnpm',
  ['exec', 'tsx', 'src/main.ts'],
  {
    cwd: __dirname,
    env: process.env,
    shell: true,
    stdio: 'inherit'
  }
);

child.on('error', function(error) {
  console.error('❌ 错误:', error);
});

child.on('close', function(code) {
  console.log('👋 子进程退出，代码:', code);
});
