const { execSync } = require('child_process');
const path = require('path');

const bin = path.resolve(__dirname, '..', 'node_modules', '@hey-api', 'openapi-ts', 'bin', 'run.js');

try {
  execSync(`node "${bin}"`, {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
    timeout: 60000,
  });
} catch (err) {
  process.exit(err.status || 1);
}
