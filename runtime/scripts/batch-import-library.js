const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const http = require('http');
const crypto = require('crypto');

// 配置
const config = {
  baseUrl: 'http://localhost:3001',
  admin: {
    username: 'admin',
    password: 'Admin123!'
  },
  libraries: {
    drawing: {
      type: 'drawing',
      sourceDir: path.join(__dirname, '..', 'data', 'drawing-library')
    },
    block: {
      type: 'block',
      sourceDir: path.join(__dirname, '..', 'data', 'block-library')
    }
  },
  maxConcurrent: 5,          // Tus 并发数（服务端处理，可更高）
  chunkSize: 10 * 1024 * 1024, // Tus PATCH 分片大小 10MB
  conflictStrategy: 'skip',  // skip, overwrite, rename
  logLevel: 'info',          // debug, info, warn, error
  onlyUploadWithThumbnail: true,
  requestTimeout: 600000,    // Tus 上传超时 10 分钟
  maxRetries: 3,
  progressFile: path.join(__dirname, 'upload-progress.json'),
  forceResyncThumbnails: true,
  onlySyncThumbnails: false
};

/**
 * 日志函数
 */
function log(message, level = 'info') {
  const levels = ['error', 'warn', 'info', 'debug'];
  const currentLevelIndex = levels.indexOf(config.logLevel);
  const messageLevelIndex = levels.indexOf(level);

  if (messageLevelIndex <= currentLevelIndex) {
    console.log(`[${level.toUpperCase()}] ${message}`);
  }
}

// 全局变量
let token = '';
let filesDataPath = path.resolve(__dirname, '../data/files');

/**
 * 发送 HTTP 请求（带超时和重试）
 */
async function sendRequest(options, data = null, maxRetries = config.maxRetries) {
  let retries = 0;

  while (retries < maxRetries) {
    try {
      return await new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
          // 204 No Content 不需要解析 body
          if (res.statusCode === 204) {
            resolve({ _headers: res.headers, _statusCode: res.statusCode });
            return;
          }

          let responseData = '';

          res.on('data', (chunk) => {
            responseData += chunk;
          });

          res.on('end', () => {
            try {
              const parsedData = JSON.parse(responseData);
              parsedData._headers = res.headers;
              parsedData._statusCode = res.statusCode;
              resolve(parsedData);
            } catch (error) {
              resolve({ _raw: responseData, _headers: res.headers, _statusCode: res.statusCode });
            }
          });
        });

        req.setTimeout(config.requestTimeout, () => {
          req.destroy(new Error(`请求超时 (${config.requestTimeout}ms)`));
        });

        req.on('error', (error) => {
          reject(error);
        });

        if (data) {
          req.write(data);
        }

        req.end();
      });
    } catch (error) {
      const shouldRetry = error.message.includes('ECONNRESET') ||
                         error.message.includes('ETIMEDOUT') ||
                         error.message.includes('timeout') ||
                         error.message.includes('ENOTFOUND');

      if (shouldRetry && retries < maxRetries - 1) {
        const delay = Math.pow(2, retries) * 1000;
        console.warn(`请求失败 (${retries + 1}/${maxRetries}):`, error.message, `等待 ${delay}ms 后重试...`);
        retries++;
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error(`请求失败(不再重试):`, error.message);
        throw error;
      }
    }
  }
  throw new Error(`请求失败，已达到最大重试次数 ${maxRetries}`);
}

/**
 * 断点续传进度管理
 */
const progressStore = {
  data: {},

  async load() {
    if (fs.existsSync(config.progressFile)) {
      try {
        this.data = JSON.parse(await fsPromises.readFile(config.progressFile, 'utf8'));
        log(`已加载上传进度，跳过 ${Object.keys(this.data).filter(k => this.data[k] === 'done').length} 个已完成文件`);
      } catch {
        this.data = {};
      }
    }
  },

  async save() {
    await fsPromises.writeFile(config.progressFile, JSON.stringify(this.data, null, 2));
  },

  markDone(filePath) {
    this.data[filePath] = 'done';
  },

  markFailed(filePath) {
    this.data[filePath] = 'failed';
  },

  isDone(filePath) {
    return this.data[filePath] === 'done';
  },

  isFailed(filePath) {
    return this.data[filePath] === 'failed';
  },

  reset() {
    this.data = {};
    if (fs.existsSync(config.progressFile)) {
      fs.unlinkSync(config.progressFile);
    }
  }
};

