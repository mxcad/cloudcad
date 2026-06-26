const http = require('http');
const fs = require('fs');
const path = require('path');
const { StringDecoder } = require('string_decoder');

const TEST_FILE = path.join(__dirname, 'test-upload.dwg');

// Create a small test file if it doesn't exist
if (!fs.existsSync(TEST_FILE)) {
  fs.writeFileSync(TEST_FILE, Buffer.alloc(1024 * 10, 'A')); // 10KB test file
}

const BOUNDARY = '----TestBoundary12345';
const fileName = 'test-upload.dwg';

function buildMultipartBody(fields, filePath) {
  const chunks = [];

  for (const [key, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(`\r\n--${BOUNDARY}\r\n`));
    chunks.push(Buffer.from(`Content-Disposition: form-data; name="${key}"\r\n\r\n`));
    chunks.push(Buffer.from(String(value)));
  }

  if (filePath) {
    const fileContent = fs.readFileSync(filePath);
    chunks.push(Buffer.from(`\r\n--${BOUNDARY}\r\n`));
    chunks.push(Buffer.from(`Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`));
    chunks.push(Buffer.from('Content-Type: application/octet-stream\r\n\r\n'));
    chunks.push(fileContent);
  }

  chunks.push(Buffer.from(`\r\n--${BOUNDARY}--\r\n`));
  return Buffer.concat(chunks);
}

const fields = {
  name: 'test-upload.dwg',
  hash: 'abc123def456',
  size: 10240,
  nodeId: 'cmqu9p1pf0006v0uf82g7zxwa',
  conflictStrategy: 'rename',
};

const body = buildMultipartBody(fields, TEST_FILE);

console.log('=== Request body dump ===');
console.log(body.slice(0, 2000).toString('latin1'));
console.log('... (showing first 2000 bytes)');
console.log(`Total body length: ${body.length}`);
console.log('');

// Try through Vite proxy (3002) AND directly (3001)
const TARGET_PORT = process.env.PORT || 3001;
console.log(`Testing via port ${TARGET_PORT} (set PORT=3002 for Vite proxy)`);
const req = http.request({
  hostname: 'localhost',
  port: parseInt(TARGET_PORT, 10),
  path: '/api/v1/mxcad/files/uploadFiles',
  method: 'POST',
  headers: {
    'Content-Type': `multipart/form-data; boundary=${BOUNDARY}`,
    'Content-Length': body.length,
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJjbW9jY21kc3kwMDB1bjh1ZnprbTVwYXM2IiwiZW1haWwiOiJhZG1pbkBjbG91ZGNhZC5jb20iLCJyb2xlIjoiYWRtaW4iLCJpYXQiOjE3MTc4MDQ2NzMsImV4cCI6MTc1ODA2Mzg3M30.fake',
    'Cookie': 'accessToken=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJjbW9jY21kc3kwMDB1bjh1ZnprbTVwYXM2IiwiZW1haWwiOiJhZG1pbkBjbG91ZGNhZC5jb20iLCJyb2xlIjoiYWRtaW4iLCJpYXQiOjE3MTc4MDQ2NzMsImV4cCI6MTc1ODA2Mzg3M30.fake',
  },
}, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', data);
  });
});

req.on('error', (err) => {
  console.error('Request error:', err.message);
});

req.write(body);
req.end();
