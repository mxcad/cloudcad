const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const jestCmd = path.join(__dirname, 'node_modules/jest/bin/jest.js');
const configPath = path.join(__dirname, 'test/jest-simple.json');
const outputFile = path.join(__dirname, 'test-result-output.txt');

try {
    const result = execSync(`node "${jestCmd}" --config "${configPath}" --verbose --forceExit`, {
        cwd: __dirname,
        encoding: 'utf8',
        env: { ...process.env, NODE_ENV: 'test' }
    });
    fs.writeFileSync(outputFile, 'SUCCESS\n' + (result || ''));
    console.log('Tests completed successfully');
    process.exit(0);
} catch (error) {
    const output = error.stdout?.toString() || '';
    const stderr = error.stderr?.toString() || '';
    fs.writeFileSync(outputFile, 'FAILED\n' + output + '\n' + stderr + '\nExit code: ' + error.status);
    console.log('Tests failed - output written to file');
    process.exit(1);
}
