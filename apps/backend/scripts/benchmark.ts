/**
 * CloudCAD Backend Performance Benchmark Script
 * Tests: Upload, Search, Nodes endpoints
 * Concurrency levels: 10, 50, 100, 200
 */

import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const BENCHMARK_CONFIG = {
  baseUrl: 'http://localhost:3001',
  endpoints: {
    // Upload endpoint - POST /api/v1/mxcad/files/uploadFiles
    upload: {
      path: '/api/v1/mxcad/files/uploadFiles',
      method: 'POST',
      needsAuth: true,
    },
    // Search endpoint - GET /api/v1/file-system/search
    search: {
      path: '/api/v1/file-system/search',
      method: 'GET',
      needsAuth: true,
    },
    // Nodes list endpoint - GET /api/v1/file-system/nodes/:nodeId/children
    nodes: {
      path: '/api/v1/file-system/nodes', // Will append /:nodeId/children
      method: 'GET',
      needsAuth: true,
    },
  },
  concurrencyLevels: [10, 50, 100, 200],
  requestsPerConcurrency: 20, // Total requests per endpoint per concurrency level
  testUserId: 'test-user-001',
  testNodeId: 'test-project-001',
};

// Results storage
const results = {
  timestamp: new Date().toISOString(),
  environment: {
    nodeVersion: process.version,
    platform: process.platform,
    cpuCount: require('os').cpus().length,
    totalMemory: Math.round(require('os').totalmem() / 1024 / 1024 / 1024) + ' GB',
  },
  endpoints: {},
};

// JWT Token for authenticated requests (mock for testing)
const MOCK_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock_token_for_testing';

// Helper: Create HTTP request
function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const urlObj = new URL(options.path, BENCHMARK_CONFIG.baseUrl);
    const httpModule = urlObj.protocol === 'https:' ? https : http;

    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MOCK_TOKEN}`,
        ...options.headers,
      },
    };

    const req = httpModule.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        const endTime = Date.now();
        const duration = endTime - startTime;
        try {
          const jsonData = data ? JSON.parse(data) : {};
          resolve({
            status: res.statusCode,
            duration,
            data: jsonData,
            headers: res.headers,
          });
        } catch {
          resolve({
            status: res.statusCode,
            duration,
            data: data,
            headers: res.headers,
          });
        }
      });
    });

    req.on('error', (err) => {
      reject({ error: err.message, duration: Date.now() - startTime });
    });

    req.setTimeout(30000, () => {
      req.destroy();
      reject({ error: 'TIMEOUT', duration: Date.now() - startTime });
    });

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

// Helper: Create multipart form data for file upload
function createMultipartFormData(fields, fileBuffer) {
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  let body = '';

  // Add fields
  for (const [key, value] of Object.entries(fields)) {
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="${key}"\r\n\r\n`;
    body += `${value}\r\n`;
  }

  // Add file
  body += `--${boundary}\r\n`;
  body += `Content-Disposition: form-data; name="file"; filename="test.dwg"\r\n`;
  body += `Content-Type: application/octet-stream\r\n\r\n`;

  const filePart = Buffer.from(body, 'utf8');
  const endBoundary = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');

  return Buffer.concat([filePart, fileBuffer, endBoundary]);
}

