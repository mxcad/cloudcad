'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const MxcadRunner = require('../mxcad/runner');

describe('MxcadRunner._parseOutput', () => {
  it('should parse valid JSON output', () => {
    const runner = new MxcadRunner();
    const parsed = runner._parseOutput('some log\n{"code":0,"newpath":"/out/a.mxweb"}');
    assert.equal(parsed.code, 0);
    assert.equal(parsed.newpath, '/out/a.mxweb');
  });

  it('should extract JSON after leading log noise', () => {
    const runner = new MxcadRunner();
    const parsed = runner._parseOutput('INFO: start\nWARN: skip\n{"code":1,"message":"boom"}');
    assert.equal(parsed.code, 1);
    assert.equal(parsed.message, 'boom');
  });

  it('should return a failure object instead of throwing on malformed JSON', () => {
    const runner = new MxcadRunner();
    const parsed = runner._parseOutput('mxcad produced garbage output');
    assert.equal(parsed.code, 1);
    assert.match(parsed.message, /格式错误/);
    assert.ok(parsed.raw);
  });

  it('should return a failure object when JSON is truncated', () => {
    const runner = new MxcadRunner();
    const parsed = runner._parseOutput('{"code":0,"newpath":');
    assert.equal(parsed.code, 1);
    assert.match(parsed.message, /格式错误/);
  });
});
