const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const backendDir = 'D:\\project\\cloudcad\\apps\\backend';
const outputFile = path.join(backendDir, 'jest-test-output.log');

const jest = spawn('node', [
  'node_modules/jest/bin/jest.js',
  '--config', path.join(backendDir, 'jest.config.ts'),
  '--testPathPatterns=cad-save-version',
  '--forceExit',
  '--verbose'
], { cwd: backendDir, shell: true, env: { ...process.env } });

let output = '';
let errorOutput = '';

jest.stdout.on('data', (data) => {
  const text = data.toString();
  output += text;
  process.stdout.write(text);
});

jest.stderr.on('data', (data) => {
  const text = data.toString();
  errorOutput += text;
  process.stderr.write(text);
});

jest.on('close', (code) => {
  const fullOutput = 'STDOUT:\n' + output + '\n\nSTDERR:\n' + errorOutput + '\n\nExit code: ' + code;
  fs.writeFileSync(outputFile, fullOutput, { encoding: 'utf8' });
  console.log('\n\nOutput saved to:', outputFile);
  process.exit(code || 0);
});
