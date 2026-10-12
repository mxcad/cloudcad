const { mx, writeTempText } = require('./mx');

function mxPropset(targetPath, propertyName, propertyValue, callback) {
  const hasNewline = propertyValue.includes('\n');

  let tempFile = null;

  if (hasNewline) {
    tempFile = writeTempText('propset', propertyValue);
  }

  const args = [propertyName];
  if (tempFile) {
    args.push('-F', tempFile);
  } else {
    args.push(propertyValue);
  }
  args.push(targetPath, '--force');

  mx('propset', args, { cleanup: tempFile ? [tempFile] : [] })
    .then(stdout => {
      callback(null, stdout);
    })
    .catch(error => {
      callback(error);
    });
}

module.exports = mxPropset;
