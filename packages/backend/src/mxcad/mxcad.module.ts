import { Module } from '@nestjs/common';
import { MxCadController } from './mxcad.controller';
import { MxCadService } from './mxcad.service';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { join } from 'path';

@Module({
  imports: [
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
          } else {
            // 完整文件名: {fileHash}.{ext}
            const ext = file.originalname.split('.').pop();
            cb(null, `${fileMd5}.${ext}`);
          }
        },
      }),
    }),
  ],
  controllers: [MxCadController],
  providers: [MxCadService],
  exports: [MxCadService],
})
export class MxCadModule {}