// Helper: Run concurrent requests
async function runConcurrentRequests(endpoint, concurrency, nodeId = null) {
  const endpointConfig = BENCHMARK_CONFIG.endpoints[endpoint];
  const results = [];
  let successCount = 0;
  let errorCount = 0;
  let timeoutCount = 0;

  const promises = [];

  for (let i = 0; i < concurrency; i++) {
    promises.push((async () => {
      try {
        let options = {
          path: endpointConfig.path,
          method: endpointConfig.method,
        };

        let postData = null;

        if (endpoint === 'upload') {
          // Generate test file content (small DWG-like data)
          const testFileContent = Buffer.alloc(1024 * 10); // 10KB test file
          for (let j = 0; j < testFileContent.length; j++) {
            testFileContent[j] = Math.floor(Math.random() * 256);
          }

          const fields = {
            hash: 'testfilehash_' + Date.now() + '_' + i,
            name: `test_file_${i}.dwg`,
            size: testFileContent.length.toString(),
            chunk: '0',
            chunks: '1',
            nodeId: nodeId || BENCHMARK_CONFIG.testNodeId,
          };

          const formData = createMultipartFormData(fields, testFileContent);

          options.path = endpointConfig.path + `?nodeId=${nodeId || BENCHMARK_CONFIG.testNodeId}`;
          options.headers = {
            'Content-Type': `multipart/form-data; boundary=${'----WebKitFormBoundary' + Math.random().toString(36).substring(2)}`,
            'Authorization': `Bearer ${MOCK_TOKEN}`,
          };

          // Use the actual HTTP request with form data
          const result = await makeFormDataRequest(options, fields, testFileContent);
          results.push(result);
          if (result.status >= 200 && result.status < 300) successCount++;
          else if (result.error === 'TIMEOUT') timeoutCount++;
          else errorCount++;
        } else if (endpoint === 'search') {
          options.path = endpointConfig.path + `?keyword=test&scope=project_files&page=1&limit=20`;
          const result = await makeRequest(options);
          results.push(result);
          if (result.status >= 200 && result.status < 300) successCount++;
          else if (result.error === 'TIMEOUT') timeoutCount++;
          else errorCount++;
        } else if (endpoint === 'nodes') {
          const targetNodeId = nodeId || BENCHMARK_CONFIG.testNodeId;
          options.path = `${endpointConfig.path}/${targetNodeId}/children?page=1&limit=50`;
          const result = await makeRequest(options);
          results.push(result);
          if (result.status >= 200 && result.status < 300) successCount++;
          else if (result.error === 'TIMEOUT') timeoutCount++;
          else errorCount++;
        }
      } catch (err) {
        results.push({ error: err.message || err.error, duration: 0 });
        errorCount++;
      }
    })());
  }

  await Promise.all(promises);

  // Calculate statistics
  const durations = results
    .filter(r => r.duration > 0)
    .map(r => r.duration)
    .sort((a, b) => a - b);

  if (durations.length === 0) {
    return {
      concurrency,
      totalRequests: concurrency,
      successCount,
      errorCount,
      timeoutCount,
      errorRate: ((errorCount + timeoutCount) / concurrency * 100).toFixed(2) + '%',
      avgResponseTime: 0,
      minResponseTime: 0,
      maxResponseTime: 0,
      p50: 0,
      p90: 0,
      p95: 0,
      p99: 0,
      throughput: 0,
    };
  }

  const sum = durations.reduce((a, b) => a + b, 0);
  const avg = sum / durations.length;
  const p50 = durations[Math.floor(durations.length * 0.5)];
  const p90 = durations[Math.floor(durations.length * 0.9)];
  const p95 = durations[Math.floor(durations.length * 0.95)];
  const p99 = durations[Math.floor(durations.length * 0.99)];
  const throughput = (concurrency / (durations[durations.length - 1] / 1000)).toFixed(2);

  return {
    concurrency,
    totalRequests: concurrency,
    successCount,
    errorCount,
    timeoutCount,
    errorRate: ((errorCount + timeoutCount) / concurrency * 100).toFixed(2) + '%',
    avgResponseTime: avg.toFixed(2),
    minResponseTime: durations[0],
    maxResponseTime: durations[durations.length - 1],
    p50,
    p90,
    p95,
    p99,
    throughput: throughput + ' req/s',
  };
}

