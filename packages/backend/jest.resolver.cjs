const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');

const resolver = (request, options) => {
  const { basedir, defaultResolver } = options;

  if (request.startsWith('<rootDir>')) {
    const resolved = request.replace('<rootDir>', options.rootDir || basedir);
    if (fs.existsSync(resolved)) {
      return resolved;
    }
    return resolved;
  }

  return defaultResolver(request, options);
};

module.exports = resolver;