/**
 * 登录管理员账号
 */
async function login() {
  log('正在登录管理员账号...');

  try {
    const postData = JSON.stringify({
      account: config.admin.username,
      password: config.admin.password
    });

    const options = {
      protocol: 'http:',
      hostname: 'localhost',
      port: 3001,
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const response = await sendRequest(options, postData);

    if (response && response.data && response.data.accessToken) {
      token = response.data.accessToken;
      log('登录成功，获取到token');
      return true;
    } else {
      log(`登录失败：未返回token ${JSON.stringify(response)}`, 'error');
      return false;
    }
  } catch (error) {
    log(`登录失败：${error.message}`, 'error');
    return false;
  }
}

/**
 * 上传队列 - 支持并发执行
 */
class UploadQueue {
  constructor(maxConcurrent = 3) {
    this.maxConcurrent = maxConcurrent;
    this.running = 0;
    this.queue = [];
  }

  enqueue(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.processQueue();
    });
  }

  processQueue() {
    while (this.running < this.maxConcurrent && this.queue.length > 0) {
      this.running++;
      const { task, resolve, reject } = this.queue.shift();

      task()
        .then(() => { resolve(); })
        .catch((error) => { reject(error); })
        .finally(() => {
          this.running--;
          this.processQueue();
        });
    }
  }

  getQueueLength() {
    return this.queue.length;
  }

  getRunningCount() {
    return this.running;
  }
}

/**
 * 计算文件哈希
 */
async function computeFileHash(filePath) {
  const hash = crypto.createHash('sha1');
  const stream = fs.createReadStream(filePath);

  return new Promise((resolve, reject) => {
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (error) => reject(error));
  });
}

/**
 * 创建文件夹
 */
async function createFolder(libraryType, parentId, folderName) {
  const postData = JSON.stringify({
    name: folderName,
    parentId: parentId,
    skipIfExists: true
  });

  const options = {
    protocol: 'http:',
    hostname: 'localhost',
    port: 3001,
    path: `/api/library/${libraryType}/folders`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
      'Authorization': `Bearer ${token}`
    }
  };

  const response = await sendRequest(options, postData);
  const folderData = response.data ? response.data : response;

  return folderData;
}

/**
 * 分页获取目录下所有子节点
 */
async function getAllChildren(libraryType, parentId) {
  const allNodes = [];
  let page = 1;
  const limit = 100;

  while (true) {
    const options = {
      protocol: 'http:',
      hostname: 'localhost',
      port: 3001,
      path: `/api/library/${libraryType}/children/${parentId}?page=${page}&limit=${limit}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    };

    const response = await sendRequest(options);
    const data = response.data || response;
    const nodes = data.nodes || [];

    allNodes.push(...nodes);

    if (nodes.length < limit) {
      break;
    }

    page++;
  }

  return allNodes;
}

/**
 * 子节点缓存
 */
const childrenCache = new Map();

/**
 * 获取目录下所有子节点（带缓存）
 */
async function getCachedChildren(libraryType, parentId) {
  const cacheKey = `${libraryType}:${parentId}`;

  if (!childrenCache.has(cacheKey)) {
    const nodes = await getAllChildren(libraryType, parentId);
    childrenCache.set(cacheKey, nodes);
  }

  return childrenCache.get(cacheKey);
}

/**
 * 检查文件是否已存在（秒传）
 * 注意：此端点仍使用旧的文件存在性检查 API
 */
async function checkFileExist(fileSize, fileHash, filename, nodeId, conflictStrategy) {
  const postData = JSON.stringify({
    fileSize,
    fileHash,
    filename,
    nodeId,
    conflictStrategy
  });

  const options = {
    protocol: 'http:',
    hostname: 'localhost',
    port: 3001,
    path: '/api/mxcad/files/fileisExist',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
      'Authorization': `Bearer ${token}`
    }
  };

  const response = await sendRequest(options, postData);
  return response.data ? response.data : response;
}

// ============================================================
// Tus 协议上传（替代旧的分片上传）
// ============================================================

/**
 * Tus 协议：创建上传会话
 * POST /api/v1/files
 * 返回 Location header 中的上传 URL
 */
async function tusCreateSession(fileSize, fileName, fileHash, nodeId, conflictStrategy) {
  // 构建 Upload-Metadata header（base64 编码的 key-value 对）
  const metadataPairs = [
    `filename ${Buffer.from(fileName).toString('base64')}`,
    `fileHash ${Buffer.from(fileHash).toString('base64')}`,
    `fileSize ${Buffer.from(String(fileSize)).toString('base64')}`,
    `nodeId ${Buffer.from(nodeId).toString('base64')}`,
  ];
  if (conflictStrategy) {
    metadataPairs.push(`conflictStrategy ${Buffer.from(conflictStrategy).toString('base64')}`);
  }

  const options = {
    protocol: 'http:',
    hostname: 'localhost',
    port: 3001,
    path: '/api/v1/files',
    method: 'POST',
    headers: {
      'Upload-Length': String(fileSize),
      'Tus-Resumable': '1.0.0',
      'Upload-Metadata': metadataPairs.join(','),
      'Authorization': `Bearer ${token}`
    }
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        if (res.statusCode === 201) {
          const location = res.headers.location;
          if (!location) {
            reject(new Error('Tus 创建会话失败：未返回 Location header'));
            return;
          }
          // location 是相对路径如 /api/v1/files/<uploadId>
          resolve(location);
        } else {
          reject(new Error(`Tus 创建会话失败: ${res.statusCode} ${body}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(config.requestTimeout, () => {
      req.destroy(new Error('Tus 创建会话超时'));
    });
    req.end();
  });
}

