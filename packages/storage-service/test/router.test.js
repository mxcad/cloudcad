'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tablePath = path.join(os.tmpdir(), `storage-routing-${Date.now()}.json`);
fs.writeFileSync(
  tablePath,
  JSON.stringify({
    groups: [
      { prefix: '202607', node: 'node1', basePath: path.join('C:', 'storage1') },
      { prefix: '202608', node: 'node2', basePath: path.join('C:', 'storage2') },
    ],
    defaultBasePath: path.join('C:', 'default'),
  }),
);
process.env.STORAGE_ROUTING_TABLE = tablePath;

const StorageRouter = require('../services/router');

describe('StorageRouter', () => {
  let router;

  before(() => {
    router = new StorageRouter();
  });

  it('should list configured nodes', () => {
    const nodes = router.getNodes();
    assert.deepEqual(nodes, [
      { prefix: '202607', node: 'node1' },
      { prefix: '202608', node: 'node2' },
    ]);
  });
});
