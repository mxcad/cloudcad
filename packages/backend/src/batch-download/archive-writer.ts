import { Injectable, Logger } from '@nestjs/common';
import * as archiver from 'archiver';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';

export interface ArchiveEntry {
  name: string;
  stream: any;
}

@Injectable()
export class ArchiveWriter {
  private readonly logger = new Logger(ArchiveWriter.name);

  async createArchive(
    entries: ArchiveEntry[],
    outputDir: string,
    archiveName: string,
    compressionLevel: number = 1,
  ): Promise<string> {
    await fsPromises.mkdir(outputDir, { recursive: true });

    const tmpPath = path.join(outputDir, `${archiveName}.zip.tmp`);
    const finalPath = path.join(outputDir, `${archiveName}.zip`);

    return new Promise<string>((resolve, reject) => {
      const output = fs.createWriteStream(tmpPath);
      const archive = archiver.create('zip', {
        zlib: { level: compressionLevel },
      });

      let finalized = false;

      output.on('close', async () => {
        if (finalized) return;
        finalized = true;
        try {
          await fsPromises.rename(tmpPath, finalPath);
          this.logger.log(`Archive created: ${finalPath} (${archive.pointer()} bytes)`);
          resolve(finalPath);
        } catch (renameErr) {
          reject(new Error(`Failed to rename temp archive: ${renameErr.message}`));
        }
      });

      output.on('error', async (err) => {
        if (finalized) return;
        finalized = true;
        await this.cleanup(tmpPath);
        reject(new Error(`Archive output error: ${err.message}`));
      });

      archive.on('error', async (err) => {
        if (finalized) return;
        finalized = true;
        await this.cleanup(tmpPath);
        reject(new Error(`Archive creation error: ${err.message}`));
      });

      archive.pipe(output as any);

      for (const entry of entries) {
        archive.append(entry.stream, { name: entry.name });
      }

      archive.finalize();
    });
  }

  private async cleanup(tmpPath: string): Promise<void> {
    try {
      if (fs.existsSync(tmpPath)) {
        await fsPromises.unlink(tmpPath);
      }
    } catch (err) {
      this.logger.warn(`Failed to clean up temp file: ${tmpPath} - ${err.message}`);
    }
  }
}
