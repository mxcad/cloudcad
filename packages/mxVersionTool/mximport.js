const fs = require('fs');
const path = require('path');
const os = require('os');
const { default: mxPath } = require('./mxpath');
const { executeCommand } = require('./mx-executor');

function mxImport(importPath, repoUrl, message, callback) {
  let command = `${mxPath} import "${importPath}" ${repoUrl}`;

  let tempFile = null;
  if (message) {
    try {
      tempFile = path.join(
        os.tmpdir(),
        `mx-import-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.txt`
      );
      fs.writeFileSync(tempFile, message, 'utf8');
      command += ` -F "${tempFile}"`;
    } catch (error) {
      command += ` -m "${message}"`;
      tempFile = null;
    }
  } else {
    command += ` -m ""`;
  }

  executeCommand(command, {
    encoding: 'utf8'
  })
    .then(stdout => {
      if (tempFile && fs.existsSync(tempFile)) {
        try { fs.unlinkSync(tempFile); } catch (cleanupError) { /* ignore */ }
      }
      callback(null, stdout);
    })
    .catch(error => {
      if (tempFile && fs.existsSync(tempFile)) {
        try { fs.unlinkSync(tempFile); } catch (cleanupError) { /* ignore */ }
      }
      callback(error);
    });
}

module.exports = mxImport;
