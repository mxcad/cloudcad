const os = require('os');

const isWindows = os.platform() === 'win32';

const svnPath = isWindows
  ? __dirname.replace(/\\/g, '/') + '/subversion/svn.exe'
  : 'svn';

module.exports = svnPath;