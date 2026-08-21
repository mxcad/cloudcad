const fs = require('fs');
const path = require('path');
const os = require('os');
const { default: mxPath } = require('./mxpath');
const { executeSpawn } = require('./mx-executor');

function mxPropset(targetPath, propertyName, propertyValue, callback) {
  const hasNewline = propertyValue.includes('\n');

  let tempFile = null;

  if (hasNewline) {
    tempFile = path.join(
      os.tmpdir(),
      `mx-prop-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.txt`
    );
    fs.writeFileSync(tempFile, propertyValue, 'utf8');
  }

  const args = ['propset', propertyName];
  if (tempFile) {
    args.push('-F', tempFile);
  } else {
    args.push(propertyValue);
  }
  args.push(targetPath, '--force');

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

module.exports = mxPropset;
