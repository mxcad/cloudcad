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