import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MinioStorageProvider } from './minio-storage.provider';
import { StorageService } from './storage.service';

@Module({
  imports: [ConfigModule],
  providers: [MinioStorageProvider, StorageService],
  exports: [MinioStorageProvider, StorageService],
})
export class StorageModule {}
