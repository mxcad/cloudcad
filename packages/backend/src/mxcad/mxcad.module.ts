import { Module } from '@nestjs/common';
import { MxCadController } from './mxcad.controller';
import { MxCadService } from './mxcad.service';
import { MxCadPermissionService } from './mxcad-permission.service';
import { MinioSyncService } from './minio-sync.service';
import { FileStorageService } from './services/file-storage.service';
import { FileConversionService } from './services/file-conversion.service';
import { FileSystemService } from './services/file-system.service';
import { CacheManagerService } from './services/cache-manager.service';
import { FileSystemNodeService } from './services/filesystem-node.service';
import { FileUploadManagerService } from './services/file-upload-manager.service';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { join } from 'path';
import { DatabaseModule } from '../database/database.module';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    DatabaseModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService) => ({
        secret: configService.get('jwt.secret'),
        signOptions: {
          expiresIn: configService.get('jwt.expiresIn'),
        },
      }),
      inject: [ConfigService],
    }),
    MulterModule.register({
      storage: diskStorage({
        destination: (req, file, cb) => {
          if (req.body.chunk !== undefined) {
            // 分片文件存放位置
            const fileMd5 = req.body.hash;
            const tmpDir = join(process.cwd(), 'temp', `chunk_${fileMd5}`);
            require('fs').mkdirSync(tmpDir, { recursive: true });
            cb(null, tmpDir);
          } else {
            // 完整文件存放位置
            const uploadPath = process.env.MXCAD_UPLOAD_PATH || join(process.cwd(), 'uploads');
            require('fs').mkdirSync(uploadPath, { recursive: true });
            cb(null, uploadPath);
          }
        },
        filename: (req, file, cb) => {
          const fileMd5 = req.body.hash;
          if (req.body.chunk !== undefined) {
            // 分片文件名: {chunkIndex}_{fileHash}
            cb(null, `${req.body.chunk}_${fileMd5}`);
          } else if (fileMd5) {
            // 完整文件名: {fileHash}.{ext}
            const ext = file.originalname.split('.').pop();
            cb(null, `${fileMd5}.${ext}`);
          } else {
            // 没有 hash 参数时，使用原始文件名
            cb(null, file.originalname);
          }
        },
      }),
      // 确保所有字段都被解析，包括非文件字段
      limits: {
        fileSize: 100 * 1024 * 1024, // 100MB
        fields: 20, // 允许最多20个字段
        fieldSize: 1024 * 1024, // 每个字段最大1MB
      },
    }),
  ],
  controllers: [MxCadController],
  providers: [
    MxCadService,
    MxCadPermissionService,
    MinioSyncService,
    FileStorageService,
    FileConversionService,
    FileSystemService,
    CacheManagerService,
    FileSystemNodeService,
    FileUploadManagerService,
  ],
  exports: [MxCadService, FileUploadManagerService],
})
export class MxCadModule {}