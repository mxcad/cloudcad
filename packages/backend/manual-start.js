#!/usr/bin/env node
console.log('Starting backend with tsx');
console.log('CWD:', process.cwd());

// Manually load tsx
const { pathToFileURL } = require('url');
const { resolve } = require('path');
const tsxCli = resolve(__dirname, 'node_modules/tsx/dist/cli.mjs');
console.log('tsxCli path:', tsxCli);

import(tsxCli)
  .then((module) => {
    console.log('tsx loaded successfully');
    // The main export is a function
    const main = module.default;
    // Call it with the args
    main(['node', 'tsx', 'src/main.ts']);
  })
  .catch((err) => {
    console.error('Failed to load tsx:', err);
    console.error('Stack:', err.stack);
  });
