
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const outputFile = path.join(__dirname, 'test-output.log');
console.log('Running tests and writing output to:', outputFile);

const child = exec(
  'pnpm exec jest test/integration/auth-token-refresh.integration.spec.ts --config test/jest-integration.json --verbose --no-cache',
  {
    cwd: __dirname,
    maxBuffer: 1024 * 1024 * 10 // 10MB
  }
);

const output = [];

child.stdout.on('data', (data) => {
  output.push(data);
  process.stdout.write(data);
});

child.stderr.on('data', (data) => {
  output.push(data);
  process.stderr.write(data);
});

child.on('close', (code) => {
  console.log('\nTest process exited with code:', code);
  fs.writeFileSync(outputFile, output.join(''), 'utf-8');
  console.log('Output written to:', outputFile);
});