// Helper: Make form data request for file upload
function makeFormDataRequest(options, fields, fileBuffer) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const urlObj = new URL(options.path, BENCHMARK_CONFIG.baseUrl);

    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);

    let body = '';
    for (const [key, value] of Object.entries(fields)) {
      body += `--${boundary}\r\n`;
      body += `Content-Disposition: form-data; name="${key}"\r\n\r\n`;
      body += `${value}\r\n`;
    }
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="file"; filename="test.dwg"\r\n`;
    body += `Content-Type: application/octet-stream\r\n\r\n`;

    const bodyBuffer = Buffer.from(body, 'utf8');
    const endBoundary = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
    const fullBody = Buffer.concat([bodyBuffer, fileBuffer, endBoundary]);

    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || 3001,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Authorization': `Bearer ${MOCK_TOKEN}`,
        'Content-Length': fullBody.length,
      },
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        const endTime = Date.now();
        const duration = endTime - startTime;
        try {
          resolve({
            status: res.statusCode,
            duration,
            data: JSON.parse(data),
          });
        } catch {
          resolve({
            status: res.statusCode,
            duration,
            data: data,
          });
        }
      });
    });

    req.on('error', (err) => {
      reject({ error: err.message, duration: Date.now() - startTime });
    });

    req.setTimeout(30000, () => {
      req.destroy();
      reject({ error: 'TIMEOUT', duration: Date.now() - startTime });
    });

    req.write(fullBody);
    req.end();
  });
}

// Run benchmark for a specific endpoint
async function benchmarkEndpoint(endpointName, nodeId = null) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Benchmarking: ${endpointName.toUpperCase()}`);
  console.log(`${'='.repeat(60)}`);

  const endpointResults = {
    endpoint: endpointName,
    path: BENCHMARK_CONFIG.endpoints[endpointName].path,
    concurrencyLevels: [],
  };

  for (const concurrency of BENCHMARK_CONFIG.concurrencyLevels) {
    console.log(`\n  Concurrency: ${concurrency}`);
    console.log(`  ${'-'.repeat(40)}`);

    // Run multiple iterations to get more stable results
    const iterations = 3;
    const iterationResults = [];

    for (let i = 0; i < iterations; i++) {
      console.log(`    Iteration ${i + 1}/${iterations}...`);
      const result = await runConcurrentRequests(endpointName, concurrency, nodeId);
      iterationResults.push(result);
    }

    // Average results across iterations
    const avgResult = {
      concurrency,
      avgResponseTime: (iterationResults.reduce((sum, r) => sum + parseFloat(r.avgResponseTime), 0) / iterations).toFixed(2),
      successRate: ((iterationResults.reduce((sum, r) => sum + r.successCount, 0) / (concurrency * iterations)) * 100).toFixed(2) + '%',
      errorRate: ((iterationResults.reduce((sum, r) => sum + r.errorCount + r.timeoutCount, 0) / (concurrency * iterations)) * 100).toFixed(2) + '%',
      p50: Math.round(iterationResults.reduce((sum, r) => sum + r.p50, 0) / iterations),
      p90: Math.round(iterationResults.reduce((sum, r) => sum + r.p90, 0) / iterations),
      p95: Math.round(iterationResults.reduce((sum, r) => sum + r.p95, 0) / iterations),
      p99: Math.round(iterationResults.reduce((sum, r) => sum + r.p99, 0) / iterations),
      maxResponseTime: Math.max(...iterationResults.map(r => r.maxResponseTime)),
      minResponseTime: Math.min(...iterationResults.map(r => r.minResponseTime)),
    };

    endpointResults.concurrencyLevels.push(avgResult);

    console.log(`    Avg Response Time: ${avgResult.avgResponseTime}ms`);
    console.log(`    Success Rate: ${avgResult.successRate}`);
    console.log(`    Error Rate: ${avgResult.errorRate}`);
    console.log(`    P50/P90/P95/P99: ${avgResult.p50}/${avgResult.p90}/${avgResult.p95}/${avgResult.p99}ms`);
  }

  return endpointResults;
}

// Check if backend is running
async function checkBackendHealth() {
  try {
    const result = await makeRequest({
      path: '/api/health',
      method: 'GET',
    });
    return result.status === 200;
  } catch {
    return false;
  }
}

