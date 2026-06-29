const fs = require('fs');
const path = require('path');
const os = require('os');
const { default: mxPath } = require('./mxpath');
const { executeCommand } = require('./mx-executor');

function mxPropset(targetPath, propertyName, propertyValue, callback) {
  const hasNewline = propertyValue.includes('\n');
  
  let command;
  let tempFile = null;
  
  if (hasNewline) {
    tempFile = path.join(
      os.tmpdir(),
      `mx-prop-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.txt`
    );
    fs.writeFileSync(tempFile, propertyValue, 'utf8');
    command = `${mxPath} propset ${propertyName} -F "${tempFile}" "${targetPath}" --force`;
  } else {
    const escapedValue = propertyValue.replace(/"/g, '\\"');
    command = `${mxPath} propset ${propertyName} "${escapedValue}" "${targetPath}" --force`;
  }
  
  executeCommand(command)
    .then(stdout => {
      if (tempFile && fs.existsSync(tempFile)) {
        try { fs.unlinkSync(tempFile); } catch (e) { /* ignore */ }
      }
      callback(null, stdout);
    })
    .catch(error => {
      if (tempFile && fs.existsSync(tempFile)) {
        try { fs.unlinkSync(tempFile); } catch (e) { /* ignore */ }
      }
      callback(error);
    });
}

module.exports = mxPropset;
