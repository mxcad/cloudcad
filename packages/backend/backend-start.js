#!/usr/bin/env node
console.log('🚀 Starting CloudCAD backend...');
console.log('📍 Working directory:', process.cwd());

try {
  // Load tsx manually to run the TypeScript main file
  const { pathToFileURL } = require('url');
  const { resolve } = require('path');
  const tsxCli = resolve(__dirname, 'node_modules/tsx/dist/cli.mjs');
  
  console.log('📦 Loading tsx from:', tsxCli);
  
  // Use child_process to run tsx
  const { spawn } = require('child_process');
  const child = spawn(
    'node', 
    [ tsxCli, 'src/main.ts' ], 
    {
      stdio: 'inherit',
      cwd: __dirname,
      env: process.env,
      shell: false
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

} catch (err) {
  console.error('❌ Failed to start backend:', err);
  console.error('Stack trace:', err.stack);
  process.exit(1);
}
