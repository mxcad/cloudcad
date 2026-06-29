const { default: mxPath } = require('./mxpath');
const { executeCommand } = require('./mx-executor');

function mxResolve(targetPath, accept = 'working', callback) {
  if (typeof accept === 'function') {
    callback = accept;
    accept = 'working';
  }

  const command = `${mxPath} resolve "${targetPath}" --accept=${accept}`;

  executeCommand(command)
    .then(stdout => {
      callback(null, stdout);
    })
    .catch(error => {
      callback(error);
    });
}

module.exports = mxResolve;
