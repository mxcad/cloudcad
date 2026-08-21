const { exec, spawn, execFile } = require('child_process');
const mxPathModule = require('./mxpath');

function executeCommand(command, options = {}) {
  const execOptions = mxPathModule.getExecOptions();
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

function executeSpawn(executable, args, options = {}) {
  const spawnOptions = mxPathModule.getSpawnOptions();
  Object.assign(spawnOptions, options);
  
  // 合并 env：保留 getSpawnOptions 中的 env 设置（如 LD_LIBRARY_PATH），
  // 同时合并调用方传入的额外环境变量（如 SVN_PASSWORD）
  if (options.env && options.env !== spawnOptions.env) {
    spawnOptions.env = { ...(spawnOptions.env || process.env), ...options.env };
  }
  
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
        const fullError = [stderr, stdout].filter(Boolean).join('\n').trim() || `Command failed with code ${code}`;
        reject(new Error(fullError));
      } else {
        resolve(stdout);
      }
    });
    
    child.on('error', (error) => {
      reject(error);
    });
  });
}

function executeExecFile(executable, args, options = {}) {
  const execOptions = mxPathModule.getExecOptions();
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