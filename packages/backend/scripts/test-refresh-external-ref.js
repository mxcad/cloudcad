const http = require('http');

console.log('========== 手动刷新外部参照状态 ==========');
console.log('');

const nodeId = 'cml92vbqy0005xkufgnc96hdi';

// 1. 获取节点信息（当前状态）
const getNodeOptions = {
  hostname: 'localhost',
  port: 3001,
  path: `/api/file-system/nodes/${nodeId}`,
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
  },
};

console.log('1. 获取节点当前状态...');
const req1 = http.request(getNodeOptions, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('   响应状态:', res.statusCode);
    try {
      const response = JSON.parse(data);
      console.log('   节点信息:');
      console.log(
        '   - hasMissingExternalReferences:',
        response.data?.hasMissingExternalReferences
      );
      console.log(
        '   - missingExternalReferencesCount:',
        response.data?.missingExternalReferencesCount
      );
      console.log(
        '   - externalReferencesJson:',
        response.data?.externalReferencesJson
      );
    } catch (e) {
      console.log('   解析失败:', e.message);
      console.log('   原始响应:', data);
    }

    // 2. 调用刷新接口
    console.log('');
    console.log('2. 调用刷新外部参照接口...');
    const refreshOptions = {
      hostname: 'localhost',
      port: 3001,
      path: `/mxcad/file/${nodeId}/refresh-external-references`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req2 = http.request(refreshOptions, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        console.log('   响应状态:', res.statusCode);
        console.log('   响应内容:', data);

        // 3. 再次获取节点信息（刷新后状态）
        console.log('');
        console.log('3. 获取节点刷新后状态...');
        const req3 = http.request(getNodeOptions, (res) => {
          let data = '';

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            console.log('   响应状态:', res.statusCode);
            try {
              const response = JSON.parse(data);
              console.log('   节点信息:');
              console.log(
                '   - hasMissingExternalReferences:',
                response.data?.hasMissingExternalReferences
              );
              console.log(
                '   - missingExternalReferencesCount:',
                response.data?.missingExternalReferencesCount
              );
              console.log(
                '   - externalReferencesJson:',
                response.data?.externalReferencesJson
              );
            } catch (e) {
              console.log('   解析失败:', e.message);
              console.log('   原始响应:', data);
            }

            console.log('');
            console.log('========== 刷新完成 ==========');
          });
        });

        req3.on('error', (e) => {
          console.error('   请求失败:', e.message);
        });

        req3.end();
      });
    });

    req2.on('error', (e) => {
      console.error('   请求失败:', e.message);
    });

    req2.end();
  });
});

req1.on('error', (e) => {
  console.error('   请求失败:', e.message);
});

req1.end();
