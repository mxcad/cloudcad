
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Checking test files...');

// List test files
const testDir = path.join(__dirname, 'test', 'integration');
if (fs.existsSync(testDir)) {
  const files = fs.readdirSync(testDir);
  console.log('Found test files:');
  files.forEach(f => console.log(`  - ${f}`));
  console.log(`Total: ${files.length} test files\n`);
}

// Try to run Jest directly
console.log('Trying to run Jest...');
try {
  const result = execSync('pnpm exec jest --listTests --config test/jest-integration.json', {
    encoding: 'utf-8',
    cwd: __dirname
  });
  console.log('Tests found by Jest:');
  console.log(result);
} catch (error) {
  console.error('Error running Jest:', error.message);
  if (error.stdout) console.error('Stdout:', error.stdout);
  if (error.stderr) console.error('Stderr:', error.stderr);
}
