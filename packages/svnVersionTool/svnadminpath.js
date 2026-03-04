const os = require('os');

const isWindows = os.platform() === 'win32';

const svnadminPath = isWindows
  ? __dirname.replace(/\\/g, '/') + '/subversion/svnadmin.exe'
  : 'svnadmin';

module.exports = svnadminPath;