'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

process.env.BACKEND_JWT_SECRET = 'test-shared-secret';
const TokenValidator = require('../services/token');

function signToken(payload, secret) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

describe('TokenValidator', () => {
  let validator;

  beforeEach(() => {
    validator = new TokenValidator();
  });

  it('should validate an upload token with correct signature', () => {
    const token = signToken(
      { path: '202607/node1/a.dwg', operation: 'upload', exp: Math.floor(Date.now() / 1000) + 3600 },
      'test-shared-secret',
    );

    const result = validator.validate(token);

    assert.equal(result.operation, 'upload');
    assert.equal(result.path, '202607/node1/a.dwg');
  });

  it('should allow file:write operation', () => {
    const token = signToken(
      { path: '202607/node1/a.dwg', operation: 'file:write' },
      'test-shared-secret',
    );

    assert.equal(validator.validate(token).operation, 'file:write');
  });

  it('should reject a token signed with a different secret', () => {
    const token = signToken(
      { path: '202607/node1/a.dwg', operation: 'upload' },
      'wrong-secret',
    );

    assert.equal(validator.validate(token), null);
  });

  it('should reject an expired token', () => {
    const token = signToken(
      { path: '202607/node1/a.dwg', operation: 'upload', exp: Math.floor(Date.now() / 1000) - 60 },
      'test-shared-secret',
    );

    assert.equal(validator.validate(token), null);
  });

  it('should reject tokens with a disallowed operation', () => {
    const token = signToken(
      { path: '202607/node1/a.dwg', operation: 'delete', exp: Math.floor(Date.now() / 1000) + 3600 },
      'test-shared-secret',
    );

    assert.equal(validator.validate(token), null);
  });

  it('should reject garbage tokens', () => {
    assert.equal(validator.validate('not-a-jwt'), null);
    assert.equal(validator.validate('a.b.c.d.e'), null);
  });

  it('should extract bearer token from Authorization header', () => {
    const token = signToken({ path: '202607/node1/a.dwg', operation: 'upload' }, 'test-shared-secret');
    const req = { headers: { authorization: `Bearer ${token}` } };

    const result = validator.middleware(req, {});
    assert.equal(result.path, '202607/node1/a.dwg');
  });

  it('should reject requests without a bearer token', () => {
    assert.equal(validator.middleware({ headers: {} }, {}), null);
    assert.equal(validator.middleware({ headers: { authorization: 'Basic abc' } }, {}), null);
  });
});