// Main benchmark runner
async function runBenchmark() {
  console.log('\n' + '='.repeat(60));
  console.log('CloudCAD Backend Performance Benchmark');
  console.log('='.repeat(60));
  console.log(`\nTimestamp: ${results.timestamp}`);
  console.log(`Node.js: ${results.environment.nodeVersion}`);
  console.log(`Platform: ${results.environment.platform}`);
  console.log(`CPU Cores: ${results.environment.cpuCount}`);
  console.log(`Total Memory: ${results.environment.totalMemory}`);

  // Check backend health
  console.log('\nChecking backend health...');
  const isHealthy = await checkBackendHealth();

  if (!isHealthy) {
    console.log('\nERROR: Backend is not running at http://localhost:3001');
    console.log('Please start the backend server before running benchmarks.');
    console.log('\nTo start the backend:');
    console.log('  cd d:\\project\\cloudcad\\apps\\backend');
    console.log('  pnpm run dev');
    process.exit(1);
  }

  console.log('Backend is healthy. Starting benchmarks...\n');

  // Run benchmarks for each endpoint
  const endpoints = ['search', 'nodes', 'upload'];
  const testNodeId = 'test-project-001'; // Use a valid node ID for testing

  for (const endpoint of endpoints) {
    results.endpoints[endpoint] = await benchmarkEndpoint(endpoint, testNodeId);
  }

  // Generate summary
  console.log('\n\n' + '='.repeat(60));
  console.log('BENCHMARK SUMMARY');
  console.log('='.repeat(60));

  // Find bottleneck
  const bottleneckAnalysis = [];
  for (const [endpoint, data] of Object.entries(results.endpoints)) {
    const highConcurrencyResult = data.concurrencyLevels.find(c => c.concurrency === 200);
    if (highConcurrencyResult) {
      const avgTime = parseFloat(highConcurrencyResult.avgResponseTime);
      const errorRate = parseFloat(highConcurrencyResult.errorRate);
      bottleneckAnalysis.push({
        endpoint,
        avgResponseTime: avgTime,
        errorRate: errorRate,
        bottleneckScore: avgTime * (1 + errorRate / 10),
      });
    }
  }

  bottleneckAnalysis.sort((a, b) => b.bottleneckScore - a.bottleneckScore);

  console.log('\nPerformance Ranking (by response time at 200 concurrency):');
  bottleneckAnalysis.forEach((item, index) => {
    console.log(`  ${index + 1}. ${item.endpoint}: ${item.avgResponseTime}ms avg, ${item.errorRate}% error rate`);
  });

  console.log('\nIdentified Bottleneck:');
  const bottleneck = bottleneckAnalysis[0];
  console.log(`  ${bottleneck.endpoint} endpoint is the weakest link`);
  console.log(`  - Average response time: ${bottleneck.avgResponseTime}ms`);
  console.log(`  - Error rate: ${bottleneck.errorRate}%`);

  // Save results to file
  const outputPath = path.join('d:', 'project', 'cloudcad', 'docs', 'sprint4-backend-benchmark.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\nRaw results saved to: ${outputPath}`);

  // Generate markdown report
  const markdownReport = generateMarkdownReport();
  const reportPath = path.join('d:', 'project', 'cloudcad', 'docs', 'sprint4-backend-benchmark.md');
  fs.writeFileSync(reportPath, markdownReport);
  console.log(`Markdown report saved to: ${reportPath}`);

  return results;
}

function generateMarkdownReport() {
  let report = `# CloudCAD 后端性能压力测试报告

## 1. 测试环境说明

### 硬件环境
- 平台: ${results.environment.platform}
- CPU 核心数: ${results.environment.cpuCount}
- 总内存: ${results.environment.totalMemory}
- Node.js 版本: ${results.environment.nodeVersion}

### 软件环境
- 后端服务: NestJS + Express + Prisma + PostgreSQL + Redis
- 后端端口: 3001
- 测试时间: ${results.timestamp}

### 测试配置
- 并发级别: ${BENCHMARK_CONFIG.concurrencyLevels.join(', ')}
- 每级别请求数: ${BENCHMARK_CONFIG.requestsPerConcurrency} × 3 次迭代
- 超时设置: 30秒

## 2. 测试方法

### 测试工具
使用自定义 Node.js 性能测试脚本，模拟真实 HTTP 请求负载。

### 测试接口
1. **文件上传接口**: POST /api/v1/mxcad/files/uploadFiles (chunked upload)
2. **搜索接口**: GET /api/v1/file-system/search
3. **文件列表接口**: GET /api/v1/file-system/nodes/:nodeId/children

### 测试指标
- 响应时间 (平均、最小、最大、P50/P90/P95/P99)
- 错误率
- 吞吐量 (req/s)
- 成功率

## 3. 各并发级别下的响应时间统计

`;

  // Add detailed results for each endpoint
  for (const [endpointName, endpointData] of Object.entries(results.endpoints)) {
    report += `### ${endpointName.toUpperCase()} 接口\n\n`;
    report += `路径: \`${endpointData.path}\`\n\n`;
    report += `| 并发数 | 平均响应时间(ms) | P50(ms) | P90(ms) | P95(ms) | P99(ms) | 成功率 | 错误率 |\n`;
    report += `|--------|------------------|---------|---------|---------|---------|-------|-------|\n`;

    for (const concurrency of endpointData.concurrencyLevels) {
      report += `| ${concurrency.concurrency} | ${concurrency.avgResponseTime} | ${concurrency.p50} | ${concurrency.p90} | ${concurrency.p95} | ${concurrency.p99} | ${concurrency.successRate} | ${concurrency.errorRate} |\n`;
    }
    report += '\n';
  }

  // Performance拐点分析
  report += `## 4. 性能拐点分析

### 响应时间增长趋势

`;

  for (const [endpointName, endpointData] of Object.entries(results.endpoints)) {
    report += `#### ${endpointName} 接口\n\n`;
    const levels = endpointData.concurrencyLevels;
    for (let i = 1; i < levels.length; i++) {
      const prev = parseFloat(levels[i-1].avgResponseTime);
      const curr = parseFloat(levels[i].avgResponseTime);
      const increase = ((curr - prev) / prev * 100).toFixed(1);
      const拐点 = parseFloat(increase) > 50 ? '**【拐点】**' : '';
      report += `- ${levels[i-1].concurrency} → ${levels[i].concurrency} 并发: ${prev}ms → ${curr}ms (${increase}% 增长) ${拐点}\n`;
    }
    report += '\n';
  }

  // Bottleneck定位
  report += `## 5. 瓶颈定位

### 性能排名 (200并发下)

| 排名 | 接口 | 平均响应时间 | 错误率 | 瓶颈评分 |
|------|------|-------------|--------|---------|
`;

  const bottleneckAnalysis = [];
  for (const [endpoint, data] of Object.entries(results.endpoints)) {
    const highConcurrencyResult = data.concurrencyLevels.find(c => c.concurrency === 200);
    if (highConcurrencyResult) {
      const avgTime = parseFloat(highConcurrencyResult.avgResponseTime);
      const errorRate = parseFloat(highConcurrencyResult.errorRate);
      bottleneckAnalysis.push({
        endpoint,
        avgResponseTime: avgTime,
        errorRate: errorRate,
        bottleneckScore: avgTime * (1 + errorRate / 10),
      });
    }
  }

  bottleneckAnalysis.sort((a, b) => b.bottleneckScore - a.bottleneckScore);
  bottleneckAnalysis.forEach((item, index) => {
    report += `| ${index + 1} | ${item.endpoint} | ${item.avgResponseTime}ms | ${item.errorRate}% | ${item.bottleneckScore.toFixed(2)} |\n`;
  });

  report += `
### 瓶颈分析

`;

  // Find which endpoint is the weakest
  const weakest = bottleneckAnalysis[0];
  const strongest = bottleneckAnalysis[bottleneckAnalysis.length - 1];

  report += `**最先达到瓶颈的接口**: ${weakest.endpoint}\n\n`;
  report += `- 该接口在 200 并发时平均响应时间达到 ${weakest.avgResponseTime}ms\n`;
  report += `- 错误率为 ${weakest.errorRate}%\n`;
  report += `- 相比最强的 ${strongest.endpoint} 接口 (${strongest.avgResponseTime}ms)，慢了 ${((weakest.avgResponseTime / strongest.avgResponseTime - 1) * 100).toFixed(1)}%\n\n`;

  // Resource consumption analysis
  report += `## 6. 资源消耗分析

### 预期资源瓶颈

1. **数据库连接池**: 高并发下 PostgreSQL 连接池可能成为瓶颈
2. **Redis 连接**: 缓存层在高频访问时可能达到连接限制
3. **文件 I/O**: 上传接口的大文件处理会占用大量磁盘 I/O
4. **内存占用**: Node.js 事件循环在高并发下的内存管理

### 关键观察

- 上传接口通常最先达到瓶颈，因为涉及文件 I/O 和可能的转换处理
- 搜索接口在高并发下可能因为复杂的数据库查询而变慢
- 节点列表接口相对轻量，但在极高并发下仍可能受影响

## 7. 改进建议

### 短期优化

1. **数据库优化**
   - 添加适当的索引，特别是搜索相关的复合索引
   - 启用查询结果缓存，减少数据库压力
   - 调整 Prisma 连接池大小

2. **缓存策略**
   - 对热门搜索结果启用 Redis 缓存
   - 实现 LRU 缓存策略，减少数据库查询

3. **连接管理**
   - 增加 Redis 连接池大小
   - 使用 HTTP keep-alive 减少连接建立开销

### 中期优化

1. **水平扩展**
   - 考虑使用 PM2 集群模式利用多核 CPU
   - 引入负载均衡器分发请求

2. **异步处理**
   - 对文件上传和转换采用异步处理队列
   - 使用后台 job 处理重计算任务

3. **CDN 加速**
   - 对静态资源和缩略图启用 CDN
   - 减少服务器带宽压力

### 架构优化

1. **微服务拆分**
   - 将文件上传服务独立部署
   - 搜索服务可以使用专用搜索引擎

2. **数据库读写分离**
   - 将读操作分发到从库
   - 搜索接口使用专门的搜索数据库

3. **消息队列**
   - 引入消息队列处理文件上传后的转换任务
   - 解耦关键路径，提升系统吞吐量

## 8. 结论

本次压力测试表明 CloudCAD 后端在当前配置下：

- **${weakest.endpoint} 接口** 是系统的主要瓶颈
- 在 **200 并发** 时整体错误率需要重点关注
- 建议优先优化数据库查询和缓存策略

---

*报告生成时间: ${new Date().toISOString()}*
`;

  return report;
}

// Run the benchmark
runBenchmark().catch(console.error);
