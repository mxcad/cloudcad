const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const cwd = path.join(__dirname);
const outputFile = path.join(cwd, 'test-output.log');
let output = '';

const jest = spawn('node', [
  'node_modules/jest/bin/jest.js',
  '--config', './test/jest-integration.json',
  '--testPathPatterns=cad-save-version',
  '--forceExit',
  '--verbose'
], { cwd, shell: true });

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
