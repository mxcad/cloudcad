///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { UploadTokenController } from './upload-token.controller';
import { UploadTokenService } from './upload-token.service';

describe('UploadTokenController', () => {
  let controller: UploadTokenController;
  let service: UploadTokenService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [UploadTokenController],
      providers: [
        {
          provide: UploadTokenService,
          useValue: {
            signUploadToken: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(UploadTokenController);
    service = module.get(UploadTokenService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should issue token for a valid path', async () => {
    const result: { token: string; path: string; operation: 'upload'; expiresAt: Date } = {
      token: 'jwt-token',
      path: '202607/node1/a.dwg',
      operation: 'upload',
      expiresAt: new Date(),
    };
    jest.spyOn(service, 'signUploadToken').mockResolvedValue(result);

    const resp = await controller.createUploadToken({ path: '202607/node1/a.dwg' });
    expect(resp).toEqual(result);
    expect(service.signUploadToken).toHaveBeenCalledWith('202607/node1/a.dwg');
  });

  it('should reject path traversal', async () => {
    await expect(
      controller.createUploadToken({ path: '../../etc/passwd' }),
    ).rejects.toThrow(BadRequestException);
    expect(service.signUploadToken).not.toHaveBeenCalled();
  });

  it('should reject tilde paths', async () => {
    await expect(
      controller.createUploadToken({ path: '~/secret.dwg' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject absolute paths', async () => {
    await expect(
      controller.createUploadToken({ path: '/etc/passwd' }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      controller.createUploadToken({ path: 'C:/Windows/win.ini' }),
    ).rejects.toThrow(BadRequestException);
  });
});
