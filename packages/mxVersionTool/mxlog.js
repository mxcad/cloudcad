const { default: mxPath } = require('./mxpath');
const { executeCommand } = require('./mx-executor');

function mxLog(targetPath, limit, verbose, username, password, callback) {
  let command = `${mxPath} log`;

  if (verbose) {
    command += ' -v';
  }

  if (limit && limit > 0) {
    command += ` -l ${limit}`;
  }

  if (targetPath) {
    command += ` ${targetPath}`;
  }

  if (username) {
    command += ` --username ${username}`;
  }
  if (password) {
    command += ` --password ${password}`;
  }

  command += ' --xml';

  executeCommand(command, {
    maxBuffer: 10 * 1024 * 1024,
    encoding: 'utf8'
  })
    .then(stdout => {
      callback(null, stdout);
    })
    .catch(error => {
      if (error.message && error.message.includes('E160013')) {
        callback(null, '<?xml version="1.0"?>\n<log></log>');
        return;
      }
      callback(error);
    });
}

module.exports = mxLog;
