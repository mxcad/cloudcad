const { default: mxPath } = require('./mxpath');
const { executeSpawn } = require('./mx-executor');

function mxRevert(targetPath, isRecursive, callback) {
  const args = ['revert'];

  if (isRecursive) {
    args.push('-R');
  }

  args.push(targetPath);

  executeSpawn(mxPath, args)
    .then(stdout => {
      callback(null, stdout);
    })
    .catch(error => {
      callback(error);
    });
}

module.exports = mxRevert;