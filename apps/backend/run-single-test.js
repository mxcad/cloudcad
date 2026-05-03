const { spawn } = require('child_process');
const fs = require('fs');

const jest = spawn('node', ['node_modules/jest/bin/jest.js', 'test/integration/project-member.integration.spec.ts', '--verbose', '--forceExit'], {
  cwd: __dirname,
  env: { ...process.env, NODE_ENV: 'test' }
});

let output = '';

jest.stdout.on('data', (data) => {
  output += data.toString();
  process.stdout.write(data);
});

jest.stderr.on('data', (data) => {
  output += data.toString();
  process.stderr.write(data);
});

jest.on('close', (code) => {
  fs.writeFileSync('test-result.txt', output);
  process.exit(code);
});
