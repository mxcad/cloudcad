const { exec, spawn, execFile } = require('child_process');
const svnPathModule = require('./svnpath');

/**
 * 执行 SVN 命令（使用 exec）
 * @param {string} command 完整的命令字符串
 * @param {Object} options 额外的选项
 * @returns {Promise<string>} 命令执行结果
 */
function executeCommand(command, options = {}) {
  const execOptions = svnPathModule.getExecOptions();
  Object.assign(execOptions, options);
  
  return new Promise((resolve, reject) => {
    exec(command, execOptions, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve(stdout);
      }
    });
  });
}

/**
 * 执行 SVN 命令（使用 spawn）
 * @param {string} executable 可执行文件路径
 * @param {string[]} args 命令参数数组
 * @param {Object} options 额外的选项
 * @returns {Promise<string>} 命令执行结果
 */
function executeSpawn(executable, args, options = {}) {
  const spawnOptions = svnPathModule.getSpawnOptions();
  Object.assign(spawnOptions, options);
  
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, spawnOptions);
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString('utf8');
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString('utf8');
    });
    
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Command failed with code ${code}`));
      } else {
        resolve(stdout);
      }
    });
    
    child.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * 执行 SVN 命令（使用 execFile）
 * @param {string} executable 可执行文件路径
 * @param {string[]} args 命令参数数组
 * @param {Object} options 额外的选项
 * @returns {Promise<string|Buffer>} 命令执行结果
 */
function executeExecFile(executable, args, options = {}) {
  const execOptions = svnPathModule.getExecOptions();
  Object.assign(execOptions, options);
  
  return new Promise((resolve, reject) => {
    execFile(executable, args, execOptions, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve(stdout);
      }
    });
  });
}

module.exports = {
  executeCommand,
  executeSpawn,
  executeExecFile
};