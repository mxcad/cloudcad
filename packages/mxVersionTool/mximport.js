const { mx, writeTempText } = require('./mx');

function mxImport(importPath, repoUrl, message, callback) {
  const args = [importPath, repoUrl];

  let tempFile = null;
  if (message) {
    try {
      tempFile = writeTempText('import', message);
      args.push('-F', tempFile);
    } catch (error) {
      args.push('-m', message);
      tempFile = null;
    }
  } else {
    args.push('-m', '');
  }

  mx('import', args, { cleanup: tempFile ? [tempFile] : [] })
    .then(stdout => {
      callback(null, stdout);
    })
    .catch(error => {
      callback(error);
    });
}

module.exports = mxImport;
