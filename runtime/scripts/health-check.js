
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

const isWindows = process.platform === 'win32';

function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach(line => {
    const [key, value] = line.split('=', 2);
    if (key && value) {
      process.env[key.trim()] = value.trim();
    }
  });
}

const envPath = path.join(__dirname, '../../apps/backend/.env');
loadEnv(envPath);

function resolvePath(inputPath) {
  if (!inputPath) return inputPath;
  if (path.isAbsolute(inputPath)) {
    return path.normalize(inputPath);
  }
  const projectRoot = path.join(__dirname, '../..');
  return path.resolve(projectRoot, inputPath);
}

const config = {
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_DATABASE || 'cloudcad',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },
  filesDataPath: resolvePath(process.env.FILES_DATA_PATH || 'data/files'),
  svnRepoPath: resolvePath(process.env.SVN_REPO_PATH || 'data/svn-repo'),
  mxcadAssemblyPath: resolvePath(
    process.env.MXCAD_ASSEMBLY_PATH ||
      (isWindows
        ? 'runtime/windows/mxcad/mxcadassembly.exe'
        : 'runtime/linux/mxcad/mxcadassembly')
  ),
};

const results = {
  database: { ok: false, error: null },
  redis: { ok: false, error: null },
  storage: { ok: false, error: null },
  svn: { ok: false, error: null },
  mxcad: { ok: false, error: null },
};

function checkDatabase() {
  return new Promise((resolve) => {
    const net = require('net');
    const socket = new net.Socket();
    socket.setTimeout(3000);

    socket.connect(config.database.port, config.database.host, () => {
      socket.destroy();
      results.database.ok = true;
      resolve();
    });

    socket.on('error', (err) => {
      socket.destroy();
      results.database.error = err.message;
      resolve();
    });

    socket.on('timeout', () => {
      socket.destroy();
      results.database.error = 'Connection timeout';
      resolve();
    });
  });
}

function checkRedis() {
  return new Promise((resolve) => {
    const net = require('net');
    const socket = new net.Socket();
    socket.setTimeout(3000);

    socket.connect(config.redis.port, config.redis.host, () => {
      socket.write('*1\r\n$4\r\nPING\r\n');
    });

    let response = '';
    socket.on('data', (data) => {
      response += data.toString();
      if (response.includes('PONG')) {
        socket.destroy();
        results.redis.ok = true;
        resolve();
      }
    });

    socket.on('error', (err) => {
      socket.destroy();
      results.redis.error = err.message;
      resolve();
    });

    socket.on('timeout', () => {
      socket.destroy();
      results.redis.error = 'Connection timeout';
      resolve();
    });
  });
}

function checkStorage() {
  try {
    if (!fs.existsSync(config.filesDataPath)) {
      fs.mkdirSync(config.filesDataPath, { recursive: true });
    }

    const testFile = path.join(config.filesDataPath, '.health-check');
    fs.writeFileSync(testFile, 'test');
    fs.readFileSync(testFile);
    fs.unlinkSync(testFile);

    results.storage.ok = true;
  } catch (error) {
    results.storage.error = error.message;
  }
}

function checkSvnRepo() {
  try {
    if (!fs.existsSync(config.svnRepoPath)) {
      results.svn.error = `SVN repo path not found: ${config.svnRepoPath}`;
      return;
    }

    try {
      const svnAdminCmd = isWindows ? 'svnadmin.exe' : 'svnadmin';
      const output = execSync(`${svnAdminCmd} info "${config.svnRepoPath}"`, {
        encoding: 'utf8',
        timeout: 5000,
      });
      if (output.includes('UUID')) {
        results.svn.ok = true;
      } else {
        results.svn.error = 'Invalid SVN repository';
      }
    } catch (svnError) {
      fs.accessSync(config.svnRepoPath, fs.constants.R_OK | fs.constants.W_OK);
      results.svn.ok = true;
    }
  } catch (error) {
    results.svn.error = error.message;
  }
}

function checkMxcadAssembly() {
  try {
    if (!fs.existsSync(config.mxcadAssemblyPath)) {
      results.mxcad.error = `mxcadassembly not found: ${config.mxcadAssemblyPath}`;
      return;
    }

    try {
      fs.accessSync(config.mxcadAssemblyPath, fs.constants.X_OK);
    } catch {}

    try {
      const output = execSync(`"${config.mxcadAssemblyPath}" --help`, {
        encoding: 'utf8',
        timeout: 3000,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      results.mxcad.ok = true;
    } catch (execError) {
      fs.accessSync(config.mxcadAssemblyPath, fs.constants.R_OK);
      results.mxcad.ok = true;
    }
  } catch (error) {
    results.mxcad.error = error.message;
  }
}

function printResults() {
  console.log('CloudCAD Health Check');
  console.log('=====================');
  console.log();

  const checks = [
    { name: 'Database', key: 'database' },
    { name: 'Redis', key: 'redis' },
    { name: 'Storage', key: 'storage' },
    { name: 'SVN Repo', key: 'svn' },
    { name: 'mxcadassembly', key: 'mxcad' },
  ];

  checks.forEach((check) => {
    const result = results[check.key];
    const status = result.ok ? '✅' : '❌';
    console.log(`${status} ${check.name}`);
    if (!result.ok && result.error) {
      console.log(`   Error: ${result.error}`);
    }
  });

  console.log();
}

async function main() {
  await checkDatabase();
  await checkRedis();
  checkStorage();
  checkSvnRepo();
  checkMxcadAssembly();

  printResults();

  const allOk = Object.values(results).every((r) => r.ok);
  process.exit(allOk ? 0 : 1);
}

main().catch((error) => {
  console.error('❌ Health check failed with error:', error);
  process.exit(1);
});
