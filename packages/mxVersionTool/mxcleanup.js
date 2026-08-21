const { default: mxPath } = require('./mxpath');
const { executeSpawn } = require('./mx-executor');

function mxCleanup(targetPath, callback) {
  const args = ['cleanup', targetPath];
  executeSpawn(mxPath, args)
    .then(stdout => {
      callback(null, stdout);
    })
    .catch(error => {
      callback(error);
    });
}

module.exports = mxCleanup;
