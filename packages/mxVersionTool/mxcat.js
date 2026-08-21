const { default: mxPath } = require('./mxpath');
const { executeExecFile } = require('./mx-executor');

const MAX_BUFFER_SIZE = 50 * 1024 * 1024;

function mxCat(filePath, revision, username, password, callback) {
  const args = ['cat'];

  if (revision) {
    args.push('-r', revision.toString());
  }

  if (filePath) {
    args.push(filePath);
  }

  if (username) {
    args.push('--username', username);
  }
  if (password) {
    args.push('--password', password);
  }

  executeExecFile(mxPath, args, {
    encoding: 'buffer',
    maxBuffer: MAX_BUFFER_SIZE
  })
    .then(stdout => {
      callback(null, stdout);
    })
    .catch(error => {
      callback(error);
    });
}

module.exports = mxCat;
