#!/usr/bin/env node
console.log('🚀 Starting CloudCAD backend...');
console.log('📍 Working directory:', process.cwd());

const { resolve } = require('path');
const { spawn } = require('child_process');

const mainTs = resolve(__dirname, 'src/main.ts');
console.log('📄 Main TypeScript file:', mainTs);

console.log('📝 Running pnpm exec tsx...');
const child = spawn(
  'pnpm',
  ['exec', 'tsx', mainTs],
  {
    stdio: 'inherit',
    cwd: __dirname,
    env: {
      ...process.env,
      NODE_ENV: 'development',
    },
    shell: true
  }
);

child.on('error', (err) => {
  console.error('❌ Child process error:', err);
  process.exit(1);
});

child.on('close', (code) => {
  console.log(`👋 Child process exited with code ${code}`);
  process.exit(code);
});
