const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const backendDir = 'D:\\project\\cloudcad\\apps\\backend';
const outputFile = path.join(backendDir, 'jest-test-output.log');

const jestConfig = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: backendDir,
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testMatch: ['**/test/integration/*.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        module: 'commonjs',
        moduleResolution: 'node',
        target: 'ES2022',
        emitDecoratorMetadata: true,
        experimentalDecorators: true,
        esModuleInterop: true,
        strict: false,
        noImplicitAny: false,
        strictNullChecks: false,
        noImplicitThis: false,
        alwaysStrict: false,
        skipLibCheck: true,
        isolatedModules: true
      }
    }]
  },
  transformIgnorePatterns: ['/node_modules/', '/packages/'],
  testTimeout: 30000,
  verbose: true,
  forceExit: true,
  clearMocks: true,
  restoreMocks: true,
  resetMocks: true,
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@test/(.*)$': '<rootDir>/src/test/$1',
    '^../../../common/concurrency/rate-limiter$': '<rootDir>/src/common/concurrency/rate-limiter.ts'
  },
  moduleFileExtensions: ['ts', 'js', 'json']
};

const configPath = path.join(backendDir, 'jest-integration-temp.json');
fs.writeFileSync(configPath, JSON.stringify(jestConfig, null, 2));

const jest = spawn('node', [
  'node_modules/jest/bin/jest.js',
  '--config', configPath,
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
  fs.unlinkSync(configPath);
  process.exit(code || 0);
});
