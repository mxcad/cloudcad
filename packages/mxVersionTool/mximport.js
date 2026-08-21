const fs = require('fs');
const path = require('path');
const os = require('os');
const { default: mxPath } = require('./mxpath');
const { executeSpawn } = require('./mx-executor');

function mxImport(importPath, repoUrl, message, callback) {
  const args = ['import', importPath, repoUrl];

  let tempFile = null;
  if (message) {
    try {
      tempFile = path.join(
        os.tmpdir(),
        `mx-import-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.txt`
      );
      fs.writeFileSync(tempFile, message, 'utf8');
      args.push('-F', tempFile);
    } catch (error) {
      args.push('-m', message);
      tempFile = null;
    }
  } else {
    args.push('-m', '');
  }

  function cleanup() {
    if (tempFile && fs.existsSync(tempFile)) {
      try { fs.unlinkSync(tempFile); } catch (e) { /* ignore */ }
    }
  }

  executeSpawn(mxPath, args)
    .then(stdout => {
      cleanup();
      callback(null, stdout);
    })
    .catch(error => {
      cleanup();
      callback(error);
    });
}

module.exports = mxImport;
