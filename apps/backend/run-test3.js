const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const backendDir = 'D:\\project\\cloudcad\\apps\\backend';
const outputFile = path.join(backendDir, 'test-output.log');
let output = '';

const jest = spawn('node', [
  'node_modules/jest/bin/jest.js',
  '--config', path.join(backendDir, 'test', 'jest-integration.json'),
  '--testPathPatterns=cad-save-version',
  '--forceExit',
  '--verbose'
], { cwd: backendDir, shell: true });

jest.stdout.on('data', (data) => {
  const text = data.toString();
  output += text;
  console.log(text);
});

jest.stderr.on('data', (data) => {
  const text = data.toString();
  output += text;
  console.error(text);
});

jest.on('close', (code) => {
  fs.writeFileSync(outputFile, output);
  console.log('Exit code:', code);
  console.log('Output saved to:', outputFile);
});
