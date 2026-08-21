///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { UploadTokenService } from './upload-token.service';

function hmacSign(secret: string, token: string): string {
  const [header, payload] = token.split('.');
  return crypto
    .createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64url');
}

describe('UploadTokenService', () => {
  let service: UploadTokenService;

  const createService = async (config: Record<string, string>) => {
    const module = await Test.createTestingModule({
      providers: [
        UploadTokenService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => config[key]),
          },
        },
      ],
    }).compile();
    return module.get(UploadTokenService);
  };

  it('should sign an upload token with path/operation/exp claims', async () => {
    service = await createService({ BACKEND_JWT_SECRET: 'shared-secret' });
    const result = await service.signUploadToken('202607/node1/a.dwg');

    expect(result.token).toBeTruthy();
    expect(result.path).toBe('202607/node1/a.dwg');
    expect(result.operation).toBe('upload');
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const payload = JSON.parse(
      Buffer.from(result.token.split('.')[1], 'base64url').toString(),
    );
    expect(payload.path).toBe('202607/node1/a.dwg');
    expect(payload.operation).toBe('upload');
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('should produce a token verifiable with the shared secret (storage-service verifyToken contract)', async () => {
    service = await createService({ BACKEND_JWT_SECRET: 'shared-secret' });
    const result = await service.signUploadToken('202607/node1/a.dwg');

    const parts = result.token.split('.');
    expect(parts).toHaveLength(3);
    expect(hmacSign('shared-secret', result.token)).toBe(parts[2]);

    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString(),
    );
    expect(payload.operation).toBe('upload');
    expect(Date.now() < payload.exp * 1000).toBe(true);
  });

  it('should throw UnauthorizedException when BACKEND_JWT_SECRET is not configured', async () => {
    service = await createService({});
    await expect(service.signUploadToken('202607/node1/a.dwg')).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