/**
 * Tus 协议：上传单个分片
 * PATCH <uploadUrl>
 * 返回 { uploadOffset, nodeId } — nodeId 在最后一个分片响应中返回
 */
async function tusPatchChunk(uploadUrl, offset, chunk, chunkLength) {
  const options = {
    protocol: 'http:',
    hostname: 'localhost',
    port: 3001,
    path: uploadUrl,
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/offset+octet-stream',
      'Upload-Offset': String(offset),
      'Tus-Resumable': '1.0.0',
      'Authorization': `Bearer ${token}`,
      'Content-Length': String(chunkLength)
    }
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        if (res.statusCode === 204 || res.statusCode === 200) {
          const newOffset = parseInt(res.headers['upload-offset'], 10);
          const nodeId = res.headers['x-node-id'] || undefined;
          resolve({
            uploadOffset: isNaN(newOffset) ? offset + chunkLength : newOffset,
            nodeId
          });
        } else {
          reject(new Error(`Tus 上传分片失败: ${res.statusCode} ${body}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(config.requestTimeout, () => {
      req.destroy(new Error('Tus 上传分片超时'));
    });
    req.write(chunk);
    req.end();
  });
}

/**
 * Tus 协议：查询上传进度（用于断点续传）
 * HEAD <uploadUrl>
 * 返回当前已上传的 offset
 */
async function tusHeadUpload(uploadUrl) {
  const options = {
    protocol: 'http:',
    hostname: 'localhost',
    port: 3001,
    path: uploadUrl,
    method: 'HEAD',
    headers: {
      'Tus-Resumable': '1.0.0',
      'Authorization': `Bearer ${token}`
    }
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      if (res.statusCode === 200) {
        const uploadOffset = parseInt(res.headers['upload-offset'], 10);
        resolve(isNaN(uploadOffset) ? 0 : uploadOffset);
      } else {
        // 404 表示会话不存在
        resolve(0);
      }
    });
    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy(new Error('Tus HEAD 请求超时'));
    });
    req.end();
  });
}

/**
 * Tus 协议完整上传流程
 * 1. POST 创建会话
 * 2. 循环 PATCH 分片
 * 3. 最后一个 PATCH 响应中提取 X-Node-Id
 */
async function tusUploadFile(filePath, fileName, fileSize, fileHash, nodeId, conflictStrategy) {
  log(`[Tus] 开始上传: ${path.relative(config.libraries.drawing.sourceDir, filePath)} (${(fileSize / 1024 / 1024).toFixed(1)}MB)`);

  try {
    // 1. 创建 Tus 上传会话
    const uploadUrl = await tusCreateSession(fileSize, fileName, fileHash, nodeId, conflictStrategy);
    log(`[Tus] 会话已创建: ${uploadUrl}`, 'debug');

    // 2. 分片上传
    const chunkSize = config.chunkSize;
    let newNodeId = undefined;
    let offset = 0;

    while (offset < fileSize) {
      const end = Math.min(offset + chunkSize, fileSize);
      const chunkLength = end - offset;

      // 流式读取分片
      const chunk = await new Promise((resolve, reject) => {
        const buffer = Buffer.allocUnsafe(chunkLength);
        let bytesRead = 0;
        const stream = fs.createReadStream(filePath, {
          start: offset,
          end: end - 1
        });

        stream.on('data', (data) => {
          data.copy(buffer, bytesRead);
          bytesRead += data.length;
        });

        stream.on('end', () => {
          resolve(buffer);
        });

        stream.on('error', (error) => {
          reject(error);
        });
      });

      // PATCH 上传分片
      const result = await tusPatchChunk(uploadUrl, offset, chunk, chunkLength);
      offset = result.uploadOffset;

      if (result.nodeId) {
        newNodeId = result.nodeId;
      }

      const progress = ((offset / fileSize) * 100).toFixed(1);
      log(`[Tus] 进度: ${progress}%`, 'debug');
    }

    log(`[Tus] 上传完成: ${path.relative(config.libraries.drawing.sourceDir, filePath)}`);

    return newNodeId || nodeId;

  } catch (error) {
    log(`[Tus] 上传失败: ${error.message}`, 'error');
    throw error;
  }
}

// ============================================================
// 上传文件（秒传检查 + Tus 协议）
// ============================================================

async function uploadFile(nodeId, filePath, conflictStrategy) {
  const fileName = path.basename(filePath);
  const fileStats = await fsPromises.stat(filePath);
  const fileSize = fileStats.size;
  const hash = await computeFileHash(filePath);

  // 1. 检查文件是否已存在（秒传）
  const existData = await checkFileExist(fileSize, hash, fileName, nodeId, conflictStrategy);
  if (existData?.exists) {
    log(`秒传成功：${path.relative(config.libraries.drawing.sourceDir, filePath)}`);

    // 复制缩略图
    await copyThumbnail(filePath, existData.nodeId || nodeId);

    return {
      nodeId: existData.nodeId || nodeId,
      isUseServerExistingFile: true,
      isInstantUpload: true
    };
  }

  // 2. Tus 协议上传
  const newNodeId = await tusUploadFile(filePath, fileName, fileSize, hash, nodeId, conflictStrategy);

  // 3. 复制缩略图
  await copyThumbnail(filePath, newNodeId);

  return {
    nodeId: newNodeId,
    isUseServerExistingFile: false,
    isInstantUpload: false
  };
}

// ============================================================
// 缩略图相关
// ============================================================

/**
 * 查找nodeId所在的目录
 */
function findNodeDirectory(nodeId) {
  try {
    if (!fs.existsSync(filesDataPath)) {
      console.error(`文件存储目录不存在: ${filesDataPath}`);
      return null;
    }

    const dirs = fs.readdirSync(filesDataPath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    for (const dir of dirs) {
      const dirPath = path.join(filesDataPath, dir);
      if (fs.existsSync(dirPath)) {
        const nodeDirs = fs.readdirSync(dirPath, { withFileTypes: true })
          .filter(dirent => dirent.isDirectory())
          .map(dirent => dirent.name);

        if (nodeDirs.includes(nodeId)) {
          return path.join(dirPath, nodeId);
        }
      }
    }

    // 检查 files1 目录
    const files1Path = path.resolve(__dirname, '../data/files1');
    if (fs.existsSync(files1Path)) {
      const dirs = fs.readdirSync(files1Path, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      for (const dir of dirs) {
        const dirPath = path.join(files1Path, dir);
        if (fs.existsSync(dirPath)) {
          const nodeDirs = fs.readdirSync(dirPath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

          if (nodeDirs.includes(nodeId)) {
            return path.join(dirPath, nodeId);
          }
        }
      }
    }

    console.error(`未找到nodeId目录: ${nodeId}`);
    return null;
  } catch (error) {
    console.error('查找node目录失败:', error.message);
    return null;
  }
}

/**
 * 复制缩略图到指定的nodeId目录
 */
async function copyThumbnail(filePath, nodeId) {
  try {
    const thumbnailPath = `${filePath}.jpg`;

    if (!fs.existsSync(thumbnailPath)) {
      console.log(`未找到缩略图：${path.relative(config.libraries.drawing.sourceDir, thumbnailPath)}`);
      return false;
    }

    const nodeDir = findNodeDirectory(nodeId);
    if (!nodeDir) {
      console.error(`未找到nodeId目录: ${nodeId}`);
      return false;
    }

    const targetThumbnailPath = path.join(nodeDir, 'thumbnail.jpg');

    fs.copyFileSync(thumbnailPath, targetThumbnailPath);
    console.log(`缩略图复制成功：${path.relative(config.libraries.drawing.sourceDir, thumbnailPath)}`);
    return true;
  } catch (error) {
    console.error('复制缩略图失败:', error.message);
    return false;
  }
}

/**
 * 检查目录是否包含有效图纸文件
 */
async function hasValidDrawingFiles(dirPath) {
  const files = await fsPromises.readdir(dirPath);

  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    const fileStats = await fsPromises.stat(fullPath);

    if (fileStats.isFile()) {
      const ext = path.extname(fullPath).toLowerCase();
      if (ext === '.dwg' || ext === '.dxf') {
        if (config.onlyUploadWithThumbnail) {
          const thumbnailPath = `${fullPath}.jpg`;
          if (fs.existsSync(thumbnailPath)) {
            return true;
          }
        } else {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * 检查目录是否包含子目录
 */
async function hasSubdirectories(dirPath) {
  const files = await fsPromises.readdir(dirPath);

  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    const fileStats = await fsPromises.stat(fullPath);

    if (fileStats.isDirectory()) {
      return true;
    }
  }

  return false;
}

/**
 * 递归处理目录
 */
async function processDirectory(libraryType, currentPath, currentParentId, uploadQueue, stats) {
  const files = await fsPromises.readdir(currentPath);

  // 先创建所有文件夹
  for (const file of files) {
    const fullPath = path.join(currentPath, file);
    const fileStats = await fsPromises.stat(fullPath);

    if (fileStats.isDirectory()) {
      const hasSubDirs = await hasSubdirectories(fullPath);
      const hasDrawings = await hasValidDrawingFiles(fullPath);

      if (!hasSubDirs && !hasDrawings) {
        log(`跳过空目录（无图纸）：${path.relative(config.libraries[libraryType].sourceDir, fullPath)}`, 'debug');
        continue;
      }

      let folderId;
      try {
        const folderData = await createFolder(libraryType, currentParentId, file);
        if (folderData?.id) {
          const isNewFolder = folderData.createdAt === folderData.updatedAt;
          if (isNewFolder) {
            stats.createdFolders++;
            log(`创建文件夹：${path.relative(config.libraries[libraryType].sourceDir, fullPath)}`);
          } else {
            stats.skippedFolders++;
            log(`跳过文件夹（已存在）：${path.relative(config.libraries[libraryType].sourceDir, fullPath)}`);
          }
          folderId = folderData.id;
          await processDirectory(libraryType, fullPath, folderId, uploadQueue, stats);
        } else {
          try {
            const children = await getCachedChildren(libraryType, currentParentId);
            const existingFolder = children.find(child =>
              child.isFolder && child.name === file
            );
            if (existingFolder) {
              folderId = existingFolder.id;
              stats.skippedFolders++;
              log(`跳过文件夹（已存在）：${path.relative(config.libraries[libraryType].sourceDir, fullPath)}`);
              await processDirectory(libraryType, fullPath, folderId, uploadQueue, stats);
            } else {
              throw new Error('文件夹创建失败且未找到已存在的文件夹');
            }
          } catch (fallbackError) {
            log(`创建文件夹失败：${path.relative(config.libraries[libraryType].sourceDir, fullPath)} ${fallbackError.message}`, 'error');
            stats.failedFolders++;
            continue;
          }
        }
      } catch (error) {
        try {
          const children = await getCachedChildren(libraryType, currentParentId);
          const existingFolder = children.find(child =>
            child.isFolder && child.name === file
          );
          if (existingFolder) {
            folderId = existingFolder.id;
            stats.skippedFolders++;
            log(`跳过文件夹（已存在）：${path.relative(config.libraries[libraryType].sourceDir, fullPath)}`);
            await processDirectory(libraryType, fullPath, folderId, uploadQueue, stats);
          } else {
            log(`创建文件夹失败：${path.relative(config.libraries[libraryType].sourceDir, fullPath)} ${error.message}`, 'error');
            stats.failedFolders++;
          }
        } catch (fallbackError) {
          log(`创建文件夹失败：${path.relative(config.libraries[libraryType].sourceDir, fullPath)} ${fallbackError.message}`, 'error');
          stats.failedFolders++;
        }
      }
    }
  }

  // 再处理所有文件
  const fileTasks = [];
  for (const file of files) {
    const fullPath = path.join(currentPath, file);
    const fileStats = await fsPromises.stat(fullPath);

    if (fileStats.isFile()) {
      const ext = path.extname(fullPath).toLowerCase();
      if (ext !== '.dwg' && ext !== '.dxf') {
        log(`跳过非CAD文件：${path.relative(config.libraries[libraryType].sourceDir, fullPath)}`, 'debug');
        continue;
      }

      if (config.onlyUploadWithThumbnail) {
        const thumbnailPath = `${fullPath}.jpg`;
        if (!fs.existsSync(thumbnailPath)) {
          log(`跳过无缩略图文件：${path.relative(config.libraries[libraryType].sourceDir, fullPath)}`);
          continue;
        }
      }

      stats.totalFiles++;

      if (config.onlySyncThumbnails) {
        const syncTask = uploadQueue.enqueue(async () => {
          let success = false;
          let retryCount = 0;

          while (!success && retryCount < config.maxRetries) {
            try {
              const nodes = await getCachedChildren(libraryType, currentParentId);
              const existingFile = nodes.find(node =>
                !node.isFolder && node.name === file
              );

              if (existingFile?.id) {
                await copyThumbnail(fullPath, existingFile.id);
                stats.successFiles++;
                log(`缩略图同步成功：${path.relative(config.libraries[libraryType].sourceDir, fullPath)}`);
              } else {
                log(`文件不存在于服务器，跳过：${path.relative(config.libraries[libraryType].sourceDir, fullPath)}`);
                stats.skippedFiles++;
              }

              success = true;
            } catch (error) {
              retryCount++;
              if (retryCount < config.maxRetries) {
                const delay = Math.pow(2, retryCount - 1) * 2000;
                log(`缩略图同步失败 (${retryCount}/${config.maxRetries})：${path.relative(config.libraries[libraryType].sourceDir, fullPath)} ${error.message}，等待 ${delay}ms 后重试...`, 'warn');
                await new Promise(resolve => setTimeout(resolve, delay));
              } else {
                log(`缩略图同步失败（已达最大重试次数）：${path.relative(config.libraries[libraryType].sourceDir, fullPath)} ${error.message}`, 'error');
                stats.failedFiles++;
              }
            }
          }
        });

        fileTasks.push(syncTask);
      } else {
        if (progressStore.isDone(fullPath) && !config.forceResyncThumbnails) {
          log(`跳过已完成文件：${path.relative(config.libraries[libraryType].sourceDir, fullPath)}`);
          stats.skippedFiles++;
          continue;
        }

        if (config.forceResyncThumbnails) {
          const syncTask = uploadQueue.enqueue(async () => {
            let success = false;
            let retryCount = 0;

            while (!success && retryCount < config.maxRetries) {
              try {
                const nodes = await getCachedChildren(libraryType, currentParentId);
                const existingFile = nodes.find(node =>
                  !node.isFolder && node.name === file
                );

                if (existingFile?.id) {
                  await copyThumbnail(fullPath, existingFile.id);
                  stats.successFiles++;
                  log(`缩略图同步成功（文件已存在）：${path.relative(config.libraries[libraryType].sourceDir, fullPath)}`);
                } else {
                  const uploadResult = await uploadFile(currentParentId, fullPath, config.conflictStrategy);
                  stats.successFiles++;
                  log(`上传成功：${path.relative(config.libraries[libraryType].sourceDir, fullPath)}`);
                }

                progressStore.markDone(fullPath);
                await progressStore.save();
                success = true;
              } catch (error) {
                retryCount++;
                if (retryCount < config.maxRetries) {
                  const delay = Math.pow(2, retryCount - 1) * 2000;
                  log(`处理失败 (${retryCount}/${config.maxRetries})：${path.relative(config.libraries[libraryType].sourceDir, fullPath)} ${error.message}，等待 ${delay}ms 后重试...`, 'warn');
                  await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                  log(`处理失败（已达最大重试次数）：${path.relative(config.libraries[libraryType].sourceDir, fullPath)} ${error.message}`, 'error');
                  progressStore.markFailed(fullPath);
                  await progressStore.save();
                  stats.failedFiles++;
                }
              }
            }
          });

          fileTasks.push(syncTask);
        } else {
          const uploadTask = uploadQueue.enqueue(async () => {
            let success = false;
            let retryCount = 0;

            while (!success && retryCount < config.maxRetries) {
              try {
                const uploadResult = await uploadFile(currentParentId, fullPath, config.conflictStrategy);

                if (uploadResult.isUseServerExistingFile && config.conflictStrategy === 'skip') {
                  stats.skippedFiles++;
                } else {
                  stats.successFiles++;
                }

                progressStore.markDone(fullPath);
                await progressStore.save();
                success = true;
              } catch (error) {
                retryCount++;
                if (retryCount < config.maxRetries) {
                  const delay = Math.pow(2, retryCount - 1) * 2000;
                  log(`上传失败 (${retryCount}/${config.maxRetries})：${path.relative(config.libraries[libraryType].sourceDir, fullPath)} ${error.message}，等待 ${delay}ms 后重试...`, 'warn');
                  await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                  log(`上传失败（已达最大重试次数）：${path.relative(config.libraries[libraryType].sourceDir, fullPath)} ${error.message}`, 'error');
                  progressStore.markFailed(fullPath);
                  await progressStore.save();
                  stats.failedFiles++;
                }
              }
            }
          });

          fileTasks.push(uploadTask);
        }
      }
    }
  }

  await Promise.all(fileTasks);
}

/**
 * 处理库
 */
async function processLibrary(libraryType) {
  log(`\n开始处理${libraryType === 'drawing' ? '图纸库' : '图块库'}...`);

  const library = config.libraries[libraryType];

  if (!fs.existsSync(library.sourceDir)) {
    log(`源目录不存在：${library.sourceDir}`, 'error');
    return;
  }

  // 获取库根节点ID
  const options = {
    protocol: 'http:',
    hostname: 'localhost',
    port: 3001,
    path: `/api/library/${libraryType}`,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  };
  const libraryInfo = await sendRequest(options);
  const rootId = libraryInfo.data ? libraryInfo.data.id : libraryInfo.id;
  log(`库根节点ID：${rootId}`);

  if (!rootId) {
    log('获取库根节点失败', 'error');
    return;
  }

  const stats = {
    totalFiles: 0,
    successFiles: 0,
    failedFiles: 0,
    skippedFiles: 0,
    createdFolders: 0,
    skippedFolders: 0,
    failedFolders: 0
  };

  const uploadQueue = new UploadQueue(config.maxConcurrent);

  await processDirectory(libraryType, library.sourceDir, rootId, uploadQueue, stats);

  while (uploadQueue.getQueueLength() > 0 || uploadQueue.getRunningCount() > 0) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  await new Promise(resolve => setTimeout(resolve, 500));

  log(`\n${libraryType === 'drawing' ? '图纸库' : '图块库'}处理完成！`);
  log(`统计：`);
  log(`- 总文件数：${stats.totalFiles}`);
  log(`- 成功：${stats.successFiles}`);
  log(`- 失败：${stats.failedFiles}`);
  log(`- 跳过：${stats.skippedFiles}`);
  log(`- 创建文件夹：${stats.createdFolders}`);
  log(`- 跳过文件夹：${stats.skippedFolders}`);
  log(`- 失败文件夹：${stats.failedFolders}`);
}

/**
 * 主函数
 */
async function main() {
  try {
    await progressStore.load();

    log('正在登录...');
    const loginSuccess = await login();
    if (!loginSuccess) {
      log('登录失败，退出脚本', 'error');
      return;
    }
    log('登录成功！');

    await processLibrary('drawing');
    await processLibrary('block');

    log('\n所有库处理完成！');
  } catch (error) {
    log(`脚本执行失败: ${error.message}`, 'error');
    process.exit(1);
  }
}

main().catch(error => {
  log(`脚本执行失败: ${error.message}`, 'error');
  process.exit(1);
});
