const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');

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
  maxConcurrent: 10, // 只更新缩略图可以并发更高
  chunkSize: 10 * 1024 * 1024, // 增大分片大小到10MB
  conflictStrategy: 'skip', // skip, overwrite, rename
  logLevel: 'info', // debug, info, warn, error
  onlyUploadWithThumbnail: true, // 只有有缩略图的图纸才上传
  requestTimeout: 300000, // 请求超时时间 5分钟
  maxRetries: 3, // 最大重试次数
  progressFile: path.join(__dirname, 'upload-progress.json'), // 断点续传进度文件
  forceResyncThumbnails: true, // 是否强制重新同步缩略图（即使文件已完成也重新复制缩略图）
  onlySyncThumbnails: false // 只同步缩略图，不上传 CAD 文件
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
        const http = require('http');
        
        const req = http.request(options, (res) => {
          let responseData = '';
          
          res.on('data', (chunk) => {
            responseData += chunk;
          });
          
          res.on('end', () => {
            try {
              const parsedData = JSON.parse(responseData);
              resolve(parsedData);
            } catch (error) {
              resolve({});
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
      path: '/api/v1/auth/login',
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

  /**
   * 将任务加入队列并返回 Promise
   */
  enqueue(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.processQueue();
    });
  }

  /**
   * 处理队列中的任务
   */
  processQueue() {
    while (this.running < this.maxConcurrent && this.queue.length > 0) {
      this.running++;
      const { task, resolve, reject } = this.queue.shift();

      task()
        .then(() => {
          resolve();
        })
        .catch((error) => {
          reject(error);
        })
        .finally(() => {
          this.running--;
          this.processQueue();
        });
    }
  }

  /**
   * 获取当前队列长度
   */
  getQueueLength() {
    return this.queue.length;
  }

  /**
   * 获取当前运行中的任务数
   */
  getRunningCount() {
    return this.running;
  }
}

/**
 * 计算文件哈希（使用sha1提高速度）
 */
async function computeFileHash(filePath) {
  const crypto = require('crypto');
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
    path: `/api/v1/library/${libraryType}/folders`,
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
 * 获取文件夹子节点（分页获取所有）
 */
async function getChildren(libraryType, parentId) {
  const options = {
    protocol: 'http:',
    hostname: 'localhost',
    port: 3001,
    path: `/api/v1/library/${libraryType}/children/${parentId}`,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  };

  const response = await sendRequest(options);
  return response.data ? response.data.nodes : response.nodes || [];
}

/**
 * 分页获取目录下所有子节点（解决分页限制）
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
      path: `/api/v1/library/${libraryType}/children/${parentId}?page=${page}&limit=${limit}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    };

    const response = await sendRequest(options);
    const data = response.data || response;
    const nodes = data.nodes || [];
    
    allNodes.push(...nodes);
    
    // 如果返回的节点数少于 limit，说明已经获取完所有数据
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
    path: '/api/v1/mxcad/files/fileisExist',
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

/**
 * 检查分片是否已存在
 */
async function checkChunkExist(chunk, chunks, size, fileHash, filename, nodeId) {
  const postData = JSON.stringify({
    chunk: parseInt(chunk),
    chunks: parseInt(chunks),
    size: parseInt(size),
    fileHash,
    filename,
    nodeId
  });

  const options = {
    protocol: 'http:',
    hostname: 'localhost',
    port: 3001,
    path: '/api/v1/mxcad/files/chunkisExist',
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

/**
 * 上传分片
 */
async function uploadChunk(formData) {
  const boundary = '----WebKitFormBoundary' + Math.random().toString(16).slice(2);
  const parts = [];

  for (const [key, value] of Object.entries(formData)) {
    parts.push(`--${boundary}`);
    if (Buffer.isBuffer(value)) {
      parts.push(`Content-Disposition: form-data; name="${key}"; filename="chunk"`);
      parts.push(`Content-Type: application/octet-stream`);
      parts.push(`Content-Length: ${value.length}`);
      parts.push(``);
      parts.push(value);
    } else {
      parts.push(`Content-Disposition: form-data; name="${key}"`);
      parts.push(``);
      parts.push(value);
    }
  }
  parts.push(`--${boundary}--`);

  // 构建body
  const bodyParts = [];
  for (const part of parts) {
    if (Buffer.isBuffer(part)) {
      bodyParts.push(part);
    } else {
      bodyParts.push(Buffer.from(part + '\r\n'));
    }
  }
  const body = Buffer.concat(bodyParts);

  const options = {
    protocol: 'http:',
    hostname: 'localhost',
    port: 3001,
    path: '/api/v1/mxcad/files/uploadFiles',
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length,
      'Authorization': `Bearer ${token}`
    }
  };

  const response = await sendRequest(options, body);
  return response.data ? response.data : response;
}

/**
 * 查找nodeId所在的目录
 */
function findNodeDirectory(nodeId) {
  try {
    // 检查filesDataPath是否存在
    if (!fs.existsSync(filesDataPath)) {
      console.error(`文件存储目录不存在: ${filesDataPath}`);
      return null;
    }
    
    // 读取filesDataPath下的所有目录
    const dirs = fs.readdirSync(filesDataPath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
    
    // 遍历所有目录，查找包含nodeId的目录
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
    
    // 还需要检查可能的files1目录
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
    // 生成缩略图文件路径（使用文件全名+.jpg格式）
    const thumbnailPath = `${filePath}.jpg`;
    
    // 检查缩略图文件是否存在
    if (!fs.existsSync(thumbnailPath)) {
      console.log(`未找到缩略图：${path.relative(config.libraries.drawing.sourceDir, thumbnailPath)}`);
      return false;
    }
    
    // 查找nodeId所在的目录
    const nodeDir = findNodeDirectory(nodeId);
    if (!nodeDir) {
      console.error(`未找到nodeId目录: ${nodeId}`);
      return false;
    }
    
    // 构建目标文件路径
    const targetThumbnailPath = path.join(nodeDir, 'thumbnail.jpg');
    
    // 复制文件
    fs.copyFileSync(thumbnailPath, targetThumbnailPath);
    console.log(`缩略图复制成功：${path.relative(config.libraries.drawing.sourceDir, thumbnailPath)}`);
    return true;
  } catch (error) {
    console.error('复制缩略图失败:', error.message);
    return false;
  }
}

/**
 * 上传文件（分片上传 - 流式读取）
 */
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

  // 2. 分片上传（流式读取）
  const chunkSize = config.chunkSize;
  const totalChunks = Math.ceil(fileSize / chunkSize);
  let newNodeId;
  let hasUploadedAnyChunk = false;

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * chunkSize;
    const end = Math.min(start + chunkSize, fileSize);
    const chunkLength = end - start;

    // 检查分片是否已存在
    const chunkData = await checkChunkExist(chunkIndex, totalChunks, chunkLength, hash, fileName, nodeId);
    if (chunkData?.exists) {
      continue;
    }

    // 流式读取分片数据（使用Buffer.allocUnsafe提高性能）
    const chunk = await new Promise((resolve, reject) => {
      const buffer = Buffer.allocUnsafe(chunkLength);
      let offset = 0;
      const stream = fs.createReadStream(filePath, {
        start: start,
        end: end - 1
      });

      stream.on('data', (data) => {
        data.copy(buffer, offset);
        offset += data.length;
      });

      stream.on('end', () => {
        resolve(buffer);
      });

      stream.on('error', (error) => {
        reject(error);
      });
    });

    // 上传分片
    const formData = {
      chunk: chunkIndex.toString(),
      chunks: totalChunks.toString(),
      name: fileName,
      hash: hash,
      size: fileSize.toString(),
      nodeId: nodeId,
      file: chunk
    };
    
    if (conflictStrategy) {
      formData.conflictStrategy = conflictStrategy;
    }

    const uploadData = await uploadChunk(formData);
    hasUploadedAnyChunk = true;

    // 最后一个分片上传完成后，获取nodeId
    if (chunkIndex === totalChunks - 1 && uploadData?.nodeId) {
      newNodeId = uploadData.nodeId;
      
      // 检查是否是跳过策略（文件已存在）
      if (uploadData.ret === 'fileAlreadyExist') {
        log(`跳过文件（已存在）：${path.relative(config.libraries.drawing.sourceDir, filePath)}`);
        
        // 复制缩略图
        await copyThumbnail(filePath, newNodeId);
        
        return {
          nodeId: newNodeId,
          isUseServerExistingFile: true,
          isInstantUpload: false
        };
      }
    }
  }

  // 3. 如果所有分片都已存在，发送合并请求
  if (!hasUploadedAnyChunk) {
    const mergeFormData = {
      chunks: totalChunks.toString(),
      name: fileName,
      hash: hash,
      size: fileSize.toString(),
      nodeId: nodeId
    };
    
    if (conflictStrategy) {
      mergeFormData.conflictStrategy = conflictStrategy;
    }

    const mergeData = await uploadChunk(mergeFormData);
    if (mergeData?.nodeId) {
      newNodeId = mergeData.nodeId;
    }
    
    // 检查是否是跳过策略（文件已存在）
    if (mergeData?.ret === 'fileAlreadyExist') {
      log(`跳过文件（已存在）：${path.relative(config.libraries.drawing.sourceDir, filePath)}`);
      
      // 复制缩略图
      await copyThumbnail(filePath, newNodeId || nodeId);
      
      return {
        nodeId: newNodeId || nodeId,
        isUseServerExistingFile: true,
        isInstantUpload: false
      };
    }
  }

  log(`上传成功：${path.relative(config.libraries.drawing.sourceDir, filePath)}`);
  
  // 复制缩略图
  await copyThumbnail(filePath, newNodeId || nodeId);
  
  return {
    nodeId: newNodeId || nodeId,
    isUseServerExistingFile: false,
    isInstantUpload: false
  };
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
        // 如果需要缩略图，检查是否存在缩略图
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
  
  // 先创建所有文件夹（如果需要）
  for (const file of files) {
    const fullPath = path.join(currentPath, file);
    const fileStats = await fsPromises.stat(fullPath);
    
    if (fileStats.isDirectory()) {
      // 检查是否应该创建这个目录：
      // 1. 如果有子目录 → 创建
      // 2. 如果只有文件，检查是否有有效图纸 → 有则创建，无则跳过
      const hasSubDirs = await hasSubdirectories(fullPath);
      const hasDrawings = await hasValidDrawingFiles(fullPath);
      
      if (!hasSubDirs && !hasDrawings) {
        log(`跳过空目录（无图纸）：${path.relative(config.libraries[libraryType].sourceDir, fullPath)}`, 'debug');
        continue;
      }
      
      // 尝试创建文件夹
      let folderId;
      try {
        const folderData = await createFolder(libraryType, currentParentId, file);
        if (folderData?.id) {
          // 检查是否是新创建的文件夹
          const isNewFolder = folderData.createdAt === folderData.updatedAt;
          if (isNewFolder) {
            stats.createdFolders++;
            log(`创建文件夹：${path.relative(config.libraries[libraryType].sourceDir, fullPath)}`);
          } else {
            stats.skippedFolders++;
            log(`跳过文件夹（已存在）：${path.relative(config.libraries[libraryType].sourceDir, fullPath)}`);
          }
          folderId = folderData.id;
          // 递归处理子目录
          await processDirectory(libraryType, fullPath, folderId, uploadQueue, stats);
        } else {
          // 如果返回数据异常，尝试通过查询获取已存在的文件夹
          try {
            const children = await getCachedChildren(libraryType, currentParentId);
            const existingFolder = children.find(child => 
              child.isFolder && child.name === file
            );
            if (existingFolder) {
              folderId = existingFolder.id;
              stats.skippedFolders++;
              log(`跳过文件夹（已存在）：${path.relative(config.libraries[libraryType].sourceDir, fullPath)}`);
              // 递归处理子目录
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
        // 文件夹创建失败，尝试查找已存在的文件夹
        try {
          const children = await getCachedChildren(libraryType, currentParentId);
          const existingFolder = children.find(child => 
            child.isFolder && child.name === file
          );
          if (existingFolder) {
            folderId = existingFolder.id;
            stats.skippedFolders++;
            log(`跳过文件夹（已存在）：${path.relative(config.libraries[libraryType].sourceDir, fullPath)}`);
            // 递归处理子目录
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
      // 只上传 .dwg 和 .dxf 文件
      const ext = path.extname(fullPath).toLowerCase();
      if (ext !== '.dwg' && ext !== '.dxf') {
        log(`跳过非CAD文件：${path.relative(config.libraries[libraryType].sourceDir, fullPath)}`, 'debug');
        continue;
      }
      
      // 检查是否需要缩略图
      if (config.onlyUploadWithThumbnail) {
        const thumbnailPath = `${fullPath}.jpg`;
        if (!fs.existsSync(thumbnailPath)) {
          log(`跳过无缩略图文件：${path.relative(config.libraries[libraryType].sourceDir, fullPath)}`);
          continue;
        }
      }
      
      stats.totalFiles++;
      
      // 如果只同步缩略图模式
      if (config.onlySyncThumbnails) {
        const syncTask = uploadQueue.enqueue(async () => {
          let success = false;
          let retryCount = 0;
          
          while (!success && retryCount < config.maxRetries) {
            try {
              // 获取当前目录的子节点（使用缓存）
              const nodes = await getCachedChildren(libraryType, currentParentId);
              const existingFile = nodes.find(node => 
                !node.isFolder && node.name === file
              );
              
              if (existingFile?.id) {
                // 复制缩略图
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
        // 检查断点续传，跳过已完成的文件
        if (progressStore.isDone(fullPath) && !config.forceResyncThumbnails) {
          log(`跳过已完成文件：${path.relative(config.libraries[libraryType].sourceDir, fullPath)}`);
          stats.skippedFiles++;
          continue;
        }
        
        // 如果配置了强制重新同步缩略图，先查询服务器是否有同名文件
        if (config.forceResyncThumbnails) {
          const syncTask = uploadQueue.enqueue(async () => {
            let success = false;
            let retryCount = 0;
            
            while (!success && retryCount < config.maxRetries) {
              try {
                // 查询当前目录的子节点（使用缓存）
                const nodes = await getCachedChildren(libraryType, currentParentId);
                const existingFile = nodes.find(node => 
                  !node.isFolder && node.name === file
                );
                
                if (existingFile?.id) {
                  // 服务器有同名文件，只复制缩略图
                  await copyThumbnail(fullPath, existingFile.id);
                  stats.successFiles++;
                  log(`缩略图同步成功（文件已存在）：${path.relative(config.libraries[libraryType].sourceDir, fullPath)}`);
                } else {
                  // 服务器没有同名文件，上传新文件
                  const uploadResult = await uploadFile(currentParentId, fullPath, config.conflictStrategy);
                  stats.successFiles++;
                  log(`上传成功：${path.relative(config.libraries[libraryType].sourceDir, fullPath)}`);
                }
                
                // 标记完成并保存进度
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
          // 正常上传队列
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
                
                // 标记完成并保存进度
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
  
  // 等待当前目录的所有任务完成
  await Promise.all(fileTasks);
}

/**
 * 处理库
 */
async function processLibrary(libraryType) {
  log(`\n开始处理${libraryType === 'drawing' ? '图纸库' : '图块库'}...`);
  
  const library = config.libraries[libraryType];
  
  // 检查源目录是否存在
  if (!fs.existsSync(library.sourceDir)) {
    log(`源目录不存在：${library.sourceDir}`, 'error');
    return;
  }
  
  // 获取库根节点ID
  const options = {
    protocol: 'http:',
    hostname: 'localhost',
    port: 3001,
    path: `/api/v1/library/${libraryType}`,
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
  
  // 初始化统计信息
  const stats = {
    totalFiles: 0,
    successFiles: 0,
    failedFiles: 0,
    createdFolders: 0,
    skippedFolders: 0,
    failedFolders: 0
  };
  
  // 初始化上传队列
  const uploadQueue = new UploadQueue(config.maxConcurrent);
  
  // 递归处理目录
  await processDirectory(libraryType, library.sourceDir, rootId, uploadQueue, stats);
  
  // 等待所有上传任务完成
  while (uploadQueue.getQueueLength() > 0 || uploadQueue.getRunningCount() > 0) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // 等待一小段时间确保数据库写入完成
  await new Promise(resolve => setTimeout(resolve, 500));
  
  log(`\n${libraryType === 'drawing' ? '图纸库' : '图块库'}处理完成！`);
  log(`统计：`);
  log(`- 总文件数：${stats.totalFiles}`);
  log(`- 成功：${stats.successFiles}`);
  log(`- 失败：${stats.failedFiles}`);
  log(`- 创建文件夹：${stats.createdFolders}`);
  log(`- 跳过文件夹：${stats.skippedFolders}`);
  log(`- 失败文件夹：${stats.failedFolders}`);
}

/**
 * 主函数
 */
async function main() {
  try {
    // 加载断点续传进度
    await progressStore.load();
    
    // 登录
    log('正在登录...');
    const loginSuccess = await login();
    if (!loginSuccess) {
      log('登录失败，退出脚本', 'error');
      return;
    }
    log('登录成功！');
    
    // 处理图纸库
    await processLibrary('drawing');
    
    // 处理图块库
    await processLibrary('block');
    
    log('\n所有库处理完成！');
    
    // 清理进度文件
    // progressStore.reset();
    // log('已清理进度文件');
  } catch (error) {
    log(`脚本执行失败: ${error.message}`, 'error');
    process.exit(1);
  }
}

// 执行主函数
main().catch(error => {
  log(`脚本执行失败: ${error.message}`, 'error');
  process.exit(1);
});
